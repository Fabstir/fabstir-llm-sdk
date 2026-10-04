// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 7 — storage-level classes (plan §20 AA2-AA4, AA7-AA11), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, SEED, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { storageSealerFromSeed } from '../../../src/storage/sealed/StorageSealer';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const msg = (content: string, timestamp: number) => ({ role: 'user', content, timestamp });
const conv = (id: string, messages: Array<ReturnType<typeof msg>>) => ({ id, messages, metadata: {}, createdAt: 1, updatedAt: 1 });

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

beforeEach(() => __resetInProcessCoherenceForTests());

describe('AA2 — "all" is never answered from a cache a reset emptied', () => {
  test('an invalidation queued on the discovery listAllDatabases joins', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Thesis', { d1: 'one' });
    await seedLegacy(net, 'Contracts', { c1: 'two' });
    await store(net.tab()).createDatabase({ name: 'Sealed', owner: ADDR });
    __resetInProcessCoherenceForTests();
    const s = store(net.tab());
    const reset = s.initialize().then(() => s.invalidateCaches());
    const [all] = await Promise.all([s.listAllDatabases(), reset]);
    expect(all.map((d) => d.databaseName).sort()).toEqual(['Contracts', 'Sealed', 'Thesis']);
  });
});

describe('AA3 — S2 recovers a sealed log under plaintext at any age', () => {
  test("an outdated tab's overwrite a minute after the seal keeps the sealed-only messages", async () => {
    const net = new FakeS5Network();
    const s = storage(net.tab(), browserOrigin({ now: () => net.now })());
    await s.saveConversation(conv('41', [msg('m1', 1), msg('m2', 2)]) as any);
    net.advance(60_000);
    await net.tab().fs.put(logPath('41'), conv('41', [msg('m1', 1), msg('old', 3)]));   // it never saw m2
    await s.appendMessage('41', msg('m4', 4) as any);
    expect((await s.loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'm2', 'old', 'm4']);
  });
});

describe('AA4 — a head vouches for a cached manifest only at its revision AND incarnation', () => {
  test('a same-origin commit to a re-created database at the same revision is seen at once', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const x = store(net.tab(), origin());
    const y = store(net.tab(), origin());
    await x.createDatabase({ name: 'notes', owner: ADDR });
    await x.addPendingDocument('notes', { id: 'old-secret' });
    expect((await x.getDatabase('notes'))!.pendingDocuments!.map((d: any) => d.id)).toEqual(['old-secret']);
    net.advance(60_000);
    await store(net.tab(), browserOrigin({ now: () => net.now })()).deleteDatabase('notes');
    await store(net.tab(), browserOrigin({ now: () => net.now })()).createDatabase({ name: 'notes', owner: ADDR });
    net.advance(60_000);
    await y.addPendingDocument('notes', { id: 'new' });               // same origin as x: the head moves to rev 2 now
    expect((await x.getDatabase('notes'))!.pendingDocuments!.map((d: any) => d.id)).toEqual(['new']);
  });
});

describe('AA4 — what a head does vouch for is served without a read', () => {
  test('after its own commit, a tab reads the database from its cache: the head matches revision and incarnation', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const s = store(tab, browserOrigin({ now: () => net.now })());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addPendingDocument('kb', { id: 'd1' });
    let reads = 0;
    const get = tab.fs.get;
    tab.fs.get = async (p: string, o?: any) => { if (p.endsWith('/manifest')) reads++; return get(p, o); };
    net.advance(20_000);                                              // inside the head's window: the head is what vouches
    expect((await s.getDatabase('kb'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d1']);
    expect(reads).toBe(0);
  });
});

describe('AA7 — a legacy directory holding only files the SDK does not own', () => {
  test('gets no entry and no verification; its files are listed on the report', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' }, 1);
    await net.tab().fs.put(`${legacyDir('Research')}/notes.json`, { x: 1 });
    await store(net.tab()).migrateLegacyStorage();                      // migrated; notes.json kept
    const tab = net.tab();
    let downloads = 0;
    const dl = tab.downloadByCID;
    tab.downloadByCID = async (h: Uint8Array) => { downloads++; return dl(h); };
    const report = await store(tab).migrateLegacyStorage();
    expect(report.databases).toEqual([]);
    expect(report.unrecognisedFiles).toEqual([`${legacyDir('Research')}/notes.json`]);
    expect(downloads).toBe(0);
  });
});

describe('AA8 — a permanent failure says it is not retryable', () => {
  test('a malformed legacy chunk, an unknown database or document, a refused write', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('Old')}/manifest.json`, legacyManifest('Old', ['d1'], 1));
    await net.tab().fs.put(`${legacyDir('Old')}/chunk-0.json`, { chunkId: 0, notVectors: true });
    const s = store(net.tab());
    expect(await caught(s.listVectors('Old'))).toMatchObject({ code: 'RAG_CHUNK_UNREADABLE', details: { retryable: false } });
    expect(await caught(s.listVectors('nope'))).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND', details: { retryable: false } });
    expect(await caught(s.getDocumentBody('Old', 'never-added'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND', details: { retryable: false } });
    await s.createDatabase({ name: 'x', owner: ADDR });
    expect(await caught(s.createDatabase({ name: 'x', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS', details: { retryable: false } });
    const io = new SealedIO(net.tab() as any, () => false);
    expect(await caught(io.write('home/rag/v1/x/manifest', new Uint8Array([1])))).toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED', details: { retryable: false } });
  });

  test('a malformed legacy log fails its migration as not retryable', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(logPath('41'), { id: '41', messages: 'not a list' });
    const report = await storage(net.tab()).migrateLegacyConversationLogs();
    expect(report.failed).toEqual([expect.objectContaining({ id: '41', retryable: false })]);
  });
});

describe('AA9 — a text body reads back exactly, or is refused', () => {
  test('a lone surrogate is RAG_DOCUMENT_INVALID', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addPendingDocument('kb', { id: 'd' });
    expect(await caught(s.putDocumentBody('kb', 'd', 'before \ud800 after'))).toMatchObject({ code: 'RAG_DOCUMENT_INVALID', details: { retryable: false } });
    await s.putDocumentBody('kb', 'd', 'emoji 😀 ok');
    expect(await s.getDocumentBody('kb', 'd')).toBe('emoji 😀 ok');
  });
});

describe('AA10 — the log migration deletes only the exchange files storeExchange wrote', () => {
  test('a foreign file under exchanges/ is kept and reported', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(logPath('41'), conv('41', [msg('m1', 1)]));
    await t.fs.put(`home/sessions/${ADDR}/41/exchanges/1700000000000-k3j9x.json`, { prompt: 'p', response: 'r' });
    await t.fs.put(`home/sessions/${ADDR}/41/exchanges/notes.txt`, 'the UI keeps this');
    const report = await storage(net.tab()).migrateLegacyConversationLogs();
    expect(net.filePaths().filter((p) => p.includes('/exchanges/'))).toEqual([`home/sessions/${ADDR}/41/exchanges/notes.txt`]);
    expect(report.unrecognisedFiles).toEqual([`home/sessions/${ADDR}/41/exchanges/notes.txt`]);
  });
});

describe('AA11 — a name that is not one path segment has no legacy copy (the read side)', () => {
  test("getDatabase('a/b') never serves a manifest nested inside database a", async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'a', { d1: 'one' });
    await net.tab().fs.put(`${legacyDir('a')}/b/manifest.json`, legacyManifest('a/b', ['nested']));
    expect(await store(net.tab()).getDatabase('a/b')).toBeNull();
  });
});
