// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 23 — storage-level (plan §36 QQ1, QQ2): the store's one-write `deleteVectors`; a migration whose
 * head this tab could not record keeps the legacy data — another tab may still be reading it.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { SDKError } from '../../../src/types';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const store = (tab: FakeS5Tab, coherence: RagCoherence) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence } as any);

/** A browser head store whose writes fail while `broken.on`. */
function flaky(base: RagCoherence, broken: { on: boolean }): RagCoherence {
  const wrap = (c: RagCoherence): RagCoherence => ({
    ...c,
    putHead: async (key, head) => {
      if (broken.on) throw new SDKError('Sealed storage needs IndexedDB', 'RAG_COHERENCE_UNAVAILABLE', { missing: 'IndexedDB', retryable: false });
      return c.putHead(key, head);
    },
    scoped: (scope) => wrap(c.scoped(scope)),
  });
  return wrap(base);
}

async function seedLegacy(net: FakeS5Network) {
  const t = net.tab();
  await t.fs.put(`${legacyDir('db')}/manifest.json`, {
    name: 'db', owner: ADDR, vectorCount: 2, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1, dimensions: 3,
    chunks: [{ chunkId: 0, cid: 'c0', vectorCount: 2, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [],
    pendingDocuments: [{ id: 'd1' }],
  });
  await t.fs.put(`${legacyDir('db')}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }] });
  await t.fs.put(`${legacyDir('db')}/documents/d1.txt`, 'private notes');
}

describe('QQ1 — the store deletes a list of vectors in one write', () => {
  test('one commit for the whole list; ids not there are ignored', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab(), browserOrigin()());
    await s.createDatabase({ name: 'db', owner: ADDR });
    await s.addVectors('db', [{ id: 'a', vector: [1, 2, 3], metadata: {} }, { id: 'b', vector: [4, 5, 6], metadata: {} }, { id: 'c', vector: [7, 8, 9], metadata: {} }]);
    const commit = vi.spyOn(s as any, '_commitLocked');
    await s.deleteVectors('db', ['a', 'c', 'nope']);
    expect({ commits: commit.mock.calls.length, left: (await s.listVectors('db')).map((v) => v.id) }).toEqual({ commits: 1, left: ['b'] });
  });
});

describe('QQ2 — a migration whose head was not recorded keeps the legacy data', () => {
  test('another tab that listed the legacy database still reads it; the next run purges it', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const b = store(net.tab(), origin());
    expect((await b.listDatabases()).map((d) => d.databaseName)).toEqual(['db']); // B discovered the legacy copy

    const broken = { on: true };
    const a = store(net.tab(), flaky(origin(), broken));
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => [d.name, d.status, d.legacyKept])).toEqual([['db', 'migrated', true]]);
    net.advance(1_000);
    expect({ vectors: (await b.listVectors('db')).map((v) => v.id).sort(), body: await b.getDocumentBody('db', 'd1') })
      .toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });

    broken.on = false;
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['purged-leftover']);
    expect(net.filePaths().filter((p) => p.startsWith(legacyDir('db')))).toEqual([]);
  });
});

test('QQ2 — a run adopting beside a sealed copy, its head not recorded: the adopted body\'s legacy file is kept', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const origin = browserOrigin({ now: () => net.now });
  expect((await store(net.tab(), origin()).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();                                              // an outdated tab writes after the migration
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late body');
  await old.fs.put(`${legacyDir('db')}/manifest.json`, {
    name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
    chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'd1' }, { id: 'late' }],
  });
  const report = await store(net.tab(), flaky(origin(), { on: true })).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['adopted-after-seal', true]]);
  expect(net.filePaths()).toContain(`${legacyDir('db')}/documents/late.txt`);
});
