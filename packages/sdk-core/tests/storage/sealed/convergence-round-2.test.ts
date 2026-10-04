// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 2 — storage-level defect classes (plan §14 S1, S2, S4, S7, S8, S9). The blocker behind S1
 * was a fact about s5js beta.55: a first-access registry miss read exactly like absence. On beta.56 a miss on a
 * linked directory is a retryable failure (fake-s5-conformance), so the S1 claims — nothing deleted, replaced or
 * served stale — are pinned against that shape (§18 B2); the absence beta.56 still produces, through a cached
 * parent, is pinned in beta56-adoption.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { storageSealerFromSeed } from '../../../src/storage/sealed/StorageSealer';
import { createRagCoherence, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const logPath = (id: string, addr = ADDR) => `home/sessions/${addr}/${id}/conversation.json`;
const msg = (content: string, timestamp = 1) => ({ role: 'user', content, timestamp });
const conversation = (id: string, messages: Array<ReturnType<typeof msg>>) => ({ id, messages, metadata: {}, createdAt: 1, updatedAt: 1 });
const legacyManifest = (name: string, docIds: string[], chunks = 0) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const OTHER_SEED = 'test test test test test test test test test test test junk';
const OTHER_ADDR = '0x' + '5'.repeat(40);

function store(tab: FakeS5Tab, coherence?: RagCoherence) {
  return new S5VectorStore({
    s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash,
    ...(coherence ? { coherence } : {}),
  });
}

function storage(tab: FakeS5Tab, coherence?: RagCoherence, opts: { seed?: string; addr?: string } = {}): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, {
    initialized: true, s5Client: tab, userAddress: opts.addr ?? ADDR, connectionStatus: 'connected',
    sealer: opts.seed ? storageSealerFromSeed(opts.seed, opts.addr ?? ADDR) : sealer(),
  });
  if (coherence) (s as any).coherence = coherence;
  return s;
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function sealedAt(net: FakeS5Network, path: string): Promise<boolean> {
  const bytes = await net.tab().fs.get(path);
  return bytes instanceof Uint8Array && sealer().isSealed(bytes);
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('S1 — an s5js "absent" never authorises destroying or replacing data on its own', () => {
  test('a registry miss on documents/ fails the migration retryably and deletes nothing; the next run completes', async () => {
    const net = new FakeS5Network();
    const seed = net.tab();
    await seed.fs.put(`${legacyDir('Research')}/manifest.json`, legacyManifest('Research', ['d1', 'd2']));
    await seed.fs.put(`${legacyDir('Research')}/documents/d1.txt`, 'the only copy of document one');
    await seed.fs.put(`${legacyDir('Research')}/documents/d2.txt`, 'the only copy of document two');
    net.registryMiss(`${legacyDir('Research')}/documents`, 1);  // the migration's first listing of documents/

    const first = await store(net.tab()).migrateLegacyStorage();
    expect(first.databases[0]).toMatchObject({ status: 'failed', code: 'S5_DIRECTORY_LOAD_ERROR' });
    expect(net.filePaths()).toEqual(expect.arrayContaining([
      `${legacyDir('Research')}/documents/d1.txt`, `${legacyDir('Research')}/documents/d2.txt`,
    ]));

    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases[0]).toMatchObject({ status: 'migrated' });
    expect(second.databases[0].legacyKept).toBeUndefined();
    expect(await store(net.tab()).getDocumentBody('Research', 'd2')).toBe('the only copy of document two');
    expect(net.filePaths().filter((p) => p.startsWith('home/vector-databases/'))).toEqual([]);
  });

  test('a document adopted after the seal joins the snapshot: removed later, it is never adopted again', async () => {
    const net = new FakeS5Network();
    const old = net.tab();
    const dir = legacyDir('Notes');
    await old.fs.put(`${dir}/manifest.json`, legacyManifest('Notes', ['d1']));
    await old.fs.put(`${dir}/documents/d1.txt`, 'one');
    const s = store(net.tab());
    await s.migrateLegacyStorage();
    net.advance(61_000);                     // runs are unlocks apart
    await old.fs.put(`${dir}/manifest.json`, legacyManifest('Notes', ['d1', 'd2']));   // an outdated tab uploads d2
    await old.fs.put(`${dir}/documents/d2.txt`, 'two');
    net.fail('delete', `${dir}/manifest.json`, 'network', 1);                         // that run's purge stops at its last step
    net.advance(61_000);
    expect((await s.migrateLegacyStorage()).databases[0]).toMatchObject({ status: 'adopted-after-seal', legacyKept: true }); // committed: not "failed"
    expect((await s.getDatabase('Notes'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d1', 'd2']);
    await s.removeDocument('Notes', 'd2');
    net.advance(61_000);
    await s.migrateLegacyStorage();
    expect((await store(net.tab()).getDatabase('Notes'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d1']);
  });

  test('a discovery that found nothing at all (a miss on the sealed root, no heads) is looked at again', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'kept', owner: ADDR });
    __resetInProcessCoherenceForTests();                                // a new device: no heads
    const s = store(net.tab());
    net.registryMiss('home/rag/v1', 1);
    // Confirmed inside the same discovery since §15 T3 (it used to take a second call).
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual(['kept']);
  });

  test('createDatabase on a device with no heads never overwrites a database whose manifest read missed', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'x', owner: ADDR });
    await a.addPendingDocument('x', { id: 'keep-me' });
    __resetInProcessCoherenceForTests();
    net.registryMiss(`home/rag/v1/${sealer().deriveId('db', 'x')}`, 1);
    expect(await caught(store(net.tab()).createDatabase({ name: 'x', owner: ADDR })))
      .toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
    expect(await caught(store(net.tab()).createDatabase({ name: 'x', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    expect((await store(net.tab()).getDatabase('x'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['keep-me']);
  });

  test('a migration beside a sealed database whose read missed never overwrites the sealed copy', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'x', owner: ADDR, description: 'sealed' });
    await a.addPendingDocument('x', { id: 'sealed-era' });
    await net.tab().fs.put(`${legacyDir('x')}/manifest.json`, legacyManifest('x', ['stale']));   // an outdated tab
    __resetInProcessCoherenceForTests();
    net.registryMiss(`home/rag/v1/${sealer().deriveId('db', 'x')}`, 1);
    await store(net.tab()).migrateLegacyStorage();
    expect((await store(net.tab()).getDatabase('x'))?.pendingDocuments?.map((d: any) => d.id)).toContain('sealed-era');
  });

  test('"all databases" is never an unconfirmed empty answer: a root miss on a new device is looked at again', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab());
    await a.createDatabase({ name: 'kept', owner: ADDR });
    await a.addPendingDocument('kept', { id: 'p1' });
    __resetInProcessCoherenceForTests();
    net.registryMiss('home/rag/v1', 1);
    expect((await store(net.tab()).listAllDatabases()).map((d) => d.databaseName)).toEqual(['kept']);
  });

  test('a stale legacy copy is never served for a sealed database whose manifest read missed', async () => {
    const net = new FakeS5Network();
    await store(net.tab()).createDatabase({ name: 'x', owner: ADDR, description: 'sealed' });
    await net.tab().fs.put(`${legacyDir('x')}/manifest.json`, { ...legacyManifest('x', ['stale']), description: 'legacy' });
    __resetInProcessCoherenceForTests();
    net.registryMiss(`home/rag/v1/${sealer().deriveId('db', 'x')}`, 1);
    expect(await caught(store(net.tab()).getDatabase('x'))).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
    expect((await store(net.tab()).getDatabase('x'))?.description).toBe('sealed');
  });

  test('appendMessage on a device with no heads never replaces a log whose read missed', async () => {
    const net = new FakeS5Network();
    await storage(net.tab()).saveConversation(conversation('41', [msg('m1'), msg('m2', 2)]) as any);
    __resetInProcessCoherenceForTests();
    net.registryMiss(`home/sessions/${ADDR}/41`, 1);
    expect(await caught(storage(net.tab()).appendMessage('41', msg('m3', 3) as any))).toMatchObject({ details: { retryable: true } });
    await storage(net.tab()).appendMessage('41', msg('m3', 3) as any);
    expect((await storage(net.tab()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('S2 — whether a log is sealed is decided by the bytes at its path', () => {
  async function sealedThenOutdatedWrite(net: FakeS5Network, legacy: string[], after?: (s: StorageManager) => Promise<void>) {
    const origin = browserOrigin();
    await net.tab().fs.put(logPath('41'), conversation('41', legacy.map((c, i) => msg(c, i + 1))));
    const a = storage(net.tab(), origin());
    await a.migrateLegacyConversationLogs();                             // sealed, snapshot = the legacy messages
    await after?.(a);
    const outdated = [...legacy.map((c, i) => msg(c, i + 1)), msg('from the old tab', 100)];
    await net.tab().fs.put(logPath('41'), conversation('41', outdated));  // an outdated tab rewrites the path in plaintext
    return origin;
  }

  test('the migration reseals plaintext written over a sealed log, keeping the outdated tab\'s new message', async () => {
    const net = new FakeS5Network();
    const origin = await sealedThenOutdatedWrite(net, ['m1']);
    const report = await storage(net.tab(), origin()).migrateLegacyConversationLogs();
    expect(report).toMatchObject({ sealed: 1, alreadySealed: 0 });
    expect(await sealedAt(net, logPath('41'))).toBe(true);
    expect((await storage(net.tab(), origin()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'from the old tab']);
  });

  test('a message deleted after the seal is not resurrected by the outdated tab\'s plaintext', async () => {
    const net = new FakeS5Network();
    const origin = await sealedThenOutdatedWrite(net, ['m1', 'm2'], async (a) => {
      const c = await a.loadConversation('41');
      await a.saveConversation({ ...c!, messages: c!.messages.filter((m: any) => m.content !== 'm2') } as any);
    });
    await storage(net.tab(), origin()).migrateLegacyConversationLogs();
    expect((await storage(net.tab(), origin()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'from the old tab']);
  });

  test('an append over such plaintext also reseals the path and keeps both writers\' messages', async () => {
    const net = new FakeS5Network();
    const origin = await sealedThenOutdatedWrite(net, ['m1']);
    await storage(net.tab(), origin()).appendMessage('41', msg('m4', 200) as any);
    expect(await sealedAt(net, logPath('41'))).toBe(true);
    expect((await storage(net.tab(), origin()).loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'from the old tab', 'm4']);
  });
});

describe('S4 — every failure carries a code', () => {
  test('SealedIO: an s5js failure that brought no code is S5_IO_ERROR; a coded one passes through', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const io = new SealedIO(tab as any, (b) => sealer().isSealed(b), tab.pathToHash);
    const sealed = sealer().seal({ kind: 'text', value: 'x' }, 'ctx');
    net.fail('put', 'home/rag/v1/a/b', 'network', 1);
    expect(await caught(io.write('home/rag/v1/a/b', sealed))).toMatchObject({ code: 'S5_IO_ERROR', details: { op: 'put', path: 'home/rag/v1/a/b' } });
    await io.write('home/rag/v1/a/b', sealed);
    net.fail('get', 'home/rag/v1/a/b', 'dir404', 1);
    expect(await caught(io.readPath('home/rag/v1/a/b'))).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } }); // one shape (§15 T7)
  });

  test('a log-migration failure carries a code', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(logPath('41'), conversation('41', [msg('m1')]));
    const s = storage(net.tab());
    (s as any)._readLog = async () => { throw new Error('no code here'); };
    const report = await s.migrateLegacyConversationLogs();
    expect(report.failed[0]).toMatchObject({ id: '41', code: 'STORAGE_MIGRATION_FAILED' });
  });
});

describe('S7 — a browser document without Web Locks fails closed, secure context or not', () => {
  const g = globalThis as any;
  let saved: Record<string, any>;
  beforeEach(() => { saved = { window: g.window, document: g.document, isSecureContext: g.isSecureContext, navigator: Object.getOwnPropertyDescriptor(g, 'navigator') }; });
  afterEach(() => {
    g.window = saved.window; g.document = saved.document; g.isSecureContext = saved.isSecureContext;
    if (saved.navigator) Object.defineProperty(g, 'navigator', saved.navigator);
  });

  test('a secure document without navigator.locks (e.g. Safari < 15.4) → RAG_COHERENCE_UNAVAILABLE', async () => {
    Object.defineProperty(g, 'navigator', { value: {}, configurable: true });
    g.window = {};
    g.document = {};
    g.isSecureContext = true;
    await expect(createRagCoherence().assertUsable()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });
});

describe('S8 — no name is left behind by a purge', () => {
  test('a second tab migrating from a stale listing neither re-creates the legacy directory nor reports legacyKept', async () => {
    const net = new FakeS5Network();
    const dir = legacyDir('Secret Project Names');
    const seed = net.tab();
    await seed.fs.put(`${dir}/manifest.json`, legacyManifest('Secret Project Names', ['d1'], 1));
    await seed.fs.put(`${dir}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v0', vector: [0.1], metadata: { text: 't' } }] });
    await seed.fs.put(`${dir}/documents/d1.txt`, 'body');
    const origin = browserOrigin();
    const a = store(net.tab(), origin());
    const b = store(net.tab(), origin());
    await a.listDatabases();
    await b.listDatabases();
    await a.migrateLegacyStorage();
    const rb = await b.migrateLegacyStorage();
    expect(net.dirPaths().filter((d) => d.includes('Secret Project Names') || d.includes(ADDR))).toEqual([]);
    expect(rb.databases.every((d) => !d.legacyKept)).toBe(true);
  });

  test('the log migration removes the {databaseName} directory it empties', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`home/sessions/${ADDR}/My Secret DB/hierarchy.json`, { folders: [] });
    await storage(net.tab()).migrateLegacyConversationLogs();
    expect(net.dirPaths().filter((d) => d.includes('My Secret DB'))).toEqual([]);
  });
});

describe('S9 — heads are scoped to the identity', () => {
  test('in-process: a second identity with the same conversation id reads and writes its own log', async () => {
    const net = new FakeS5Network();
    const alice = storage(net.tab());
    const bob = storage(net.tab(), undefined, { seed: OTHER_SEED, addr: OTHER_ADDR });
    await alice.saveConversation(conversation('7', [msg('alice 1')]) as any);
    await alice.appendMessage('7', msg('alice 2', 2) as any);
    await bob.appendMessage('7', msg('bob 1') as any);
    expect((await bob.loadConversation('7'))?.messages.map((m: any) => m.content)).toEqual(['bob 1']);
  });

  test('log heads cost RAG discovery nothing, and IndexedDB never names a conversation', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin();
    const raw = origin();
    await storage(net.tab(), origin()).saveConversation(conversation('conversation-4242', [msg('m1')]) as any);
    expect((await raw.listHeads()).map(([k]) => k).join(' ')).not.toContain('conversation-4242');
    const tab = net.tab();
    let reads = 0;
    const dl = tab.downloadByCID;
    tab.downloadByCID = async (h: Uint8Array) => { reads++; return dl(h); };
    const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence: origin() });
    expect(await s.listDatabases()).toEqual([]);
    expect(reads).toBe(0);
  });

  test('one origin: another identity\'s RAG heads are not listed (no read spent on them)', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin();
    const alice = store(net.tab(), origin());
    for (const n of ['a1', 'a2']) await alice.createDatabase({ name: n, owner: ADDR });
    const bobTab = new FakeS5Network().tab();          // bob's own S5 home; only the browser origin is shared
    let reads = 0;
    const dl = bobTab.downloadByCID;
    const get = bobTab.fs.get;
    bobTab.downloadByCID = async (h: Uint8Array) => { reads++; return dl(h); };
    bobTab.fs.get = async (p: string, o?: any) => { if (p.startsWith('home/rag/v1/')) reads++; return get(p, o); };
    const bob = new S5VectorStore({
      s5Client: bobTab as any, userAddress: OTHER_ADDR, encryptionManager: (await import('../../../src/managers/EncryptionManager')).EncryptionManager.fromSeed(OTHER_SEED, OTHER_ADDR),
      pathToHash: bobTab.pathToHash, coherence: origin(),
    });
    expect(await bob.listDatabases()).toEqual([]);
    expect(reads).toBe(0);
  });
});
