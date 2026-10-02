// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 11 — storage-level classes (plan §24 EE1–EE3, EE6, EE9), on the release candidate.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, SEED, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { VectorRAGManager } from '../../../src/managers/VectorRAGManager';
import { DEFAULT_RAG_CONFIG } from '../../../src/rag/config';
import { __resetInProcessCoherenceForTests } from '../../../src/storage/sealed/rag-coherence';

const SRC = join(__dirname, '../../../src');
const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});

function store(tab: FakeS5Tab, encryptionManager = em()) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager, pathToHash: tab.pathToHash });
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

beforeEach(() => __resetInProcessCoherenceForTests());

describe('EE1 — a legacy manifest that is not a plain object with a name is corrupt: nothing is purged', () => {
  for (const [label, content] of [
    ['raw bytes (what s5js get() returns for undecodable content)', new Uint8Array([0x01, 0x02, 0x03])],
    ['an array', [1, 2, 3]],
    ['a plain object without a name', { chunks: [], pendingDocuments: [] }],
  ] as const) {
    test(`${label}: RAG_MANIFEST_CORRUPT, and every legacy file stays`, async () => {
      const net = new FakeS5Network();
      const t = net.tab();
      await t.fs.put(`${legacyDir('kb')}/manifest.json`, content as any);
      await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v0', vector: [0.1], metadata: {} }] });
      await t.fs.put(`${legacyDir('kb')}/documents/d1.txt`, 'the only copy');
      const entry = (await store(net.tab()).migrateLegacyStorage()).databases.find((d) => d.name === 'kb');
      expect(entry).toMatchObject({ status: 'failed', code: 'RAG_MANIFEST_CORRUPT', retryable: false });
      expect(net.filePaths().filter((p) => p.startsWith(legacyDir('kb'))).sort())
        .toEqual([`${legacyDir('kb')}/chunk-0.json`, `${legacyDir('kb')}/documents/d1.txt`, `${legacyDir('kb')}/manifest.json`]);
    });
  }
});

describe('EE2 — a document id is never an object key: prototype names are ids like any other', () => {
  test('__proto__ and constructor keep their bodies across a reload; a listed one without a body is BODY_MISSING', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    for (const id of ['__proto__', 'constructor', 'toString']) {
      await s.addPendingDocument('kb', { id });
    }
    await s.putDocumentBody('kb', '__proto__', 'proto body');
    await s.putDocumentBody('kb', 'constructor', 'ctor body');
    const fresh = store(net.tab());
    expect(await fresh.getDocumentBody('kb', '__proto__')).toBe('proto body');
    expect(await fresh.getDocumentBody('kb', 'constructor')).toBe('ctor body');
    expect(await caught(fresh.getDocumentBody('kb', 'toString'))).toMatchObject({ code: 'RAG_DOCUMENT_BODY_MISSING' });
    await fresh.removeDocument('kb', '__proto__');
    expect(await caught(fresh.getDocumentBody('kb', '__proto__'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });

  test('a legacy __proto__ document migrates with its body; constructor gets its late body repaired', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', ['__proto__', 'constructor']));
    await t.fs.put(`${legacyDir('kb')}/documents/__proto__.txt`, 'legacy proto');
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', missingBodies: ['constructor'] });
    await net.tab().fs.put(`${legacyDir('kb')}/documents/constructor.txt`, 'late body');   // an outdated tab uploads it
    await store(net.tab()).migrateLegacyStorage();
    const fresh = store(net.tab());
    expect(await fresh.getDocumentBody('kb', '__proto__')).toBe('legacy proto');
    expect(await fresh.getDocumentBody('kb', 'constructor')).toBe('late body');
  });
});

describe("EE3 — a legacy chunk's vectors are checked: a malformed one is RAG_CHUNK_MALFORMED and can be consented away", () => {
  async function seedNullVector(net: FakeS5Network) {
    const t = net.tab();
    await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', ['d1'], 1));
    await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, vectors: [null] });
    await t.fs.put(`${legacyDir('kb')}/documents/d1.txt`, 'body');
  }

  test('the migration names it unreadable (not retryable); consent migrates the rest', async () => {
    const net = new FakeS5Network();
    await seedNullVector(net);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0])
      .toMatchObject({ status: 'failed', code: 'RAG_LEGACY_UNREADABLE', unreadable: { chunks: [0] }, retryable: false });
    expect((await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { kb: { chunks: [0] } } })).databases[0])
      .toMatchObject({ status: 'migrated' });
  });

  test('reading it: RAG_CHUNK_UNREADABLE whose cause is RAG_CHUNK_MALFORMED, not retryable', async () => {
    const net = new FakeS5Network();
    await seedNullVector(net);
    expect(await caught(store(net.tab()).listVectors('kb')))
      .toMatchObject({ code: 'RAG_CHUNK_UNREADABLE', details: { retryable: false, cause: { code: 'RAG_CHUNK_MALFORMED' } } });
  });
});

describe('EE6 — a listed database with a blank name is opened, never refused', () => {
  test('createDatabase answers RAG_DATABASE_EXISTS; the manager starts and opens it', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir(' ')}/manifest.json`, legacyManifest(' ', ['d1']));
    expect(await caught(store(net.tab()).createDatabase({ name: ' ', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    expect(await caught(store(net.tab()).createDatabase({ name: '  ', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_NAME_INVALID', details: { retryable: false } });
    const m = manager(net.tab());
    await m.initialize();
    await expect(m.getOrCreateSessionId(' ')).resolves.toEqual(expect.any(String));
  });
});

describe('EE9 — pins round 10 lacked', () => {
  for (const [label, shape] of [
    ['a folder that is not a string', { folderPaths: [5] }],
    ['a negative chunk id', { chunks: [{ chunkId: -1 }] }],
    ['a fractional chunk id', { chunks: [{ chunkId: 1.5 }] }],
  ] as const) {
    test(`DD4: ${label} is RAG_MANIFEST_CORRUPT`, async () => {
      const net = new FakeS5Network();
      await net.tab().fs.put(`${legacyDir('kb')}/manifest.json`, { ...legacyManifest('kb', []), ...shape });
      expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'RAG_MANIFEST_CORRUPT', retryable: false });
    });
  }

  test('DD9: a READY listed id with a lone surrogate is ALREADY_READY on add, and takes a body', async () => {
    const browserDecode = (value: unknown): unknown => {
      if (typeof value === 'string') return value.split('���').join('\uD83D');
      if (Array.isArray(value)) return value.map(browserDecode);
      if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [browserDecode(k) as string, browserDecode(v)]));
      }
      return value;
    };
    const manager = em();
    const real = manager.getStorageSealer();
    manager.getStorageSealer = () => ({ ...real, open: (b: Uint8Array, c: string) => { const o = real.open(b, c); return { ...o, value: browserDecode(o.value) }; } }) as any;
    const s = store(new FakeS5Network().tab(), manager);
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await (s as any)._mutate('kb', (m: any) => { m.readyDocuments = [{ id: 'r\uD83D' }]; });
    expect(await caught(s.addPendingDocument('kb', { id: 'r\uD83D' }))).toMatchObject({ code: 'RAG_DOCUMENT_ALREADY_READY' });
    await s.putDocumentBody('kb', 'r\uD83D', 'ready body');
    expect(await s.getDocumentBody('kb', 'r\uD83D')).toBe('ready body');
  });

  test("DD5: every coded throw in the RAG manager says it is not retryable (a static pin per site)", () => {
    const source = readFileSync(join(SRC, 'managers/VectorRAGManager.ts'), 'utf8').replace(/\r/g, '');
    const throws = source.match(/throw new SDKError\([\s\S]*?\);/g) ?? [];
    // Those whose verdict is the cause's (a refresh failure carrying its report; a session-create wrapper) are not
    // logic errors: they carry `retryableOf(cause)`.
    const fromCause = throws.filter((t) => t.includes("'RAG_REFRESH_FAILED'") || /retryable: retryableOf\(/.test(t));
    const logic = throws.filter((t) => !fromCause.includes(t));
    expect(fromCause.length).toBe(2);
    expect(logic.length).toBeGreaterThanOrEqual(21);
    expect(logic.filter((t) => !/retryable: false/.test(t))).toEqual([]);
  });
});
