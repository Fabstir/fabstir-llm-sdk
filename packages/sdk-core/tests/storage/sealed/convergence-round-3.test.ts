// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 3 — storage-level defect classes (plan §15 T1, T2, T3, T5, T6, T7, T8). Two new failure
 * models: a registry answer that arrives between two listings (the purge used to act on the later one), and two
 * BROWSERS on one account, whose heads outlive s5js's cache window.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { createRagCoherence, __resetInProcessCoherenceForTests, HEAD_TRUST_MS, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const dbDir = (name: string) => `home/rag/v1/${sealer().deriveId('db', name)}`;

function store(tab: FakeS5Tab, coherence?: RagCoherence) {
  return new S5VectorStore({
    s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash,
    ...(coherence ? { coherence } : {}),
  });
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries(docs)) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

const legacyFiles = (net: FakeS5Network, name: string) => net.filePaths().filter((p) => p.startsWith(`${legacyDir(name)}/`));

beforeEach(() => __resetInProcessCoherenceForTests());

describe('T1 — the purge deletes only its own inventory', () => {
  test('a miss on documents/ that outlasts two runs fails each run it hits and deletes no unread body', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'only copy one', d2: 'only copy two' });
    net.registryMiss(`${legacyDir('Research')}/documents`, 2);
    for (let run = 0; run < 2; run++) {
      expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'S5_DIRECTORY_LOAD_ERROR' });
      expect(legacyFiles(net, 'Research')).toEqual(expect.arrayContaining([
        `${legacyDir('Research')}/documents/d1.txt`, `${legacyDir('Research')}/documents/d2.txt`,
      ]));
    }
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated' });
    expect(await store(net.tab()).getDocumentBody('Research', 'd2')).toBe('only copy two');
  });

  test('the repair run under a miss keeps the bodiless document\'s body; a later run repairs it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', {});
    const old = net.tab();
    await old.fs.put(`${legacyDir('Research')}/manifest.json`, legacyManifest('Research', ['d1']));   // listed, no body yet
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ missingBodies: ['d1'] });
    await old.fs.put(`${legacyDir('Research')}/manifest.json`, legacyManifest('Research', ['d1']));   // an outdated tab uploads it
    await old.fs.put(`${legacyDir('Research')}/documents/d1.txt`, 'only copy one');
    net.registryMiss(`${legacyDir('Research')}/documents`, 1);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'S5_DIRECTORY_LOAD_ERROR' });
    expect(legacyFiles(net, 'Research')).toContain(`${legacyDir('Research')}/documents/d1.txt`);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ repairedBodies: ['d1'] });
    expect(await store(net.tab()).getDocumentBody('Research', 'd1')).toBe('only copy one');
  });

  test('a miss on the legacy base never deletes an unmigrated database: the run fails retryably', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'only copy one' }, 1);
    net.registryMiss(`home/vector-databases/${ADDR}`, 2);
    for (let run = 0; run < 2; run++) {
      expect(await caught(store(net.tab()).migrateLegacyStorage())).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
      expect(legacyFiles(net, 'Research')).toHaveLength(3);
    }
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated' });
  });

  test('a leaf miss on a database directory is never an orphan: nothing unread is deleted', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'only copy one' }, 1);
    net.registryMiss(legacyDir('Research'), 4);
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases.find((d) => d.status === 'purged-orphan')).toBeUndefined();
    expect(legacyFiles(net, 'Research')).toHaveLength(3);
  });

  test('a body an outdated tab uploads during the purge is kept; the next run adopts it with its body', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    const tab = net.tab();
    const del = tab.fs.delete;
    let raced = false;
    tab.fs.delete = async (path: string) => {
      const ok = await del(path);
      if (!raced && path.endsWith('/documents/d1.txt')) {
        raced = true;
        const old = net.tab();
        await old.fs.put(`${legacyDir('Research')}/documents/late.txt`, 'late body');
        await old.fs.put(`${legacyDir('Research')}/manifest.json`, legacyManifest('Research', ['d1', 'late']));
      }
      return ok;
    };
    const first = await store(tab).migrateLegacyStorage();
    expect(first.databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect(legacyFiles(net, 'Research')).toContain(`${legacyDir('Research')}/documents/late.txt`);
    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['late'] });
    expect(await store(net.tab()).getDocumentBody('Research', 'late')).toBe('late body');
  });

  test('a document adopted beside the sealed copy under a miss keeps its legacy body; the next run adopts it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', { d1: 'one' });
    await store(net.tab()).migrateLegacyStorage();
    const old = net.tab();
    await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['d1', 'd2']));
    await old.fs.put(`${legacyDir('Notes')}/documents/d2.txt`, 'only copy two');
    net.registryMiss(`${legacyDir('Notes')}/documents`, 1);
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'failed', code: 'S5_DIRECTORY_LOAD_ERROR' });
    expect(legacyFiles(net, 'Notes')).toContain(`${legacyDir('Notes')}/documents/d2.txt`);
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['d2'] });
    expect(await store(net.tab()).getDocumentBody('Notes', 'd2')).toBe('only copy two');
  });

  test('a LISTED body whose read fails is never deleted — adopted or repaired, it waits for the next run', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', {});
    const old = net.tab();
    await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['d1']));      // listed, no body yet
    await store(net.tab()).migrateLegacyStorage();                       // d1 is bodiless in the sealed copy
    await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['d1', 'd2']));
    await old.fs.put(`${legacyDir('Notes')}/documents/d1.txt`, 'one');
    await old.fs.put(`${legacyDir('Notes')}/documents/d2.txt`, 'only copy two');
    const blobOf = (text: string) => [...net.blobs].find(([, b]) => new TextDecoder().decode(b) === text)![0];
    net.fail('download', blobOf('one'), 'network', 3);                  // the repair's read, through its retries
    net.fail('download', blobOf('only copy two'), 'network', 3);        // the adoption's read, through its retries
    expect((await store(net.tab()).migrateLegacyStorage()).databases[0]).toMatchObject({ legacyKept: true, unreadable: { bodies: ['d1', 'd2'] } });
    expect(legacyFiles(net, 'Notes')).toEqual(expect.arrayContaining([
      `${legacyDir('Notes')}/documents/d1.txt`, `${legacyDir('Notes')}/documents/d2.txt`,
    ]));
    await store(net.tab()).migrateLegacyStorage();
    expect(await store(net.tab()).getDocumentBody('Notes', 'd1')).toBe('one');
    expect(await store(net.tab()).getDocumentBody('Notes', 'd2')).toBe('only copy two');
  });

  test('a purge failure after a verified commit is migrated + legacyKept (with its code), never failed', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    const tab = net.tab();
    const del = tab.fs.delete;
    tab.fs.delete = async (path: string) => { if (path.endsWith('chunk-0.json') || path.endsWith('d1.txt')) throw new Error('WebSocket connection closed'); return del(path); };
    const report = await store(tab).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect(typeof report.databases[0].purgeError).toBe('string');
  });

  test('files outside the legacy layout are reported and kept — the migration deletes only its own (§19 Z13)', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    await net.tab().fs.put(`${legacyDir('Research')}/notes.json`, { x: 1 });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'migrated', unrecognisedFiles: ['notes.json'] });
    expect(report.databases[0].legacyKept).toBeUndefined();
    expect(legacyFiles(net, 'Research')).toEqual([`${legacyDir('Research')}/notes.json`]);
  });
});

describe('T2 — a head is trusted only inside the cache window, and only for its own incarnation', () => {
  const later = HEAD_TRUST_MS + 20_000;

  test('a database deleted on device A is not resurrected by device B\'s old head', async () => {
    const net = new FakeS5Network();
    const deviceA = browserOrigin({ now: () => net.now });
    const deviceB = browserOrigin({ now: () => net.now });
    const b1 = store(net.tab(), deviceB());
    await b1.createDatabase({ name: 'Research', owner: ADDR });
    await b1.addPendingDocument('Research', { id: 'doc-1' });
    await store(net.tab(), deviceA()).deleteDatabase('Research');
    net.advance(later);
    const b2 = store(net.tab(), deviceB());
    expect(await b2.listDatabases()).toEqual([]);
    expect(await caught(b2.addPendingDocument('Research', { id: 'doc-2' }))).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
    expect(net.filePaths().filter((p) => p.startsWith('home/rag/'))).toEqual([]);
  });

  test('device A\'s tombstone never hides a database device B re-created, nor lets A overwrite it', async () => {
    const net = new FakeS5Network();
    const deviceA = browserOrigin({ now: () => net.now });
    const deviceB = browserOrigin({ now: () => net.now });
    const a1 = store(net.tab(), deviceA());
    await a1.createDatabase({ name: 'Notes', owner: ADDR });
    await a1.addPendingDocument('Notes', { id: 'old' });
    await a1.deleteDatabase('Notes');
    net.advance(later);
    const b1 = store(net.tab(), deviceB());
    await b1.createDatabase({ name: 'Notes', owner: ADDR });
    await b1.addPendingDocument('Notes', { id: 'phone-upload' });
    net.advance(later);
    const a2 = store(net.tab(), deviceA());
    expect((await a2.listDatabases()).map((d) => d.databaseName)).toEqual(['Notes']);
    expect(await caught(a2.createDatabase({ name: 'Notes', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    expect((await store(net.tab(), browserOrigin()()).getDatabaseMetadata('Notes')).pendingDocuments?.map((d: any) => d.id)).toEqual(['phone-upload']);
  });

  test('inside the window too, a tombstone covers only its own incarnation: another device\'s re-created database is seen and never overwritten', async () => {
    const net = new FakeS5Network();
    const deviceA = browserOrigin({ now: () => net.now });
    const deviceB = browserOrigin({ now: () => net.now });
    const a1 = store(net.tab(), deviceA());
    await a1.createDatabase({ name: 'Notes', owner: ADDR });
    await a1.addPendingDocument('Notes', { id: 'old' });
    await a1.deleteDatabase('Notes');                            // tombstone revision 3 — still trusted below
    const b1 = store(net.tab(), deviceB());
    await b1.createDatabase({ name: 'Notes', owner: ADDR });     // a new incarnation, revisions 1-2
    await b1.addPendingDocument('Notes', { id: 'phone-upload' });
    net.advance(40_000);                                         // past s5js's directory cache, inside HEAD_TRUST_MS
    const a2 = store(net.tab(), deviceA());
    expect((await a2.listDatabases()).map((d) => d.databaseName)).toEqual(['Notes']);
    expect(await caught(a2.createDatabase({ name: 'Notes', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
  });

  test('inside the window a tombstone still hides a stale view of the deleted incarnation (R5 holds)', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const a = store(net.tab(), origin());
    const b = store(net.tab(), origin());
    await a.createDatabase({ name: 'x', owner: ADDR });
    await b.listDatabases();                      // b caches the root and the database directory
    await a.deleteDatabase('x');
    expect(await b.getDatabase('x')).toBeNull();
  });
});

describe('T3 — "all databases" is complete or an error', () => {
  test('a listed database whose manifest read misses is confirmed; if it stays unreadable the answer is RAG_DISCOVERY_INCOMPLETE', async () => {
    const net = new FakeS5Network();
    const seed = store(net.tab());
    await seed.createDatabase({ name: 'A', owner: ADDR });
    await seed.createDatabase({ name: 'B', owner: ADDR });
    __resetInProcessCoherenceForTests();
    net.registryMiss(dbDir('B'), 1);
    expect((await store(net.tab()).listAllDatabases()).map((d) => d.databaseName).sort()).toEqual(['A', 'B']);
    __resetInProcessCoherenceForTests();
    net.registryMiss(dbDir('B'), 50);
    const err = await caught(store(net.tab()).listAllDatabases());
    expect(err).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE', details: { retryable: true } });
    expect(err.details.failed.map((f: any) => f.dbId)).toEqual([sealer().deriveId('db', 'B')]);
  });

  test('a database another tab created whose read fails in the reconcile is never silently left out', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'first', owner: ADDR });
    await a.listAllDatabases();
    const b = store(net.tab());
    await b.createDatabase({ name: 'second', owner: ADDR });
    net.fail('get', `${dbDir('second')}/manifest`, 'network', 1);
    net.fail('download', /.*/, 'network', 1);
    expect(await caught(a.listAllDatabases())).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE' });
  });

  test('a miss on the sealed root never serves the legacy copy of a sealed database', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'research', owner: ADDR, description: 'sealed' });
    await net.tab().fs.put(`${legacyDir('research')}/manifest.json`, { ...legacyManifest('research', ['stale']), description: 'legacy' });
    __resetInProcessCoherenceForTests();
    net.registryMiss('home/rag/v1', 1);
    const s = store(net.tab());
    expect((await s.listDatabases()).map((d) => d.description)).toEqual(['sealed']);
  });

  test('a user who never had a sealed database pays no confirmation wait', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'only-legacy', { d1: 'x' });
    const s = store(net.tab(), undefined, 60_000);
    const started = Date.now();
    expect((await s.listAllDatabases()).map((d) => d.databaseName)).toEqual(['only-legacy']);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe('T5 — delete means delete even when the manifest cannot be read', () => {
  test('a database whose manifest will not open is deleted, and can then be re-created', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'x', owner: ADDR });
    const other = sealer().seal({ kind: 'cbor', value: { name: 'x' } }, 'rag/v1/not-this/manifest');   // wrong context
    await net.tab().fs.put(`${dbDir('x')}/manifest`, other, { mediaType: 'application/octet-stream' });
    __resetInProcessCoherenceForTests();
    const fresh = store(net.tab());
    await fresh.deleteDatabase('x');
    expect(net.filePaths().filter((p) => p.startsWith('home/rag/'))).toEqual([]);
    await fresh.createDatabase({ name: 'x', owner: ADDR });
    expect((await fresh.getDatabase('x'))?.databaseName).toBe('x');
  });
});

describe('T6 — a permanently unreadable legacy item has a consented way out', () => {
  test('the failure names the unreadable body; with discardUnreadable the database migrates without it', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'db', { d1: 'lost blob', d2: 'fine' });
    const lost = [...net.blobs].find(([, b]) => new TextDecoder().decode(b) === 'lost blob')![0];
    net.blobs.delete(lost);
    const failed = await store(net.tab()).migrateLegacyStorage();
    expect(failed.databases[0]).toMatchObject({ status: 'failed', unreadable: { bodies: ['d1'] } });
    const consented = await store(net.tab()).migrateLegacyStorage({ discardUnreadable: { db: { bodies: ['d1'] } } });
    expect(consented.databases[0]).toMatchObject({ status: 'migrated', discardedUnreadable: { bodies: ['d1'] } });
    expect(await store(net.tab()).getDocumentBody('db', 'd2')).toBe('fine');
  });
});

describe('T7 — retryability has one shape', () => {
  test('SealedIO failures are SDKErrors with details.retryable and details.cause, s5js\'s code kept', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const io = new SealedIO(tab as any, (b) => sealer().isSealed(b), tab.pathToHash);
    await tab.fs.put('home/rag/v1/a/b', sealer().seal({ kind: 'text', value: 'x' }, 'c'), { mediaType: 'application/octet-stream' });
    net.fail('get', 'home/rag/v1/a/b', 'dir404', 1);
    const typed = await caught(io.readPath('home/rag/v1/a/b'));
    expect(typed.name).toBe('SDKError');
    expect(typed).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
    expect(typed.details.cause.name).toBe('S5DirectoryLoadError');
    net.fail('list', 'home/rag/v1/a', 'network', 1);
    expect(await caught(io.list('home/rag/v1/a'))).toMatchObject({ code: 'S5_IO_ERROR', details: { retryable: true, op: 'list' } });
  });
});

describe('T8 — DocumentManager: an indexed body that reads as nothing is an error, not a TypeError', () => {
  test('DOCUMENT_BODY_UNREADABLE (retryable) on a registry miss', async () => {
    const { DocumentManager } = await import('../../../src/managers/DocumentManager');
    const { extractionCache } = await import('../../../src/documents/extractors');
    const net = new FakeS5Network();
    const dm = new DocumentManager();
    Object.assign(dm as any, { initialized: true, userAddress: ADDR, s5Client: net.tab(), sealer: sealer() });
    const { documentId } = await dm.uploadDocument(new File(['body'], 'notes.txt', { type: 'text/plain' }), 'db');
    extractionCache.clear();
    (dm as any).getFromRegistry('db', documentId).textCached = '';
    (dm as any).s5Client = net.tab();                                     // a fresh view of the directory
    net.registryMiss('home/documents/v1', 1);
    expect(await caught(dm.extractText(documentId, 'db'))).toMatchObject({ code: 'DOCUMENT_BODY_UNREADABLE', details: { retryable: true } });
  });
});

describe('T8 — the preflight opens IndexedDB', () => {
  test('assertUsable rejects when the head store will not open', async () => {
    const factory = { open: () => { throw new Error('IndexedDB disabled (private window)'); } } as any;
    const c = createRagCoherence({ isBrowser: true, locks: { request: async (_n: string, _o: any, cb: any) => cb() } as any, indexedDB: factory });
    await expect(c.assertUsable()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });
});

describe('T8 — a failed IndexedDB open is not cached', () => {
  test('the next call opens again', async () => {
    const good = new IDBFactory();
    let fail = true;
    const factory = { open: (...a: any[]) => { if (fail) throw new Error('open failed'); return (good.open as any)(...a); } } as any;
    const c = createRagCoherence({ isBrowser: true, locks: { request: async (_n: string, _o: any, cb: any) => cb() } as any, indexedDB: factory });
    await expect(c.getHead('x')).rejects.toThrow();
    fail = false;
    expect(await c.getHead('x')).toBeUndefined();
  });
});
