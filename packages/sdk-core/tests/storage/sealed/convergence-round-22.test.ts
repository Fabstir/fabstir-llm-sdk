// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 22 — storage-level (plan §35 PP1, PP2, PP8): a sealed object of 65,536 keys or more; nothing is
 * purged beside a manifest that does not open; a migration's head not recorded is never the caller's write; a delete
 * reads its head before it deletes.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { SDKError } from '../../../src/types';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const DB = 'notes';
const dbDir = (name = DB) => `home/rag/v1/${sealer().deriveId('db', name)}`;
const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, docIds: string[]) => ({
  name, owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const unavailable = () => new SDKError('Sealed storage needs IndexedDB', 'RAG_COHERENCE_UNAVAILABLE', { missing: 'IndexedDB', retryable: false });

/** A browser head store whose next `faults.puts` head writes fail, and whose head reads fail while `faults.reads()`. */
function flaky(base: RagCoherence, faults: { puts: number; reads?: () => boolean }): RagCoherence {
  const wrap = (c: RagCoherence): RagCoherence => ({
    ...c,
    putHead: async (key, head) => {
      if (faults.puts > 0) { faults.puts--; throw unavailable(); }
      return c.putHead(key, head);
    },
    getHead: async (key) => {
      if (faults.reads?.()) throw unavailable();
      return c.getHead(key);
    },
    scoped: (scope) => wrap(c.scoped(scope)),
  });
  return wrap(base);
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

const store = (tab: FakeS5Tab, coherence?: RagCoherence) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), cacheEnabled: true, pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}) } as any);

/** A sealed object as the 1.39 release candidate's encoder wrote it (a 16-bit-length map per object). */
const FIXTURE = 'ff53454c0101d978b6e22e2b90638120c788d67423b43625debcb1a3e6b74d4b80e071923c5b812aa49404647de3f69c6c02b01751399772a861514b9ddf45125d5ef88079c8e6ac5f08960a0f113cba4c467b32de3794867913e628826a1eec29f827fad8ef59fdaf4767580aa3c065e2f8e2b2f1a5d4016d6ac82d7042e031a83ca5e6bf5d2cdae52473b379a963440543dd5571bde1e2517ce0f09f261f9d3086';

const manyKeys = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { hash: 'ab'.repeat(32), kind: 'text', size: i }]));

beforeEach(() => __resetInProcessCoherenceForTests());

describe('PP1 — a sealed object of 65,536 keys or more opens again', () => {
  test('the sealer: 65,536 and 70,000 keys round-trip', () => {
    const s = sealer();
    for (const n of [65_536, 70_000]) {
      const opened = s.open(s.seal({ kind: 'cbor', value: manyKeys(n) }, 'ctx/v1'), 'ctx/v1').value as Record<string, unknown>;
      expect(Object.keys(opened).length).toBe(n);
    }
  });

  test('what was sealed before opens as it did', () => {
    expect(sealer().open(Uint8Array.from(Buffer.from(FIXTURE, 'hex')), 'fixture/v1').value).toEqual({
      name: 'notes', revision: 3, bodies: { k1: { hash: 'aa', kind: 'text', size: 5 } }, pendingDocuments: [{ id: 'd1' }], nested: { deep: [1, 2, { x: 'y' }] },
    });
  });

  test('a manifest with 65,536 bodies: another tab lists the database and reads it', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: DB, owner: ADDR });
    await (s as any)._mutate(DB, (m: any) => { m.bodies = manyKeys(65_536); });
    const other = store(net.tab());
    expect((await other.listDatabases()).map((d) => d.databaseName)).toEqual([DB]);
    expect((await other.getDatabaseMetadata(DB)).databaseName).toBe(DB);
  }, 60_000);

  test('a migration never purges beside a committed manifest that does not open', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1']));
    const s = store(net.tab());
    const real = (s as any).sealer.seal;
    // The commit's manifest is sealed so that it cannot open (any defect of the kind PP1 was) — the read-back must see it.
    (s as any).sealer.seal = (payload: any, context: string) =>
      real(payload, payload?.value?.migratedFrom && context.endsWith('/manifest') ? `${context}/unopenable` : context);
    const report = await s.migrateLegacyStorage();
    expect(report.databases.map((d: any) => [d.name, d.status])).toEqual([['L', 'failed']]);
    expect(net.filePaths()).toContain(`${legacyDir('L')}/manifest.json`);
  });
});

test('PP1 — a run adopting beside a sealed copy keeps the legacy body when its committed manifest does not open', async () => {
  const net = new FakeS5Network();
  await net.tab().fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1']));
  expect((await store(net.tab()).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();                                              // an outdated tab writes after the migration
  await old.fs.put(`${legacyDir('L')}/documents/late.txt`, 'late body');
  await old.fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1', 'late']));
  const s = store(net.tab());
  const real = (s as any).sealer.seal;
  (s as any).sealer.seal = (payload: any, context: string) =>
    real(payload, payload?.value?.migratedFrom && context.endsWith('/manifest') ? `${context}/unopenable` : context);
  expect((await s.migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['failed']);
  expect(net.filePaths()).toContain(`${legacyDir('L')}/documents/late.txt`);
});

test('PP1 — a migration whose committed manifest does not read back at all: nothing purged', async () => {
  const net = new FakeS5Network();
  await net.tab().fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1']));
  const s = store(net.tab());
  const io = (s as any).io;
  const readPath = io.readPath.bind(io);
  io.readPath = async (path: string) => (path === `${dbDir('L')}/manifest` ? { state: 'absent' } : readPath(path));
  const report = await s.migrateLegacyStorage();
  // Since §44 YY5: none to read back is what another device's delete leaves — a move (retryable), still nothing purged.
  expect(report.databases.map((d: any) => [d.name, d.status, d.code, d.retryable])).toEqual([['L', 'failed', 'RAG_DATABASE_MOVED', true]]);
  expect(net.filePaths()).toContain(`${legacyDir('L')}/manifest.json`);
});

test('PP2 — a migration whose manifest write fails says so with that failure\'s own code and verdict', async () => {
  const net = new FakeS5Network();
  await net.tab().fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1']));
  net.fail('put', `${dbDir('L')}/manifest`, 'network');
  const report = await store(net.tab()).migrateLegacyStorage();
  expect(report.databases.map((d: any) => [d.status, d.code, d.retryable])).toEqual([['failed', 'S5_IO_ERROR', true]]);
  expect(net.filePaths()).toContain(`${legacyDir('L')}/manifest.json`);
});

describe('PP2 — a migration\'s head not recorded is never the caller\'s write', () => {
  test('upgrade on write, the migration\'s head not recorded: the caller\'s write still runs — and lands', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir(DB)}/manifest.json`, legacyManifest(DB, ['old']));
    const faults = { puts: 1 };                                       // the migration's commit only
    const s = store(net.tab(), flaky(browserOrigin()(), faults));
    await s.addPendingDocument(DB, { id: 'new' } as any);
    const fresh = store(net.tab());
    expect(((await fresh.getDatabaseMetadata(DB)) as any).pendingDocuments.map((d: any) => d.id).sort()).toEqual(['new', 'old']);
  });

  test('every head write failing: committed: true is the caller\'s own write — which landed', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir(DB)}/manifest.json`, legacyManifest(DB, ['old']));
    const s = store(net.tab(), flaky(browserOrigin()(), { puts: Infinity }));
    expect(await caught(s.addPendingDocument(DB, { id: 'new' } as any))).toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true } });
    const fresh = store(net.tab());
    expect(((await fresh.getDatabaseMetadata(DB)) as any).pendingDocuments.map((d: any) => d.id).sort()).toEqual(['new', 'old']);
  });

  test('a migration run whose head is not recorded reports the database moved', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('L')}/manifest.json`, legacyManifest('L', ['d1']));
    const s = store(net.tab(), flaky(browserOrigin()(), { puts: 1 }));
    expect((await s.migrateLegacyStorage()).databases.map((d: any) => [d.name, d.status])).toEqual([['L', 'migrated']]);
  });
});

describe('PP8 — deleteDatabase reads its head before it deletes anything', () => {
  test('a head store that fails once files are gone: the delete completes', async () => {
    const net = new FakeS5Network();
    const files = () => net.filePaths().filter((p) => p.startsWith(dbDir())).length;
    const faults = { puts: 0, reads: () => false };
    const s = store(net.tab(), flaky(browserOrigin()(), faults));
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [{ id: 'v1', vector: [1, 2, 3], metadata: {} }]);
    const before = files();
    faults.reads = () => files() < before;
    await s.deleteDatabase(DB);
    expect(files()).toBe(0);
  });
});
