// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 4 — APIs so the UI stops touching RAG files itself (plan D13, D14, D16; review M4).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { SEED, ADDR, encryptionManager as em } from '../helpers/sealed-fixtures';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../src/storage/sealed/rag-coherence';

const DB = 'research';

function vrm(tab: FakeS5Tab, opts: { coherence?: RagCoherence; isOnline?: () => boolean } = {}) {
  return new VectorRAGManager({
    userAddress: ADDR,
    seedPhrase: SEED,
    config: DEFAULT_RAG_CONFIG,
    sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(),
    pathToHash: tab.pathToHash,
    ...opts,
  });
}

async function withDb(tab: FakeS5Tab, opts: Parameters<typeof vrm>[1] = {}) {
  const m = vrm(tab, opts);
  await m.initialize();
  await m.createSession(DB);
  return m;
}

const doc = (id: string, extra: Record<string, any> = {}) => ({ id, fileName: `${id}-secret-name.pdf`, embeddingStatus: 'pending', ...extra });

beforeEach(() => __resetInProcessCoherenceForTests());

describe('addPendingDocument (replaces the UI\'s manifest read-modify-write)', () => {
  test('adds a pending document; re-adding the same id replaces it (retry-safe)', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('d1'));
    await m.addPendingDocument(DB, doc('d1', { size: 42 }));
    await m.addPendingDocument(DB, doc('d2'));
    const pending = await m.getPendingDocuments(DB);
    expect(pending.map((d: any) => d.id)).toEqual(['d1', 'd2']);
    expect(pending[0].size).toBe(42);
  });

  test('a document already ready is refused with RAG_DOCUMENT_ALREADY_READY', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('d1'));
    await m.updateDocumentStatus('d1', 'ready', { vectorCount: 3 });
    await expect(m.addPendingDocument(DB, doc('d1'))).rejects.toMatchObject({ code: 'RAG_DOCUMENT_ALREADY_READY' });
  });

  test('a document without an id is refused', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await expect(m.addPendingDocument(DB, { fileName: 'x' } as any)).rejects.toMatchObject({ code: 'RAG_DOCUMENT_INVALID' });
  });

  test('two tabs adding documents concurrently lose neither', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 2;
    const mk = browserOrigin();
    const a = await withDb(net.tab(), { coherence: mk() });
    const b = vrm(net.tab(), { coherence: mk() });
    await b.initialize();
    await Promise.all([a.addPendingDocument(DB, doc('fromA')), b.addPendingDocument(DB, doc('fromB'))]);
    const fresh = vrm(net.tab());
    await fresh.initialize();
    expect((await fresh.getPendingDocuments(DB)).map((d: any) => d.id).sort()).toEqual(['fromA', 'fromB']);
  });
});

describe('updateDocumentStatus / removeDocument (keyed — no caller-built arrays, review M4)', () => {
  test('ready moves the document from pending to ready, with the updates', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('d1'));
    await m.updateDocumentStatus('d1', 'ready', { vectorCount: 7 });
    const meta: any = await m.getDatabaseMetadata(DB);
    expect(meta.pendingDocuments).toEqual([]);
    expect(meta.readyDocuments).toMatchObject([{ id: 'd1', embeddingStatus: 'ready', vectorCount: 7 }]);
  });

  test('removeDocument drops the entry and its sealed body', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('d1'));
    await m.putDocumentBody(DB, 'd1', 'body text');
    const bodyFiles = () => net.filePaths().filter((p) => p.includes('/documents/'));
    expect(bodyFiles()).toHaveLength(1);
    await m.removeDocument(DB, 'd1');
    expect(await m.getPendingDocuments(DB)).toEqual([]);
    expect(bodyFiles()).toHaveLength(0);
    await expect(m.getDocumentBody(DB, 'd1')).rejects.toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
    await expect(m.removeDocument(DB, 'd1')).rejects.toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });

  test('updating metadata with a caller-built document array is refused', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await expect(m.updateVectorDatabaseMetadata(DB, { pendingDocuments: [] } as any)).rejects.toMatchObject({ code: 'RAG_DOCUMENT_ARRAYS_READONLY' });
    await expect((m as any).vectorStore.updateDatabaseMetadata(DB, { readyDocuments: [] })).rejects.toMatchObject({ code: 'RAG_DOCUMENT_ARRAYS_READONLY' });
    await m.updateVectorDatabaseMetadata(DB, { description: 'ok' } as any);
    expect((await m.getVectorDatabaseMetadata(DB) as any).description).toBe('ok');
  });
});

describe('putDocumentBody / getDocumentBody (replaces putWithRetry / getWithRetry)', () => {
  test('text and binary bodies come back with their exact type and bytes — including what get() would corrupt', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    for (const [id, body] of [['a', 'cats'], ['b', '42'], ['c', '7'], ['d', '']] as const) {
      await m.addPendingDocument(DB, { id } as any);                     // served for a listed document (§19 Z11)
      await m.putDocumentBody(DB, id, body);
      expect(await m.getDocumentBody(DB, id)).toBe(body);
    }
    const bin = new Uint8Array([0, 0xff, 0x63, 0x61]);
    await m.addPendingDocument(DB, { id: 'bin' } as any);
    await m.putDocumentBody(DB, 'bin', bin);
    const back = await m.getDocumentBody(DB, 'bin');
    expect(back).toBeInstanceOf(Uint8Array);
    expect(Array.from(back as Uint8Array)).toEqual(Array.from(bin));
  });

  test('bodies are sealed at opaque paths: no text, id or file name on S5', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('custody-plan'));
    await m.putDocumentBody(DB, 'custody-plan', 'The custody hearing is next week');
    for (const w of net.writes) {
      const text = Buffer.from(w.bytes).toString('latin1');
      for (const n of ['custody', 'hearing', 'secret-name', DB]) {
        expect(w.path).not.toContain(n);
        expect(text).not.toContain(n);
      }
    }
    expect(net.filePaths().some((p) => /\/documents\/[0-9a-f]{32}$/.test(p))).toBe(true);
  });

  test('a body is read by the hash the manifest recorded — a lost directory entry does not lose it', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, { id: 'd1' } as any);
    await m.putDocumentBody(DB, 'd1', 'kept');
    const docsDir = net.dirPaths().find((d) => d.endsWith('/documents'))!;
    net.dirs.set(docsDir, new Map());
    const fresh = vrm(net.tab());
    await fresh.initialize();
    expect(await fresh.getDocumentBody(DB, 'd1')).toBe('kept');
  });

  test('while S5 is offline a body write fails fast with STORAGE_OFFLINE and writes nothing', async () => {
    const net = new FakeS5Network();
    let online = true;
    const m = await withDb(net.tab(), { isOnline: () => online });
    online = false;
    const before = net.writes.length;
    await expect(m.putDocumentBody(DB, 'd1', 'x')).rejects.toMatchObject({ code: 'STORAGE_OFFLINE' });
    await expect(m.addPendingDocument(DB, doc('d1'))).rejects.toMatchObject({ code: 'STORAGE_OFFLINE' });
    expect(net.writes.length).toBe(before);
  });

  test('a legacy (not yet migrated) database serves its plaintext bodies byte-exact', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const dir = `home/vector-databases/${ADDR}/legacy-db`;
    await tab.fs.put(`${dir}/manifest.json`, { name: 'legacy-db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1, chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'd1' }] });
    await tab.fs.put(`${dir}/documents/d1.txt`, 'cats');
    const m = vrm(net.tab());
    await m.initialize();
    expect(await m.getDocumentBody('legacy-db', 'd1')).toBe('cats');
    await expect(m.getDocumentBody('legacy-db', 'nope')).rejects.toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });

  test('getDocumentBody for an unknown database or document is RAG_DOCUMENT_NOT_FOUND / not found', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await expect(m.getDocumentBody(DB, 'nope')).rejects.toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
    await expect(m.getDocumentBody('no-db', 'x')).rejects.toThrow('not found');
  });
});

describe('deleteDatabase (request §1 safety — delete means delete)', () => {
  test('removes vectors, documents, bodies and the manifest from S5, and the database from the list', async () => {
    const net = new FakeS5Network();
    const m = await withDb(net.tab());
    await m.addPendingDocument(DB, doc('d1'));
    await m.putDocumentBody(DB, 'd1', 'body');
    await (m as any).vectorStore.addVectors(DB, [{ id: 'v1', vector: [1, 2], metadata: { text: 'chunk' } }]);
    await m.deleteDatabase(DB);
    expect(net.filePaths()).toEqual([]);
    expect(m.listDatabases().map((d) => d.databaseName)).not.toContain(DB);
    const fresh = vrm(net.tab());
    await fresh.initialize();
    expect(fresh.listDatabases()).toEqual([]);
  });

  test('also purges what the UI\'s own delete leaves behind at the legacy path', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const dir = `home/vector-databases/${ADDR}/${DB}`;
    await tab.fs.put(`${dir}/chunk-0.json`, { chunkId: 0, vectors: [] });
    await tab.fs.put(`${dir}/documents/d1.txt`, 'orphaned plaintext');
    const m = vrm(net.tab());
    await m.initialize();
    await m.deleteDatabase(DB);
    expect(net.filePaths()).toEqual([]);
  });
});

describe('refreshDatabases (replaces the private manifestCache poke)', () => {
  test('sees a database created and one deleted in another tab', async () => {
    const net = new FakeS5Network();
    const mk = browserOrigin();
    const a = await withDb(net.tab(), { coherence: mk() });
    const b = vrm(net.tab(), { coherence: mk() });
    await b.initialize();
    expect(b.listDatabases().map((d) => d.databaseName)).toEqual([DB]);
    await (a as any).vectorStore.createDatabase({ name: 'second', owner: ADDR });
    await a.deleteDatabase(DB);
    const after = await b.refreshDatabases();
    expect(after.map((d) => d.databaseName)).toEqual(['second']);
    expect(b.listDatabases().map((d) => d.databaseName)).toEqual(['second']);
  });
});

describe('StorageManager.putWithRetry refuses plaintext into RAG paths (D13)', () => {
  function sm(tab: FakeS5Tab, status: 'connected' | 'disconnected' = 'connected') {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, connectionStatus: status });
    return s;
  }

  test('both RAG roots are refused; other paths still write', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await expect(s.putWithRetry(`home/vector-databases/${ADDR}/db/documents/a.txt`, 'text')).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await expect(s.putWithRetry('home/rag/v1/abc/manifest', { x: 1 })).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await s.putWithRetry('home/session-groups/x/g.json', { ok: true });
    expect(net.filePaths()).toEqual(['home/session-groups/x/g.json']);
  });

  test('a refused RAG write is not queued while S5 is disconnected', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab(), 'disconnected');
    await expect(s.putWithRetry(`home/vector-databases/${ADDR}/db/documents/a.txt`, 'text')).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    expect(s.getPendingOperationCount()).toBe(0);
  });
});
