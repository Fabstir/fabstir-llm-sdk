// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 27 — plan §40 UU1–UU3: a migration re-checks what it started from right before its manifest (the
 * sealed side and the legacy manifest's hash), not only before its writes; discovery lists the legacy root before the
 * sealed one; pins.
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
const SEALED_FILE = /^home\/rag\/v1\/[0-9a-f]{32}\//;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);
/** A device of its own: its own heads and locks. */
const device = (net: FakeS5Network, tab = net.tab()) => store(tab, browserOrigin({ now: () => net.now })());

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

describe('UU1 — another device that overtakes a migration\'s write phase: nothing committed over it', () => {
  for (const [where, pattern] of [['body', /^home\/rag\/v1\/[0-9a-f]{32}\/documents\//], ['chunk', /^home\/rag\/v1\/[0-9a-f]{32}\/chunk-/]] as const) {
    test(`it migrates and writes during this run's ${where} write: RAG_DATABASE_MOVED — its write stands`, async () => {
      const net = new FakeS5Network();
      await seedLegacy(net);
      const a = device(net);
      const tabB = net.tab();
      const b = device(net, tabB);
      hookPut(tabB, pattern, async () => {
        await a.migrateLegacyStorage();
        await a.addVectors('db', [{ id: 'n', vector: [7, 8, 9], metadata: {} }]);
      });
      expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code, d.retryable])).toEqual([['failed', 'RAG_DATABASE_MOVED', true]]);
      expect((await device(net).listVectors('db')).map((v) => v.id).sort()).toEqual(['n', 'v1', 'v2']);
    });
  }

  test('it migrates then deletes the database during this run\'s write phase: the delete stands', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const a = device(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookPut(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/chunk-/, async () => {
      await a.migrateLegacyStorage();
      await a.deleteDatabase('db');
    });
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
    expect(await device(net).getDatabase('db')).toBeNull();
  });

  test('it deletes a legacy-only database under this run\'s reads: never brought back', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    const realGet = tabB.fs.get;
    let armed = true;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (armed && path === CHUNK) { armed = false; await device(net).deleteDatabase('db'); }
      return realGet(path, opts);
    };
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
    expect(await device(net).getDatabase('db')).toBeNull();
  });

  test('beside a sealed copy: another device adopts and writes during this run\'s body write — its write stands', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    expect((await device(net).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
    const old = net.tab();                                             // an outdated tab writes after the migration
    await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late body');
    await old.fs.put(MANIFEST, {
      name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
      chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'd1' }, { id: 'late' }],
    });
    const a = device(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookPut(tabB, /^home\/rag\/v1\/[0-9a-f]{32}\/documents\//, async () => {
      await a.migrateLegacyStorage();                                  // adopts 'late'
      await a.addVectors('db', [{ id: 'n', vector: [7, 8, 9], metadata: {} }]);
    });
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
    const fresh = device(net);
    expect({ vectors: (await fresh.listVectors('db')).map((v) => v.id).sort(), late: await fresh.getDocumentBody('db', 'late') })
      .toEqual({ vectors: ['n', 'v1', 'v2'], late: 'late body' });
  });

  test('a run that finds the database moved before it writes writes nothing sealed', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    let armed = true;
    const b = store(tabB, browserOrigin({ now: () => net.now })(), {
      // Its chunk already read (vectors to write), the other device moves it before this run's body read.
      pathToHash: async (path: string, o?: any) => {
        if (armed && path === BODY) { armed = false; await device(net).migrateLegacyStorage(); }
        return tabB.pathToHash(path, o);
      },
    });
    const realPut = tabB.fs.put;
    const sealedWrites: string[] = [];
    tabB.fs.put = async (path: string, data: any, o?: any) => { if (SEALED_FILE.test(path)) sealedWrites.push(path); return realPut(path, data, o); };
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => d.code)).toEqual(['RAG_DATABASE_MOVED']);
    expect(sealedWrites).toEqual([]);
  });
});

test('UU3 — beside a sealed copy, a run that finds it changed before it writes writes nothing sealed', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  expect((await device(net).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();
  await old.fs.put(`${legacyDir('db')}/documents/late1.txt`, 'late body 1');
  await old.fs.put(`${legacyDir('db')}/documents/late2.txt`, 'late body 2');
  await old.fs.put(MANIFEST, {
    name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
    chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'd1' }, { id: 'late1' }, { id: 'late2' }],
  });
  const tabB = net.tab();
  let armed = true;
  const b = store(tabB, browserOrigin({ now: () => net.now })(), {
    // late1's body already read (a body to write), the other device adopts both before this run reads late2's.
    pathToHash: async (path: string, o?: any) => {
      if (armed && path === `${legacyDir('db')}/documents/late2.txt`) {
        armed = false;
        await new Promise((r) => setTimeout(r, 0));
        await device(net).migrateLegacyStorage();
      }
      return tabB.pathToHash(path, o);
    },
  });
  const realPut = tabB.fs.put;
  const sealedWrites: string[] = [];
  tabB.fs.put = async (path: string, data: any, o?: any) => { if (SEALED_FILE.test(path)) sealedWrites.push(path); return realPut(path, data, o); };
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => d.code)).toEqual(['RAG_DATABASE_MOVED']);
  expect(sealedWrites).toEqual([]);
});

describe('UU2 — discovery lists the legacy root before the sealed one', () => {
  test('another device moves and purges the database between the listings\' service: "all" still lists it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    const realList = tabB.fs.list;
    let armed = true;
    (tabB.fs as any).list = (p: string, opts?: any) => {
      if (!(armed && p === BASE)) return realList(p, opts);
      armed = false;
      return (async function* () { await device(net).migrateLegacyStorage(); yield* realList(p, opts) as any; })();
    };
    expect((await b.listAllDatabases()).map((d) => d.databaseName)).toEqual(['db']);
  });
});

describe('UU3 — pins', () => {
  test('a legacy body found missing while the sealed check fails: that failure, retryable — never BODY_MISSING', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    expect(await b.getDatabase('db')).not.toBeNull();
    await net.tab().fs.delete(BODY);
    const realGet = tabB.fs.get;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (/^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/.test(path)) throw Object.assign(new Error('network error'), { retryable: true });
      return realGet(path, opts);
    };
    const e = await caught(b.getDocumentBody('db', 'd1'));
    expect(e.code).not.toBe('RAG_DOCUMENT_BODY_MISSING');
    expect(e).toMatchObject({ details: { retryable: true } });
  });

  test('an INCOMPLETE discovery drops nothing: a database whose read failed stays listed', async () => {
    const net = new FakeS5Network();
    const other = device(net);
    await other.createDatabase({ name: 'x', owner: ADDR });
    await other.createDatabase({ name: 'y', owner: ADDR });
    const tabB = net.tab();
    const b = device(net, tabB);
    expect(await b.getDatabase('y')).not.toBeNull();                   // cached before the first discovery
    net.advance(1_000);
    const yManifest = `home/rag/v1/${(b as any)._dbId('y')}/manifest`;
    const realGet = tabB.fs.get;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (path === yManifest) throw Object.assign(new Error('network error'), { retryable: true });
      return realGet(path, opts);
    };
    expect((await b.listDatabases()).map((d) => d.databaseName).sort()).toEqual(['x', 'y']);
  }, 30_000);
});
