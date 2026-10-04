// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 29 — plan §42 WW1–WW3: `vouch` vouches for what it reads fresh (a newer revision of the same
 * incarnation included), so another device's writes never stall the purge; it keeps the legacy data for a delete or a
 * re-create; a foreign file never hides plaintext left behind; TT2's early sealed-side check pinned.
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
const SEALED_FILE = /^home\/rag\/v1\/[0-9a-f]{32}\//;
const SEALED_MANIFEST = /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);
const device = (net: FakeS5Network, tab = net.tab()) => store(tab, browserOrigin({ now: () => net.now })());
const legacyManifest = (docs: string[], updated = 1) => ({
  name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated,
  chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: docs.map((id) => ({ id })),
});
const addN = (a: S5VectorStore, id = 'n') => a.addVectors('db', [{ id, vector: [7, 8, 9], metadata: {} }]);
const plaintext = (net: FakeS5Network) => net.filePaths().filter((p) => p.startsWith(BASE));

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

/** Device A migrated the database; its legacy copy is back as a leftover (an interrupted purge). */
async function migratedWithLeftover(net: FakeS5Network) {
  await seedLegacy(net);
  const a = device(net);
  expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  await seedLegacy(net);
  return a;
}

/** During this tab's first blob download (the run's verification), run `during`. */
function duringVerification(tab: FakeS5Tab, during: () => Promise<unknown>) {
  const realDownload = tab.downloadByCID;
  let armed = true;
  tab.downloadByCID = async (hash: Uint8Array) => {
    if (armed) { armed = false; await during(); }
    return realDownload(hash);
  };
}

// ── WW1: vouch for what it reads ──────────────────────────────────────────────────────────────────────────────────────

test('another device writes during this run\'s verification: the leftover is purged all the same', async () => {
  const net = new FakeS5Network();
  const a = await migratedWithLeftover(net);
  const tabB = net.tab();
  duringVerification(tabB, () => addN(a));
  const report = await device(net, tabB).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['purged-leftover', undefined]]);
  expect(plaintext(net)).toEqual([]);
  expect((await device(net).listVectors('db')).map((v) => v.id).sort()).toEqual(['n', 'v1', 'v2']);
});

test('… and while it writes during every run, every run still purges', async () => {
  const net = new FakeS5Network();
  const a = await migratedWithLeftover(net);
  for (let run = 0; run < 3; run++) {
    if (run > 0) await seedLegacy(net);                                // the leftover again
    const tabB = net.tab();
    duringVerification(tabB, () => addN(a, `n${run}`));
    expect((await device(net, tabB).migrateLegacyStorage()).databases.map((d: any) => d.legacyKept)).toEqual([undefined]);
    expect(plaintext(net)).toEqual([]);
  }
});

// Since §43 XX3 a refused vouch reports legacyKept only while plaintext is left — A's delete removed the legacy tree, so
// neither run keeps anything (round 30's file pins the kept case: an outdated tab writing the legacy copy back).
test('the database deleted and re-created by another device during the run: not vouched for — nothing left to keep', async () => {
  const net = new FakeS5Network();
  const a = await migratedWithLeftover(net);
  const tabB = net.tab();
  duringVerification(tabB, async () => { await a.deleteDatabase('db'); await a.createDatabase({ name: 'db', owner: ADDR }); });
  const report = await device(net, tabB).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['purged-leftover', undefined]]);
  expect(plaintext(net)).toEqual([]);
});

test('the database deleted by another device during the run: never an uncoded failure, nothing left to keep', async () => {
  const net = new FakeS5Network();
  const a = await migratedWithLeftover(net);
  const tabB = net.tab();
  duringVerification(tabB, () => a.deleteDatabase('db'));
  const report = await device(net, tabB).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['purged-leftover', undefined]]);
  expect(plaintext(net)).toEqual([]);
});

// ── WW2: a foreign file never hides plaintext left behind ─────────────────────────────────────────────────────────────

test('a foreign file and an outdated tab\'s body after the commit: legacyKept, never "done" with plaintext left', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  await net.tab().fs.put(`${legacyDir('db')}/notes.md`, 'someone else');
  const tabB = net.tab();
  const realPut = tabB.fs.put;
  let armed = true;
  tabB.fs.put = async (path: string, data: any, o?: any) => {
    const r = await realPut(path, data, o);
    if (armed && SEALED_MANIFEST.test(path)) { armed = false; await net.tab().fs.put(`${legacyDir('db')}/documents/late.txt`, 'late plaintext'); }
    return r;
  };
  const report = await device(net, tabB).migrateLegacyStorage();
  expect(plaintext(net)).toContain(`${legacyDir('db')}/documents/late.txt`);
  expect(report.databases.map((d: any) => d.legacyKept)).toEqual([true]);
});

// ── WW3: TT2's early sealed-side check — nothing sealed written ───────────────────────────────────────────────────────

function sealedWrites(tab: FakeS5Tab): string[] {
  const writes: string[] = [];
  const realPut = tab.fs.put;
  tab.fs.put = async (path: string, data: any, o?: any) => { if (SEALED_FILE.test(path)) writes.push(path); return realPut(path, data, o); };
  return writes;
}

test('fresh: another device upgraded on write (no purge) during this run\'s reads — nothing sealed written', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  const tabB = net.tab();
  let armed = true;
  const b = store(tabB, browserOrigin({ now: () => net.now })(), {
    pathToHash: async (p: string, o?: any) => {                       // its chunk read: vectors to write
      if (armed && p === BODY) { armed = false; await addN(a); }
      return tabB.pathToHash(p, o);
    },
  });
  const writes = sealedWrites(tabB);
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(writes).toEqual([]);
});

test('beside a sealed copy: another device writes to it during this run\'s reads — nothing written on the stale read', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();
  await old.fs.put(`${legacyDir('db')}/documents/late1.txt`, 'late body 1');
  await old.fs.put(`${legacyDir('db')}/documents/late2.txt`, 'late body 2');
  await old.fs.put(MANIFEST, legacyManifest(['d1', 'late1', 'late2'], 2));
  const tabB = net.tab();
  let armed = true;
  const b = store(tabB, browserOrigin({ now: () => net.now })(), {
    pathToHash: async (p: string, o?: any) => {                       // late1 read (a body to write); then A writes
      if (armed && p === `${legacyDir('db')}/documents/late2.txt`) { armed = false; await new Promise((r) => setTimeout(r, 0)); await addN(a); }
      return tabB.pathToHash(p, o);
    },
  });
  const writes = sealedWrites(tabB);
  // Since §43 XX1 the run rebases on that write: still nothing written on the stale read — each body once, by the
  // attempt that commits (without the early check the first attempt's bodies would be written, then written again).
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['adopted-after-seal', undefined]]);
  expect(writes.filter((w) => w.includes('/documents/')).length).toBe(2);
  expect(await device(net).listVectors('db').then((vs) => vs.map((v) => v.id).sort())).toEqual(['n', 'v1', 'v2']);
});
