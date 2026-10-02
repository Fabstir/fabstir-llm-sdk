// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 6 — storage-level classes (plan §19 Z2, Z3, Z4, Z5, Z7, Z8, Z9, Z10, Z11, Z13, Z14, Z15, Z18, Z19,
 * Z20, Z23, and X4), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, SEED, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { EncryptionManager } from '../../../src/managers/EncryptionManager';
import { storageSealerFromSeed } from '../../../src/storage/sealed/StorageSealer';
import { __resetInProcessCoherenceForTests, HEAD_TRUST_MS, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const OTHER = '0x' + '5'.repeat(40);
const legacyDir = (name: string, addr = ADDR) => `home/vector-databases/${addr}/${name}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0, owner = ADDR) => ({
  name, owner, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const files = (net: FakeS5Network, prefix: string) => net.filePaths().filter((p) => p.startsWith(prefix));

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0, addr = ADDR) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name, addr)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks, addr));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name, addr)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `v${i}-${addr.slice(-4)}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name, addr)}/documents/${id}.txt`, body);
}

function store(tab: FakeS5Tab, coherence?: RagCoherence, opts: { addr?: string } = {}) {
  const addr = opts.addr ?? ADDR;
  return new S5VectorStore({
    s5Client: tab as any, userAddress: addr, encryptionManager: addr === ADDR ? em() : EncryptionManager.fromSeed(SEED, addr),
    pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}),
  });
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('Z2 — a legacy path exists only for a single-segment name', () => {
  test("deleteDatabase('' | '/' | 'a/b' | '..') never touches another database's legacy data", async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Thesis', { d1: 'one' }, 1);
    await seedLegacy(net, 'Contracts', { c1: 'two' });
    const before = files(net, 'home/vector-databases/');
    for (const name of ['', '/', 'Thesis/documents', '..', '.']) {
      await store(net.tab()).deleteDatabase(name).catch(() => undefined);
      expect(files(net, 'home/vector-databases/')).toEqual(before);
    }
    await expect(store(net.tab()).deleteDatabase('')).rejects.toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
    const { legacyLayout } = await import('../../../src/storage/sealed/rag-layout');
    for (const name of ['', '/', 'a/b', '..', '.']) expect(() => legacyLayout.dir(ADDR, name)).toThrow(expect.objectContaining({ code: 'RAG_DATABASE_NAME_INVALID' }));
  });
});

describe("Z5 — a head never overrides a fresh read; heads are trusted for 30 s", () => {
  test("device B's own head does not undo device A's delete a minute later", async () => {
    const net = new FakeS5Network();
    const devA = browserOrigin({ now: () => net.now });
    const devB = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), devA());
    const b = store(net.tab(), devB());
    await a.createDatabase({ name: 'notes', owner: ADDR });
    net.advance(1_000);
    await b.addPendingDocument('notes', { id: 'b1' });               // B's own head
    net.advance(10_000);
    await a.deleteDatabase('notes');
    net.advance(60_000);
    expect(await caught(b.addPendingDocument('notes', { id: 'b2' }))).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
    const c = store(net.tab(), browserOrigin({ now: () => net.now })());
    expect(await c.getDatabase('notes')).toBeNull();
  });

  test("inside the trust window too: device B's own fresh head does not undo device A's delete", async () => {
    const net = new FakeS5Network();
    const devA = browserOrigin({ now: () => net.now });
    const devB = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), devA());
    const b = store(net.tab(), devB());
    await a.createDatabase({ name: 'notes', owner: ADDR });
    await b.addPendingDocument('notes', { id: 'b1' });               // B's own head, trusted for HEAD_TRUST_MS
    net.advance(10_000);
    await a.deleteDatabase('notes');
    net.advance(10_000);                                             // still inside B's head's window
    expect(await caught(b.addPendingDocument('notes', { id: 'b2' }))).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
  });

  test("a device's own log head never brings back a log that is gone from its path", async () => {
    const net = new FakeS5Network();
    const b = new StorageManager();
    Object.assign(b as any, { initialized: true, s5Client: net.tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, ADDR), coherence: browserOrigin({ now: () => net.now })() });
    await b.saveConversation({ id: '9', messages: [{ role: 'user', content: 'old', timestamp: 1 }], metadata: {}, createdAt: 1, updatedAt: 1 } as any);
    await net.tab().fs.delete(`home/sessions/${ADDR}/9/conversation.json`);   // removed elsewhere
    expect(await b.loadConversation('9')).toBeNull();
  });

  test('HEAD_TRUST_MS is derived from beta.56: 30 s', () => {
    expect(HEAD_TRUST_MS).toBe(30_000);
  });
});

describe('Z7 — a legacy manifest that never reads has a way out', () => {
  test('discovery names the database; deleteDatabase removes it without reading its manifest', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Broken', { d1: 'one' }, 1);
    await seedLegacy(net, 'Fine', { f1: 'two' });
    net.fail('get', new RegExp(`${legacyDir('Broken')}/manifest\\.json$`), 'network', 1_000);
    const err = await caught(store(net.tab()).listAllDatabases());
    expect(err).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE' });
    expect(err.details.failed).toEqual([expect.objectContaining({ database: 'Broken' })]);
    await store(net.tab()).deleteDatabase('Broken');
    expect(files(net, `${legacyDir('Broken')}/`)).toEqual([]);
    expect((await store(net.tab()).listAllDatabases()).map((d) => d.databaseName)).toEqual(['Fine']);
  });
});

describe('Z8 — keys and ids are bound to the address: one seed, two addresses, never merged', () => {
  function storage(net: FakeS5Network, addr: string): StorageManager {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: net.tab(), userAddress: addr, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, addr) });
    return s;
  }
  const conv = (id: string, contents: string[]) => ({ id, messages: contents.map((content, i) => ({ role: 'user', content, timestamp: i + 1 })), metadata: {}, createdAt: 1, updatedAt: 1 });

  test('the sealer: another address, other ids; the same address in another case, the same', () => {
    expect(storageSealerFromSeed(SEED, ADDR).deriveId('db', 'x')).not.toBe(storageSealerFromSeed(SEED, OTHER).deriveId('db', 'x'));
    expect(storageSealerFromSeed(SEED, ADDR.toLowerCase()).deriveId('db', 'x')).toBe(storageSealerFromSeed(SEED, ADDR).deriveId('db', 'x'));
    expect(EncryptionManager.fromSeed(SEED, ADDR).getStorageSealer().deriveId('db', 'x')).toBe(storageSealerFromSeed(SEED, ADDR).deriveId('db', 'x'));
    const sealed = storageSealerFromSeed(SEED, ADDR).seal({ kind: 'text', value: 'x' }, 'ctx');
    expect(() => storageSealerFromSeed(SEED, OTHER).open(sealed, 'ctx')).toThrow();                // the key too, not only ids
    expect(() => storageSealerFromSeed(SEED, '')).toThrow(expect.objectContaining({ code: 'STORAGE_SEALER_MISSING' }));
  });

  test('conversation logs: session 5 of each address stays its own', async () => {
    const net = new FakeS5Network();
    await storage(net, ADDR).saveConversation(conv('5', ['A: secret question', 'A: secret answer']) as any);
    await storage(net, OTHER).saveConversation(conv('5', ['B: my own first prompt']) as any);
    expect((await storage(net, OTHER).loadConversation('5'))?.messages.map((m: any) => m.content)).toEqual(['B: my own first prompt']);
    expect((await storage(net, ADDR).loadConversation('5'))?.messages.map((m: any) => m.content)).toEqual(['A: secret question', 'A: secret answer']);
  });

  test("RAG: B's legacy database is migrated as B's, never merged into A's sealed one of the same name", async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'Notes', owner: ADDR });
    await a.addPendingDocument('Notes', { id: 'doc-A' });
    await seedLegacy(net, 'Notes', { 'doc-B': 'B body' }, 1, OTHER);
    expect((await store(net.tab(), undefined, { addr: OTHER }).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated' });
    expect((await store(net.tab()).getDatabase('Notes'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['doc-A']);
    const b = store(net.tab(), undefined, { addr: OTHER });
    expect((await b.getDatabase('Notes'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['doc-B']);
    expect(await b.getDocumentBody('Notes', 'doc-B')).toBe('B body');
  });
});

describe('Z9 — nothing between the manifest re-check and its delete', () => {
  test('the last hash of manifest.json is followed directly by its delete', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    const tab = net.tab();
    const ops: string[] = [];
    const manifest = `${legacyDir('Research')}/manifest.json`;
    const hash = tab.pathToHash;
    (tab as any).pathToHash = async (p: string, o?: any) => { ops.push(p === manifest ? 'hash manifest' : 'hash'); return hash(p, o); };
    const list = tab.fs.list;
    tab.fs.list = (p: string, o?: any) => { ops.push('list'); return list(p, o); };
    const del = tab.fs.delete;
    tab.fs.delete = async (p: string) => { ops.push(p === manifest ? 'delete manifest' : 'delete'); return del(p); };
    await store(tab).migrateLegacyStorage();
    const at = ops.indexOf('delete manifest');
    expect(at).toBeGreaterThan(0);
    expect(ops[at - 1]).toBe('hash manifest');
  });
});

describe('Z10 — a tombstone covers a cached legacy manifest of its database', () => {
  test('migrated and deleted in another tab: gone from this tab\'s complete list', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Old', { d1: 'one' }, 1);
    const origin = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), origin());
    expect((await a.listAllDatabases()).map((d) => d.databaseName)).toEqual(['Old']);
    const b = store(net.tab(), origin());
    await b.addPendingDocument('Old', { id: 'd2' });
    await b.deleteDatabase('Old');
    net.advance(5_000);
    expect((await a.listAllDatabases()).map((d) => d.databaseName)).toEqual([]);
  });
});

describe('Z13 — the migration never deletes what it does not recognise', () => {
  test('files outside the layout are kept and reported, and so is anything not written by the old DocumentManager', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    const t = net.tab();
    await t.fs.put(`${legacyDir('Research')}/documents/d1.pdf`, new Uint8Array([1]));
    await t.fs.put(`${legacyDir('Research')}/knowledge-graph.bin`, new Uint8Array([2]));
    await t.fs.put(`${legacyDir('Research')}/thumbs/d1.png`, new Uint8Array([3]));
    const oldDocs = `home/documents/${ADDR}`;
    await t.fs.put(`${oldDocs}/Research/Research_-12345_1700000000000_abc12`, new Uint8Array([4]));   // the old DocumentManager's own
    await t.fs.put(`${oldDocs}/unrelated/file.txt`, 'the UI keeps this');
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'migrated' });
    expect(report.databases[0].legacyKept).toBeUndefined();                  // our data is gone; the rest is not ours
    expect(report.databases[0].unrecognisedFiles?.sort()).toEqual(['documents/d1.pdf', 'knowledge-graph.bin', 'thumbs/d1.png']);
    expect(files(net, `${legacyDir('Research')}/`).sort()).toEqual([
      `${legacyDir('Research')}/documents/d1.pdf`, `${legacyDir('Research')}/knowledge-graph.bin`, `${legacyDir('Research')}/thumbs/d1.png`,
    ]);
    expect(files(net, `${oldDocs}/`)).toEqual([`${oldDocs}/unrelated/file.txt`]);
    expect(report.unrecognisedFiles).toEqual([`${oldDocs}/unrelated/file.txt`]);
  });
});

describe('Z20 — a directory another tab already purged is purged', () => {
  test('two tabs migrating at once: nobody reports legacyKept for a directory that is gone', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 1;
    await seedLegacy(net, 'notes', { a: 'body a' });
    const origin = browserOrigin();
    const [r1, r2] = await Promise.all([store(net.tab(), origin()).migrateLegacyStorage(), store(net.tab(), origin()).migrateLegacyStorage()]);
    expect(files(net, `${legacyDir('notes')}/`)).toEqual([]);
    expect([...r1.databases, ...r2.databases].filter((d) => d.legacyKept)).toEqual([]);
  });
});

describe('Z3 — an invalidation after discovery never yields a partial "all"', () => {
  test("an invalidation while listAllDatabases reconciles heads: all six, or RAG_DISCOVERY_INCOMPLETE", async () => {
    const net = new FakeS5Network();
    const writer = store(net.tab(), browserOrigin({ now: () => net.now })());
    for (let i = 0; i < 6; i++) await writer.createDatabase({ name: `db${i}`, owner: ADDR });
    const s = store(net.tab(), browserOrigin({ now: () => net.now })());
    await s.listAllDatabases();
    const heads = (s as any).heads;
    const listHeads = heads.listHeads.bind(heads);
    let armed = true;
    heads.listHeads = async () => { const all = await listHeads(); if (armed) { armed = false; s.invalidateCaches(); } return all; };
    const result = await s.listAllDatabases().then((l) => l.map((d) => d.databaseName).sort(), (e: any) => e.code);
    expect([['db0', 'db1', 'db2', 'db3', 'db4', 'db5'], 'RAG_DISCOVERY_INCOMPLETE']).toContainEqual(result);
  });
});

describe('Z4 — a failed sealed listing never lets a legacy copy stand in', () => {
  test('an upgraded database whose legacy copy remains is served sealed on a device whose sealed listing failed', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Thesis', { d1: 'one' });
    const s = store(net.tab(), browserOrigin({ now: () => net.now })());
    await s.addPendingDocument('Thesis', { id: 'd2' });                  // upgrade on write: sealed; the legacy copy stays
    await s.removeDocument('Thesis', 'd1');
    net.fail('list', 'home/rag/v1', 'network', 5);                        // outlasts discovery's retries
    const other = store(net.tab(), browserOrigin({ now: () => net.now })());
    await other.listDatabases().catch(() => undefined);
    expect((await other.getDatabase('Thesis'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d2']);
  });
});

describe('Z18 — a superseded discovery caches nothing', () => {
  test("a straggler from before an invalidation never overwrites what the current discovery read", async () => {
    const net = new FakeS5Network();
    const tabA = net.tab();
    const manifestPath = `home/rag/v1/${em().getStorageSealer().deriveId('db', 'notes')}/manifest`;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let holding = false;
    const slowA: any = { ...tabA, fs: { ...tabA.fs, get: async (p: string, o?: any) => {
      const v = await tabA.fs.get(p, o);
      if (p === manifestPath && !holding) { holding = true; await gate; }
      return v;
    } } };
    const b = store(net.tab(), browserOrigin()());
    const a = new S5VectorStore({ s5Client: slowA, userAddress: ADDR, encryptionManager: em(), pathToHash: tabA.pathToHash, coherence: browserOrigin()() });
    await b.createDatabase({ name: 'notes', owner: ADDR });
    const gen1 = a.initialize();
    while (!holding) await new Promise((r) => setTimeout(r, 5));
    await b.addPendingDocument('notes', { id: 'doc-from-B' });
    a.invalidateCaches();
    await a.listAllDatabases();
    release();
    await gen1;
    expect((await a.getDatabase('notes'))?.pendingDocuments?.map((d: any) => d.id)).toContain('doc-from-B');
  });
});

describe('Z19 — the uncertain "Parent Directory of" never reads as a not-found code', () => {
  test('an unvouched root is S5_IO_ERROR (retryable), s5js\'s code kept aside', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'x', owner: ADDR });
    net.registryMiss('', 1);
    expect(await caught(store(net.tab(), browserOrigin()()).getDatabase('x')))
      .toMatchObject({ code: 'S5_IO_ERROR', details: { retryable: true, s5Code: 'S5_PATH_NOT_FOUND' } });
  });
});

describe('Z11 / Z15 — a body only for a listed document; "no body yet" has its own code', () => {
  test('sealed: listed without a body → RAG_DOCUMENT_BODY_MISSING; unlisted → RAG_DOCUMENT_NOT_FOUND, even with a body', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addPendingDocument('kb', { id: 'listed' });
    await s.putDocumentBody('kb', 'orphan', 'a body whose entry never came');
    expect(await caught(s.getDocumentBody('kb', 'listed'))).toMatchObject({ code: 'RAG_DOCUMENT_BODY_MISSING', details: { database: 'kb', documentId: 'listed', retryable: false } });
    expect(await caught(s.getDocumentBody('kb', 'orphan'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
    expect(await caught(s.getDocumentBody('kb', 'never-added'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });

  test('legacy: the same two answers', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('Old')}/manifest.json`, legacyManifest('Old', ['with-body', 'no-body']));
    await net.tab().fs.put(`${legacyDir('Old')}/documents/with-body.txt`, 'body');
    const s = store(net.tab());
    expect(await s.getDocumentBody('Old', 'with-body')).toBe('body');
    expect(await caught(s.getDocumentBody('Old', 'no-body'))).toMatchObject({ code: 'RAG_DOCUMENT_BODY_MISSING' });
    expect(await caught(s.getDocumentBody('Old', 'never-added'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });
});

describe('Z14 — every storage error says whether retrying may help', () => {
  test('RAG_CHUNK_UNREADABLE carries its cause\'s verdict at the top', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addVectors('kb', [{ id: 'v', vector: [1, 0], metadata: {} }]);
    net.fail('download', /./, 'network', 100);
    expect(await caught(store(net.tab()).listVectors('kb'))).toMatchObject({ code: 'RAG_CHUNK_UNREADABLE', details: { retryable: true } });
  });

  test('an upgrade on write that did not seal says why, and that a retry may', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Old', { d1: 'one' });
    const tab = net.tab();
    const get = tab.fs.get;
    let reads = 0;
    tab.fs.get = async (p: string, o?: any) => {
      // The legacy manifest is gone for the migration's own read only (another tab's purge in between).
      if (p === `${legacyDir('Old')}/manifest.json` && ++reads === 2) return undefined;
      return get(p, o);
    };
    expect(await caught(store(tab).addPendingDocument('Old', { id: 'd2' })))
      .toMatchObject({ code: 'RAG_MIGRATION_FAILED', details: { database: 'Old', retryable: true } });
  });
});

describe('Z23 — each sealed blob is verified once per migration', () => {
  test('no blob is downloaded twice', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one', d2: 'two' }, 1);
    const tab = net.tab();
    const downloads = new Map<string, number>();
    const dl = tab.downloadByCID;
    tab.downloadByCID = async (h: Uint8Array) => {
      const key = Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
      downloads.set(key, (downloads.get(key) ?? 0) + 1);
      return dl(h);
    };
    expect((await store(tab).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated' });
    expect(downloads.size).toBe(5);                  // the two legacy bodies read raw; two sealed bodies and a chunk verified
    expect([...downloads.values()]).toEqual([1, 1, 1, 1, 1]);
  });
});

describe('X4 — a directory a late cross-device write re-created after a delete', () => {
  test('its orphan is excluded from "all", and the name can be created and deleted again', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab(), browserOrigin({ now: () => net.now })());
    await a.createDatabase({ name: 'kb', owner: ADDR });
    await a.addPendingDocument('kb', { id: 'd1' });
    await a.putDocumentBody('kb', 'd1', 'first');
    const sealer = em().getStorageSealer();
    const dbId = sealer.deriveId('db', 'kb');
    await store(net.tab(), browserOrigin({ now: () => net.now })()).deleteDatabase('kb');
    // A body write whose fresh read preceded the delete lands now: beta.56 re-creates the directory (P3 window).
    await net.tab().fs.put(`home/rag/v1/${dbId}/documents/${sealer.deriveId('doc', `${dbId}:d2`)}`,
      sealer.seal({ kind: 'text', value: 'late' }, 'x'), { mediaType: 'application/octet-stream' });
    const c = store(net.tab(), browserOrigin({ now: () => net.now })());
    expect(await c.listAllDatabases()).toEqual([]);
    await c.createDatabase({ name: 'kb', owner: ADDR });
    await c.deleteDatabase('kb');
    expect(files(net, `home/rag/v1/${dbId}/`)).toEqual([]);
  });
});

