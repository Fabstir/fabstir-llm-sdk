// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 14 — storage-level classes (plan §27 HH6, HH7, HH11).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { __resetInProcessCoherenceForTests } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, chunks: number) => ({
  name, owner: ADDR, vectorCount: chunks, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: Array.from({ length: chunks }, (_, i) => ({ chunkId: i, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 })),
  chunkCount: chunks, folderPaths: [], pendingDocuments: [],
});

function store(tab: FakeS5Tab) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash });
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** Rejections nobody handled while `run` ran (and a turn after). */
async function unhandledDuring(run: () => Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => { seen.push(reason); };
  process.on('unhandledRejection', listener);
  try {
    await run();
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off('unhandledRejection', listener);
  }
  return seen;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('HH7 — a folder a call matches, or renames to, is a non-blank string', () => {
  async function foldered() {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.createDatabase({ name: 'kb', owner: ADDR });
    await s.addVectors('kb', [
      { id: 'in-a', vector: [0.1], metadata: { folderPath: '/a' } },
      { id: 'root-1', vector: [0.2], metadata: {} },
      { id: 'root-2', vector: [0.3] },
    ] as any);
    return s;
  }

  for (const [label, call] of [
    ['deleteFolder with no folder', (s: S5VectorStore) => s.deleteFolder('kb', undefined as any)],
    ['deleteFolder with a blank folder', (s: S5VectorStore) => s.deleteFolder('kb', '  ')],
    ['renameFolder from no folder', (s: S5VectorStore) => s.renameFolder('kb', undefined as any, '/x')],
    ['renameFolder to no folder', (s: S5VectorStore) => s.renameFolder('kb', '/a', undefined as any)],
    ['moveFolderContents from no folder', (s: S5VectorStore) => s.moveFolderContents('kb', undefined as any, '/x')],
  ] as const) {
    test(`${label}: RAG_FOLDER_PATH_INVALID, not retryable — no vector touched`, async () => {
      const s = await foldered();
      expect(await caught(call(s))).toMatchObject({ code: 'RAG_FOLDER_PATH_INVALID', details: { retryable: false } });
      const left = await s.listVectors('kb');
      expect(left.map((v) => [v.id, v.metadata?.folderPath])).toEqual(expect.arrayContaining([['in-a', '/a'], ['root-1', undefined], ['root-2', undefined]]));
      expect(left).toHaveLength(3);
    });
  }

  test('a named folder still deletes exactly its vectors', async () => {
    const s = await foldered();
    expect(await s.deleteFolder('kb', '/a')).toBe(1);
    expect((await s.listVectors('kb')).map((v) => v.id).sort()).toEqual(['root-1', 'root-2']);
  });
});

describe('HH11 — GG7: an invalid filter is refused before anything is read', () => {
  test('on an unmigrated legacy database: nothing is written, the legacy files stay', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', 1));
    await t.fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v1', vector: [0.1], metadata: {} }] });
    const writes = net.writes.length;
    expect(await caught(store(net.tab()).deleteByMetadata('kb', {}))).toMatchObject({ code: 'RAG_FILTER_INVALID' });
    expect(net.writes.length).toBe(writes);
    expect(net.filePaths().filter((p) => p.startsWith(legacyDir('kb'))).sort())
      .toEqual([`${legacyDir('kb')}/chunk-0.json`, `${legacyDir('kb')}/manifest.json`]);
  });

  test('on a database that does not exist: RAG_FILTER_INVALID, not RAG_DATABASE_NOT_FOUND', async () => {
    expect(await caught(store(new FakeS5Network().tab()).deleteByMetadata('nothing', { documentId: undefined })))
      .toMatchObject({ code: 'RAG_FILTER_INVALID' });
  });
});

describe('HH6 — an async progress callback that rejects is caught too', () => {
  test('the RAG migration finishes, and no rejection is left unhandled', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${legacyDir('kb')}/manifest.json`, legacyManifest('kb', 1));
    await net.tab().fs.put(`${legacyDir('kb')}/chunk-0.json`, { chunkId: 0, vectors: [{ id: 'v1', vector: [0.1], metadata: {} }] });
    let report: any;
    const unhandled = await unhandledDuring(async () => {
      report = await store(net.tab()).migrateLegacyStorage({ onProgress: async () => { throw new Error('UI state update failed'); } });
    });
    expect(report.databases[0]).toMatchObject({ status: 'migrated' });
    expect(unhandled).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('onProgress'), expect.any(Error));
  });
});
