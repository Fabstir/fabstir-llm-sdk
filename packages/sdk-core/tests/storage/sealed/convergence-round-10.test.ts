// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 10 — storage-level classes (plan §23 DD2, DD4, DD5, DD7–DD10), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, SEED, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { VectorRAGManager } from '../../../src/managers/VectorRAGManager';
import { DEFAULT_RAG_CONFIG } from '../../../src/rag/config';
import { retryableOf } from '../../../src/storage/sealed/sealed-io';
import { __resetInProcessCoherenceForTests } from '../../../src/storage/sealed/rag-coherence';

const SRC = join(__dirname, '../../../src');
const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0, manifest: object = {}) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, { ...legacyManifest(name, Object.keys(docs), chunks), ...manifest });
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `${name}-v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

function store(tab: FakeS5Tab) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
}

function manager(tab: FakeS5Tab) {
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
  });
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('DD2 — the SDK loads where it did: no regex lookbehind (Safari/iOS before 16.4 cannot parse one)', () => {
  test('no source file uses a lookbehind', () => {
    const offenders = sourceFiles(SRC).filter((f) => /\(\?<[=!]/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

describe('DD4 — a legacy manifest of the wrong shape is corrupt, not retryable', () => {
  for (const [label, shape] of [
    ['a null pending document', { pendingDocuments: [null] }],
    ['ready documents that are not a list', { readyDocuments: {} }],
    ['a null chunk entry', { chunks: [null] }],
    ['a document without a string id', { pendingDocuments: [{ id: 7 }] }],
  ] as const) {
    test(`${label}: the migration fails it RAG_MANIFEST_CORRUPT (not retryable); a write says the same`, async () => {
      const net = new FakeS5Network();
      await seedLegacy(net, 'bad', { d1: 'one' }, 0, shape);
      const entry = (await store(net.tab()).migrateLegacyStorage()).databases.find((d) => d.name === 'bad');
      expect(entry).toMatchObject({ status: 'failed', code: 'RAG_MANIFEST_CORRUPT', retryable: false });
      expect(await caught(store(net.tab()).addPendingDocument('bad', { id: 'd2' }))).toMatchObject({ code: 'RAG_MANIFEST_CORRUPT', details: { retryable: false } });
    });
  }

  test('it never breaks a healthy database: updateDocumentStatus (no name) finds a document past it; deleteDatabase removes it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'aaa-bad', {}, 0, { pendingDocuments: [null] });
    const m = manager(net.tab());
    await m.initialize();
    await m.createSession('zzz-good');
    await m.addPendingDocument('zzz-good', { id: 'd1' });
    await m.updateDocumentStatus('d1', 'processing');
    await store(net.tab()).deleteDatabase('aaa-bad');
    expect(net.filePaths().filter((p) => p.startsWith(legacyDir('aaa-bad')))).toEqual([]);
  });
});

describe("DD5 — the manager's own errors are coded and not retryable", () => {
  test('no plain Error is thrown anywhere in the RAG manager, the store or the sealed layer', () => {
    const files = [join(SRC, 'managers/VectorRAGManager.ts'), join(SRC, 'storage/S5VectorStore.ts'), ...sourceFiles(join(SRC, 'storage/sealed'))];
    const offenders = files.filter((f) => /throw new Error\(/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  test('a missing session, a closed one, a disposed manager, a misconfigured one', async () => {
    const m = manager(new FakeS5Network().tab());
    await m.initialize();
    const permanent = (code: string) => ({ code, details: expect.objectContaining({ retryable: false }) });
    expect(await caught(m.deleteVectors('nope', ['a']))).toMatchObject(permanent('RAG_SESSION_NOT_FOUND'));
    const session = await m.createSession('kb');
    await m.closeSession(session);
    expect(await caught(m.deleteVectors(session, ['a']))).toMatchObject(permanent('RAG_SESSION_CLOSED'));
    await m.dispose();
    expect(await caught(m.addPendingDocument('kb', { id: 'd' }))).toMatchObject(permanent('RAG_MANAGER_DISPOSED'));
    expect(() => new VectorRAGManager({ seedPhrase: SEED } as any)).toThrow(expect.objectContaining(permanent('RAG_MANAGER_MISCONFIGURED')));
  });
});

describe('DD7 — a listed database under a name that could not be created is still opened', () => {
  test('createDatabase answers RAG_DATABASE_EXISTS for it (what getOrCreateSessionId handles), and the manager opens it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'odd\uD83D', { o1: 'odd body' });
    expect(await caught(store(net.tab()).createDatabase({ name: 'odd\uD83D', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    const m = manager(net.tab());
    await m.initialize();
    await expect(m.getOrCreateSessionId('odd\uD83D')).resolves.toEqual(expect.any(String));
  });
});

describe("DD8 — RAG_LEGACY_UNREADABLE's cause agrees with its verdict", () => {
  test('retryable (a transient body) beside a malformed chunk: the cause is the transient one', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', ['d1'], 1));
    await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, notVectors: true });
    await t.fs.put(`${legacyDir('kb')}/documents/d1.txt`, 'body');
    net.fail('download', /./, 'network', 50);
    const error = await caught(store(net.tab()).addPendingDocument('kb', { id: 'd2' }));
    expect(error).toMatchObject({ code: 'RAG_LEGACY_UNREADABLE', details: { retryable: true } });
    expect(retryableOf(error.details.cause)).toBe(true);
  });
});

describe('DD9 — a listed document id an older client wrote with a lone surrogate is still a document', () => {
  // A browser's cbor-x decodes a lone surrogate losslessly; Node's (this suite's) does not. This sealer restores it
  // after opening, as a browser would read it.
  const browserDecode = (value: unknown): unknown => {
    if (typeof value === 'string') return value.split('���').join('\uD83D');
    if (Array.isArray(value)) return value.map(browserDecode);
    if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [browserDecode(k) as string, browserDecode(v)]));
    }
    return value;
  };

  test('it can be updated and given a body; a NEW ill-formed id is still refused', async () => {
    const manager = em();
    const real = manager.getStorageSealer();
    manager.getStorageSealer = () => ({ ...real, open: (b: Uint8Array, c: string) => { const o = real.open(b, c); return { ...o, value: browserDecode(o.value) }; } }) as any;
    const tab = new FakeS5Network().tab();
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: manager, pathToHash: tab.pathToHash });
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await (s as any)._mutate('kb', (m: any) => { m.pendingDocuments = [{ id: 'd\uD83D' }]; });   // as an older client listed it
    await s.addPendingDocument('kb', { id: 'd\uD83D', note: 'updated' });
    await s.putDocumentBody('kb', 'd\uD83D', 'its body');
    expect(await s.getDocumentBody('kb', 'd\uD83D')).toBe('its body');
    expect((await s.getDatabase('kb'))!.pendingDocuments).toEqual([{ id: 'd\uD83D', note: 'updated' }]);
    expect(await caught(s.addPendingDocument('kb', { id: 'e\uD83D' }))).toMatchObject({ code: 'RAG_DOCUMENT_INVALID', details: { retryable: false } });
    expect(await caught(s.putDocumentBody('kb', 'e\uD83D', 'x'))).toMatchObject({ code: 'RAG_DOCUMENT_INVALID', details: { retryable: false } });
  });
});

describe('DD10 — pins the round-9 fixes lacked', () => {
  test('CC1: the exact WTF-8 bytes — a lone surrogate never shares an id with any well-formed string', () => {
    const s = (em()).getStorageSealer();
    expect(s.deriveId('db', 'x\uD83D')).toBe('c2988db92ada20717391c197bd31ed97');
    expect(s.deriveId('db', 'x\uDE00')).toBe('f345a17791081179c67399f6997f36ee');
    expect(s.deriveId('db', 'x\uD83D')).not.toBe(s.deriveId('db', 'x퀽'));      // ED 80 BD would be U+D03D's UTF-8
  });

  test("CC4: each number of an old DocumentManager file name is exact on its own", async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`home/documents/${ADDR}/kb/kb_007_1700000000000_x`, 'hash has a leading zero');
    await net.tab().fs.put(`home/documents/${ADDR}/kb/kb_7_0012_x`, 'time has a leading zero');
    await store(net.tab()).migrateLegacyStorage();
    expect(net.filePaths().filter((p) => p.startsWith('home/documents')).sort())
      .toEqual([`home/documents/${ADDR}/kb/kb_007_1700000000000_x`, `home/documents/${ADDR}/kb/kb_7_0012_x`]);
  });

  test("CC8: a refreshed entry's own fields are the store's (a database made elsewhere keeps its creation time)", async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'kb', {}, 0, { created: 1, lastAccessed: 1 });
    const m = manager(net.tab());
    await m.initialize();
    const entry = (await m.refreshDatabases()).find((d) => d.databaseName === 'kb')!;
    expect({ createdAt: entry.createdAt, lastAccessedAt: entry.lastAccessedAt }).toEqual({ createdAt: 1, lastAccessedAt: 1 });
  });

  test('CC6: STORAGE_HISTORY_ERROR carries a transient cause as retryable', async () => {
    const { StorageManager } = await import('../../../src/managers/StorageManager');
    const { storageSealerFromSeed } = await import('../../../src/storage/sealed/StorageSealer');
    const net = new FakeS5Network();
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: net.tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, ADDR) });
    net.fail('get', /conversation\.json$/, 'network', 5);
    expect(await caught(s.getConversationHistory('41'))).toMatchObject({ code: 'STORAGE_HISTORY_ERROR', details: { retryable: true } });
  });
});
