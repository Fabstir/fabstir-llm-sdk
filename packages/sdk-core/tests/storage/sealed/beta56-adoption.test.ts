// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Plan §18 B1 — s5js beta.56 finds a directory through its parent's view, which a default read takes from a 30 s
 * per-tab cache (fs5.js:1564-1581, 1822-1829). A directory or file another tab or device wrote inside that window
 * reads as absent — "does not exist" for a new directory, nothing for a new file — until a fresh read. Every
 * sealed-storage read is fresh, so no decision that creates, replaces, deletes or falls back rests on that view.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { blake3 } from '@noble/hashes/blake3';
import { FakeS5Network, FakeS5Tab, hex } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { StorageManager } from '../../../src/managers/StorageManager';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { sealer } from '../../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const msg = (content: string, timestamp = 1) => ({ role: 'user', content, timestamp });
const conversation = (id: string, messages: Array<ReturnType<typeof msg>>) => ({ id, messages, metadata: {}, createdAt: 1, updatedAt: 1 });

/** One device: its own origin, so its own locks and heads. */
const device = () => browserOrigin();

function store(tab: FakeS5Tab, coherence: RagCoherence) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence });
}

function storage(tab: FakeS5Tab, coherence: RagCoherence): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer(), coherence });
  return s;
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('B1 — a view another tab or device changed in the last 30 s never reads as absent', () => {
  test("SealedIO sees another tab's new file and new directory through its own cached view", async () => {
    // Each read gets its own stale view: a fresh read evicts the stale copy it proves, which would mask the next.
    const staleView = async () => {
      const net = new FakeS5Network();
      const mine = net.tab();
      const other = net.tab();
      await other.fs.put('home/d/a', new Uint8Array([1]));
      const io = new SealedIO(mine as any, () => false, mine.pathToHash);
      for await (const _ of mine.fs.list('home/d')) { /* mine caches home/d */ }
      await other.fs.put('home/d/b', new Uint8Array([2]));
      await other.fs.put('home/d/sub/c', new Uint8Array([3]));
      return io;
    };
    expect((await (await staleView()).list('home/d'))!.map((e) => e.name).sort()).toEqual(['a', 'b', 'sub']);
    expect(await (await staleView()).readPath('home/d/b')).toMatchObject({ state: 'plain' });
    expect(await (await staleView()).readPath('home/d/sub/c')).toMatchObject({ state: 'plain' });
    expect(await (await staleView()).hashOf('home/d/b')).toBe(hex(blake3(new Uint8Array([2]))));
    expect(await (await staleView()).hashOf('home/d/sub/c')).toBe(hex(blake3(new Uint8Array([3]))));
    expect(Array.from((await (await staleView()).readRaw('home/d/b'))!)).toEqual([2]);
    expect(Array.from((await (await staleView()).readRaw('home/d/sub/c'))!)).toEqual([3]);
  });

  test('createDatabase never overwrites a database another device created while this tab had the root cached', async () => {
    const net = new FakeS5Network();
    const a = store(net.tab(), device()());
    await a.listDatabases();                                        // a caches the path to home/rag/v1
    const b = store(net.tab(), device()());
    await b.createDatabase({ name: 'x', owner: ADDR });
    await b.addPendingDocument('x', { id: 'keep-me' });
    expect(await caught(a.createDatabase({ name: 'x', owner: ADDR }))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    const later = store(net.tab(), device()());
    expect((await later.getDatabase('x'))?.pendingDocuments?.map((d: any) => d.id)).toEqual(['keep-me']);
  });

  test("getDatabase serves another device's new sealed database, never the stale legacy copy beside it", async () => {
    const net = new FakeS5Network();
    const a = store(net.tab(), device()());
    await a.listDatabases();                                        // a caches the path to home/rag/v1
    await store(net.tab(), device()()).createDatabase({ name: 'x', owner: ADDR, description: 'sealed' });
    await net.tab().fs.put(`${legacyDir('x')}/manifest.json`, {     // an outdated tab writes the legacy layout
      name: 'x', owner: ADDR, description: 'legacy', vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1,
      updated: 1, chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: [],
    });
    expect((await a.getDatabase('x'))?.description).toBe('sealed');
  });

  test('appendMessage never replaces a log another device started while this tab had its sessions cached', async () => {
    const net = new FakeS5Network();
    const a = storage(net.tab(), device()());
    await a.saveConversation(conversation('40', [msg('mine')]) as any);
    await a.loadConversation('40');                                 // a caches home/sessions/{addr}
    await storage(net.tab(), device()()).saveConversation(conversation('41', [msg('m1'), msg('m2', 2)]) as any);
    await a.appendMessage('41', msg('m3', 3) as any);
    const later = storage(net.tab(), device()());
    expect((await later.loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('§18 B1 consequences', () => {
  test('an empty listed database directory is no database, and the discovery is complete', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab(), device()());
    await s.createDatabase({ name: 'kept', owner: ADDR });
    await net.tab().fs.put(`home/rag/v1/${sealer().deriveId('db', 'gone')}/x`, new Uint8Array([1]));
    await net.tab().fs.delete(`home/rag/v1/${sealer().deriveId('db', 'gone')}/x`);   // listed, and empty
    const later = store(net.tab(), device()());
    expect((await later.listAllDatabases()).map((d) => d.databaseName)).toEqual(['kept']);
  });
});

describe('§18 B3 — DocumentManager keeps s5js\'s retry verdict', () => {
  test('a permanent read failure is DOCUMENT_BODY_UNREADABLE with retryable false', async () => {
    const { DocumentManager } = await import('../../../src/managers/DocumentManager');
    const { extractionCache } = await import('../../../src/documents/extractors');
    const net = new FakeS5Network();
    const dm = new DocumentManager();
    Object.assign(dm as any, { initialized: true, userAddress: ADDR, s5Client: net.tab(), sealer: sealer() });
    const { documentId } = await dm.uploadDocument(new File(['body'], 'notes.txt', { type: 'text/plain' }), 'db');
    extractionCache.clear();
    (dm as any).getFromRegistry('db', documentId).textCached = '';
    net.fail('get', /home\/documents/, Object.assign(new Error('refused'), { retryable: false }));
    expect(await caught(dm.extractText(documentId, 'db'))).toMatchObject({ code: 'DOCUMENT_BODY_UNREADABLE', details: { retryable: false } });
  });
});
