// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 12 — storage-level classes (plan §25 FF4).
 */

import { describe, test, expect, beforeEach } from 'vitest';
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

async function seedChunk(net: FakeS5Network, vectors: unknown[]) {
  const t = net.tab();
  await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', 1));
  await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, vectors });
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('FF4 — a legacy vector is an id, a numeric vector and (if any) object metadata', () => {
  for (const [label, entry] of [
    ['no vector', { id: 'v1', metadata: {} }],
    ['a vector that is not a list', { id: 'v1', vector: 'abc', metadata: {} }],
    ['a vector of non-numbers', { id: 'v1', vector: ['a'], metadata: {} }],
    ['metadata that is not an object', { id: 'v1', vector: [0.1], metadata: 5 }],
  ] as const) {
    test(`${label}: the chunk is malformed — named unreadable, not retryable, nothing migrated`, async () => {
      const net = new FakeS5Network();
      await seedChunk(net, [entry]);
      expect((await store(net.tab()).migrateLegacyStorage()).databases[0])
        .toMatchObject({ status: 'failed', code: 'RAG_LEGACY_UNREADABLE', unreadable: { chunks: [0] }, retryable: false });
    });
  }

  test('a vector without metadata migrates, and a metadata filter treats it as matching nothing', async () => {
    const net = new FakeS5Network();
    await seedChunk(net, [{ id: 'v1', vector: [0.1] }, { id: 'v2', vector: [0.2], metadata: { documentId: 'd2' } }]);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', vectors: 2 });
    const s = store(net.tab());
    expect(await s.deleteByMetadata('kb', { documentId: 'd2' })).toBe(1);
    expect((await s.listVectors('kb')).map((v) => v.id)).toEqual(['v1']);
  });
});
