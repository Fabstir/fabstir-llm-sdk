// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 30 — storage-level (plan §43 XX1–XX3, XX8): another device's write beside a sealed copy is
 * rebased on, never a stall; a repair gives a body only to a document the migration found without one; `legacyKept`
 * only while plaintext is left; WW2's second look and `vouch`'s tombstone branch pinned.
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

const BASE = `home/vector-databases/${ADDR}`;
const legacyDir = (name: string) => `${BASE}/${name}`;
const MANIFEST = `${legacyDir('db')}/manifest.json`;
const CHUNK = `${legacyDir('db')}/chunk-0.json`;
const BODY = `${legacyDir('db')}/documents/d1.txt`;
const SEALED_BODY = /^home\/rag\/v1\/[0-9a-f]{32}\/documents\//;
const store = (tab: FakeS5Tab, coherence: RagCoherence) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence } as any);
const device = (net: FakeS5Network, tab = net.tab()) => store(tab, browserOrigin({ now: () => net.now })());
const legacyManifest = (docs: string[], updated = 1) => ({
  name: 'db', owner: ADDR, vectorCount: 2, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated, dimensions: 3,
  chunks: [{ chunkId: 0, cid: 'c0', vectorCount: 2, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [],
  pendingDocuments: docs.map((id) => ({ id })),
});
const plaintext = (net: FakeS5Network) => net.filePaths().filter((p) => p.startsWith(BASE));
const docIds = async (s: S5VectorStore) => {
  const meta: any = await s.getDatabase('db');
  return [...(meta.pendingDocuments ?? []), ...(meta.readyDocuments ?? [])].map((d: any) => d.id).sort();
};
const vectorIds = async (s: S5VectorStore) => (await s.listVectors('db')).map((v) => v.id).sort();
const body = (s: S5VectorStore, id: string) => s.getDocumentBody('db', id).catch((e: any) => e.code);
const entries = (r: any) => r.databases.map((d: any) => [d.status, d.code, d.legacyKept]);

async function seedLegacy(net: FakeS5Network, docs = ['d1']) {
  const t = net.tab();
  await t.fs.put(MANIFEST, legacyManifest(docs));
  await t.fs.put(CHUNK, { chunkId: 0, vectors: [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }] });
  await t.fs.put(BODY, 'private notes');
}

/** Device A migrated; an outdated tab then wrote the legacy copy back with a late document (its body, then its entry). */
async function migratedThenLate(net: FakeS5Network) {
  await seedLegacy(net);
  const a = device(net);
  expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  await seedLegacy(net);
  const old = net.tab();
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late text');
  await old.fs.put(MANIFEST, legacyManifest(['d1', 'late'], 2));
  return a;
}

/** Run `during` at this tab's blob downloads: the first one, or each one while `every`. */
function onDownload(tab: FakeS5Tab, during: () => Promise<unknown>, opts: { every?: { on: boolean }; afterSealedBody?: boolean } = {}) {
  const realDownload = tab.downloadByCID;
  const realPut = tab.fs.put;
  let wroteBody = false;
  tab.fs.put = async (path: string, data: any, o?: any) => { if (SEALED_BODY.test(path)) wroteBody = true; return realPut(path, data, o); };
  let armed = true;
  tab.downloadByCID = async (hash: Uint8Array) => {
    const ready = !opts.afterSealedBody || wroteBody;
    if (ready && (opts.every ? opts.every.on : armed)) { armed = false; await during(); }
    return realDownload(hash);
  };
}

// ── XX1: another device's write beside a sealed copy is rebased on ──────────────────────────────────────────────────

describe('XX1 — a run that commits rebases on another device\'s write to the same database', () => {
  test('a write during the run\'s verification: the late document is adopted at once, that device\'s write kept', async () => {
    const net = new FakeS5Network();
    const a = await migratedThenLate(net);
    const tabB = net.tab();
    onDownload(tabB, () => a.addVectors('db', [{ id: 'a1', vector: [7, 8, 9], metadata: {} }]));
    const report = await device(net, tabB).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.adopted])).toEqual([['adopted-after-seal', ['late']]]);
    const fresh = device(net);
    expect({ docs: await docIds(fresh), vectors: await vectorIds(fresh), late: await body(fresh, 'late') })
      .toEqual({ docs: ['d1', 'late'], vectors: ['a1', 'v1', 'v2'], late: 'late text' });
    expect(plaintext(net)).toEqual([]);
  });

  test('a write right before the manifest (after this run wrote its bodies): rebased the same', async () => {
    const net = new FakeS5Network();
    const a = await migratedThenLate(net);
    const tabB = net.tab();
    onDownload(tabB, () => a.addVectors('db', [{ id: 'a1', vector: [7, 8, 9], metadata: {} }]), { afterSealedBody: true });
    const report = await device(net, tabB).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.adopted])).toEqual([['adopted-after-seal', ['late']]]);
    const fresh = device(net);
    expect({ docs: await docIds(fresh), vectors: await vectorIds(fresh), late: await body(fresh, 'late') })
      .toEqual({ docs: ['d1', 'late'], vectors: ['a1', 'v1', 'v2'], late: 'late text' });
  });

  test('the rebase decides again: a body that device put is never replaced by the legacy one', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, ['d1', 'd2']);                                // d2 listed, its body not there yet
    const a = device(net);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.missingBodies)).toEqual([['d2']]);
    await seedLegacy(net, ['d1', 'd2']);
    await net.tab().fs.put(`${legacyDir('db')}/documents/d2.txt`, 'stale legacy text'); // it arrives: a repair to make
    const tabB = net.tab();
    onDownload(tabB, () => a.putDocumentBody('db', 'd2', 'newer text'));
    const report = await device(net, tabB).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.repairedBodies])).toEqual([['purged-leftover', undefined]]);
    expect(await body(device(net), 'd2')).toBe('newer text');
    expect(plaintext(net)).toEqual([]);
  });

  test('a write during every attempt: RAG_DATABASE_MOVED after three rebases — and a quiet run then adopts', async () => {
    const net = new FakeS5Network();
    const a = await migratedThenLate(net);
    const tabB = net.tab();
    const busy = { on: true };
    let k = 0;
    onDownload(tabB, () => a.addVectors('db', [{ id: `a${++k}`, vector: [k, k, k], metadata: {} }]), { every: busy });
    const b = device(net, tabB);
    const first = await b.migrateLegacyStorage();
    expect(first.databases.map((d: any) => [d.status, d.code, d.retryable])).toEqual([['failed', 'RAG_DATABASE_MOVED', true]]);
    expect(await docIds(device(net))).toEqual(['d1']);                 // nothing committed
    busy.on = false;
    net.advance(60_000);
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['adopted-after-seal']);
    expect(await docIds(device(net))).toEqual(['d1', 'late']);
  });

  test('a delete and re-create under the run is still a move: RAG_DATABASE_MOVED, nothing adopted into the new one', async () => {
    const net = new FakeS5Network();
    const a = await migratedThenLate(net);
    const tabB = net.tab();
    onDownload(tabB, async () => { await a.deleteDatabase('db'); await a.createDatabase({ name: 'db', owner: ADDR }); });
    expect(entries(await device(net, tabB).migrateLegacyStorage())).toEqual([['failed', 'RAG_DATABASE_MOVED', undefined]]);
    expect(await docIds(device(net))).toEqual([]);
  });
});

// ── XX2: a repair only for a body the migration found missing ───────────────────────────────────────────────────────

describe('XX2 — S1\'s repair gives a body only to a document the migration recorded without one', () => {
  test('removed and re-added under the same id: the removed document\'s text is never its body', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const a = device(net);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
    await seedLegacy(net);                                              // the leftover
    await a.removeDocument('db', 'd1');
    await a.addPendingDocument('db', { id: 'd1' });                     // a new document, its body to come
    const report = await device(net).migrateLegacyStorage();
    expect(report.databases.map((d: any) => d.repairedBodies)).toEqual([undefined]);
    expect(await body(device(net), 'd1')).toBe('RAG_DOCUMENT_BODY_MISSING');
    expect(plaintext(net)).toEqual([]);
  });

  test('one recorded missing, then removed and re-added: not repaired either — removeDocument forgets it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, ['d1', 'd2']);
    const a = device(net);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.missingBodies)).toEqual([['d2']]);
    await a.removeDocument('db', 'd2');
    await a.addPendingDocument('db', { id: 'd2' });
    await net.tab().fs.put(`${legacyDir('db')}/documents/d2.txt`, 'the removed document\'s text');
    const report = await device(net).migrateLegacyStorage();
    expect(report.databases.map((d: any) => d.repairedBodies)).toEqual([undefined]);
    expect(await body(device(net), 'd2')).toBe('RAG_DOCUMENT_BODY_MISSING');
  });

  test('recorded missing at the migration: its body, arriving later, is repaired', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, ['d1', 'd2']);
    const a = device(net);
    await a.migrateLegacyStorage();
    await net.tab().fs.put(`${legacyDir('db')}/documents/d2.txt`, 'late body');
    const report = await device(net).migrateLegacyStorage();
    expect(report.databases.map((d: any) => d.repairedBodies)).toEqual([['d2']]);
    expect(await body(device(net), 'd2')).toBe('late body');
  });

  test('adopted without its body: recorded, and repaired when the body arrives', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const a = device(net);
    await a.migrateLegacyStorage();
    await seedLegacy(net);
    await net.tab().fs.put(MANIFEST, legacyManifest(['d1', 'late'], 2));   // the entry first, the body later
    const adoption = await device(net).migrateLegacyStorage();
    expect(adoption.databases.map((d: any) => [d.status, d.missingBodies])).toEqual([['adopted-after-seal', ['late']]]);
    await net.tab().fs.put(`${legacyDir('db')}/documents/late.txt`, 'late text');
    const repair = await device(net).migrateLegacyStorage();
    expect(repair.databases.map((d: any) => d.repairedBodies)).toEqual([['late']]);
    expect(await body(device(net), 'late')).toBe('late text');
  });
});

// ── XX3: legacyKept only while plaintext is left ────────────────────────────────────────────────────────────────────

describe('XX3 — a refused vouch reports legacyKept only while a file of the layout is left', () => {
  async function migratedWithLeftover(net: FakeS5Network) {
    await seedLegacy(net);
    const a = device(net);
    expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
    await seedLegacy(net);
    return a;
  }

  test('another device deleted the database under the run: its delete removed the plaintext — nothing kept', async () => {
    const net = new FakeS5Network();
    const a = await migratedWithLeftover(net);
    const tabB = net.tab();
    onDownload(tabB, () => a.deleteDatabase('db'));
    expect(entries(await device(net, tabB).migrateLegacyStorage())).toEqual([['purged-leftover', undefined, undefined]]);
    expect(plaintext(net)).toEqual([]);
  });

  test('deleted and re-created: the same', async () => {
    const net = new FakeS5Network();
    const a = await migratedWithLeftover(net);
    const tabB = net.tab();
    onDownload(tabB, async () => { await a.deleteDatabase('db'); await a.createDatabase({ name: 'db', owner: ADDR }); });
    expect(entries(await device(net, tabB).migrateLegacyStorage())).toEqual([['purged-leftover', undefined, undefined]]);
    expect(plaintext(net)).toEqual([]);
  });

  test('deleted, and only a file outside the layout written there since: nothing of the SDK\'s kept', async () => {
    const net = new FakeS5Network();
    const a = await migratedWithLeftover(net);
    const tabB = net.tab();
    onDownload(tabB, async () => { await a.deleteDatabase('db'); await net.tab().fs.put(`${legacyDir('db')}/notes.md`, 'the UI\'s own'); });
    expect(entries(await device(net, tabB).migrateLegacyStorage())).toEqual([['purged-leftover', undefined, undefined]]);
    expect(plaintext(net)).toEqual([`${legacyDir('db')}/notes.md`]);
  });

  test('re-created, and an outdated tab wrote the legacy copy back: kept', async () => {
    const net = new FakeS5Network();
    const a = await migratedWithLeftover(net);
    const tabB = net.tab();
    onDownload(tabB, async () => { await a.deleteDatabase('db'); await a.createDatabase({ name: 'db', owner: ADDR }); await seedLegacy(net); });
    expect(entries(await device(net, tabB).migrateLegacyStorage())).toEqual([['purged-leftover', undefined, true]]);
    expect(plaintext(net)).toContain(BODY);
  });
});

// ── XX8: pins ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe('XX8 — WW2\'s second look for a late manifest or chunk', () => {
  for (const [label, late] of [
    ['manifest', (t: FakeS5Tab) => t.fs.put(MANIFEST, legacyManifest(['d1'], 2))],
    ['chunk', (t: FakeS5Tab) => t.fs.put(`${legacyDir('db')}/chunk-1.json`, { chunkId: 1, vectors: [] })],
  ] as const) {
    test(`a foreign file, and an outdated tab's ${label} right after phase B removed the manifest: legacyKept`, async () => {
      const net = new FakeS5Network();
      await seedLegacy(net);
      await net.tab().fs.put(`${legacyDir('db')}/notes.md`, 'someone else\'s');
      const tabB = net.tab();
      const realDelete = tabB.fs.delete;
      let armed = true;
      tabB.fs.delete = async (path: string) => {
        const done = await realDelete(path);
        if (armed && path === MANIFEST) { armed = false; await late(net.tab()); }
        return done;
      };
      const report = await device(net, tabB).migrateLegacyStorage();
      expect(report.databases.map((d: any) => [d.status, d.legacyKept])).toEqual([['migrated', true]]);
    });
  }
});

test('XX8 — vouch meets a tombstone (an earlier build\'s, revision-only, and a re-create under the run): kept, never an uncoded failure', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const a = device(net);
  expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']); // revision 1
  await a.addVectors('db', [{ id: 'n', vector: [7, 8, 9], metadata: {} }]);                               // revision 2
  await seedLegacy(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  // A tombstone with no incarnation at revision 1 (an earlier build's) in this origin: it does not cover revision 2.
  await (b as any).heads.putHead((b as any)._dbId('db'), { revision: 1, deleted: true });
  onDownload(tabB, async () => {
    await a.deleteDatabase('db');
    await device(net).createDatabase({ name: 'db', owner: ADDR });                                           // revision 1 again
    await seedLegacy(net);                                                                                    // and the legacy copy back
  });
  expect(entries(await b.migrateLegacyStorage())).toEqual([['purged-leftover', undefined, true]]);
});
