// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 25 — storage-level (plan §38 SS1–SS4): a cached manifest is as old as its read's start; a legacy
 * file a migration purged under a read is never "lost"; addVectors' and deleteVectors' input refused before anything.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const MANIFEST = `${legacyDir('db')}/manifest.json`;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function seedLegacy(net: FakeS5Network) {
  const t = net.tab();
  await t.fs.put(MANIFEST, {
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

describe('SS1 — a cached manifest is as old as the start of its read', () => {
  test('a read straddling another tab\'s upgrade on write; that tab\'s run then purges: after its head lapses, the data', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const b = store(tabB, origin());
    const a = store(net.tab(), origin());
    const realGet = tabB.fs.get;
    let armed = true;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (armed && path === MANIFEST) {
        armed = false;
        await a.addPendingDocument('db', { id: 'd2' } as any);          // t=0: moved and written; its head at t=0
        net.advance(20_000);                                            // B's legacy read lands at t=20 s
      }
      return realGet(path, opts);
    };
    expect(await b.getDatabase('db')).not.toBeNull();
    await a.migrateLegacyStorage();                                     // the head vouches: purged
    net.advance(15_000);                                                // t=35 s: the head lapsed
    expect(await reads(b)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('a discovery straddling it: the same', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const b = store(tabB, origin());
    const a = store(net.tab(), origin());
    const realGet = tabB.fs.get;
    let armed = true;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (armed && path === MANIFEST) {
        armed = false;
        await a.addPendingDocument('db', { id: 'd2' } as any);
        net.advance(20_000);
      }
      return realGet(path, opts);
    };
    await b.initialize();
    await a.migrateLegacyStorage();
    net.advance(15_000);
    expect(await reads(b)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('a sealed database: a removed document and deleted vectors are never served again by a read that straddled it', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), origin());
    await a.createDatabase({ name: 'db', owner: ADDR });
    await a.addVectors('db', [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }]);
    await a.addPendingDocument('db', { id: 'd1' } as any);
    await a.putDocumentBody('db', 'd1', 'confidential notes');
    net.advance(60_000);
    const tabB = net.tab();
    const b = store(tabB, origin());
    const realGet = tabB.fs.get;
    let armed = true;
    tabB.fs.get = async (path: string, opts?: any) => {
      const value = await realGet(path, opts);
      if (armed && /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/.test(path)) {
        armed = false;
        await a.removeDocument('db', 'd1');
        await a.deleteVectors('db', ['v1', 'v2']);
        net.advance(20_000);
      }
      return value;
    };
    expect(await b.getDatabase('db')).not.toBeNull();
    net.advance(15_000);
    expect({ body: await b.getDocumentBody('db', 'd1').catch((e: any) => e.code), vectors: (await b.listVectors('db')).map((v) => v.id) })
      .toEqual({ body: 'RAG_DOCUMENT_NOT_FOUND', vectors: [] });
  });
});

test('SS1 — a reconcile\'s read straddling another tab\'s commit: stamped at its start too', async () => {
  const net = new FakeS5Network();
  const origin = browserOrigin({ now: () => net.now });
  const a = store(net.tab(), origin());
  await a.createDatabase({ name: 'db', owner: ADDR });
  await a.addPendingDocument('db', { id: 'd1' } as any);
  await a.putDocumentBody('db', 'd1', 'confidential notes');
  const tabB = net.tab();
  const b = store(tabB, origin());
  await b.listDatabases();                                            // B discovered revision r
  await a.addPendingDocument('db', { id: 'd2' } as any);              // r+1: B's cache no longer vouched — a reconcile reads
  const realGet = tabB.fs.get;
  let armed = true;
  tabB.fs.get = async (path: string, opts?: any) => {
    const value = await realGet(path, opts);
    if (armed && /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/.test(path)) {
      armed = false;
      await a.removeDocument('db', 'd1');                             // r+2 while B's read of r+1 is in flight
      net.advance(20_000);
    }
    return value;
  };
  await b.listDatabases();                                            // the reconcile caches r+1
  net.advance(15_000);                                                // r+2's head lapsed
  expect(await b.getDocumentBody('db', 'd1').catch((e: any) => e.code)).toBe('RAG_DOCUMENT_NOT_FOUND');
});

describe('SS2 — a legacy file a migration purged under a read: moved, never lost', () => {
  test('another device migrated it (no head here): the retry reads the sealed copy — this tab forgot its own', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const b = store(net.tab(), browserOrigin({ now: () => net.now })());
    expect(await b.getDatabase('db')).not.toBeNull();                 // B cached the legacy manifest, young
    await store(net.tab(), browserOrigin({ now: () => net.now })()).migrateLegacyStorage(); // another device: moved, purged
    expect(await caught(b.listVectors('db'))).toMatchObject({ code: 'RAG_DATABASE_MOVED' });
    expect((await b.listVectors('db')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('listVectors: RAG_DATABASE_MOVED, retryable — and the retry reads the sealed copy', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const b = store(tabB, origin());
    const a = store(net.tab(), origin());
    const realGet = tabB.fs.get;
    let armed = true;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (armed && path === `${legacyDir('db')}/chunk-0.json`) { armed = false; await a.migrateLegacyStorage(); }
      return realGet(path, opts);
    };
    expect(await caught(b.listVectors('db'))).toMatchObject({ code: 'RAG_DATABASE_MOVED', details: { retryable: true } });
    expect((await b.listVectors('db')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('getDocumentBody: RAG_DATABASE_MOVED, retryable — and the retry reads the sealed copy', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const a = store(net.tab(), origin());
    let armed = true;
    const b = store(tabB, origin(), {
      pathToHash: async (path: string, o?: any) => {
        if (armed && path === `${legacyDir('db')}/documents/d1.txt`) { armed = false; await a.migrateLegacyStorage(); }
        return tabB.pathToHash(path, o);
      },
    });
    expect(await caught(b.getDocumentBody('db', 'd1'))).toMatchObject({ code: 'RAG_DATABASE_MOVED', details: { retryable: true } });
    expect(await b.getDocumentBody('db', 'd1')).toBe('private notes');
  });

  test('a legacy file that is gone with nothing moved: as before — the chunk\'s vectors lost, the body missing', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    await net.tab().fs.delete(`${legacyDir('db')}/chunk-0.json`);
    await net.tab().fs.delete(`${legacyDir('db')}/documents/d1.txt`);
    const s = store(net.tab(), browserOrigin()());
    expect(await reads(s)).toEqual({ vectors: [], body: 'RAG_DOCUMENT_BODY_MISSING' });
  });
});

describe('SS3/SS4 — vectors to add or ids to delete that are not lists: refused before anything runs', () => {
  for (const [label, value] of [['undefined', undefined], ['a record', { id: 'v1' }], ['a list of a record without its vector', [{ id: 'v1' }]]] as const) {
    test(`addVectors(${label}): RAG_VECTORS_INVALID, not retryable — a legacy database not migrated for it`, async () => {
      const net = new FakeS5Network();
      await seedLegacy(net);
      const s = store(net.tab(), browserOrigin()());
      const writes = net.writes.length;
      expect(await caught(s.addVectors('db', value as any))).toMatchObject({ code: 'RAG_VECTORS_INVALID', details: { retryable: false } });
      expect(net.writes.length).toBe(writes);
    });
  }

  test('deleteVectors(a string): RAG_VECTOR_IDS_INVALID — never its characters', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const s = store(net.tab(), browserOrigin()());
    const writes = net.writes.length;
    expect(await caught(s.deleteVectors('db', 'v1' as any))).toMatchObject({ code: 'RAG_VECTOR_IDS_INVALID' });
    expect(net.writes.length).toBe(writes);
  });
});
