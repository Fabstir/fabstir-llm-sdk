// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 4 — storage-level defect classes (plan §16 V1-V8, V10, V11). Written against s5js beta.55's
 * own-write shadow; the fake now models beta.56 (§18), and these tests hold their claims on it.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { createRagCoherence, __resetInProcessCoherenceForTests, HEAD_TRUST_MS, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const dbDir = (name: string) => `home/rag/v1/${sealer().deriveId('db', name)}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const legacyFiles = (net: FakeS5Network, name: string) => net.filePaths().filter((p) => p.startsWith(`${legacyDir(name)}/`));

function store(tab: FakeS5Tab, coherence?: RagCoherence, extra: Record<string, unknown> = {}) {
  return new S5VectorStore({
    s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}), ...extra,
  } as any);
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('V1 — the purge\'s last step acts on a quiet, fresh view', () => {
  test('an outdated tab\'s manifest rewrite within the cache window of the inventory is never deleted (chunk-less database)', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', { d1: 'one' });
    const tab = net.tab();
    const put = tab.fs.put;
    let raced = false;
    tab.fs.put = async (path: string, data: any, o?: any) => {
      await put(path, data, o);
      if (!raced && path.startsWith('home/rag/v1/') && path.endsWith('/manifest')) {
        raced = true;                                        // right after the sealed commit
        const old = net.tab();
        await old.fs.put(`${legacyDir('Notes')}/documents/d2.txt`, 'late body');
        await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['d1', 'd2']));
      }
    };
    expect((await store(tab).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect(legacyFiles(net, 'Notes')).toEqual(expect.arrayContaining([`${legacyDir('Notes')}/manifest.json`, `${legacyDir('Notes')}/documents/d2.txt`]));
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['d2'] });
    expect(await store(net.tab()).getDocumentBody('Notes', 'd2')).toBe('late body');
  });

  test('an upgrade-on-write migration never purges; the next background run does', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', { d1: 'one' }, 1);
    await store(net.tab()).addPendingDocument('Notes', { id: 'new' });
    expect(legacyFiles(net, 'Notes')).toHaveLength(3);
    await store(net.tab()).migrateLegacyStorage();
    expect(legacyFiles(net, 'Notes')).toEqual([]);
  });
});

describe('V2 — a cache entry is trusted only as long as something vouches for it', () => {
  test('a tab idle past the head window sees other tabs\' adds, creates and deletes', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), origin());
    await a.createDatabase({ name: 'notes', owner: ADDR });
    await a.createDatabase({ name: 'old', owner: ADDR });
    const b = store(net.tab(), origin());
    await b.listAllDatabases();                             // b's discovery and caches
    await a.addPendingDocument('notes', { id: 'd2' });
    await a.putDocumentBody('notes', 'd2', 'new body');
    await a.deleteDatabase('old');
    await a.createDatabase({ name: 'third', owner: ADDR });
    net.advance(HEAD_TRUST_MS + 1_000);
    const all = await b.listAllDatabases();
    expect(all.map((d) => d.databaseName).sort()).toEqual(['notes', 'third']);
    expect(all.find((d) => d.databaseName === 'notes')?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d2']);
    expect(await b.getDocumentBody('notes', 'd2')).toBe('new body');
    expect(await b.getDatabase('old')).toBeNull();
  });
});

describe('V2 — per entry', () => {
  test('inside the discovery window, an entry no head vouches for is re-read once past s5js\'s 30 s cache (another device\'s change)', async () => {
    const net = new FakeS5Network();
    const deviceA = browserOrigin({ now: () => net.now });
    const deviceB = browserOrigin({ now: () => net.now });
    const b = store(net.tab(), deviceB());
    await store(net.tab(), deviceA()).createDatabase({ name: 'notes', owner: ADDR });
    net.advance(31_000);
    expect((await b.getDatabase('notes'))?.pendingDocuments ?? []).toEqual([]);   // b caches it
    await store(net.tab(), deviceA()).addPendingDocument('notes', { id: 'from-a' });
    net.advance(40_000);                                    // past the 30 s cache, inside HEAD_TRUST_MS
    expect((await b.getDatabase('notes'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['from-a']);
  });
});

describe('V3 — a tombstone that recorded its incarnation does not expire', () => {
  test('legacy data an outdated tab writes under a tombstone is only ever purged, even after the window', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const s = store(net.tab(), origin());
    await s.createDatabase({ name: 'R', owner: ADDR });
    await s.deleteDatabase('R');
    await seedLegacy(net, 'R', { d1: 'stale' });
    net.advance(HEAD_TRUST_MS + 1_000);
    const t = store(net.tab(), origin());
    expect(await t.getDatabase('R')).toBeNull();
    expect((await t.migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'purged-after-delete' });
  });
});

describe('V1 — a file delete that finds the file already gone', () => {
  test('is gone, not "remaining" — even when this tab\'s listing still shows it', async () => {
    const { SealedIO } = await import('../../../src/storage/sealed/sealed-io');
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/x/only', 'a');
    await a.fs.put('home/x/keep', 'b');
    const io = new SealedIO(b as any, () => false, b.pathToHash);
    await io.list('home/x');                                // b caches the listing
    await a.fs.delete('home/x/only');
    await io.deleteFiles('home/x', ['only']);               // a NotModified no-op for b: nothing re-lists fresh
    expect(net.filePaths()).toEqual(['home/x/keep']);
  });
});

describe('V4 — delete skips the manifest read only on a permanent error', () => {
  test('a transient read failure fails the delete, and nothing is deleted', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'x', owner: ADDR });
    __resetInProcessCoherenceForTests();
    net.fail('get', `${dbDir('x')}/manifest`, 'network', 10);
    const err = await caught(store(net.tab()).deleteDatabase('x'));
    expect(err).toMatchObject({ details: { retryable: true } });
    expect(net.filePaths()).toContain(`${dbDir('x')}/manifest`);
  });
});

describe('V5 — a sealed directory never loses its manifest before its data', () => {
  test('an interrupted delete leaves a listed database that can be deleted again', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'Research', owner: ADDR });
    await s.putDocumentBody('Research', 'd1', 'body');
    net.fail('delete', /\/documents\//, 'network', 1);
    await caught(store(net.tab()).deleteDatabase('Research'));
    __resetInProcessCoherenceForTests();
    const fresh = store(net.tab());
    expect((await fresh.listAllDatabases()).map((d) => d.databaseName)).toEqual(['Research']);
    await fresh.deleteDatabase('Research');
    expect(net.filePaths().filter((p) => p.startsWith('home/rag/'))).toEqual([]);
  });

  test('a resolved sealed directory with entries but no manifest is an orphan, not a discovery failure', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kept', owner: ADDR });
    const orphan = `home/rag/v1/${'ab'.repeat(16)}`;
    await net.tab().fs.put(`${orphan}/documents/x`, sealer().seal({ kind: 'text', value: 'x' }, 'c'), { mediaType: 'application/octet-stream' });
    __resetInProcessCoherenceForTests();
    expect((await store(net.tab()).listAllDatabases()).map((d) => d.databaseName)).toEqual(['kept']);
  });
});

describe('V6 — consent binds to items, and a blip is not "unreadable"', () => {
  test('a single network blip on a legacy read is retried, not reported unreadable', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'db', { d1: 'one' }, 2);
    net.fail('get', `${legacyDir('db')}/chunk-1.json`, 'network', 1);
    const blob = [...net.blobs].find(([, b]) => new TextDecoder().decode(b) === 'one')![0];
    net.fail('download', blob, 'network', 1);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', vectors: 2 });
    expect(await store(net.tab()).getDocumentBody('db', 'd1')).toBe('one');
  });

  test('consent covers exactly the items shown: another item failing on the consented run is not discarded', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'db', {}, 2);
    await net.tab().fs.put(`${legacyDir('db')}/chunk-0.json`, { chunkId: 0, notVectors: true });   // permanently unreadable
    const first = await store(net.tab()).migrateLegacyStorage();
    expect(first.databases[0]).toMatchObject({ status: 'failed', code: 'RAG_LEGACY_UNREADABLE', unreadable: { chunks: [0] } });
    net.fail('get', `${legacyDir('db')}/chunk-1.json`, 'network', 3);                          // chunk 1 fails on THIS run
    const consented = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { db: { chunks: [0] } } });
    expect(consented.databases[0]).toMatchObject({ status: 'failed', unreadable: { chunks: [1] } });
    expect(legacyFiles(net, 'db')).toContain(`${legacyDir('db')}/chunk-1.json`);
    const done = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { db: { chunks: [0] } } });
    expect(done.databases[0]).toMatchObject({ status: 'migrated', discardedUnreadable: { chunks: [0] }, vectors: 1 });
  });

  test('an unreadable legacy body beside a sealed copy is reported unreadable, and consent discards it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', { d1: 'one' });
    await store(net.tab()).migrateLegacyStorage();
    const old = net.tab();
    await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['d1', 'd9']));
    await old.fs.put(`${legacyDir('Notes')}/documents/d9.txt`, 'lost');
    const lost = [...net.blobs].find(([, b]) => new TextDecoder().decode(b) === 'lost')![0];
    net.blobs.delete(lost);
    const r1 = await store(net.tab()).migrateLegacyStorage();
    expect(r1.databases[0]).toMatchObject({ legacyKept: true, unreadable: { bodies: ['d9'] } });
    expect(r1.databases[0].missingBodies ?? []).not.toContain('d9');
    const r2 = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { Notes: { bodies: ['d9'] } } });
    expect(r2.databases[0]).toMatchObject({ discardedUnreadable: { bodies: ['d9'] } });
    expect(legacyFiles(net, 'Notes')).toEqual([]);
  });
});

describe('V7 — nothing is committed that has not been verified; bytes are exact', () => {
  test('a body that fails verification leaves no sealed manifest and the legacy copy intact', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'db', { d1: 'real body' });
    const s = store(net.tab());
    const write = (s as any)._writeBodyLocked.bind(s);
    (s as any)._writeBodyLocked = (dbId: string, m: any, id: string) => write(dbId, m, id, { kind: 'text', value: 'tampered' });
    const report = await s.migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'failed', code: 'RAG_MIGRATION_VERIFY_FAILED' });
    expect(net.filePaths().filter((p) => p.startsWith('home/rag/v1/') && p.endsWith('/manifest'))).toEqual([]);
    expect(legacyFiles(net, 'db')).toHaveLength(2);
  });

  test('chunks that fail verification are never committed: no manifest, the legacy copy intact', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'db', { d1: 'body' }, 2);
    const s = store(net.tab());
    const commit = (s as any)._commitLocked.bind(s);
    (s as any)._commitLocked = (n: string, d: string, r: number, m: any, v: Map<string, any> | undefined, before: any) =>
      commit(n, d, r, m, v && new Map([...v].slice(1)), before);                   // a vector lost on the way
    const report = await s.migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'failed', code: 'RAG_MIGRATION_VERIFY_FAILED' });
    expect(net.filePaths().filter((p) => p.startsWith('home/rag/v1/') && p.endsWith('/manifest'))).toEqual([]);
    expect(legacyFiles(net, 'db')).toHaveLength(4);
  });

  test('a body with a leading BOM keeps it, through the API and the migration', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'x', owner: ADDR });
    await s.addPendingDocument('x', { id: 'd' });                     // a body is served for a listed document (§19 Z11)
    await s.putDocumentBody('x', 'd', '﻿bom text');
    expect(await store(net.tab()).getDocumentBody('x', 'd')).toBe('﻿bom text');
    await seedLegacy(net, 'legacy', { d1: '﻿legacy bom' });
    expect((await store(net.tab()).migrateLegacyStorage()).databases.find((d) => d.name === 'legacy')).toMatchObject({ status: 'migrated' });
    expect(await store(net.tab()).getDocumentBody('legacy', 'd1')).toBe('﻿legacy bom');
  });
});

describe('V8 — one error shape everywhere', () => {
  test('STORAGE_OFFLINE and RAG_LOCK_TIMEOUT say they are retryable', async () => {
    const net = new FakeS5Network();
    expect(await caught(store(net.tab(), undefined, { isOnline: () => false }).createDatabase({ name: 'x', owner: ADDR })))
      .toMatchObject({ code: 'STORAGE_OFFLINE', details: { retryable: true } });
    const c = createRagCoherence({ isBrowser: false, lockTimeoutMs: 20 });
    const hold = c.withLock('db', () => new Promise((r) => setTimeout(r, 200)));
    expect(await caught(c.withLock('db', async () => 1))).toMatchObject({ code: 'RAG_LOCK_TIMEOUT', details: { retryable: true } });
    await hold;
  });

  test('a head store that will not open is RAG_COHERENCE_UNAVAILABLE on every head call, not a raw error', async () => {
    const factory = { open: () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); } } as any;
    const c = createRagCoherence({ isBrowser: true, locks: { request: async (_n: string, _o: any, cb: any) => cb() } as any, indexedDB: factory });
    await expect(c.getHead('x')).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    await expect(c.listHeads()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });

  test('a closed head-store connection is reopened, not reused', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const real = new IDBFactory();
    const opened: IDBDatabase[] = [];
    const factory = {
      open: (...a: any[]) => {
        const req = (real.open as any)(...a);
        req.addEventListener('success', () => opened.push(req.result));
        return req;
      },
    } as any;
    const c = createRagCoherence({ isBrowser: true, locks: { request: async (_n: string, _o: any, cb: any) => cb() } as any, indexedDB: factory });
    await c.putHead('x', { revision: 1 });
    opened[0].close();                                        // storage cleared / another version took over
    expect(await c.getHead('x')).toMatchObject({ revision: 1 });
  });

  test('a log read failure carries details.retryable and details.cause', async () => {
    const net = new FakeS5Network();
    const sm = new StorageManager();
    Object.assign(sm as any, { initialized: true, s5Client: net.tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    await sm.saveConversation({ id: '41', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 } as any);
    net.fail('get', `home/sessions/${ADDR}/41/conversation.json`, 'dir404', 1);
    const fresh = new StorageManager();
    Object.assign(fresh as any, { initialized: true, s5Client: net.tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    const err = await caught(fresh.loadConversation('41'));
    expect(err.details).toMatchObject({ retryable: true });
    expect(err.details.cause).toBeDefined();
  });
});

describe('V10 — a report is complete or it says why', () => {
  test('a failed root removal is recorded; the report survives', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'R', { d1: 'one' });
    net.fail('delete', `home/vector-databases/${ADDR}`, 'network', 1);
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ name: 'R', status: 'migrated' });
    expect(report.purgeErrors?.[0]).toMatchObject({ root: `home/vector-databases/${ADDR}` });
  });

  test('unrecognised files are reported on the leftover path too', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'R', { d1: 'one' });
    await store(net.tab()).migrateLegacyStorage();
    const old = net.tab();
    await old.fs.put(`${legacyDir('R')}/manifest.json`, legacyManifest('R', ['d1']));
    await old.fs.put(`${legacyDir('R')}/notes.json`, { x: 1 });
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'purged-leftover', unrecognisedFiles: ['notes.json'] });
  });
});

describe('V11 — small contract gaps', () => {
  test('listAllDatabases refuses to answer with the manifest cache disabled', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'A', owner: ADDR });
    await expect(store(net.tab(), undefined, { cacheEnabled: false }).listAllDatabases()).rejects.toThrow();
  });
});
