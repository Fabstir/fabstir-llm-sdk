// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 5 — the findings that do not depend on s5js (plan §17, classes W*), on beta.56 semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { FakeLockManager, browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { isS5Absent } from '../../../src/storage/sealed/sealed-io';
import { createRagCoherence, __resetInProcessCoherenceForTests, HEAD_TRUST_MS, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const dbDir = (name: string) => `home/rag/v1/${sealer().deriveId('db', name)}`;
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const legacyFiles = (net: FakeS5Network, name: string) => net.filePaths().filter((p) => p.startsWith(`${legacyDir(name)}/`));

async function seedLegacy(net: FakeS5Network, name: string, docs: Record<string, string>, chunks = 0, garbage: Record<string, string> = {}) {
  const tab = net.tab();
  await tab.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, Object.keys(docs), chunks));
  for (let i = 0; i < chunks; i++) await tab.fs.put(`${legacyDir(name)}/chunk-${i}.json`, { chunkId: i, vectors: [{ id: `v${i}`, vector: [0.1], metadata: {} }] });
  for (const [id, body] of Object.entries({ ...docs, ...garbage })) await tab.fs.put(`${legacyDir(name)}/documents/${id}.txt`, body);
}

function store(tab: FakeS5Tab, coherence?: RagCoherence, extra: Record<string, unknown> = {}) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}), ...extra } as any);
}

function storage(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('W1 — Node ≥ 24.5 has navigator.locks and no IndexedDB: the in-process mechanism, not a failure', () => {
  test('a runtime with Web Locks but neither IndexedDB nor a document gets working coherence', async () => {
    const nav = globalThis.navigator as any;
    Object.defineProperty(nav, 'locks', { value: new FakeLockManager(), configurable: true });
    try {
      const c = createRagCoherence();
      await expect(c.assertUsable()).resolves.toBeUndefined();
      expect(await c.withLock('db', async () => 'ran')).toBe('ran');
      await c.putHead('db', { revision: 1 });
      expect(await c.getHead('db')).toMatchObject({ revision: 1 });
      await expect(storage(new FakeS5Network().tab()).assertConversationLogWritable()).resolves.toBeUndefined();
    } finally {
      delete nav.locks;
    }
  });
});

describe("W2 — s5js's absence messages are absence whatever their path holds (a session 404, a database \"Error 404 notes\")", () => {
  test('isS5Absent reads the message shape, not a 404 token inside the path', () => {
    for (const message of [
      `Directory "home/sessions/${ADDR}/404" does not exist`,
      `Directory "fs5://[redacted]/home/vector-databases/${ADDR}/http-404" does not exist`,
      `Path not found: home/vector-databases/${ADDR}/Error 404 notes/manifest.json`,
    ]) expect(isS5Absent(new Error(message))).toBe(true);
    for (const message of [
      `Parent Directory of "home/sessions/${ADDR}/404" does not exist`,
      'Blob 1f2e… 404 not found on any portal',
      'HTTP 404: Directory "x" does not exist',
    ]) expect(isS5Absent(new Error(message))).toBe(false);
    expect(isS5Absent(Object.assign(new Error('Directory "x" does not exist'), { retryable: true }))).toBe(false);
  });

  test('session 404 with no log yet loads as "no log", like session 405', async () => {
    const net = new FakeS5Network();
    await storage(net.tab()).saveConversation({ id: '1', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 } as any);
    expect(await storage(net.tab()).loadConversation('405')).toBeNull();
    expect(await storage(net.tab()).loadConversation('404')).toBeNull();
  });

  test('a legacy database named "404" migrates like one named "405"', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    for (const name of ['405', '404']) {
      await t.fs.put(`${legacyDir(name)}/manifest.json`, {
        name, owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
        chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [{ id: 'with-body' }, { id: 'no-body' }],
      });
      await t.fs.put(`${legacyDir(name)}/documents/with-body.txt`, 'body');
    }
    const report = await store(net.tab()).migrateLegacyStorage();
    for (const name of ['405', '404']) {
      expect(report.databases.find((d) => d.name === name)).toMatchObject({ status: 'migrated', missingBodies: ['no-body'] });
    }
  });
});

describe('W3 — every head-store failure is RAG_COHERENCE_UNAVAILABLE, including a failed request or an aborted commit', () => {
  function factoryWith(behaviour: { getFails?: boolean; putAborts?: boolean; listFails?: boolean }) {
    const fail = (r: any, name: string) => { r.error = Object.assign(new Error(name), { name }); r.onerror?.(); };
    const db: any = {
      transaction: () => {
        const tx: any = {};
        tx.objectStore = () => ({
          get: () => { const r: any = {}; setTimeout(() => (behaviour.getFails ? fail(r, 'UnknownError') : (r.result = undefined, r.onsuccess?.()))); return r; },
          put: () => { setTimeout(() => { if (behaviour.putAborts) { tx.error = Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); tx.onabort?.(); } else tx.oncomplete?.(); }); return {}; },
          getAllKeys: () => { const r: any = {}; setTimeout(() => (behaviour.listFails ? fail(r, 'UnknownError') : (r.result = [], r.onsuccess?.()))); return r; },
          getAll: () => { const r: any = {}; setTimeout(() => { r.result = []; r.onsuccess?.(); }); return r; },
        });
        return tx;
      },
    };
    return { open: () => { const req: any = { result: db }; setTimeout(() => req.onsuccess?.()); return req; } } as any;
  }
  const locks = { request: async (_n: string, _o: any, cb: any) => cb() } as any;
  const coherence = (b: Parameters<typeof factoryWith>[0]) => createRagCoherence({ isBrowser: true, locks, indexedDB: factoryWith(b) });

  test('a read whose transaction aborts after answering leaves no unhandled rejection behind', async () => {
    const db: any = {
      transaction: () => {
        const tx: any = {};
        tx.objectStore = () => ({ get: () => { const r: any = {}; setTimeout(() => { r.result = undefined; r.onsuccess?.(); tx.error = new Error('aborted'); tx.onabort?.(); }); return r; } });
        return tx;
      },
    };
    const factory = { open: () => { const req: any = { result: db }; setTimeout(() => req.onsuccess?.()); return req; } } as any;
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      await createRagCoherence({ isBrowser: true, locks, indexedDB: factory }).getHead('x');
      await new Promise((r) => setTimeout(r, 20));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });

  test('getHead, putHead and listHeads', async () => {
    await expect(coherence({ getFails: true }).getHead('x')).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    await expect(coherence({ putAborts: true }).putHead('x', { revision: 1 })).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    await expect(coherence({ listFails: true }).listHeads()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });
});

describe('W4 — a failed migration entry says whether retrying may help (§16 V6)', () => {
  test('a transient read failure is retryable; a malformed chunk is not', async () => {
    const net = new FakeS5Network();
    const w = net.tab();
    for (const name of ['Malformed', 'Flaky']) {
      await w.fs.put(`${legacyDir(name)}/manifest.json`, {
        name, owner: ADDR, vectorCount: 1, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
        chunks: [{ chunkId: 0, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [], pendingDocuments: [],
      });
    }
    await w.fs.put(`${legacyDir('Malformed')}/chunk-0.json`, { chunkId: 0, notVectors: true });
    await w.fs.put(`${legacyDir('Flaky')}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v', vector: [0.1], metadata: {} }] });
    net.fail('get', `${legacyDir('Flaky')}/chunk-0.json`, 'network', 3);
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases.find((d) => d.name === 'Flaky')).toMatchObject({ status: 'failed', retryable: true });
    expect(report.databases.find((d) => d.name === 'Malformed')).toMatchObject({ status: 'failed', retryable: false });
  });

  test('a failed log in the log migration says so too', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`home/sessions/${ADDR}/41/conversation.json`, { id: '41', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 });
    net.fail('get', `home/sessions/${ADDR}/41/conversation.json`, 'network', 1);
    const report = await storage(net.tab()).migrateLegacyConversationLogs();
    expect(report.failed).toEqual([expect.objectContaining({ id: '41', retryable: true })]);
  });
});

describe("W5 — phase B checks the manifest again right before deleting it", () => {
  test("an outdated tab's upload whose manifest lands during the garbage deletes survives: the next run adopts it", async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' }, 0, { g1: 'old', g2: 'old', g3: 'old', g4: 'old' });
    const origin = browserOrigin({ now: () => net.now });
    const tab = net.tab();
    const old = net.tab();
    const del = tab.fs.delete;
    let injected = false;
    tab.fs.delete = async (path: string) => {
      if (!injected && /\/documents\/g\d\.txt$/.test(path)) {       // garbage goes only in phase B
        injected = true;
        await old.fs.put(`${legacyDir('Research')}/documents/d6.txt`, 'the only copy of d6');
        await old.fs.put(`${legacyDir('Research')}/manifest.json`, legacyManifest('Research', ['d1', 'd6']));
      }
      return del(path);
    };
    expect((await store(tab, origin()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect((await store(net.tab(), origin()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', adopted: ['d6'] });
    expect(await store(net.tab(), origin()).getDocumentBody('Research', 'd6')).toBe('the only copy of d6');
  });
});

describe('W6 — besideSealed names the entry-less bodies it discards', () => {
  test('a leftover body with no manifest entry is reported in `discarded`', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Research', { d1: 'one' });
    const origin = browserOrigin({ now: () => net.now });
    await store(net.tab(), origin()).migrateLegacyStorage();
    await net.tab().fs.put(`${legacyDir('Research')}/documents/d6.txt`, 'a body whose entry never landed');
    const entry = (await store(net.tab(), origin()).migrateLegacyStorage()).databases[0];
    expect(entry).toMatchObject({ status: 'purged-leftover' });
    expect(entry.discarded).toContain('d6');
  });
});

describe('W7 — an interrupted delete never lets the legacy copy take the name', () => {
  test('the legacy delete fails: the sealed database is still the one served', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    const s = store(net.tab(), origin());
    await s.createDatabase({ name: 'Notes', owner: ADDR });
    await s.addPendingDocument('Notes', { id: 'current-doc' });
    const old = net.tab();
    await old.fs.put(`${legacyDir('Notes')}/manifest.json`, legacyManifest('Notes', ['stale-doc']));
    await old.fs.put(`${legacyDir('Notes')}/documents/stale-doc.txt`, 'an old plaintext body');
    net.fail('delete', new RegExp(`${legacyDir('Notes')}/documents/stale-doc\\.txt$`), 'network', 3);
    await expect(store(net.tab(), origin()).deleteDatabase('Notes')).rejects.toMatchObject({ code: 'RAG_DELETE_INCOMPLETE' });
    await new Promise((r) => setTimeout(r, 20));                      // nothing of that delete may still be running
    const elsewhere = store(net.tab(), browserOrigin({ now: () => net.now })());   // another device: no heads to vouch
    const db = await elsewhere.getDatabase('Notes');
    expect(db?.pendingDocuments?.map((d: any) => d.id)).toEqual(['current-doc']);
  });
});

describe('W8 — an orphan sealed directory never hides the intact legacy copy', () => {
  test('a failed commit: the legacy database is in the complete list', async () => {
    const net = new FakeS5Network();
    await seedLegacy(net, 'Notes', { d1: 'one' }, 1);
    const origin = browserOrigin({ now: () => net.now });
    net.fail('put', new RegExp(`^${dbDir('Notes')}/manifest$`), 'network', 10);
    expect((await store(net.tab(), origin()).migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'failed' });
    expect(net.filePaths().some((p) => p.startsWith(`${dbDir('Notes')}/`))).toBe(true);            // the orphan
    expect((await store(net.tab(), origin()).listAllDatabases()).map((d) => d.databaseName)).toEqual(['Notes']);
  });
});

describe('W9 — an invalidation during an in-flight discovery is never answered by it', () => {
  test('six databases; invalidate after three were cached; the call after it sees all six', async () => {
    const net = new FakeS5Network();
    const writer = store(net.tab(), browserOrigin({ now: () => net.now })());
    for (let i = 0; i < 6; i++) await writer.createDatabase({ name: `db${i}`, owner: ADDR });
    const s = store(net.tab(), browserOrigin({ now: () => net.now })());
    const cache = (s as any)._cacheManifest.bind(s);
    let n = 0;
    let refresh: Promise<any[]> | undefined;
    (s as any)._cacheManifest = (name: string, m: any) => {
      cache(name, m);
      if (++n === 3) { s.invalidateCaches(); refresh = s.listAllDatabases(); }
    };
    await s.listAllDatabases();
    expect((await refresh!).map((d) => d.databaseName).sort()).toEqual(['db0', 'db1', 'db2', 'db3', 'db4', 'db5']);
  });

  test('a superseded discovery never marks the store complete: a call after it waits for the current one', async () => {
    const net = new FakeS5Network();
    const writer = store(net.tab(), browserOrigin({ now: () => net.now })());
    for (let i = 0; i < 6; i++) await writer.createDatabase({ name: `db${i}`, owner: ADDR });
    const s = store(net.tab(), browserOrigin({ now: () => net.now })());
    const discover = (s as any)._doInitialize.bind(s);
    let openGate!: () => void;
    const gate = new Promise<void>((r) => { openGate = r; });
    let third: Promise<any[]> | undefined;
    let runs = 0;
    (s as any)._doInitialize = async (...args: unknown[]) => {
      const run = ++runs;
      if (run === 2) await gate;                                      // the current generation's discovery waits
      const failures = await discover(...args);
      if (run === 1) setTimeout(() => { third = s.listAllDatabases(); openGate(); }, 0);   // after run 1 settled
      return failures;
    };
    const cache = (s as any)._cacheManifest.bind(s);
    let n = 0;
    (s as any)._cacheManifest = (name: string, m: any) => {
      cache(name, m);
      if (++n === 3) { s.invalidateCaches(); void s.listAllDatabases(); }
    };
    await s.listAllDatabases();
    expect((await third!).map((d) => d.databaseName).sort()).toEqual(['db0', 'db1', 'db2', 'db3', 'db4', 'db5']);
  });
});

describe('W10 — the periodic re-discovery keeps the content-addressed vector cache', () => {
  test('unchanged chunks are not downloaded again after a discovery past HEAD_TRUST_MS', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const s = store(tab, browserOrigin({ now: () => net.now })(), { chunkSize: 2 });
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addVectors('kb', Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, vector: [i, 1], metadata: {} })));
    let downloads = 0;
    const dl = tab.downloadByCID;
    tab.downloadByCID = async (h: Uint8Array) => { downloads++; return dl(h); };
    await s.listAllDatabases();
    await s.listVectors('kb');
    net.advance(HEAD_TRUST_MS + 1_000);
    await s.listAllDatabases();
    const before = downloads;
    await s.listVectors('kb');
    expect(downloads - before).toBe(0);
  });
});
