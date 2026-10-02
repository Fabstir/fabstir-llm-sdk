// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 13 — storage-level classes (plan §26 GG3, GG5, GG6, GG7).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { __resetInProcessCoherenceForTests } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, chunks: number) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: [],
});

function store(tab: FakeS5Tab) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
}

async function seedChunk(net: FakeS5Network, name: string, vectors: unknown[]) {
  const t = net.tab();
  await t.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, 1));
  await t.fs.put(`${legacyDir(name)}/chunk-0.json`, { chunkId: 0, vectors });
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('GG3 — a progress callback that throws never decides the migration', () => {
  test('every database migrates and its plaintext is purged; the throw is warned about', async () => {
    const net = new FakeS5Network();
    await seedChunk(net, 'a', [{ id: 'v1', vector: [0.1], metadata: {} }]);
    await seedChunk(net, 'b', [{ id: 'v2', vector: [0.2], metadata: {} }]);
    const report = await store(net.tab()).migrateLegacyStorage({ onProgress: () => { throw new TypeError('ui bug'); } });
    expect(report.databases.map((d) => [d.name, d.status])).toEqual([['a', 'migrated'], ['b', 'migrated']]);
    expect(net.filePaths().filter((p) => p.startsWith(`home/vector-databases/${ADDR}`))).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('onProgress'), expect.any(TypeError));
  });
});

describe('GG5 — FF4 on the read path: an unmigrated legacy database', () => {
  test('a vector without a `vector` is RAG_CHUNK_UNREADABLE whose cause is RAG_CHUNK_MALFORMED — never an uncoded TypeError', async () => {
    const net = new FakeS5Network();
    await seedChunk(net, 'kb', [{ id: 'v1', metadata: {} }]);
    expect(await caught(store(net.tab()).listVectors('kb')))
      .toMatchObject({ code: 'RAG_CHUNK_UNREADABLE', details: { retryable: false, cause: { code: 'RAG_CHUNK_MALFORMED' } } });
  });
});

describe('GG6 — `metadata: null` is absent, like undefined', () => {
  test('the chunk migrates whole, and a filter treats the null one as matching nothing', async () => {
    const net = new FakeS5Network();
    await seedChunk(net, 'kb', [{ id: 'v1', vector: [0.1], metadata: null }, { id: 'v2', vector: [0.2], metadata: { documentId: 'd2' } }]);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', vectors: 2 });
    const s = store(net.tab());
    expect(await s.deleteByMetadata('kb', { documentId: 'd2' })).toBe(1);
    expect((await s.listVectors('kb')).map((v) => v.id)).toEqual(['v1']);
  });
});

describe('GG7 — a delete filter is a non-empty object of defined values', () => {
  async function twoVectors() {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addVectors('kb', [
      { id: 'v1', vector: [0.1], metadata: { documentId: 'd1' } },
      { id: 'v2', vector: [0.2], metadata: { other: 'x' } },
    ] as any);
    return s;
  }

  for (const [label, filter] of [
    ['a value that is undefined (`{ documentId: doc?.id }`)', { documentId: undefined }],
    ['an empty filter', {}],
    ['no object at all', null],
    ['a list', ['documentId']],
  ] as const) {
    test(`${label}: RAG_FILTER_INVALID, not retryable — nothing deleted`, async () => {
      const s = await twoVectors();
      expect(await caught(s.deleteByMetadata('kb', filter as any))).toMatchObject({ code: 'RAG_FILTER_INVALID', details: { retryable: false } });
      expect((await s.listVectors('kb')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    });
  }

  test('a defined filter still deletes exactly its matches', async () => {
    const s = await twoVectors();
    expect(await s.deleteByMetadata('kb', { documentId: 'd1' })).toBe(1);
    expect((await s.listVectors('kb')).map((v) => v.id)).toEqual(['v2']);
  });
});
