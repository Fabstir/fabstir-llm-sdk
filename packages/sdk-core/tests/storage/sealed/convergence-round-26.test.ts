// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 26 — plan §39 TT1–TT6: absence decided by a fresh sealed read for the legacy manifest too; a
 * migration commits only beside the sealed side it started from (two devices moving one database); a database that
 * moved stays listed; sparse vectors refused; a complete discovery drops what it did not find; SS2's pins.
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
const CHUNK = `${legacyDir('db')}/chunk-0.json`;
const BODY = `${legacyDir('db')}/documents/d1.txt`;
const store = (tab: FakeS5Tab, coherence: RagCoherence, extra: Record<string, unknown> = {}) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence, ...extra } as any);
/** A device of its own: its own heads and locks (an origin of its own). */
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

/** Run `before` the first time this tab reads `path` (its read then sees what `before` did). */
function hookRead(tab: FakeS5Tab, path: string, before: () => Promise<unknown>) {
  const realGet = tab.fs.get;
  let armed = true;
  tab.fs.get = async (p: string, opts?: any) => {
    if (armed && p === path) { armed = false; await before(); }
    return realGet(p, opts);
  };
}

const intact = async (net: FakeS5Network) => {
  const fresh = device(net);
  return { vectors: (await fresh.listVectors('db')).map((v) => v.id).sort(), body: await fresh.getDocumentBody('db', 'd1').catch((e: any) => e.code) };
};

describe('TT1 — a legacy manifest found absent after an absent sealed read: the sealed side read again', () => {
  test('same origin: getDatabase and listVectors straddling another tab\'s migration find the database', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const b = store(tabB, origin());
    hookRead(tabB, MANIFEST, () => store(net.tab(), origin()).migrateLegacyStorage());
    expect(await b.getDatabase('db')).not.toBeNull();
    expect((await b.listVectors('db')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('another device: a discovery straddling its migration lists the database in "all"', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookRead(tabB, MANIFEST, () => device(net).migrateLegacyStorage());
    expect((await b.listAllDatabases()).map((d) => d.databaseName)).toEqual(['db']);
  });

  test('another device: createDatabase straddling its migration refuses EXISTS — the migrated copy stays', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookRead(tabB, MANIFEST, () => device(net).migrateLegacyStorage());
    expect((await caught(b.createDatabase({ name: 'db', owner: ADDR }))).code).toBe('RAG_DATABASE_EXISTS');
    expect(await intact(net)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });
});

describe('TT2 — two devices moving one legacy database: never a sealed copy without what the other purged', () => {
  test('another device migrates inside this run\'s chunk read: RAG_DATABASE_MOVED, retryable — the data intact', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookRead(tabB, CHUNK, () => device(net).migrateLegacyStorage());
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code, d.retryable])).toEqual([['failed', 'RAG_DATABASE_MOVED', true]]);
    expect(await intact(net)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('… inside an upgrade on write: the write throws RAG_DATABASE_MOVED — the data intact', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    hookRead(tabB, CHUNK, () => device(net).migrateLegacyStorage());
    expect(await caught(b.addVectors('db', [{ id: 'n', vector: [7, 8, 9], metadata: {} }]))).toMatchObject({ code: 'RAG_DATABASE_MOVED', details: { retryable: true } });
    expect(await intact(net)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });

  test('… inside this run\'s body read: the same', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    let armed = true;
    const b = store(tabB, browserOrigin({ now: () => net.now })(), {
      pathToHash: async (path: string, o?: any) => {
        if (armed && path === BODY) { armed = false; await device(net).migrateLegacyStorage(); }
        return tabB.pathToHash(path, o);
      },
    });
    expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
    expect(await intact(net)).toEqual({ vectors: ['v1', 'v2'], body: 'private notes' });
  });
});

describe('TT3 — a database that moved stays listed', () => {
  test('another device migrated it under a read: after RAG_DATABASE_MOVED, "all" still lists it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const b = device(net);
    await b.createDatabase({ name: 'other', owner: ADDR });
    expect((await b.listAllDatabases()).map((d) => d.databaseName).sort()).toEqual(['db', 'other']);
    await device(net).migrateLegacyStorage();                                      // another device: moved, purged
    expect((await caught(b.listVectors('db'))).code).toBe('RAG_DATABASE_MOVED');
    expect((await b.listAllDatabases()).map((d) => d.databaseName).sort()).toEqual(['db', 'other']);
  });
});

describe('TT4 — sparse vectors are refused', () => {
  for (const [label, value] of [['a list with holes', new Array(2)], ['a hole before a vector', [, { id: 'v', vector: [1, 2, 3], metadata: {} }]], ['a vector with a hole', [{ id: 'v', vector: [1, , 3], metadata: {} }]]] as const) {
    test(`${label}: RAG_VECTORS_INVALID, nothing written`, async () => {
      const net = new FakeS5Network();
      await seedLegacy(net);
      const s = device(net);
      const writes = net.writes.length;
      expect((await caught(s.addVectors('db', value as any))).code).toBe('RAG_VECTORS_INVALID');
      expect(net.writes.length).toBe(writes);
    });
  }
});

describe('TT5 — a complete discovery drops what it did not find', () => {
  test('a database cached before it, deleted by another device: no longer listed', async () => {
    const net = new FakeS5Network();
    const other = device(net);
    await other.createDatabase({ name: 'x', owner: ADDR });
    net.advance(60_000);
    const b = device(net);
    expect(await b.getDatabase('x')).not.toBeNull();
    await other.deleteDatabase('x');
    net.advance(25_000);
    await b.initialize();                                                           // complete: x not found
    net.advance(30_000);
    expect({ listed: (await b.listAllDatabases()).map((d) => d.databaseName), got: await b.getDatabase('x') }).toEqual({ listed: [], got: null });
  });
});

describe('TT6 — SS2\'s pins', () => {
  test('a legacy database another tab deletes under a read: RAG_DATABASE_MOVED, then NOT_FOUND — never empty', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net);
    const tabB = net.tab();
    const b = store(tabB, origin());
    hookRead(tabB, CHUNK, () => store(net.tab(), origin()).deleteDatabase('db'));
    expect((await caught(b.listVectors('db'))).code).toBe('RAG_DATABASE_MOVED');
    expect((await caught(b.listVectors('db'))).code).toBe('RAG_DATABASE_NOT_FOUND');
  });

  test('a legacy chunk found missing while the sealed check fails: that failure, retryable — never "lost"', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net);
    const tabB = net.tab();
    const b = device(net, tabB);
    expect(await b.getDatabase('db')).not.toBeNull();
    await net.tab().fs.delete(CHUNK);
    const realGet = tabB.fs.get;
    tabB.fs.get = async (path: string, opts?: any) => {
      if (/^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/.test(path)) throw Object.assign(new Error('network error'), { retryable: true });
      return realGet(path, opts);
    };
    expect(await caught(b.listVectors('db'))).toMatchObject({ details: { retryable: true } });
  });

  test('an empty addVectors still writes (as on 1.38.9)', async () => {
    const net = new FakeS5Network();
    const s = device(net);
    await s.createDatabase({ name: 'db', owner: ADDR });
    const writes = net.writes.length;
    expect(await s.addVectors('db', [])).toBe(0);
    expect(net.writes.length).toBeGreaterThan(writes);
  });
});

test('TT5 — what a read cached during a discovery (after it began) stays, though the discovery never saw it', async () => {
  const net = new FakeS5Network();
  const other = device(net);
  await other.createDatabase({ name: 'y', owner: ADDR });             // the sealed root exists: its listing succeeds
  const tabB = net.tab();
  const b = device(net, tabB);
  const realList = tabB.fs.list;
  let armed = true;
  tabB.fs.list = (dir: string, opts?: any) => (async function* () {
    const entries: any[] = [];
    for await (const e of realList(dir, opts)) entries.push(e);
    if (armed && dir === 'home/rag/v1') {                             // the discovery's sealed listing, without x
      armed = false;
      await other.createDatabase({ name: 'x', owner: ADDR });           // another device creates x …
      expect(await b.getDatabase('x')).not.toBeNull();                  // … and this tab reads it meanwhile
    }
    yield* entries;
  })();
  await b.initialize();
  expect((await b.listAllDatabases()).map((d) => d.databaseName).sort()).toEqual(['x', 'y']);
});

test('TT3 — the sealed copy `_moved` caches is as old as its read\'s start', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  const tabB = net.tab();
  const b = device(net, tabB);
  expect(await b.getDatabase('db')).not.toBeNull();                   // B holds the legacy copy
  const x = device(net);
  await x.migrateLegacyStorage();                                       // another device moved it (r), purged
  const realGet = tabB.fs.get;
  let armed = true;
  tabB.fs.get = async (path: string, opts?: any) => {
    const value = await realGet(path, opts);
    if (armed && /^home\/rag\/v1\/[0-9a-f]{32}\/manifest$/.test(path)) {
      armed = false;                                                    // _moved's read of r returns, then …
      await x.removeDocument('db', 'd1');                               // … r+1 removes d1
      net.advance(20_000);
    }
    return value;
  };
  expect((await caught(b.listVectors('db'))).code).toBe('RAG_DATABASE_MOVED');
  net.advance(15_000);
  expect(await b.getDocumentBody('db', 'd1').catch((e: any) => e.code)).toBe('RAG_DOCUMENT_NOT_FOUND');
});

test('TT2 — two devices adopting one late document: neither commits over the other without its body', async () => {
  const net = new FakeS5Network();
  await seedLegacy(net);
  expect((await device(net).migrateLegacyStorage()).databases.map((d: any) => d.status)).toEqual(['migrated']);
  const old = net.tab();                                                // an outdated tab writes after the migration
  await old.fs.put(`${legacyDir('db')}/documents/late.txt`, 'late body');
  await old.fs.put(MANIFEST, {
    name: 'db', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 2,
    chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'd1' }, { id: 'late' }],
  });
  const tabB = net.tab();
  let armed = true;
  const b = store(tabB, browserOrigin({ now: () => net.now })(), {
    pathToHash: async (path: string, o?: any) => {
      if (armed && path === `${legacyDir('db')}/documents/late.txt`) { armed = false; await device(net).migrateLegacyStorage(); }
      return tabB.pathToHash(path, o);
    },
  });
  expect((await b.migrateLegacyStorage()).databases.map((d: any) => [d.status, d.code])).toEqual([['failed', 'RAG_DATABASE_MOVED']]);
  expect(await device(net).getDocumentBody('db', 'late')).toBe('late body');
});
