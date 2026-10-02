// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 9 — storage-level classes (plan §22 CC1, CC3–CC6, CC9), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, SEED, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { storageSealerFromSeed } from '../../../src/storage/sealed/StorageSealer';
import { createRagCoherence, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const msg = (content: string, timestamp: number) => ({ role: 'user', content, timestamp });
const vec = (id: string, dims = 2) => ({ id, vector: Array.from({ length: dims }, () => 0.1), metadata: {} });

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `${name}-v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

function store(tab: FakeS5Tab, coherence?: RagCoherence) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}) });
}

function storage(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, ADDR) });
  return s;
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

const sealedDirs = (net: FakeS5Network) => new Set(net.filePaths().filter((p) => p.startsWith('home/rag/v1/')).map((p) => p.split('/')[3]));

beforeEach(() => __resetInProcessCoherenceForTests());

describe('CC1 — a listed name UTF-8 cannot carry exactly never bricks RAG', () => {
  test('ids of well-formed strings are exactly what they always were; a lone surrogate gets its own', () => {
    const s = sealer();
    expect(s.deriveId('db', 'kb')).toBe('ab0720d292b6225b32d21eb9bdcb76bd');
    expect(s.deriveId('db', 'kb 😀')).toBe('a78b394fea10eca0e649f262f0f6dc90');
    expect(s.deriveId('doc', 'abc:d1')).toBe('aedc1e6bfa855ebb1e68fc58c2ba7058');
    expect(s.deriveId('conv', '41')).toBe('619b5be8fe8392aed5d1648d23de49f9');
    expect(s.deriveId('db', 'x\uD83D')).not.toBe(s.deriveId('db', 'x�'));
    expect(s.deriveId('db', 'x\uD83D')).not.toBe(s.deriveId('db', 'x\uDE00'));
  });

  test('discovery lists it, and the migration moves every database — its U+FFFD twin to a directory of its own — and purges all plaintext', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'aaa-first', { a1: 'one' }, 1);
    await seedLegacy(net, 'odd\uD83D', { o1: 'odd body' }, 1);        // an older UI cut a name mid-emoji
    await seedLegacy(net, 'odd�', { t1: 'twin body' }, 1);
    await seedLegacy(net, 'zzz-good', { z1: 'good' }, 1);
    // Four databases. (The odd one's reported name comes from its manifest's content, which Node's cbor-x — the fake's
    // codec — decodes lossily; a browser's keeps it: the name is not asserted here.)
    expect(await store(net.tab()).listDatabases()).toHaveLength(4);
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases.map((d) => d.status)).toEqual(['migrated', 'migrated', 'migrated', 'migrated']);
    expect(net.filePaths().filter((p) => p.startsWith('home/vector-databases/'))).toEqual([]);
    expect(sealedDirs(net).size).toBe(4);
  });

  test('deleteDatabase removes it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'odd\uD83D', { o1: 'odd body' }, 1);
    await store(net.tab()).deleteDatabase('odd\uD83D');
    expect(net.filePaths()).toEqual([]);
  });

  test('where a name or id would be created, an ill-formed one is refused; reading one names nothing else', async () => {
    const s = store(new FakeS5Network().tab());
    await s.createDatabase({ name: 'kb�', owner: ADDR });
    expect(await caught(s.createDatabase({ name: 'kb\ud800', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_NAME_INVALID', details: { retryable: false } });
    expect(await s.getDatabase('kb\ud800')).toBeNull();
  });
});

describe('CC3 — RAG_LEGACY_UNREADABLE takes its verdict from the refused items only', () => {
  async function seedMalformedChunk(net: FakeS5Network) {
    const t = net.tab();
    await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', ['d1'], 1));
    await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, notVectors: true });
    await t.fs.put(`${legacyDir('kb')}/documents/d1.txt`, 'body');
  }

  test('a consented malformed chunk does not make a transient body failure permanent', async () => {
    const net = new FakeS5Network();
    await seedMalformedChunk(net);
    net.fail('download', /./, 'network', 50);
    const report = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { kb: { chunks: [0] } } });
    expect(report.databases.find((d) => d.name === 'kb')).toMatchObject({ status: 'failed', code: 'RAG_LEGACY_UNREADABLE', unreadable: { bodies: ['d1'] }, retryable: true });
  });

  test('refused items: retryable while any may read; once only permanent ones remain, not', async () => {
    const net = new FakeS5Network();
    await seedMalformedChunk(net);
    net.fail('download', /./, 'network', 50);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ unreadable: { chunks: [0], bodies: ['d1'] }, retryable: true });
    const net2 = new FakeS5Network();
    await seedMalformedChunk(net2);
    expect((await store(net2.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ unreadable: { chunks: [0] }, retryable: false });
  });

  test('a consented transient item does not make a refused permanent one retryable', async () => {
    const net = new FakeS5Network();
    await seedMalformedChunk(net);
    net.fail('download', /./, 'network', 50);
    const report = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { kb: { bodies: ['d1'] } } });
    expect(report.databases[0]).toMatchObject({ unreadable: { chunks: [0] }, retryable: false });
  });
});

describe("CC4 — BB10's siblings: only the exact names their writers render are the SDK's", () => {
  test('exchanges/: 0123-abc.json is kept and reported; a real one is deleted', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(logPath('41'), { id: '41', messages: [msg('m1', 1)], metadata: {}, createdAt: 1, updatedAt: 1 });
    await t.fs.put(`home/sessions/${ADDR}/41/exchanges/1700000000000-k3j9x.json`, { prompt: 'p', response: 'r' });
    await t.fs.put(`home/sessions/${ADDR}/41/exchanges/0123-abc.json`, { note: 'not storeExchange' });
    const report = await storage(net.tab()).migrateLegacyConversationLogs();
    expect(net.filePaths().filter((p) => p.includes('/exchanges/'))).toEqual([`home/sessions/${ADDR}/41/exchanges/0123-abc.json`]);
    expect(report.unrecognisedFiles).toEqual([`home/sessions/${ADDR}/41/exchanges/0123-abc.json`]);
  });

  test("the old DocumentManager's root: kb_007_0012_x is kept and reported; a real one is deleted", async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`home/documents/${ADDR}/kb/kb_-12_1700000000000_abc`, 'ours');
    await net.tab().fs.put(`home/documents/${ADDR}/kb/kb_007_0012_x`, 'someone else');
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(net.filePaths().filter((p) => p.startsWith('home/documents'))).toEqual([`home/documents/${ADDR}/kb/kb_007_0012_x`]);
    expect(report.unrecognisedFiles).toEqual([`home/documents/${ADDR}/kb/kb_007_0012_x`]);
  });
});

describe('CC5 — logic errors in the store are coded and not retryable', () => {
  test('dimension mismatch (in a batch, and against the database), vector not found, empty folder path, unsupported search', async () => {
    const s = store(new FakeS5Network().tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    const permanent = (code: string) => ({ code, details: expect.objectContaining({ retryable: false }) });
    expect(await caught(s.addVectors('kb', [vec('a', 2), vec('b', 3)]))).toMatchObject(permanent('RAG_VECTOR_DIMENSION_MISMATCH'));
    await s.addVectors('kb', [vec('a', 2)]);
    expect(await caught(s.addVectors('kb', [vec('c', 3)]))).toMatchObject(permanent('RAG_VECTOR_DIMENSION_MISMATCH'));
    expect(await caught(s.updateMetadata('kb', 'nope', {}))).toMatchObject(permanent('RAG_VECTOR_NOT_FOUND'));
    expect(await caught(s.moveToFolder('kb', 'nope', '/x'))).toMatchObject(permanent('RAG_VECTOR_NOT_FOUND'));
    expect(await caught(s.createFolder('kb', ' '))).toMatchObject(permanent('RAG_FOLDER_PATH_INVALID'));
    expect(await caught(s.searchInFolder('kb', '/x', [0.1, 0.1]))).toMatchObject(permanent('RAG_NOT_SUPPORTED'));
  });
});

describe("CC6 — the log's public readers carry a verdict, and nothing without a message list is sealed", () => {
  test('getConversationHistory keeps its cause and verdict; CONVERSATION_NOT_FOUND is not retryable', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(logPath('41'), { id: '41', metadata: {} });
    const s = storage(net.tab());
    expect(await caught(s.getConversationHistory('41'))).toMatchObject({ code: 'STORAGE_HISTORY_ERROR', details: { retryable: false, cause: { code: 'STORAGE_LOAD_ERROR' } } });
    expect(await caught(s.retrieveConversation('nope'))).toMatchObject({ code: 'CONVERSATION_NOT_FOUND', details: { retryable: false } });
  });

  test('saveConversation refuses a conversation without a messages array', async () => {
    const s = storage(new FakeS5Network().tab());
    expect(await caught(s.saveConversation({ id: '9', metadata: {}, createdAt: 1, updatedAt: 1 } as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { retryable: false } });
  });

  test('a sealed log without a message list is refused on read, as a legacy one is (BB8)', async () => {
    const net = new FakeS5Network();
    const bytes = storageSealerFromSeed(SEED, ADDR).seal({ kind: 'cbor', value: { revision: 1, conversation: { id: '9', metadata: {} } } }, 'conv/v1/9');
    await net.tab().fs.put(logPath('9'), bytes, { mediaType: 'application/octet-stream' });
    const s = storage(net.tab());
    expect(await caught(s.loadConversation('9'))).toMatchObject({ code: 'STORAGE_LOAD_ERROR', details: { retryable: false } });
    expect(await caught(s.appendMessage('9', msg('m', 1) as any))).toMatchObject({ code: 'STORAGE_APPEND_ERROR', details: { retryable: false } });
  });
});

describe('CC9 — the store ages its caches on its coherence\'s window', () => {
  test('with a 5 s window, a discovery older than 5 s is redone', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const coherence = createRagCoherence({ now: () => net.now, headTrustMs: 5_000 });
    const s = store(tab, coherence);
    await s.listDatabases();
    let discoveries = 0;
    const list = tab.fs.list;
    tab.fs.list = function (this: unknown, path: string, options?: unknown) {
      if (path === 'home/rag/v1') discoveries++;
      return list.call(this, path, options);
    } as typeof tab.fs.list;
    net.advance(6_000);
    await s.listDatabases();
    expect(discoveries).toBe(1);
  });

  test('with a 5 s window, a cached manifest no head vouches for any more is read again after 6 s', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const s = store(tab, createRagCoherence({ now: () => net.now, headTrustMs: 5_000 }));
    await s.createDatabase({ name: 'kb', owner: ADDR });
    let reads = 0;
    const get = tab.fs.get;
    tab.fs.get = async (p: string, o?: any) => { if (p.endsWith('/manifest')) reads++; return get(p, o); };
    net.advance(6_000);
    await s.getDatabase('kb');
    expect(reads).toBe(1);
  });
});
