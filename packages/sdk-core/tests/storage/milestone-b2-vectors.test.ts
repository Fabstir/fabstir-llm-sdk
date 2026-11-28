// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Milestone B2 (1.39.24) — vectors.
 *
 * D42: only chunks whose ids changed are re-sealed and written; a no-op writes no chunk; an emptied chunk is dropped and
 * swept; chunk numbers never shift (the seal context names the chunk number).
 * D44: a database whose sealed manifest never opens is listed as unreadable and deletable by id; untrusted heads are
 * pruned at discovery, tombstones that recorded an incarnation never.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { FakeLockManager } from '../helpers/fake-locks';
import { SEED, ADDR, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { S5VectorStore } from '../../src/storage/S5VectorStore';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { ragHeadScopeOf } from '../../src/storage/sealed/rag-layout';
import {
  createRagCoherence, __resetInProcessCoherenceForTests, HEAD_TRUST_MS, type RagCoherence,
} from '../../src/storage/sealed/rag-coherence';
import { SDK_CAPABILITIES as CAPABILITIES } from '../../src/capabilities';

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const DB = 'b2-notes';
const dbIdOf = (name: string) => sealer().deriveId('db', name);
const dirOf = (name: string) => `home/rag/v1/${dbIdOf(name)}`;

const vec = (id: string, extra: Record<string, any> = {}) => ({ id, vector: [0.1, 0.2, 0.3], metadata: { documentId: 'doc', ...extra } });

function store(tab: FakeS5Tab, opts: { coherence?: RagCoherence; chunkSize?: number } = {}) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, chunkSize: 2, ...opts } as any);
}

function manifestOf(net: FakeS5Network, name: string): any {
  const e: any = net.dirs.get(dirOf(name))!.get('manifest');
  return sealer().open(net.blobs.get(e.hash)!, `rag/v1/${dbIdOf(name)}/manifest`).value;
}

/** The ids sealed in chunk `n`, read by the hash the manifest records. */
function chunkIds(net: FakeS5Network, name: string, n: number): string[] {
  const m = manifestOf(net, name);
  const entry = m.chunks.find((c: any) => c.chunkId === n);
  const bytes = net.blobs.get(entry.cid)!;
  return (sealer().open(bytes, `rag/v1/${dbIdOf(name)}/${m.incarnation}/chunk/${n}`).value as any).vectors.map((v: any) => v.id);
}

/** Chunk files written since `from` (an index into net.writes), by name. */
const chunkWrites = (net: FakeS5Network, from: number) =>
  net.writes.slice(from).map((w) => w.path).filter((p) => /\/chunk-\d+$/.test(p)).map((p) => p.split('/').pop());

const chunkFiles = (net: FakeS5Network, name: string) =>
  [...(net.dirs.get(dirOf(name)) ?? new Map()).keys()].filter((n) => /^chunk-\d+$/.test(n)).sort();

/** a,b | c,d | e — three chunks of two. */
async function seeded(net: FakeS5Network, s = store(net.tab())) {
  await s.createDatabase({ name: DB, owner: ADDR });
  await s.addVectors(DB, ['a', 'b', 'c', 'd', 'e'].map((id) => vec(id)));
  return s;
}

describe('D42 — only changed chunks are rewritten', () => {
  test('the first write of a database writes every chunk; ids are laid out in order', async () => {
    const net = new FakeS5Network();
    await seeded(net);
    const m = manifestOf(net, DB);
    expect(m.chunks.map((c: any) => c.chunkId)).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((n) => chunkIds(net, DB, n))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  test('a metadata update re-seals and writes only the chunk that holds the vector', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const before = manifestOf(net, DB).chunks;
    const seal = vi.spyOn((s as any).sealer, 'seal');
    const mark = net.writes.length;
    await s.updateMetadata(DB, 'c', { tag: 'x' });
    expect(chunkWrites(net, mark)).toEqual(['chunk-1']);
    const chunkSeals = seal.mock.calls.map(([, ctx]) => ctx as string).filter((ctx) => ctx.includes('/chunk/'));
    expect(chunkSeals).toHaveLength(1);
    expect(chunkSeals[0]).toMatch(/\/chunk\/1$/);
    const after = manifestOf(net, DB).chunks;
    expect(after[0]).toEqual(before[0]);
    expect(after[2]).toEqual(before[2]);
    expect(after[1].cid).not.toBe(before[1].cid);
  });

  test('every mutator that changes one vector rewrites only its chunk', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const cases: Array<[() => Promise<unknown>, string[]]> = [
      [() => s.moveToFolder(DB, 'a', '/f1'), ['chunk-0']],
      [() => s.renameFolder(DB, '/f1', '/f2'), ['chunk-0']],
      [() => s.moveFolderContents(DB, '/f2', '/f3'), ['chunk-0']],
      [() => s.addVectors(DB, [vec('d', { v: 2 })]), ['chunk-1']],
      [() => s.deleteByMetadata(DB, { v: 2 }), ['chunk-1']],
      [() => s.deleteFolder(DB, '/f3'), ['chunk-0']],
    ];
    for (const [run, expected] of cases) {
      const mark = net.writes.length;
      await run();
      expect(chunkWrites(net, mark)).toEqual(expected);
    }
    const fresh = store(net.tab());
    expect((await fresh.listVectors(DB)).map((v) => v.id)).toEqual(['b', 'c', 'e']);
  });

  test('a vector the caller changed in place and adds again is written (an object the store returned)', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const v = (await s.getVector(DB, 'e'))!;
    v.metadata.edited = true; // the caller edits the object it was given
    const mark = net.writes.length;
    await s.addVectors(DB, [v]);
    expect(chunkWrites(net, mark)).toEqual(['chunk-2']);
    expect((await store(net.tab()).getVector(DB, 'e'))!.metadata.edited).toBe(true);
  });

  test('a no-op mutation writes no chunk', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const before = manifestOf(net, DB).chunks;
    const mark = net.writes.length;
    await s.deleteVector(DB, 'missing');
    await s.deleteVectors(DB, ['missing-1', 'missing-2']);
    expect(await s.deleteByMetadata(DB, { documentId: 'other' })).toBe(0);
    expect(await s.renameFolder(DB, '/none', '/other')).toBe(0);
    await s.addVectors(DB, []);
    expect(chunkWrites(net, mark)).toEqual([]);
    expect(manifestOf(net, DB).chunks).toEqual(before);
  });

  test('deleting from chunk 0 leaves chunk 1 — its manifest entry and its file — untouched', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const before = manifestOf(net, DB).chunks;
    const fileBefore = { ...(net.dirs.get(dirOf(DB))!.get('chunk-1') as any) };
    const mark = net.writes.length;
    await s.deleteVector(DB, 'a');
    expect(chunkWrites(net, mark)).toEqual(['chunk-0']);
    const after = manifestOf(net, DB);
    expect(after.chunks[1]).toEqual(before[1]);
    expect(after.chunks[2]).toEqual(before[2]);
    expect(after.chunks[0]).toMatchObject({ chunkId: 0, vectorCount: 1 });
    expect(net.dirs.get(dirOf(DB))!.get('chunk-1')).toEqual(fileBefore);
    expect(chunkIds(net, DB, 0)).toEqual(['b']);
    expect(chunkIds(net, DB, 1)).toEqual(['c', 'd']); // never shifted
    expect(after.vectorCount).toBe(4);
  });

  test('an emptied chunk is dropped from the manifest and its file swept; later chunks keep their number', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    const before = manifestOf(net, DB).chunks;
    const mark = net.writes.length;
    await s.deleteVectors(DB, ['c', 'd']);
    expect(chunkWrites(net, mark)).toEqual([]);
    const after = manifestOf(net, DB);
    expect(after.chunks.map((c: any) => c.chunkId)).toEqual([0, 2]);
    expect(after.chunkCount).toBe(2);
    expect(after.chunks[1]).toEqual(before[2]);
    expect(chunkFiles(net, DB)).toEqual(['chunk-0', 'chunk-2']);
    expect((await store(net.tab()).listVectors(DB)).map((v) => v.id)).toEqual(['a', 'b', 'e']);
  });

  test('the sweep removes any chunk file the manifest does not name', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    await net.tab().fs.put(`${dirOf(DB)}/chunk-7`, new Uint8Array([1, 2, 3])); // a leftover past the count…
    await s.deleteVectors(DB, ['c', 'd']); // …and chunk-1, emptied
    await s.updateMetadata(DB, 'e', { t: 1 });
    expect(chunkFiles(net, DB)).toEqual(['chunk-0', 'chunk-2']);
  });

  test('new ids fill the last chunk, then go into new chunks; earlier chunks are not written', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    await s.deleteVector(DB, 'a'); // a hole in chunk 0 is not refilled
    const mark = net.writes.length;
    await s.addVectors(DB, [vec('f'), vec('g'), vec('h')]);
    expect(chunkWrites(net, mark).sort()).toEqual(['chunk-2', 'chunk-3']);
    expect(manifestOf(net, DB).chunks.map((c: any) => c.chunkId)).toEqual([0, 1, 2, 3]);
    expect(chunkIds(net, DB, 0)).toEqual(['b']);
    expect(chunkIds(net, DB, 2)).toEqual(['e', 'f']);
    expect(chunkIds(net, DB, 3)).toEqual(['g', 'h']);
  });

  test('a new chunk after a dropped last chunk is numbered past every chunk still listed', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    await s.deleteVector(DB, 'e'); // chunk 2 emptied and dropped
    expect(manifestOf(net, DB).chunks.map((c: any) => c.chunkId)).toEqual([0, 1]);
    await s.addVectors(DB, [vec('f')]);
    expect(manifestOf(net, DB).chunks.map((c: any) => c.chunkId)).toEqual([0, 1, 2]);
    expect(chunkIds(net, DB, 2)).toEqual(['f']);
  });

  test('reads after incremental commits return the right vectors — this tab, a fresh tab, and with the cache off', async () => {
    const net = new FakeS5Network();
    const s = await seeded(net);
    await s.deleteVector(DB, 'b');
    await s.updateMetadata(DB, 'd', { note: 'changed' });
    await s.addVectors(DB, [vec('f'), vec('g')]);
    await s.deleteVectors(DB, ['e']);
    const expected = ['a', 'c', 'd', 'f', 'g'];
    expect((await s.listVectors(DB)).map((v) => v.id)).toEqual(expected);
    const fresh = store(net.tab());
    expect((await fresh.listVectors(DB)).map((v) => v.id)).toEqual(expected);
    expect((await fresh.getVector(DB, 'd'))!.metadata.note).toBe('changed');
    const uncached = new S5VectorStore({ s5Client: net.tab() as any, userAddress: ADDR, encryptionManager: em(), pathToHash: net.tab().pathToHash, chunkSize: 2, cacheEnabled: false } as any);
    expect((await uncached.listVectors(DB)).map((v) => v.id)).toEqual(expected);
    expect((await fresh.getStats(DB)).vectorCount).toBe(5);
    // A mutation through a store whose cache is off keeps the layout too.
    const mark = net.writes.length;
    await uncached.updateMetadata(DB, 'g', { x: 1 });
    expect(chunkWrites(net, mark)).toEqual(['chunk-3']);
  });

  test('another tab\'s incremental commit is seen by a tab holding a cached vector map', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    const one = await seeded(net, store(net.tab(), { coherence }));
    const two = store(net.tab(), { coherence });
    expect((await two.listVectors(DB)).map((v) => v.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    await one.updateMetadata(DB, 'c', { seen: true });
    expect((await two.getVector(DB, 'c'))!.metadata.seen).toBe(true);
  });
});

/** The manifest of `name` replaced by bytes that never open (another key's seal), or by plaintext. */
async function breakManifest(net: FakeS5Network, name: string, how: 'sealed' | 'plain') {
  const path = `${dirOf(name)}/manifest`;
  const bytes = sealer().seal({ kind: 'cbor', value: { name } }, 'another/context');
  await net.tab().fs.put(path, how === 'sealed' ? bytes : { name });
}

describe('D44 — unreadable databases', () => {
  test('listUnreadableDatabases names a database whose manifest never opens, with its code; listings leave it out', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'good', owner: ADDR });
    await s.createDatabase({ name: 'sealed-bad', owner: ADDR });
    await s.createDatabase({ name: 'plain-bad', owner: ADDR });
    await breakManifest(net, 'sealed-bad', 'sealed');
    await breakManifest(net, 'plain-bad', 'plain');
    // This identity's heads name them (any age): the evidence they are its own (1.39.24 review)
    const fresh = store(net.tab());
    expect((await fresh.listDatabases()).map((d) => d.databaseName)).toEqual(['good']);
    expect(await fresh.listAllDatabases()).toHaveLength(1); // a permanent failure is not an incomplete discovery
    const unreadable = fresh.listUnreadableDatabases();
    expect(unreadable).toEqual(expect.arrayContaining([
      { dbId: dbIdOf('sealed-bad'), code: 'SEALED_OPEN_FAILED' },
      { dbId: dbIdOf('plain-bad'), code: 'RAG_MANIFEST_CORRUPT' },
    ]));
    expect(unreadable).toHaveLength(2);
  });

  test('another identity\'s database on the same seed is not offered, and deleteDatabaseById refuses it', async () => {
    const OTHER = '0x' + 'd'.repeat(40);
    const net = new FakeS5Network();
    const theirs = new S5VectorStore({ s5Client: net.tab() as any, userAddress: OTHER, encryptionManager: EncryptionManager.fromSeed(SEED, OTHER), pathToHash: net.tab().pathToHash, chunkSize: 2 } as any);
    await theirs.createDatabase({ name: 'theirs', owner: OTHER });
    const theirId = EncryptionManager.fromSeed(SEED, OTHER).getStorageSealer().deriveId('db', 'theirs');
    // Theirs breaks too; this identity can open neither its manifest nor its owner marker
    await net.tab().fs.put(`home/rag/v1/${theirId}/manifest`, EncryptionManager.fromSeed(SEED, OTHER).getStorageSealer().seal({ kind: 'cbor', value: {} }, 'another/context'));
    __resetInProcessCoherenceForTests();
    const mine = store(net.tab());
    await mine.listDatabases();
    expect(mine.listUnreadableDatabases()).toEqual([]);
    await expect(mine.deleteDatabaseById(theirId)).rejects.toMatchObject({ code: 'RAG_DATABASE_NOT_OWNED' });
  });

  test('a device that never used this identity\'s database still offers it once it breaks: its sealed owner marker shows whose it is (round 2)', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'mine', owner: ADDR });
    await breakManifest(net, 'mine', 'sealed');
    __resetInProcessCoherenceForTests();   // another device: no head names it
    const fresh = store(net.tab());
    await fresh.listDatabases();
    expect(fresh.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('mine'), code: 'SEALED_OPEN_FAILED' }]);
    await fresh.deleteDatabaseById(dbIdOf('mine'));
    expect(net.dirs.has(dirOf('mine'))).toBe(false);
  });

  test('a re-create after another tab deleted the database writes its owner marker again (round 3)', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'x', owner: ADDR });
    await store(net.tab()).deleteDatabase('x');
    await a.createDatabase({ name: 'x', owner: ADDR });   // no invalidateCaches: a still holds its earlier marking
    expect(net.dirs.get(dirOf('x'))?.has('owner')).toBe(true);
  });

  test('a delete interrupted at the manifest keeps the owner marker: the retry, on any device, finishes it (round 3)', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'y', owner: ADDR });
    await breakManifest(net, 'y', 'sealed');
    __resetInProcessCoherenceForTests();
    const tab = net.tab();
    const del = tab.fs.delete.bind(tab.fs);
    let fail = true;
    (tab.fs as any).delete = async (p: string) => { if (fail && p.endsWith('/manifest')) { fail = false; throw new Error('network'); } return del(p); };
    const d1 = store(tab);
    await d1.listDatabases();
    await expect(d1.deleteDatabaseById(dbIdOf('y'))).rejects.toBeDefined();
    expect(net.dirs.get(dirOf('y'))?.has('owner')).toBe(true);
    __resetInProcessCoherenceForTests();
    const d2 = store(net.tab());
    await d2.listDatabases();
    expect(d2.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('y'), code: 'SEALED_OPEN_FAILED' }]);
    await d2.deleteDatabaseById(dbIdOf('y'));
    expect(net.dirs.has(dirOf('y'))).toBe(false);
  });

  test('a marker read that fails for a moment is not "not yours": the delete says retry, the discovery is incomplete (round 3)', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'z', owner: ADDR });
    await breakManifest(net, 'z', 'sealed');
    __resetInProcessCoherenceForTests();
    const tab = net.tab();
    const get = tab.fs.get.bind(tab.fs);
    let down = true;
    (tab.fs as any).get = async (p: string, o?: any) => { if (down && p.endsWith('/owner')) throw new Error('network down'); return get(p, o); };
    const s = store(tab);
    await s.listDatabases();
    expect(s.listUnreadableDatabases()).toEqual([]);
    const err: any = await s.deleteDatabaseById(dbIdOf('z')).catch((e) => e);
    expect(err?.code).not.toBe('RAG_DATABASE_NOT_OWNED');
    down = false;
    await s.listDatabases();   // the incomplete discovery is not cached: this one looks again
    expect(s.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('z'), code: 'SEALED_OPEN_FAILED' }]);
  });

  test('the owner marker is sealed, names nothing, and is written once per database per instance', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'm', owner: ADDR });
    await s.addVectors('m', [vec('a')]);
    await s.addVectors('m', [vec('b')]);
    const marks = net.writes.filter((w) => w.path === `${dirOf('m')}/owner`);
    expect(marks).toHaveLength(1);
    expect(sealer().isSealed(marks[0].bytes)).toBe(true);
    expect(() => sealer().open(marks[0].bytes, `rag/v1/${dbIdOf('m')}/owner`)).not.toThrow();
  });

  test('a database known through a head that then fails to open is listed as unreadable by the reconcile too', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'good', owner: ADDR });
    await s.listDatabases();
    await s.createDatabase({ name: 'late', owner: ADDR }); // another tab's commit leaves a head …
    await breakManifest(net, 'late', 'sealed'); // … and its manifest is then unreadable
    s.invalidateCaches();
    await s.listDatabases();
    expect(s.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('late'), code: 'SEALED_OPEN_FAILED' }]);
  });

  test('deleteDatabaseById removes an unreadable database: its tree, a sentinel tombstone, and the list entry', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: 'bad', owner: ADDR });
    await s.addVectors('bad', [vec('a'), vec('b'), vec('c')]);
    await breakManifest(net, 'bad', 'sealed');
    s.invalidateCaches();
    await s.listDatabases();
    const id = dbIdOf('bad');
    expect(s.listUnreadableDatabases()).toEqual([{ dbId: id, code: 'SEALED_OPEN_FAILED' }]);
    await s.deleteDatabaseById(id);
    expect(net.filePaths().filter((p) => p.startsWith(dirOf('bad')))).toEqual([]);
    expect(s.listUnreadableDatabases()).toEqual([]);
    const head = await coherence.scoped(ragHeadScopeOf(sealer())).getHead(id);
    expect(head).toMatchObject({ deleted: true, incarnation: 'legacy' });
    s.invalidateCaches();
    await s.listDatabases();
    expect(s.listUnreadableDatabases()).toEqual([]);
  });

  test('deleteDatabaseById deletes a readable database too, and forgets it', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [vec('a')]);
    const incarnation = manifestOf(net, DB).incarnation;
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual([DB]);
    await s.deleteDatabaseById(dbIdOf(DB));
    expect(await s.listDatabases()).toEqual([]);
    expect(net.filePaths().filter((p) => p.startsWith(dirOf(DB)))).toEqual([]);
    expect(await coherence.scoped(ragHeadScopeOf(sealer())).getHead(dbIdOf(DB))).toMatchObject({ deleted: true, incarnation });
  });

  test('deleteDatabaseById refuses an id that is not one, and a database that is not there', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await expect(s.deleteDatabaseById('../escape')).rejects.toMatchObject({ code: 'RAG_DATABASE_ID_INVALID' });
    await expect(s.deleteDatabaseById(DB)).rejects.toMatchObject({ code: 'RAG_DATABASE_ID_INVALID' });
    await expect(s.deleteDatabaseById('0'.repeat(32))).rejects.toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
  });

  test('VectorRAGManager exposes listUnreadableDatabases and deleteDatabaseById', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const rag = new VectorRAGManager({
      userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
      s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
    } as any);
    await rag.createSession('bad');
    await breakManifest(net, 'bad', 'sealed');
    await rag.refreshDatabases();
    expect(rag.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('bad'), code: 'SEALED_OPEN_FAILED' }]);
    await rag.deleteDatabaseById(dbIdOf('bad'));
    expect(rag.listUnreadableDatabases()).toEqual([]);
    expect(net.filePaths().filter((p) => p.startsWith(dirOf('bad')))).toEqual([]);
  });

  test('capability flags', () => {
    expect((CAPABILITIES as any).incrementalRagChunks).toBe(true);
    expect((CAPABILITIES as any).unreadableDatabaseCleanup).toBe(true);
  });
});

describe('D44 — head GC', () => {
  const clocked = (kind: 'in-process' | 'browser') => {
    const clock = { t: 1_000_000 };
    const opts = { now: () => clock.t };
    const c = kind === 'browser'
      ? createRagCoherence({ isBrowser: true, locks: new FakeLockManager() as any, indexedDB: new IDBFactory() as any, ...opts })
      : createRagCoherence({ isBrowser: false, ...opts });
    return { c, clock };
  };

  for (const kind of ['in-process', 'browser'] as const) {
    test(`${kind}: pruneHeads removes untrusted heads and keeps fresh heads and incarnation tombstones`, async () => {
      const { c, clock } = clocked(kind);
      const rag = c.scoped('scope-a');
      await rag.putHead('old-hash', { revision: 1, manifestHash: 'aa', incarnation: 'i1' });
      await rag.putHead('old-plain-tombstone', { revision: 2, deleted: true });
      await rag.putHead('old-tombstone', { revision: 3, deleted: true, incarnation: 'i2' });
      await rag.putHead('old-legacy-tombstone', { revision: 4, deleted: true, incarnation: 'legacy' });
      clock.t += HEAD_TRUST_MS + 1;
      await rag.putHead('fresh-hash', { revision: 5, manifestHash: 'bb', incarnation: 'i3' });
      await rag.pruneHeads();
      const left = async (key: string) => (await rag.getHeadAnyAge(key)) !== undefined;
      expect(await left('old-hash')).toBe(false);
      expect(await left('old-plain-tombstone')).toBe(false);
      expect(await left('old-tombstone')).toBe(true);
      expect(await left('old-legacy-tombstone')).toBe(true);
      expect(await left('fresh-hash')).toBe(true);
    });

    test(`${kind}: pruneHeads touches only its own scope; root keys (log heads, read at any age) are left`, async () => {
      const { c, clock } = clocked(kind);
      await c.putHead('log-head', { revision: 1, manifestHash: 'aa' });
      await c.scoped('scope-b').putHead('db', { revision: 1, manifestHash: 'aa' });
      await c.scoped('scope-a').scoped('inner').putHead('db', { revision: 1, manifestHash: 'aa' });
      clock.t += HEAD_TRUST_MS + 1;
      await c.scoped('scope-a').pruneHeads();
      expect(await c.getHeadAnyAge('log-head')).toBeDefined();
      expect(await c.scoped('scope-b').getHeadAnyAge('db')).toBeDefined();
      expect(await c.scoped('scope-a').scoped('inner').getHeadAnyAge('db')).toBeDefined();
      await expect(c.pruneHeads()).rejects.toMatchObject({ code: 'RAG_HEAD_SCOPE_REQUIRED' });
      expect(await c.getHeadAnyAge('log-head')).toBeDefined();
    });

    test(`${kind}: deleteHead removes one head of its scope`, async () => {
      const { c } = clocked(kind);
      const rag = c.scoped('scope-a');
      await rag.putHead('x', { revision: 1, manifestHash: 'aa' });
      await rag.putHead('y', { revision: 1, manifestHash: 'aa' });
      await c.putHead('x', { revision: 9, manifestHash: 'cc' });
      await rag.deleteHead('x');
      expect(await rag.getHeadAnyAge('x')).toBeUndefined();
      expect(await rag.getHeadAnyAge('y')).toBeDefined();
      expect(await c.getHeadAnyAge('x')).toBeDefined(); // the root key of the same name is another head
    });
  }

  test('discovery prunes this identity\'s untrusted heads of databases it did not open, and keeps its incarnation tombstones', async () => {
    const net = new FakeS5Network();
    const clock = { t: 5_000_000 };
    const coherence = createRagCoherence({ isBrowser: false, now: () => clock.t });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: 'kept', owner: ADDR });
    await s.createDatabase({ name: 'gone', owner: ADDR });
    await s.deleteDatabase('gone');
    const heads = coherence.scoped(ragHeadScopeOf(sealer()));
    await heads.putHead('f'.repeat(32), { revision: 1, deleted: true }); // an earlier build's tombstone, no incarnation
    clock.t += HEAD_TRUST_MS + 1;
    await s.listDatabases(); // a discovery past the trust window
    expect(await heads.getHeadAnyAge(dbIdOf('kept'))).toBeDefined();   // opened: kept (1.39.24 review round 2)
    expect(await heads.getHeadAnyAge('f'.repeat(32))).toBeUndefined();
    expect(await heads.getHeadAnyAge(dbIdOf('gone'))).toMatchObject({ deleted: true, incarnation: expect.any(String) });
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual(['kept']);
  });
  test('a database that was readable when its head was pruned, and breaks later, is still offered (round 2)', async () => {
    const net = new FakeS5Network();
    const clock = { t: 9_000_000 };
    const coherence = createRagCoherence({ isBrowser: false, now: () => clock.t });
    await store(net.tab(), { coherence }).createDatabase({ name: 'later-broken', owner: ADDR });
    clock.t += HEAD_TRUST_MS + 1;
    await store(net.tab(), { coherence }).listDatabases();   // prunes past the window while it still opens
    await breakManifest(net, 'later-broken', 'sealed');
    const again = store(net.tab(), { coherence });
    await again.listDatabases();
    expect(again.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('later-broken'), code: 'SEALED_OPEN_FAILED' }]);
    await expect(again.deleteDatabaseById(dbIdOf('later-broken'))).resolves.not.toThrow();
  });

  test('discovery keeps the heads of the databases it opened', async () => {
    const net = new FakeS5Network();
    const clock = { t: 11_000_000 };
    const coherence = createRagCoherence({ isBrowser: false, now: () => clock.t });
    await store(net.tab(), { coherence }).createDatabase({ name: 'live', owner: ADDR });
    clock.t += HEAD_TRUST_MS + 1;
    await store(net.tab(), { coherence }).listDatabases();
    expect(await coherence.scoped(ragHeadScopeOf(sealer())).getHeadAnyAge(dbIdOf('live'))).toBeDefined();
  });

  test('an unreadable database\'s head survives the prune past the trust window, so it is still offered and deletable (1.39.24 review)', async () => {
    const net = new FakeS5Network();
    const clock = { t: 7_000_000 };
    const coherence = createRagCoherence({ isBrowser: false, now: () => clock.t });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: 'broken', owner: ADDR });
    await breakManifest(net, 'broken', 'sealed');
    clock.t += HEAD_TRUST_MS + 1;
    const later = store(net.tab(), { coherence });
    await later.listDatabases();                       // discovery past the window: prunes, but keeps this head
    const again = store(net.tab(), { coherence });
    await again.listDatabases();
    expect(again.listUnreadableDatabases()).toEqual([{ dbId: dbIdOf('broken'), code: 'SEALED_OPEN_FAILED' }]);
    await expect(again.deleteDatabaseById(dbIdOf('broken'))).resolves.not.toThrow();
  });
});
