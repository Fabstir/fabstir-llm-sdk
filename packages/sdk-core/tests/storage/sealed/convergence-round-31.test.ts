// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 31 — storage-level (plan §44 YY3, YY5, YY6): a look that fails after a commit keeps the legacy data
 * (never `failed`), and reports what is there now; a read-back that finds another device's delete or re-create is a
 * move, never a failed verification; XX1's bound and its incarnation clause pinned.
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

const BASE = `home/vector-databases/${ADDR}`;
const legacyDir = (name: string) => `${BASE}/${name}`;
const MANIFEST = `${legacyDir('db')}/manifest.json`;
const CHUNK = `${legacyDir('db')}/chunk-0.json`;
const BODY = `${legacyDir('db')}/documents/d1.txt`;
const SEALED_MANIFEST = /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);
const origin = (net: FakeS5Network) => browserOrigin({ now: () => net.now })();
const device = (net: FakeS5Network, tab = net.tab()) => store(tab, origin(net));
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

async function seedLegacy(net: FakeS5Network) {
  const t = net.tab();
  await t.fs.put(MANIFEST, legacyManifest(['d1']));
  await t.fs.put(CHUNK, { chunkId: 0, vectors: [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }] });
  await t.fs.put(BODY, 'private notes');
}

/** Device A migrated; an outdated tab then wrote the legacy copy back with a late document (its body, then its entry). */
async function writeLate(net: FakeS5Network) {
  await seedLegacy(net);
  const old = net.tab();
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late text');
  await old.fs.put(MANIFEST, legacyManifest(['d1', 'late'], 2));
}
async function migratedThenLate(net: FakeS5Network) {
  await seedLegacy(net);
  const a = device(net);
  expect((await a.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  await writeLate(net);
  return a;
}

/** A head store whose next `puts` writes fail as blocked storage does. */
function flaky(base: RagCoherence, faults: { puts: number }): RagCoherence {
  const wrap = (c: RagCoherence): RagCoherence => ({
    ...c,
    putHead: async (key, head) => {
      if (faults.puts > 0) { faults.puts--; throw new SDKError('Sealed storage needs IndexedDB', 'RAG_COHERENCE_UNAVAILABLE', { missing: 'IndexedDB', retryable: false }); }
      return c.putHead(key, head);
    },
    scoped: (scope) => wrap(c.scoped(scope)),
  });
  return wrap(base);
}

/** Right after this tab writes a sealed manifest (its commit), run `after` — once. */
function afterCommit(tab: FakeS5Tab, after: () => Promise<unknown>) {
  const realPut = tab.fs.put;
  let armed = true;
  tab.fs.put = async (path: string, data: any, o?: any) => {
    const done = await realPut(path, data, o);
    if (armed && SEALED_MANIFEST.test(path)) { armed = false; await after(); }
    return done;
  };
}

/** At this tab's first blob download (a run's verification), run `during`. */
function duringVerification(tab: FakeS5Tab, during: () => Promise<unknown>) {
  const realDownload = tab.downloadByCID;
  let armed = true;
  tab.downloadByCID = async (hash: Uint8Array) => {
    if (armed) { armed = false; await during(); }
    return realDownload(hash);
  };
}

// ── YY3: the second look after a commit ─────────────────────────────────────────────────────────────────────────────

describe('YY3 — a refused vouch\'s second look', () => {
  test('committed, its head not recorded, and the look fails: migrated, legacyKept + purgeError — never failed', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tab = net.tab();
    afterCommit(tab, async () => net.fail('list', legacyDir('db'), 'dir404', 1));
    const report = await store(tab, flaky(origin(net), { puts: 1 })).migrateLegacyStorage();
    const [entry] = report.databases as any[];
    expect({ status: entry.status, vectors: entry.vectors, legacyKept: entry.legacyKept, purgeError: typeof entry.purgeError })
      .toEqual({ status: 'migrated', vectors: 2, legacyKept: true, purgeError: 'string' });
    expect(plaintext(net)).toContain(BODY);
    expect((await device(net).listVectors('db')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('a file outside the layout that another device\'s delete removed under the run is not reported', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    await net.tab().fs.put(`${legacyDir('db')}/notes.md`, 'the UI\'s own');
    const a = device(net);
    await a.migrateLegacyStorage();
    await seedLegacy(net);                                                   // the leftover, the UI's file beside it
    const tabB = net.tab();
    duringVerification(tabB, () => a.deleteDatabase('db'));
    const report = await device(net, tabB).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.legacyKept, d.unrecognisedFiles])).toEqual([['purged-leftover', undefined, undefined]]);
    expect(plaintext(net)).toEqual([]);
  });
});

// ── YY5: the read-back finds another device's delete or re-create ──────────────────────────────────────────────────

describe('YY5 — a read-back that finds no manifest, a tombstone or another incarnation is a move', () => {
  test('a run: another device deleted the database right after the commit — RAG_DATABASE_MOVED, retryable', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const other = device(net);
    const tab = net.tab();
    afterCommit(tab, () => other.deleteDatabase('db'));
    const report = await device(net, tab).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.code, d.retryable])).toEqual([['failed', 'RAG_DATABASE_MOVED', true]]);
  });

  test('an upgrade on write: the write rejects RAG_DATABASE_MOVED, retryable — never a failed verification', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const other = device(net);
    const tab = net.tab();
    afterCommit(tab, () => other.deleteDatabase('db'));
    const write = device(net, tab).addVectors('db', [{ id: 'x', vector: [1, 1, 1], metadata: {} }]).then(() => undefined, (e) => e);
    expect(await write).toMatchObject({ code: 'RAG_DATABASE_MOVED', details: { retryable: true } });
  });

  test('re-created right after the commit, and the legacy copy written back: nothing purged beside the other copy', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const other = device(net);
    const tab = net.tab();
    afterCommit(tab, async () => {
      await other.deleteDatabase('db');
      await other.createDatabase({ name: 'db', owner: ADDR });
      await seedLegacy(net);                                                 // an outdated tab writes it back
    });
    const report = await device(net, tab).migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
    expect(plaintext(net)).toEqual(expect.arrayContaining([MANIFEST, CHUNK, BODY]));
  });
});

// ── YY6: XX1's pins ─────────────────────────────────────────────────────────────────────────────────────────────────

test('YY6 — exactly 3 rebases, then RAG_DATABASE_MOVED', async () => {
  const net = new FakeS5Network();
  const a = await migratedThenLate(net);
  const tabB = net.tab();
  let checks = 0;
  const b = store(tabB, origin(net), {
    pathToHash: async (path: string, o?: any) => {
      // The legacy manifest's hash: the run's read, then each attempt's check — another device writes before each.
      if (path === MANIFEST) { checks++; await a.addVectors('db', [{ id: `a${checks}`, vector: [checks, checks, checks], metadata: {} }]); }
      return tabB.pathToHash(path, o);
    },
  });
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(checks).toBe(1 + 4);                                                // the read, then attempts 1–4 (3 rebases)
});

test('YY6 — deleted, re-created and written to under the run, the legacy copy written back byte-identical: a move, never a rebase onto the new copy', async () => {
  const net = new FakeS5Network();
  const a = await migratedThenLate(net);
  const tabB = net.tab();
  duringVerification(tabB, async () => {
    await a.deleteDatabase('db');
    await a.createDatabase({ name: 'db', owner: ADDR });
    await a.addVectors('db', [{ id: 'n1', vector: [7, 8, 9], metadata: {} }]);
    await a.addVectors('db', [{ id: 'n2', vector: [7, 8, 9], metadata: {} }]);
    await writeLate(net);                                                    // the same bytes the run read
  });
  expect((await device(net, tabB).migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await docIds(device(net))).toEqual([]);
});
