// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 8 — storage-level classes (plan §21), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, SEED, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { storageSealerFromSeed, createStorageSealer } from '../../../src/storage/sealed/StorageSealer';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { legacyLayout, legacyManifestFrom } from '../../../src/storage/sealed/rag-layout';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const msg = (content: string, timestamp: number) => ({ role: 'user', content, timestamp });

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

function store(tab: FakeS5Tab, coherence?: RagCoherence) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}) });
}

function storage(tab: FakeS5Tab, coherence?: RagCoherence): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, ADDR), ...(coherence ? { coherence } : {}) });
  return s;
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

const pendingIds = (d: any) => d.pendingDocuments.map((p: any) => p.id);

beforeEach(() => __resetInProcessCoherenceForTests());

describe('BB1 — listAllDatabases answers after a discovery that outlasts the trust window', () => {
  test('one discovery per call, never a loop of them', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const s = store(tab, browserOrigin({ now: () => net.now })());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    let discoveries = 0;
    const list = tab.fs.list;
    tab.fs.list = function (this: unknown, path: string, options?: unknown) {
      // Each discovery takes 31 s — until the tenth, so a looping implementation ends and the count shows it.
      if (path === 'home/rag/v1' && ++discoveries <= 10) net.advance(31_000);
      return list.call(this, path, options);
    } as typeof tab.fs.list;
    await s.listAllDatabases();
    discoveries = 0;
    net.advance(31_000);                                              // the discovery is stale: the next call looks again
    expect((await s.listAllDatabases()).map((d) => d.databaseName)).toEqual(['kb']);
    expect(discoveries).toBe(1);
  });
});

describe('BB2 — the listing trusts a cached manifest only at its revision AND incarnation (as _load does)', () => {
  test('a same-origin commit to a re-created database at the cached revision is listed at once', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const x = store(net.tab(), origin());
    const y = store(net.tab(), origin());
    await x.listDatabases();
    await x.createDatabase({ name: 'notes', owner: ADDR });            // incarnation 1, revision 1
    await x.addPendingDocument('notes', { id: 'old-secret' });        // revision 2, cached in x
    await store(net.tab(), browserOrigin({ now: () => net.now })()).deleteDatabase('notes');
    await store(net.tab(), browserOrigin({ now: () => net.now })()).createDatabase({ name: 'notes', owner: ADDR });
    await y.addPendingDocument('notes', { id: 'new' });               // incarnation 2 at revision 2: x's head moves
    expect(pendingIds((await x.listDatabases()).find((d) => d.databaseName === 'notes'))).toEqual(['new']);
    expect(pendingIds((await x.listAllDatabases()).find((d) => d.databaseName === 'notes'))).toEqual(['new']);
  });
});

describe('BB4 — a legacy database that can never be moved says so', () => {
  test('a legacy body that already carries the seal: the write is refused, not retryable, with the entry', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('Old')}/manifest.json`, legacyManifest('Old', ['d1']));
    await net.tab().fs.put(`${legacyDir('Old')}/documents/d1.txt`, sealer().seal({ kind: 'text', value: 'x' }, 'elsewhere'));
    expect(await caught(store(net.tab()).addPendingDocument('Old', { id: 'd2' }))).toMatchObject({
      code: 'RAG_MIGRATION_FAILED', details: { database: 'Old', retryable: false, entry: { status: 'anomaly' } },
    });
  });
});

describe('BB7 — a name or id that UTF-8 cannot carry exactly is refused', () => {
  test('a lone surrogate in a database name: RAG_DATABASE_NAME_INVALID, and no collision with U+FFFD', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb�', owner: ADDR });
    expect(await caught(s.createDatabase({ name: 'kb\ud800', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_NAME_INVALID', details: { retryable: false } });
    expect(await s.getDatabase('kb\udfff')).toBeNull(); // §22 CC1: read, it names nothing (ids are lossless)
  });

  test('a lone surrogate in a document id: RAG_DOCUMENT_INVALID', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    expect(await caught(s.addPendingDocument('kb', { id: 'd\ud800' }))).toMatchObject({ code: 'RAG_DOCUMENT_INVALID', details: { retryable: false } });
    expect(await caught(s.putDocumentBody('kb', 'd\udc00', 'text'))).toMatchObject({ code: 'RAG_DOCUMENT_INVALID', details: { retryable: false } });
  });

  test('an empty database name is coded too', async () => {
    const s = store(new FakeS5Network().tab());
    expect(await caught(s.createDatabase({ name: ' ', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_NAME_INVALID', details: { retryable: false } });
  });
});

describe('BB8 — a legacy log without a message list is refused everywhere alike', () => {
  test('load, append and the migration all say STORAGE_LOAD_ERROR, not retryable', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(logPath('41'), { id: '41', metadata: {} });
    const s = storage(net.tab());
    expect(await caught(s.loadConversation('41'))).toMatchObject({ details: { retryable: false } });
    expect(await caught(s.appendMessage('41', msg('m', 1) as any))).toMatchObject({ code: 'STORAGE_APPEND_ERROR', details: { retryable: false } });
    expect((await storage(net.tab()).migrateLegacyConversationLogs()).failed).toEqual([expect.objectContaining({ id: '41', retryable: false })]);
  });
});

describe('BB9 — S2 at any age never loses what the plaintext alone holds', () => {
  test("the plaintext's fields (the later write) win; the messages are the union", async () => {
    const net = new FakeS5Network();
    const s = storage(net.tab(), browserOrigin({ now: () => net.now })());
    await s.saveConversation({ id: '7', messages: [msg('m1', 1), msg('sealed-only', 2)], metadata: { status: 'active', totalTokens: 0, title: 'kept' }, createdAt: 1, updatedAt: 1 } as any);
    net.advance(7 * 24 * 3600_000);                                   // a week later, an outdated tab ends the session
    await net.tab().fs.put(logPath('7'), { id: '7', messages: [msg('m1', 1), msg('m3', 3)], metadata: { status: 'completed', totalTokens: 812, endTime: 99 }, createdAt: 1, updatedAt: 99 });
    const read = await s.loadConversation('7');
    expect(read?.metadata).toEqual({ status: 'completed', totalTokens: 812, endTime: 99, title: 'kept' });
    expect(read?.updatedAt).toBe(99);
    expect(read?.messages.map((m: any) => m.content)).toEqual(['m1', 'sealed-only', 'm3']);
  });
});

describe("BB10 — only the layout's exact file names are the SDK's", () => {
  test('chunk-00.json and chunk-007.json are kept and reported, never deleted', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'kb', { d1: 'one' }, 1);
    await net.tab().fs.put(`${legacyDir('kb')}/chunk-00.json`, { note: 'not written by any SDK' });
    await net.tab().fs.put(`${legacyDir('kb')}/chunk-007.json`, { note: 'nor this' });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases.find((d) => d.name === 'kb')?.unrecognisedFiles?.sort()).toEqual(['chunk-00.json', 'chunk-007.json']);
    expect(net.filePaths().filter((p) => p.startsWith(legacyDir('kb'))).sort()).toEqual([`${legacyDir('kb')}/chunk-00.json`, `${legacyDir('kb')}/chunk-007.json`]);
  });
});

describe('BB13 — deleting a deleted database again never weakens its tombstone', () => {
  test('the second tombstone keeps the incarnation, so an outdated tab cannot bring the database back later', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const s = store(net.tab(), origin());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.deleteDatabase('kb');
    await seedLegacy(net, 'kb', { d1: 'an outdated tab wrote this' });     // an outdated tab writes it again
    await store(net.tab(), origin()).deleteDatabase('kb');                  // purged again: a second tombstone
    net.advance(60_000);                                                    // past the trust window of an unscoped head
    await seedLegacy(net, 'kb', { d1: 'and again' });
    expect(await store(net.tab(), origin()).getDatabase('kb')).toBeNull();
    expect((await store(net.tab(), origin()).listDatabases()).map((d) => d.databaseName)).toEqual([]);
  });
});

describe('BB15 — every permanent code says it is not retryable (the AA8 pins round 7 left out)', () => {
  test('STORAGE_SEALER_MISSING — no address to bind, and a log store with no sealer', async () => {
    expect(() => createStorageSealer(new Uint8Array(32), '')).toThrow(expect.objectContaining({ code: 'STORAGE_SEALER_MISSING', details: { retryable: false } }));
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: new FakeS5Network().tab(), userAddress: ADDR, connectionStatus: 'connected' });
    expect(await caught(s.saveConversation({ id: '9', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 } as any))).toMatchObject({ details: { retryable: false } });
  });

  test('RAG_IO_MISCONFIGURED — raw and hash reads without pathToHash', async () => {
    const io = new SealedIO(new FakeS5Network().tab() as any, () => false);
    expect(await caught(io.hashOf('x'))).toMatchObject({ code: 'RAG_IO_MISCONFIGURED', details: { retryable: false } });
    expect(await caught(io.readRaw('x'))).toMatchObject({ code: 'RAG_IO_MISCONFIGURED', details: { retryable: false } });
  });

  test('RAG_MIGRATION_VERIFY_FAILED — a sealed copy that does not hold what was read', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'kb', { d1: 'one' }, 1);
    const manager = em();
    const real = manager.getStorageSealer();
    // The sealed chunk opens, but holds no vectors: what verification exists to catch.
    const lying = { ...real, open: (bytes: Uint8Array, context: string) => {
      const opened = real.open(bytes, context);
      return context.includes('/chunk/') ? { ...opened, value: { ...(opened.value as object), vectors: [] } } : opened;
    } };
    manager.getStorageSealer = () => lying as any;
    const tab = net.tab();
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: manager, pathToHash: tab.pathToHash });
    const entry = (await s.migrateLegacyStorage()).databases.find((d) => d.name === 'kb');
    expect(entry).toMatchObject({ status: 'failed', code: 'RAG_MIGRATION_VERIFY_FAILED', retryable: false });
  });

  test('RAG_DOCUMENT_ALREADY_READY', async () => {
    const s = store(new FakeS5Network().tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addPendingDocument('kb', { id: 'd' });
    await s.updateDocumentStatus('kb', 'd', 'ready');
    expect(await caught(s.addPendingDocument('kb', { id: 'd' }))).toMatchObject({ code: 'RAG_DOCUMENT_ALREADY_READY', details: { retryable: false } });
  });

  test('the legacy side: a name with no legacy directory, a corrupt legacy manifest', () => {
    expect(() => legacyLayout.dir(ADDR, 'a/b')).toThrow(expect.objectContaining({ code: 'RAG_DATABASE_NAME_INVALID', details: expect.objectContaining({ retryable: false }) }));
    expect(() => legacyManifestFrom({ state: 'plain', value: 'not a manifest' } as any, 'here')).toThrow(expect.objectContaining({ code: 'RAG_MANIFEST_CORRUPT', details: expect.objectContaining({ retryable: false }) }));
  });
});

describe('BB18 — one code for a malformed legacy chunk, nested wherever it surfaces', () => {
  test('a read reports RAG_CHUNK_UNREADABLE, and the write that migrates reports RAG_LEGACY_UNREADABLE — each with cause RAG_CHUNK_MALFORMED', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('Old')}/manifest.json`, legacyManifest('Old', ['d1'], 1));
    await net.tab().fs.put(`${legacyDir('Old')}/chunk-0.json`, { chunkId: 0, notVectors: true });
    const s = store(net.tab());
    expect(await caught(s.listVectors('Old'))).toMatchObject({ code: 'RAG_CHUNK_UNREADABLE', details: { cause: { code: 'RAG_CHUNK_MALFORMED' } } });
    expect(await caught(s.addPendingDocument('Old', { id: 'd2' }))).toMatchObject({ code: 'RAG_LEGACY_UNREADABLE', details: { retryable: false, cause: { code: 'RAG_CHUNK_MALFORMED' } } });
  });
});
