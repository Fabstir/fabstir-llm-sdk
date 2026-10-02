// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 1 — storage-level defect classes (plan §13 R1, R3-R10). Each test reproduces a reviewer's
 * probe; the rule it pins is named in the describe title.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { FakeLockManager, browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { ragHeadScopeOf } from '../../../src/storage/sealed/rag-layout';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { DocumentManager } from '../../../src/managers/DocumentManager';
import { createRagCoherence, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';

const DB = 'research';
const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const vec = (id: string) => ({ id, vector: [0.1, 0.2], metadata: { text: `t ${id}` } });
const msg = (content: string) => ({ role: 'user', content, timestamp: 1 });
const conversation = (id: string, contents: string[]) => ({ id, messages: contents.map(msg), metadata: {}, createdAt: 1, updatedAt: 1 });

function store(tab: FakeS5Tab, coherence?: RagCoherence) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}) });
}

function storage(tab: FakeS5Tab, coherence?: RagCoherence): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  if (coherence) (s as any).coherence = coherence;
  return s;
}

async function legacyDb(tab: FakeS5Tab, name: string, opts: { chunks?: number; listed?: number } = {}) {
  const dir = legacyDir(name);
  const chunks = opts.chunks ?? 1;
  const listed = opts.listed ?? chunks;
  await tab.fs.put(`${dir}/manifest.json`, {
    name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
    chunks: Array.from({ length: listed }, (_, i) => ({ chunkId: i, cid: `${dir}/chunk-${i}.json`, vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
    chunkCount: listed, folderPaths: [], pendingDocuments: [{ id: 'd1' }],
  });
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${dir}/chunk-${i}.json`, { chunkId: i, vectors: [vec(`v${i}`)] });
  await tab.fs.put(`${dir}/documents/d1.txt`, 'body one');
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('R1 — the conversation log read-modify-write reads a copy proven current', () => {
  test('two tabs appending inside the directory-cache window lose nothing', async () => {
    const net = new FakeS5Network();
    const tab = browserOrigin();
    const a = storage(net.tab(), tab());
    const b = storage(net.tab(), tab());
    await a.saveConversation(conversation('41', ['m1']) as any);
    await b.loadConversation('41');                    // b caches the directory view
    await a.appendMessage('41', msg('m2') as any);
    await b.appendMessage('41', msg('m3') as any);    // b's path view is stale
    expect((await storage(net.tab()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'm2', 'm3']);
  });

  test('the log migration never seals a stale plaintext read over a newer sealed log (it reseals the newest content — S2)', async () => {
    const net = new FakeS5Network();
    const tab = browserOrigin();
    await net.tab().fs.put(logPath('41'), conversation('41', ['m1']));
    const a = storage(net.tab(), tab());
    const b = storage(net.tab(), tab());
    await b.loadConversation('41');                    // b sees the legacy plaintext
    await a.appendMessage('41', msg('m2') as any);    // a seals it, with m2
    await b.migrateLegacyConversationLogs();
    expect((await storage(net.tab()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'm2']);
  });

  test('log heads never appear as RAG databases', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    await storage(net.tab(), coherence).saveConversation(conversation('41', ['m1']) as any);
    const s = store(net.tab(), coherence);
    await s.initialize();
    expect(await s.listDatabases()).toEqual([]);
    expect(net.writes.every((w) => !w.path.startsWith('home/rag/'))).toBe(true);
  });
});

describe('R3 — coherence is chosen by capability, not by `typeof window`', () => {
  const g = globalThis as any;
  let saved: Record<string, any>;
  beforeEach(() => { saved = { window: g.window, isSecureContext: g.isSecureContext, navigator: Object.getOwnPropertyDescriptor(g, 'navigator'), indexedDB: g.indexedDB }; });
  afterEach(() => {
    g.window = saved.window; g.isSecureContext = saved.isSecureContext; g.indexedDB = saved.indexedDB;
    if (saved.navigator) Object.defineProperty(g, 'navigator', saved.navigator);
  });

  test('a context with navigator.locks and no window (a Web Worker) uses Web Locks', async () => {
    const locks = new FakeLockManager();
    Object.defineProperty(g, 'navigator', { value: { locks }, configurable: true });
    g.indexedDB = new (await import('fake-indexeddb')).IDBFactory();
    delete g.window;
    await createRagCoherence().withLock('db', async () => 1);
    expect(locks.acquired).toEqual(['fabstir-rag:db']);
  });

  test('an insecure browser document (no locks, isSecureContext false) fails closed', async () => {
    Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
    g.window = {};
    g.isSecureContext = false;
    await expect(createRagCoherence().withLock('db', async () => 1)).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });

  test('assertUsable (the pre-funding check) refuses an insecure document even when IndexedDB is present', async () => {
    Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
    g.window = {};
    g.isSecureContext = false;
    g.indexedDB = new (await import('fake-indexeddb')).IDBFactory();
    await expect(createRagCoherence().assertUsable()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });

  test('a window without a document (React Native) uses the in-process lock (jsdom has one: it fails closed — S7)', async () => {
    Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
    g.window = {};
    delete g.isSecureContext;
    expect(await createRagCoherence().withLock('db', async () => 'ok')).toBe('ok');
  });
});

describe('R4 — an incomplete discovery is never cached as complete; sealed evidence is never served from legacy', () => {
  test('a listing of the sealed root that fails through every retry is looked at again on the next call', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: DB, owner: ADDR });
    __resetInProcessCoherenceForTests();               // a fresh page: no heads
    const s = store(net.tab());
    net.fail('list', 'home/rag/v1', 'dir404', 5);      // all five attempts of the first discovery
    expect(await s.listDatabases()).toEqual([]);
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual([DB]);
  }, 15_000);

  test('discovery never reads the legacy copy of a name this browser has a head for (the listing may be stale)', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin();
    const b = net.tab();
    await store(net.tab(), origin()).createDatabase({ name: 'other', owner: ADDR });
    const cached: string[] = [];
    for await (const e of b.fs.list('home/rag/v1')) cached.push(e.name); // b caches the root: one database
    await store(net.tab(), origin()).createDatabase({ name: DB, owner: ADDR, description: 'sealed' });
    expect(cached).toHaveLength(1);
    await legacyDb(net.tab(), DB);
    const gets: string[] = [];
    const get = b.fs.get;
    b.fs.get = async (path: string, o?: any) => { gets.push(path); return get(path, o); };
    const s = store(b, origin());
    await s.initialize();
    expect(gets).not.toContain(`${legacyDir(DB)}/manifest.json`);
    expect((await s.listDatabases()).find((d) => d.databaseName === DB)?.description).toBe('sealed');
  });

  test('a sealed database whose manifest cannot be read is never replaced by its legacy copy', async () => {
    const net = new FakeS5Network();
    const s0 = store(net.tab());
    await s0.createDatabase({ name: DB, owner: ADDR, description: 'sealed' });
    await legacyDb(net.tab(), DB);
    __resetInProcessCoherenceForTests();
    const s = store(net.tab());
    net.fail('get', /^home\/rag\/v1\/[0-9a-f]+\/manifest$/, 'dir404', 5);
    const listed = await s.listDatabases();
    expect(listed.every((d) => d.description !== undefined && d.description === 'sealed')).toBe(true);
    await expect(s.getDocumentBody(DB, 'd1')).rejects.toThrow();
  });

  test('listDatabases reflects another tab\'s create and delete without a refresh', async () => {
    const net = new FakeS5Network();
    const tab = browserOrigin();
    const a = store(net.tab(), tab());
    const b = store(net.tab(), tab());
    await a.createDatabase({ name: 'gone', owner: ADDR });
    expect((await b.listDatabases()).map((d) => d.databaseName)).toEqual(['gone']);
    await a.deleteDatabase('gone');
    await a.createDatabase({ name: 'new', owner: ADDR });
    expect((await b.listDatabases()).map((d) => d.databaseName)).toEqual(['new']);
  });
});

describe('R5 — a tombstone makes a name absent; revisions only grow', () => {
  test('legacy data written under a tombstone is never served, and a second delete never lowers the tombstone', async () => {
    const net = new FakeS5Network();
    const tab = browserOrigin();
    const a = store(net.tab(), tab());
    await a.createDatabase({ name: DB, owner: ADDR });
    await a.addVectors(DB, [vec('v1')]);
    await a.addVectors(DB, [vec('v2')]);
    await a.deleteDatabase(DB);
    const heads = tab().scoped(ragHeadScopeOf(sealer()));        // this identity's heads (S9)
    const dbId = sealer().deriveId('db', DB);
    const tombstone = (await heads.getHead(dbId))!.revision;
    await legacyDb(net.tab(), DB);                     // an outdated tab writes the legacy path again
    const b = store(net.tab(), tab());
    expect(await b.getDatabase(DB)).toBeNull();
    await expect(b.addVectors(DB, [vec('zombie')])).rejects.toThrow(/not found/);
    await b.deleteDatabase(DB).catch(() => undefined);
    expect((await heads.getHead(dbId))!.revision).toBeGreaterThanOrEqual(tombstone);
    expect(await store(net.tab(), tab()).getDatabase(DB)).toBeNull();
  });
});

describe('R6 — "remaining" after a delete means still listed', () => {
  test('a stale tab deleting a database another tab already deleted does not report phantom leftovers', async () => {
    const net = new FakeS5Network();
    const tab = browserOrigin();
    const a = store(net.tab(), tab());
    const b = store(net.tab(), tab());
    await a.createDatabase({ name: DB, owner: ADDR });
    await a.addVectors(DB, [vec('v1')]);
    await b.listVectors(DB);                           // b caches the database directory
    await a.deleteDatabase(DB);
    await b.deleteDatabase(DB).catch((e) => { expect(e.code).not.toBe('RAG_DELETE_INCOMPLETE'); });
    expect(net.filePaths()).toEqual([]);
  });
});

describe('R6 — deleteFiles', () => {
  test('a file another tab already deleted is not reported as remaining', async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/x/one', 'a');
    await a.fs.put('home/x/two', 'b');
    const io = new SealedIO(b as any, () => false, b.pathToHash);
    expect((await io.list('home/x'))?.map((e) => e.name).sort()).toEqual(['one', 'two']); // b caches the listing
    await a.fs.delete('home/x/one');
    await io.deleteFiles('home/x', ['one', 'two']);
    expect(net.filePaths()).toEqual([]);
  });
});

describe('R7 — the migration never purges legacy data it did not read', () => {
  test('an outdated tab\'s upload landing mid-migration is kept, then adopted by the next run', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), DB);
    const tab = net.tab();
    const put = tab.fs.put;
    let raced = false;
    tab.fs.put = async (path: string, data: any, o?: any) => {
      await put(path, data, o);
      if (!raced && path.endsWith('/manifest') && path.startsWith('home/rag/v1/')) {
        raced = true;                                  // the old UI rewrites the legacy manifest right now
        const old = net.tab();
        await old.fs.put(`${legacyDir(DB)}/documents/late.txt`, 'late body');
        await old.fs.put(`${legacyDir(DB)}/manifest.json`, {
          name: DB, owner: ADDR, vectorCount: 1, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
          chunks: [{ chunkId: 0, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [],
          pendingDocuments: [{ id: 'd1' }, { id: 'late' }],
        });
      }
    };
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
    const first = await s.migrateLegacyStorage();
    expect(first.databases[0]).toMatchObject({ name: DB, status: 'migrated', legacyKept: true });
    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['late'] });
    expect(await store(net.tab()).getDocumentBody(DB, 'late')).toBe('late body');
  });
});

describe('R7 — the legacy manifest hash is checked before the purge and again before the manifest is deleted', () => {
  const lateManifest = () => ({
    name: DB, owner: ADDR, vectorCount: 1, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
    chunks: [{ chunkId: 0, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [],
    pendingDocuments: [{ id: 'd1' }, { id: 'late' }],
  });

  test('a manifest-only rewrite before the purge starts keeps the manifest (the sealed copies go — §16 V1 phase A)', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), DB);
    const tab = net.tab({ dirCacheTtlMs: 0 });        // this tab's view is fresh (outside the recorded R7 residual)
    const put = tab.fs.put;
    let raced = false;
    tab.fs.put = async (path: string, data: any, o?: any) => {
      await put(path, data, o);
      if (!raced && path.endsWith('/manifest') && path.startsWith('home/rag/v1/')) {
        raced = true;
        await net.tab().fs.put(`${legacyDir(DB)}/manifest.json`, lateManifest());
      }
    };
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
    expect((await s.migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    // chunk-0 and d1 are in the sealed copy (phase A deletes them at once); the changed manifest is kept.
    expect(net.filePaths()).toContain(`${legacyDir(DB)}/manifest.json`);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['late'] });
  });

  test('a manifest-only rewrite during the purge keeps the manifest for the next run', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), DB);
    const tab = net.tab({ dirCacheTtlMs: 0 });
    const del = tab.fs.delete;
    let raced = false;
    tab.fs.delete = async (path: string) => {
      const ok = await del(path);
      if (!raced && path === `${legacyDir(DB)}/chunk-0.json`) {
        raced = true;
        await net.tab().fs.put(`${legacyDir(DB)}/manifest.json`, lateManifest());
      }
      return ok;
    };
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
    expect((await s.migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect(net.filePaths()).toContain(`${legacyDir(DB)}/manifest.json`);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['late'] });
  });
});

describe('R8 — a legacy chunk that provably does not exist is reported, not fatal', () => {
  test('reads skip it and the migration reports missingChunks', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), DB, { chunks: 1, listed: 2 });   // the manifest lists chunk-1; the file never existed
    const s = store(net.tab());
    expect((await s.listVectors(DB)).map((v) => v.id)).toEqual(['v0']);
    const report = await s.migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'migrated', missingChunks: [1] });
  });

  test('a chunk read that fails (rather than being absent) still throws', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), DB, { chunks: 2 });
    net.fail('get', `${legacyDir(DB)}/chunk-1.json`, 'dir404', 1);
    await expect(store(net.tab()).listVectors(DB)).rejects.toMatchObject({ code: 'RAG_CHUNK_UNREADABLE' });
  });
});

describe('R9 — one plaintext refusal on the normalised path, in every public write funnel', () => {
  test('double slashes, a leading slash and store({ path }) are all refused', async () => {
    const net = new FakeS5Network();
    const s = storage(net.tab());
    await expect(s.putWithRetry(`home//vector-databases/${ADDR}/db/documents/a.txt`, 'SECRET')).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await expect(s.putWithRetry('/home/rag/v1/abc/manifest', 'SECRET')).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await expect(s.store('SECRET', { path: 'home/rag/v1/abc/x', encrypt: false })).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await expect(s.store('SECRET', { path: `home/vector-databases/${ADDR}/db/x` })).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    expect(net.writes).toHaveLength(0);
  });
});

describe('R10 — every sealing context has a matching opener', () => {
  test('DocumentManager reads back the text of a document it stored sealed', async () => {
    const net = new FakeS5Network();
    const dm = new DocumentManager();
    Object.assign(dm as any, { initialized: true, userAddress: ADDR, s5Client: net.tab(), sealer: sealer() });
    const { documentId } = await dm.uploadDocument(new File(['sealed text body'], 'notes.txt', { type: 'text/plain' }), DB);
    const { extractionCache } = await import('../../../src/documents/extractors');
    extractionCache.clear();
    (dm as any).getFromRegistry(DB, documentId).textCached = '';
    expect(await dm.extractText(documentId, DB)).toBe('sealed text body');
  });
});
