// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 28 — plan §41 VV1–VV3: TT2's sealed-side check pinned where it alone protects (another device that
 * committed without purging); the re-check after the read-backs; the legacy hash read before the sealed side, so the
 * sealed read is the last before the commit; `vouch` only for what it reads; finalPurge's opening hash check.
 */

import { test, expect, vi, beforeEach, afterEach } from 'vitest';
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

const BASE = `home/vector-databases/${ADDR}`;
const legacyDir = (name: string) => `${BASE}/${name}`;
const MANIFEST = `${legacyDir('db')}/manifest.json`;
const CHUNK = `${legacyDir('db')}/chunk-0.json`;
const BODY = `${legacyDir('db')}/documents/d1.txt`;
const SEALED_MANIFEST = /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);
/** A device of its own: its own heads and locks. */
const device = (net: FakeS5Network, tab = net.tab()) => store(tab, browserOrigin({ now: () => net.now })());
const legacyManifest = (docs: string[], updated = 1) => ({
  name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated,
  chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: docs.map((id) => ({ id })),
});

async function seedLegacy(net: FakeS5Network) {
  const t = net.tab();
  await t.fs.put(MANIFEST, {
    name: 'db', owner: ADDR, vectorCount: 2, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1, dimensions: 3,
    chunks: [{ chunkId: 0, cid: 'c0', vectorCount: 2, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [],
    pendingDocuments: [{ id: 'd1' }],
  });
  await t.fs.put(CHUNK, { chunkId: 0, vectors: [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }] });
  await t.fs.put(BODY, 'private notes');
}

/** Run `during` the first time this tab writes a sealed file matching `pattern` (its own write then follows). */
function hookPut(tab: FakeS5Tab, pattern: RegExp, during: () => Promise<unknown>) {
  const realPut = tab.fs.put;
  let armed = true;
  tab.fs.put = async (path: string, data: any, o?: any) => {
    if (armed && pattern.test(path)) { armed = false; await during(); }
    return realPut(path, data, o);
  };
}

/** After this tab's first sealed write matching `pattern`, run `during` at its next blob download (the read-back). */
function hookReadBack(tab: FakeS5Tab, pattern: RegExp, during: () => Promise<unknown>) {
  const realPut = tab.fs.put;
  const realDownload = tab.downloadByCID;
  let wrote = false;
  let armed = true;
  tab.fs.put = async (path: string, data: any, o?: any) => { if (pattern.test(path)) wrote = true; return realPut(path, data, o); };
  tab.downloadByCID = async (hash: Uint8Array) => {
    if (wrote && armed) { armed = false; await during(); }
    return realDownload(hash);
  };
}

const vectorsOf = async (net: FakeS5Network) => (await device(net).listVectors('db')).map((v) => v.id).sort();
const addN = (a: S5VectorStore) => a.addVectors('db', [{ id: 'n', vector: [7, 8, 9], metadata: {} }]);

async function besideSealedWithLate(net: FakeS5Network) {
  await seedLegacy(net);
  expect((await device(net).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();                                               // an outdated tab writes after the migration
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late body');
  await old.fs.put(MANIFEST, legacyManifest(['d1', 'late'], 2));
}

// ── VV3: the sealed-side check where it alone protects — the other device committed but did not purge ────────────────

test('late sealed-side check alone: another device upgraded on write (no purge) during this run\'s chunk write', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  hookPut(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/chunk-/, () => addN(a));
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await vectorsOf(net)).toEqual(['n', 'v1', 'v2']);
});

test('early sealed-side check alone: another device upgraded on write (no purge) during this run\'s chunk read', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  const realGet = tabB.fs.get;
  let armed = true;
  tabB.fs.get = async (path: string, opts?: any) => {
    if (armed && path === CHUNK) { armed = false; await addN(a); }
    return realGet(path, opts);
  };
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await vectorsOf(net)).toEqual(['n', 'v1', 'v2']);
});

test('another device\'s run committed and purged phase A, its phase B pending: this run never commits a torn copy', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const tabA = net.tab();
  const realDelete = tabA.fs.delete;
  tabA.fs.delete = async (p: string) => { if (p === MANIFEST) throw Object.assign(new Error('network error'), { retryable: true }); return realDelete(p); };
  const a = device(net, tabA);
  const tabB = net.tab();
  const b = device(net, tabB);
  const realGet = tabB.fs.get;
  let armed = true;
  tabB.fs.get = async (path: string, opts?: any) => {
    if (armed && path === CHUNK) { armed = false; await a.migrateLegacyStorage(); }  // its legacy manifest stays
    return realGet(path, opts);
  };
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  const fresh = device(net);
  expect({ vectors: (await fresh.listVectors('db')).map((v) => v.id).sort(), body: await fresh.getDocumentBody('db', 'd1') })
    .toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
});

test('beside a sealed copy: another device writes to the sealed database during this run\'s body write — only the revision tells', async () => {
  const net = new FakeS5Network();
  await besideSealedWithLate(net);
  const a = device(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  hookPut(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/documents\//, () => addN(a));
  // Since §43 XX1 the run rebases on that write rather than failing: its vector is kept only because the revision told.
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['adopted-after-seal', undefined]]);
  expect(await vectorsOf(net)).toEqual(['n', 'v1', 'v2']);
});

// ── VV3: the re-check after the read-backs ─────────────────────────────────────────────────────────────────────────────

test('fresh: another device migrates and writes during this run\'s chunk read-back — RAG_DATABASE_MOVED, its write stands', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  hookReadBack(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/chunk-/, async () => { await a.migrateLegacyStorage(); await addN(a); });
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await vectorsOf(net)).toEqual(['n', 'v1', 'v2']);
});

test('beside a sealed copy: another device adopts and writes during this run\'s body read-back — its write stands', async () => {
  const net = new FakeS5Network();
  await besideSealedWithLate(net);
  const a = device(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  hookReadBack(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/documents\//, async () => { await a.migrateLegacyStorage(); await addN(a); });
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  const fresh = device(net);
  expect({ vectors: (await fresh.listVectors('db')).map((v) => v.id).sort(), late: await fresh.getDocumentBody('db', 'late') })
    .toEqual({ vectors: ['n', 'v1', 'v2'], late: 'late body' });
});

// ── VV1: the sealed side read last, after the legacy hash ─────────────────────────────────────────────────────────────

test('another device upgrades on write while this run\'s late check reads the legacy hash: its write survives', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const tabB = net.tab();
  let calls = 0;
  const b = store(tabB, browserOrigin({ now: () => net.now })(), {
    pathToHash: async (p: string, o?: any) => {
      if (p === MANIFEST && ++calls === 3) await addN(device(net));    // 1: the run's read, 2: the early check, 3: the late
      return tabB.pathToHash(p, o);
    },
  });
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await vectorsOf(net)).toEqual(['n', 'v1', 'v2']);
});

// ── VV2: vouch only for what it reads ─────────────────────────────────────────────────────────────────────────────────

test('a vouch after a long run never keeps another tab serving a revision another device replaced meanwhile', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const devA = store(net.tab(), browserOrigin({ now: () => net.now })());
  expect((await devA.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  await net.tab().fs.put(MANIFEST, { ...legacyManifest(['d1']), vectorCount: 2, dimensions: 3 });   // a leftover
  const originB = browserOrigin({ now: () => net.now });
  const t2 = store(net.tab(), originB());
  expect((await t2.listVectors('db')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  const tabT1 = net.tab();
  const t1 = store(tabT1, originB());
  // The run read the sealed copy (rev r), then verifies it — every chunk and body by hash, minutes on a large one: device
  // A changes it meanwhile (t=1), and the run vouches only at t=26.
  const realDownload = tabT1.downloadByCID;
  let armed = true;
  tabT1.downloadByCID = async (hash: Uint8Array) => {
    if (armed) { armed = false; net.advance(1_000); await addN(devA); net.advance(25_000); }
    return realDownload(hash);
  };
  await t1.migrateLegacyStorage();
  net.advance(24_000);                                                 // t=50
  expect((await t2.listVectors('db')).map((v) => v.id).sort()).toContain('n');
});

// ── VV3: finalPurge's opening hash check ──────────────────────────────────────────────────────────────────────────────

test('an outdated tab lists an entry-less body between the commit and phase B: the body survives for adoption', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const old = net.tab();
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late body');   // its body first (D16), its entry not yet
  const tabB = net.tab();
  const realPut = tabB.fs.put;
  let armed = true;
  tabB.fs.put = async (path: string, data: any, o?: any) => {
    const r = await realPut(path, data, o);
    if (armed && SEALED_MANIFEST.test(path)) { armed = false; await old.fs.put(MANIFEST, legacyManifest(['d1', 'late'], 2)); }
    return r;
  };
  const b = device(net, tabB);
  await b.migrateLegacyStorage();
  await b.migrateLegacyStorage();
  expect(await device(net).getDocumentBody('db', 'late')).toBe('late body');
});
