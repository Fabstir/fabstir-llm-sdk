// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 5 — migrating legacy plaintext RAG data (plan D12, D17, D18, D29; review M5, M6).
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { browserOrigin } from '../../helpers/fake-locks';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { DocumentManager } from '../../../src/managers/DocumentManager';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;

function store(tab: FakeS5Tab, opts: { coherence?: RagCoherence; chunkSize?: number } = {}) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, ...opts });
}

const vec = (id: string, doc = 'd1') => ({ id, vector: [0.5, -0.5, 0.25], metadata: { text: `secret chunk ${id}`, documentId: doc } });

interface LegacySpec {
  docs?: Array<{ id: string; ready?: boolean }>;
  chunks?: Array<ReturnType<typeof vec>[]>;
  bodies?: Record<string, string | Uint8Array>;
  extraChunks?: Record<number, ReturnType<typeof vec>[]>;
  deleted?: boolean;
  manifest?: boolean;
}

async function legacyDb(tab: FakeS5Tab, name: string, spec: LegacySpec = {}) {
  const dir = legacyDir(name);
  const chunks = spec.chunks ?? [[vec('v1'), vec('v2')]];
  const docs = spec.docs ?? [{ id: 'd1' }];
  if (spec.manifest !== false) {
    await tab.fs.put(`${dir}/manifest.json`, {
      name, owner: ADDR, description: `legacy ${name}`, dimensions: 3, vectorCount: chunks.flat().length, storageSizeBytes: 0,
      created: 1, lastAccessed: 1, updated: 1, deleted: spec.deleted,
      chunks: chunks.map((c, i) => ({ chunkId: i, cid: `${dir}/chunk-${i}.json`, vectorCount: c.length, sizeBytes: 0, updatedAt: 1 })),
      chunkCount: chunks.length, folderPaths: ['/legacy'],
      pendingDocuments: docs.filter((d) => !d.ready).map((d) => ({ id: d.id, fileName: `${d.id}.pdf`, embeddingStatus: 'pending' })),
      readyDocuments: docs.filter((d) => d.ready).map((d) => ({ id: d.id, fileName: `${d.id}.pdf`, embeddingStatus: 'ready' })),
    });
  }
  for (const [i, c] of chunks.entries()) await tab.fs.put(`${dir}/chunk-${i}.json`, { chunkId: i, vectors: c });
  for (const [i, c] of Object.entries(spec.extraChunks ?? {})) await tab.fs.put(`${dir}/chunk-${i}.json`, { chunkId: Number(i), vectors: c });
  for (const [id, body] of Object.entries(spec.bodies ?? { d1: 'the body of d1' })) await tab.fs.put(`${dir}/documents/${id}.txt`, body);
}

const legacyFiles = (net: FakeS5Network) => net.filePaths().filter((p) => p.startsWith('home/vector-databases/'));

beforeEach(() => __resetInProcessCoherenceForTests());

describe('migrateLegacyStorage — the happy path', () => {
  test('re-saves vectors, documents and bodies sealed, then purges the legacy directory', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research', { docs: [{ id: 'd1' }, { id: 'd2', ready: true }], bodies: { d1: 'body one', d2: 'body two' } });
    const s = store(net.tab());
    const report = await s.migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'research', status: 'migrated', vectors: 2, documents: 2 }]);
    expect(legacyFiles(net)).toEqual([]);
    const fresh = store(net.tab());
    await fresh.initialize();
    expect((await fresh.listDatabases()).map((d) => d.databaseName)).toEqual(['research']);
    expect((await fresh.listVectors('research')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    const meta: any = await fresh.getDatabaseMetadata('research');
    expect(meta.pendingDocuments.map((d: any) => d.id)).toEqual(['d1']);
    expect(meta.readyDocuments.map((d: any) => d.id)).toEqual(['d2']);
    expect(await fresh.getDocumentBody('research', 'd1')).toBe('body one');
    expect(await fresh.listFolders('research')).toEqual(['/legacy']);
  });

  test('after migration nothing on S5 is plaintext and nothing names the database', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    await store(net.tab()).migrateLegacyStorage();
    for (const p of net.filePaths()) {
      expect(p.startsWith('home/rag/v1/')).toBe(true);
      expect(p).not.toContain('research');
    }
  });

  test('the sealed manifest is written after every chunk and body of that database', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research', { bodies: { d1: 'a', d2: 'b' }, docs: [{ id: 'd1' }, { id: 'd2' }] });
    const start = net.writes.length;
    await store(net.tab()).migrateLegacyStorage();
    const sealedWrites = net.writes.slice(start).map((w) => w.path.split('/').slice(4).join('/'));
    expect(sealedWrites[sealedWrites.length - 1]).toBe('manifest');
    expect(sealedWrites.filter((p) => p === 'manifest')).toHaveLength(1);
  });

  test('document bodies are copied as raw bytes — nothing s5js get() would corrupt is changed', async () => {
    const net = new FakeS5Network();
    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x00, 0x63]);
    const bodies = { a: 'cats', b: '42', c: '7', bin: invalidUtf8 };
    await legacyDb(net.tab(), 'research', { docs: Object.keys(bodies).map((id) => ({ id })), bodies });
    await store(net.tab()).migrateLegacyStorage();
    const fresh = store(net.tab());
    expect(await fresh.getDocumentBody('research', 'a')).toBe('cats');
    expect(await fresh.getDocumentBody('research', 'b')).toBe('42');
    expect(await fresh.getDocumentBody('research', 'c')).toBe('7');
    expect(Array.from(await fresh.getDocumentBody('research', 'bin') as Uint8Array)).toEqual(Array.from(invalidUtf8));
  });

  test('reports progress per database', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'one');
    await legacyDb(net.tab(), 'two');
    const events: any[] = [];
    await store(net.tab()).migrateLegacyStorage({ onProgress: (e) => events.push(e) });
    expect(events.map((e) => [e.phase, e.done, e.total])).toEqual([['rag', 1, 2], ['rag', 2, 2]]);
  });
});

describe('what is purged rather than migrated', () => {
  test('a soft-deleted database is purged, never migrated (D15)', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'gone', { deleted: true });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'gone', status: 'purged-deleted' }]);
    expect(net.filePaths()).toEqual([]);
  });

  test('a directory with no manifest — what the UI\'s own delete leaves — is purged (M5)', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'ui-deleted', { manifest: false });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'ui-deleted', status: 'purged-orphan' }]);
    expect(net.filePaths()).toEqual([]);
  });

  test('chunk files past the legacy chunk count hold stale vectors: purged, not migrated', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research', { extraChunks: { 5: [vec('stale')] } });
    await store(net.tab()).migrateLegacyStorage();
    expect((await store(net.tab()).listVectors('research')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
    expect(legacyFiles(net)).toEqual([]);
  });

  test('a body with no manifest entry is discarded; an entry with no body is reported', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research', { docs: [{ id: 'd1' }, { id: 'nobody' }], bodies: { d1: 'x', orphan: 'y' } });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases[0]).toMatchObject({ status: 'migrated', discarded: ['orphan'], missingBodies: ['nobody'] });
    expect(legacyFiles(net)).toEqual([]);
  });

  test('the dead home/documents root of the old DocumentManager is purged of its own files (D29, §19 Z13)', async () => {
    const net = new FakeS5Network();
    // The old DocumentManager's own layout: {database}/{database}_{nameHash}_{ms}_{random}.
    await net.tab().fs.put(`home/documents/${ADDR}/research/research_-4061523_1760000000000_k3j9x`, new TextEncoder().encode('plaintext upload'));
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.purgedRoots).toEqual([`home/documents/${ADDR}`]);
    expect(net.filePaths()).toEqual([]);
  });

  test('managers/DocumentManager.uploadDocument stores the file sealed at an opaque path (D29)', async () => {
    const net = new FakeS5Network();
    const dm = new DocumentManager();
    Object.assign(dm as any, { initialized: true, userAddress: ADDR, s5Client: net.tab(), sealer: em().getStorageSealer() });
    const result = await dm.uploadDocument(new File(['secret custody text'], 'custody-notes.txt', { type: 'text/plain' }), 'research');
    expect(net.writes).toHaveLength(1);
    const [w] = net.writes;
    expect(w.path).toMatch(/^home\/documents\/v1\/[0-9a-f]{32}$/);
    expect(result.s5Path).toBe(w.path);
    const text = Buffer.from(w.bytes).toString('latin1');
    for (const n of ['custody', 'secret', 'research', ADDR]) expect(`${w.path}${text}`).not.toContain(n);
    const key = w.path.split('/').pop();
    const opened = em().getStorageSealer().open(w.bytes, `docs/v1/${key}`);
    expect(new TextDecoder().decode(opened.value as Uint8Array)).toBe('secret custody text');
  });
});

describe('idempotent, never re-seals, fails safe', () => {
  test('a second run finds nothing to do and writes nothing', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    await store(net.tab()).migrateLegacyStorage();
    const writes = net.writes.length;
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toEqual([]);
    expect(net.writes.length).toBe(writes);
  });

  test('legacy bytes that already carry the seal are never sealed again (anomaly; left in place)', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const sealed = em().getStorageSealer().seal({ kind: 'cbor', value: { name: 'weird' } }, 'x');
    await tab.fs.put(`${legacyDir('weird')}/manifest.json`, sealed);
    const writes = net.writes.length;
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'weird', status: 'anomaly' }]);
    expect(net.writes.length).toBe(writes);
    expect(legacyFiles(net)).toEqual([`${legacyDir('weird')}/manifest.json`]);
  });

  test('a read failure leaves the legacy data intact and reports failed; a later run completes', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    net.fail('get', `${legacyDir('research')}/chunk-0.json`, 'dir404', 3);   // outlasts the read retries (§16 V6)
    const first = await store(net.tab()).migrateLegacyStorage();
    expect(first.databases).toMatchObject([{ name: 'research', status: 'failed' }]);
    expect(legacyFiles(net).length).toBeGreaterThan(0);
    expect(net.filePaths().some((p) => p.startsWith('home/rag/'))).toBe(false);
    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases).toMatchObject([{ name: 'research', status: 'migrated' }]);
    expect(legacyFiles(net)).toEqual([]);
  });

  test('a sealed copy the portal did not store as written fails verification: legacy data stays', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    const tab = net.tab();
    const put = tab.fs.put;
    tab.fs.put = async (path: string, data: any, o?: any) => put(path, path.includes('/documents/') ? new Uint8Array([...data].reverse()) : data, o);
    const report = await new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash }).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'research', status: 'failed' }]);
    expect(legacyFiles(net)).toContain(`${legacyDir('research')}/documents/d1.txt`);
    expect(legacyFiles(net)).toContain(`${legacyDir('research')}/manifest.json`);
  });

  test('a leftover beside a sealed copy that can no longer be read is NOT purged', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    net.fail('delete', `${legacyDir('research')}/chunk-0.json`, 'network', 2);   // phase A and phase B (§16 V1)
    await store(net.tab()).migrateLegacyStorage();
    const sealedChunk = net.filePaths().find((p) => /home\/rag\/v1\/[0-9a-f]+\/chunk-0$/.test(p))!;
    const e: any = net.dirs.get(sealedChunk.split('/').slice(0, -1).join('/'))!.get('chunk-0');
    net.blobs.delete(e.hash); // the sealed copy is gone from the portal
    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases).toMatchObject([{ name: 'research', status: 'failed' }]);
    expect(legacyFiles(net)).toContain(`${legacyDir('research')}/manifest.json`);
  });

  test('a crash between the sealed commit and the purge: the next run purges our own leftover', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    net.fail('delete', `${legacyDir('research')}/chunk-0.json`, 'network', 2);   // phase A and phase B (§16 V1)
    const first = await store(net.tab()).migrateLegacyStorage();
    // The sealed copy is committed and verified: migrated; the plaintext is kept for the next run (§14 S1).
    expect(first.databases[0]).toMatchObject({ status: 'migrated', legacyKept: true });
    expect(legacyFiles(net)).toContain(`${legacyDir('research')}/manifest.json`); // the manifest goes last
    const second = await store(net.tab()).migrateLegacyStorage();
    expect(second.databases).toMatchObject([{ name: 'research', status: 'purged-leftover' }]);
    expect(legacyFiles(net)).toEqual([]);
    expect((await store(net.tab()).listVectors('research')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });
});

describe('outdated tabs after migration (D18)', () => {
  test('keeps documents uploaded after migration, resurrects nothing deleted since, never merges legacy vectors', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research', { docs: [{ id: 'd1' }, { id: 'later-deleted' }], bodies: { d1: 'one', 'later-deleted': 'gone' } });
    const s = store(net.tab());
    await s.migrateLegacyStorage();
    await s.removeDocument('research', 'later-deleted');
    // An outdated tab (old SDK, old UI) writes the database again at the legacy path:
    await legacyDb(net.tab(), 'research', {
      docs: [{ id: 'd1' }, { id: 'later-deleted' }, { id: 'uploaded-in-old-tab' }],
      bodies: { 'uploaded-in-old-tab': 'new body' },
      chunks: [[vec('ghost')]],
    });
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'research', status: 'adopted-after-seal', adopted: ['uploaded-in-old-tab'] }]);
    expect(report.databases[0].discarded).toContain('later-deleted');
    expect(legacyFiles(net)).toEqual([]);
    const fresh = store(net.tab());
    const meta: any = await fresh.getDatabaseMetadata('research');
    expect([...meta.pendingDocuments, ...meta.readyDocuments].map((d: any) => d.id).sort()).toEqual(['d1', 'uploaded-in-old-tab']);
    expect(await fresh.getDocumentBody('research', 'uploaded-in-old-tab')).toBe('new body');
    expect((await fresh.listVectors('research')).map((v) => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('legacy data written after the database was deleted is purged, not resurrected', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'research', owner: ADDR });
    await s.deleteDatabase('research');
    await legacyDb(net.tab(), 'research');
    const report = await store(net.tab()).migrateLegacyStorage();
    expect(report.databases).toMatchObject([{ name: 'research', status: 'purged-after-delete' }]);
    expect(net.filePaths()).toEqual([]);
  });
});

describe('upgrade on write (D12) and concurrency', () => {
  test('the first write to a legacy database migrates it, then applies the write sealed', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    const s = store(net.tab());
    await s.addVectors('research', [vec('v3')]);
    expect(legacyFiles(net)).toHaveLength(3);           // an upgrade-on-write never purges (§16 V1) …
    expect(net.writes.filter((w) => w.path.startsWith('home/vector-databases/'))).toHaveLength(3); // only the fixture's own writes
    await store(net.tab()).migrateLegacyStorage();      // … the next background run does
    expect(legacyFiles(net)).toEqual([]);
    expect((await store(net.tab()).listVectors('research')).map((v) => v.id).sort()).toEqual(['v1', 'v2', 'v3']);
    expect(await store(net.tab()).getDocumentBody('research', 'd1')).toBe('the body of d1');
  });

  test('a document added in another tab during the migration is not lost', async () => {
    const net = new FakeS5Network();
    await legacyDb(net.tab(), 'research');
    net.latencyMs = 2;
    const mk = browserOrigin();
    const a = store(net.tab(), { coherence: mk() });
    const b = store(net.tab(), { coherence: mk() });
    await Promise.all([a.migrateLegacyStorage(), b.addPendingDocument('research', { id: 'from-b' })]);
    const meta: any = await store(net.tab()).getDatabaseMetadata('research');
    expect(meta.pendingDocuments.map((d: any) => d.id).sort()).toEqual(['d1', 'from-b']);
    expect(legacyFiles(net)).toEqual([]);
  });
});
