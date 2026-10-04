// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 3 — S5VectorStore on the sealed layout (plan D6-D12, D14-D15; I1-I6; review round 1 M1-M3).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { ragHeadScopeOf } from '../../../src/storage/sealed/rag-layout';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { createRagCoherence, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const DB = 'divorce-lawyer-notes';
const SECRET_TEXT = 'The custody hearing is scheduled after the mediation';
const FILE_NAME = 'custody-plan.pdf';

const dbDir = (name: string) => `home/rag/v1/${sealer().deriveId('db', name)}`;
const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;

function vec(id: string, extra: Record<string, any> = {}) {
  return { id, vector: [0.1, -0.2, 0.3, 0.4], metadata: { text: `${SECRET_TEXT} (${id})`, fileName: FILE_NAME, documentId: 'doc-1', ...extra } };
}

function store(tab: FakeS5Tab, opts: { coherence?: RagCoherence; chunkSize?: number } = {}) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), cacheEnabled: true, pathToHash: tab.pathToHash, ...opts });
}

function openManifest(net: FakeS5Network, name: string) {
  const dir = dbDir(name);
  const e: any = net.dirs.get(dir)!.get('manifest');
  return sealer().open(net.blobs.get(e.hash)!, `rag/v1/${sealer().deriveId('db', name)}/manifest`).value as any;
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('confidentiality (I1, D6)', () => {
  test('no chunk text, file name, database name or wallet address appears in any written byte or path', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: DB, owner: ADDR, description: 'notes for the divorce lawyer' });
    await s.addVectors(DB, [vec('v1'), vec('v2')]);
    await s.createFolder(DB, '/private-custody');
    expect(net.writes.length).toBeGreaterThan(0);
    const needles = [SECRET_TEXT, FILE_NAME, DB, 'divorce lawyer', ADDR, ADDR.toLowerCase(), ADDR.slice(2).toLowerCase(), 'private-custody'];
    for (const w of net.writes) {
      expect(w.path.startsWith('home/rag/v1/')).toBe(true);
      const text = Buffer.from(w.bytes).toString('latin1');
      for (const n of needles) {
        expect(w.path).not.toContain(n);
        expect(text).not.toContain(n);
      }
      expect(sealer().isSealed(w.bytes)).toBe(true);
    }
    expect(net.filePaths().every((p) => /^home\/rag\/v1\/[0-9a-f]{32}\/(manifest|chunk-\d+)$/.test(p))).toBe(true);
  });

  test('another tab with the same seed reads everything back', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: DB, owner: ADDR });
    await store(net.tab()).addVectors(DB, [vec('v1'), vec('v2')]);
    const fresh = store(net.tab());
    await fresh.initialize();
    expect((await fresh.listDatabases()).map((d) => d.databaseName)).toEqual([DB]);
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    expect((await fresh.getVector(DB, 'v1'))).toEqual(vec('v1'));
  });
});

describe('manifest as the source of truth (D7)', () => {
  test('each chunk hash in the manifest is the BLAKE3 of that chunk file, and reads go by hash', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab(), { chunkSize: 2 });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [vec('a'), vec('b'), vec('c')]);
    const m = openManifest(net, DB);
    expect(m.chunks).toHaveLength(2);
    const dir = net.dirs.get(dbDir(DB))!;
    for (const c of m.chunks) expect((dir.get(`chunk-${c.chunkId}`) as any).hash).toBe(c.cid);
    // A lost/stale directory link must not matter: point chunk-0's entry at garbage — reads still use the hash.
    dir.set('chunk-0', { type: 'file', hash: '00'.repeat(32), size: 1, mediaType: 'application/octet-stream' });
    const fresh = store(net.tab(), { chunkSize: 2 });
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['a', 'b', 'c']);
  });

  test('revision increments on every commit and the head records the manifest hash', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: DB, owner: ADDR });
    const r0 = openManifest(net, DB).revision;
    await s.addVectors(DB, [vec('a')]);
    await s.createFolder(DB, '/x');
    const m = openManifest(net, DB);
    expect(m.revision).toBe(r0 + 2);
    const head = await coherence.scoped(ragHeadScopeOf(sealer())).getHead(sealer().deriveId('db', DB));
    expect(head).toEqual({ revision: m.revision, manifestHash: (net.dirs.get(dbDir(DB))!.get('manifest') as any).hash, incarnation: m.incarnation, at: expect.any(Number) }); // stamped (§15 T2); the incarnation (§20 AA4)
  });
});

describe('legacy databases (D12, I3)', () => {
  async function legacyDb(tab: FakeS5Tab, name: string, description = 'legacy') {
    await tab.fs.put(`${legacyDir(name)}/manifest.json`, {
      name, owner: ADDR, description, vectorCount: 1, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
      chunks: [{ chunkId: 0, cid: `${legacyDir(name)}/chunk-0.json`, vectorCount: 1, sizeBytes: 0, updatedAt: 1 }],
      chunkCount: 1, folderPaths: [],
    });
    await tab.fs.put(`${legacyDir(name)}/chunk-0.json`, { chunkId: 0, vectors: [vec('old')] });
  }

  test('a legacy plaintext database is listed and readable', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'legacy-db');
    const s = store(net.tab());
    await s.initialize();
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual(['legacy-db']);
    expect((await s.listVectors('legacy-db')).map((v) => v.id)).toEqual(['old']);
  });

  test('sealed wins: a legacy manifest for a sealed name is never read in its place', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: DB, owner: ADDR, description: 'sealed' });
    await legacyDb(net.tab(), DB, 'stale legacy copy');
    const fresh = store(net.tab());
    await fresh.initialize();
    const dbs = await fresh.listDatabases();
    expect(dbs).toHaveLength(1);
    expect(dbs[0].description).toBe('sealed');
    expect((await fresh.getDatabase(DB))?.description).toBe('sealed');
    expect(await fresh.listVectors(DB)).toEqual([]);
  });

  test('createDatabase refuses a name that exists as a legacy database (a sealed copy would hide it)', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'legacy-db');
    const before = net.writes.length;
    await expect(store(net.tab()).createDatabase({ name: 'legacy-db', owner: ADDR })).rejects.toThrow('already exists');
    expect(net.writes.length).toBe(before);
  });

  test('a write to a legacy database never lands at the legacy path', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'legacy-db');
    const before = net.writes.length;
    const s = store(net.tab());
    await s.addVectors('legacy-db', [vec('new')]).catch(() => undefined);
    expect(net.writes.slice(before).every((w) => !w.path.startsWith('home/vector-databases/'))).toBe(true);
  });
});

describe('a failed read is never absence (I2, D10, X5)', () => {
  test('a transient manifest failure makes createDatabase throw instead of overwriting', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: DB, owner: ADDR, description: 'original' });
    const fresh = store(net.tab());
    net.fail('get', `${dbDir(DB)}/manifest`, 'dir404', 5);
    await expect(fresh.createDatabase({ name: DB, owner: ADDR })).rejects.toMatchObject({ details: { retryable: true } }); // one shape (§15 T7)
    await expect(fresh.databaseExists(DB)).rejects.toMatchObject({ details: { retryable: true } }); // one shape (§15 T7)
    expect(openManifest(net, DB).description).toBe('original');
  });

  test('an unreadable chunk throws RAG_CHUNK_UNREADABLE, caches nothing and writes nothing', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab(), { chunkSize: 2 });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [vec('a'), vec('b'), vec('c')]);
    const fresh = store(net.tab(), { chunkSize: 2 });
    const chunk1 = openManifest(net, DB).chunks[1].cid;
    net.fail('download', chunk1, 'network', 1);
    await expect(fresh.listVectors(DB)).rejects.toMatchObject({ code: 'RAG_CHUNK_UNREADABLE' });
    const writes = net.writes.length;
    net.fail('download', chunk1, 'network', 1);
    await expect(fresh.addVectors(DB, [vec('d')])).rejects.toMatchObject({ code: 'RAG_CHUNK_UNREADABLE' });
    expect(net.writes.length).toBe(writes);
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('delete means delete (I6, D11, D14)', () => {
  test('shrinking the chunk count deletes the orphaned chunk files', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab(), { chunkSize: 2 });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, ['a', 'b', 'c', 'd', 'e'].map((id) => vec(id)));
    expect(net.filePaths().filter((p) => p.includes('chunk-'))).toHaveLength(3);
    await s.deleteByMetadata(DB, { documentId: 'doc-1' });
    await s.addVectors(DB, [vec('z')]);
    expect(net.filePaths().filter((p) => p.includes('chunk-')).map((p) => p.split('/').pop())).toEqual(['chunk-0']);
  });

  test('deleteDatabase removes every file under the sealed and the legacy directory, and tombstones the head', async () => {
    const net = new FakeS5Network();
    const coherence = createRagCoherence({ isBrowser: false });
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [vec('a')]);
    await net.tab().fs.put(`${legacyDir(DB)}/manifest.json`, { name: DB, deleted: true });
    await net.tab().fs.put(`${legacyDir(DB)}/chunk-0.json`, { chunkId: 0, vectors: [vec('old')] });
    await net.tab().fs.put(`${legacyDir(DB)}/documents/doc-1.txt`, 'legacy body');
    await s.deleteDatabase(DB);
    expect(net.filePaths()).toEqual([]);
    expect(await coherence.scoped(ragHeadScopeOf(sealer())).getHead(sealer().deriveId('db', DB))).toMatchObject({ deleted: true });
    expect(await s.getDatabase(DB)).toBeNull();
    const fresh = store(net.tab(), { coherence });
    await fresh.initialize();
    expect(await fresh.listDatabases()).toEqual([]);
  });

  test('deleting a database that does not exist throws and creates nothing', async () => {
    const net = new FakeS5Network();
    await expect(store(net.tab()).deleteDatabase('nope')).rejects.toThrow('not found');
    expect(net.dirPaths()).toEqual(['home']);
  });
});

describe('cross-tab (D8, D9, D14 tombstone; review M1, M2)', () => {
  function browserTabs(net: FakeS5Network, shadow = false) {
    const tab = browserOrigin();
    const mk = () => store(net.tab({ registryShadow: shadow }), { coherence: tab() });
    return { a: mk(), b: mk() };
  }

  test('two tabs adding vectors inside the 30 s cache window lose nothing', async () => {
    const net = new FakeS5Network();
    const { a, b } = browserTabs(net);
    await a.createDatabase({ name: DB, owner: ADDR });
    await b.listVectors(DB);                         // b caches the directory view
    await a.addVectors(DB, [vec('fromA')]);
    await b.addVectors(DB, [vec('fromB')]);          // b's directory view is stale here
    const fresh = store(net.tab());
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['fromA', 'fromB']);
  });

  test('concurrent writers — two tabs, and several calls in one tab — lose nothing (the lock serialises them)', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 2; // real delays, so the calls genuinely interleave
    const { a, b } = browserTabs(net);
    await a.createDatabase({ name: DB, owner: ADDR });
    await Promise.all([
      a.addVectors(DB, [vec('a1')]), b.addVectors(DB, [vec('b1')]),
      a.addVectors(DB, [vec('a2')]), b.addVectors(DB, [vec('b2')]),
      a.createFolder(DB, '/x'), b.createFolder(DB, '/y'),
    ]);
    const fresh = store(net.tab());
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(await fresh.listFolders(DB)).toEqual(['/x', '/y']);
  });

  test('concurrent writers in one process (no window: the in-process lock) lose nothing', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 2;
    const s = store(net.tab());
    await s.createDatabase({ name: DB, owner: ADDR });
    await Promise.all(['p', 'q', 'r', 's'].map((id) => s.addVectors(DB, [vec(id)])));
    expect((await store(net.tab()).listVectors(DB)).map((v) => v.id).sort()).toEqual(['p', 'q', 'r', 's']);
  });

  test('…and still lose nothing with the registry shadowing that drops directory entries', async () => {
    const net = new FakeS5Network();
    const { a, b } = browserTabs(net, true);
    await b.createDatabase({ name: DB, owner: ADDR });
    net.advance(1000);
    await a.addVectors(DB, [vec('fromA')]);
    net.advance(1000);
    await b.addVectors(DB, [vec('fromB')]);
    net.advance(1000);
    await a.createFolder(DB, '/f');
    const fresh = store(net.tab());
    expect((await fresh.listVectors(DB)).map((v) => v.id).sort()).toEqual(['fromA', 'fromB']);
    expect(await fresh.listFolders(DB)).toEqual(['/f']);
  });

  test('a read in another tab sees a change made within the cache window (cache validated against the head)', async () => {
    const net = new FakeS5Network();
    const { a, b } = browserTabs(net);
    await a.createDatabase({ name: DB, owner: ADDR });
    expect((await b.getStats(DB)).vectorCount).toBe(0);
    await a.addVectors(DB, [vec('x'), vec('y')]);
    expect((await b.getStats(DB)).vectorCount).toBe(2);
    expect((await b.listVectors(DB)).map((v) => v.id).sort()).toEqual(['x', 'y']);
  });

  test('a database created in another tab is discovered through the heads before the cache expires', async () => {
    const net = new FakeS5Network();
    const { a, b } = browserTabs(net);
    await b.createDatabase({ name: 'other', owner: ADDR });
    b.invalidateCaches();
    await b.initialize();                            // b lists (and caches) a root holding only 'other'
    await a.createDatabase({ name: DB, owner: ADDR });
    b.invalidateCaches();
    await b.initialize();                            // b's listing is stale; the heads are not
    expect((await b.listDatabases()).map((d) => d.databaseName).sort()).toEqual([DB, 'other'].sort());
  });

  test('a stale tab cannot resurrect a deleted database; re-creating it starts a new incarnation', async () => {
    const net = new FakeS5Network();
    const { a, b } = browserTabs(net);
    await a.createDatabase({ name: DB, owner: ADDR });
    await a.addVectors(DB, [vec('a')]);
    const oldIncarnation = openManifest(net, DB).incarnation;
    await b.listVectors(DB);                          // b's view still shows the database
    await a.deleteDatabase(DB);
    expect(await b.getDatabase(DB)).toBeNull();
    await expect(b.addVectors(DB, [vec('b')])).rejects.toThrow('not found');
    expect(net.filePaths()).toEqual([]);
    await b.createDatabase({ name: DB, owner: ADDR });
    const m = openManifest(net, DB);
    expect(m.incarnation).not.toBe(oldIncarnation);
    expect(await store(net.tab()).listVectors(DB)).toEqual([]);
  });
});

describe('composite operations under a non-reentrant lock (review M3)', () => {
  test('rename, delete and move folders, and update metadata, each complete as one locked commit', async () => {
    const net = new FakeS5Network();
    const coherence = browserOrigin({ lockTimeoutMs: 300 })();
    const s = store(net.tab(), { coherence });
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [vec('a', { folderPath: '/one' }), vec('b', { folderPath: '/one' }), vec('c', { folderPath: '/two' })]);
    expect(await s.renameFolder(DB, '/one', '/uno')).toBe(2);
    await s.moveToFolder(DB, 'c', '/uno');
    await s.updateMetadata(DB, 'a', { tag: 'x' });
    expect(await s.moveFolderContents(DB, '/uno', '/dos')).toBe(3);
    expect(await s.deleteFolder(DB, '/dos')).toBe(3);
    expect(await s.listVectors(DB)).toEqual([]);
    const revisions = openManifest(net, DB).revision;
    expect(revisions).toBeLessThanOrEqual(8); // create + add + one commit per operation, never one per vector
  });
});
