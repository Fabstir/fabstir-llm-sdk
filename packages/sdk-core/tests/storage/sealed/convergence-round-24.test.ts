// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 24 — storage-level (plan §37 RR1, RR3): nothing is purged beside a sealed copy unless this origin
 * holds a head vouching for it; deleteVectors' edges.
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

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

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

const reads = async (s: S5VectorStore) => ({
  vectors: (await s.listVectors('db')).map((v) => v.id).sort(),
  body: await s.getDocumentBody('db', 'd1').catch((e: any) => e.code),
});

describe('RR1 — never a purge beside a sealed copy no head of this origin vouches for', () => {
  test('the run after one that kept the legacy data: it records the head, then purges — the other tab reads the data', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const b = store(net.tab(), origin());
    expect((await b.listDatabases()).map((d) => d.databaseName)).toEqual(['db']); // B discovered the legacy copy
    const broken = { on: true };
    const a = store(net.tab(), flaky(origin(), broken));
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.legacyKept)).toEqual([true]);
    broken.on = false;
    net.advance(1_000);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['purged-leftover']);
    expect(await reads(b)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('a run that still cannot record the head keeps the legacy data again', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const b = store(net.tab(), origin());
    await b.listDatabases();
    const a = store(net.tab(), flaky(origin(), { on: true }));
    await a.migrateLegacyStorage();
    net.advance(1_000);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['purged-leftover', true]]);
    expect(await reads(b)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('another device migrated it (no head here): this device\'s run records one before it purges', async () => {
    const net = new FakeS5Network();
    const here = browserOrigin({ now: () => net.now });
    const elsewhere = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const b = store(net.tab(), here());
    await b.listDatabases();                                          // B, on this device, listed the legacy copy
    await store(net.tab(), elsewhere()).addPendingDocument('db', { id: 'd2' } as any); // an upgrade on write elsewhere
    expect((await store(net.tab(), here()).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['purged-leftover']);
    expect(await reads(b)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });
});

test('RR1 — a head write that fails for another reason fails the run, never taken for "storage blocked"', async () => {
  const net = new FakeS5Network();
  const origin = browserOrigin({ now: () => net.now });
  await seedLegacy(net);
  await store(net.tab(), flaky(origin(), { on: true })).migrateLegacyStorage();        // legacy kept, no head
  const base = origin();
  const odd: RagCoherence = {
    ...base,
    scoped: (scope) => ({ ...base.scoped(scope), putHead: async () => { throw new SDKError('head store bug', 'SOMETHING_ELSE', { retryable: false }); } }),
  };
  const report = await store(net.tab(), odd).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'SOMETHING_ELSE']]);
  expect(net.filePaths()).toContain(`${legacyDir('db')}/manifest.json`);
});

describe('RR3 — deleteVectors\' edges', () => {
  test('an empty list writes nothing — a legacy database is not migrated for it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const s = store(net.tab(), browserOrigin()());
    const writes = net.writes.length;
    await s.deleteVectors('db', []);
    expect(net.writes.length).toBe(writes);
  });

  test('a list that is not one: RAG_VECTOR_IDS_INVALID, not retryable — before anything runs', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const s = store(net.tab(), browserOrigin()());
    const writes = net.writes.length;
    expect(await caught(s.deleteVectors('db', undefined as any))).toMatchObject({ code: 'RAG_VECTOR_IDS_INVALID', details: { retryable: false } });
    expect(net.writes.length).toBe(writes);
  });
});
