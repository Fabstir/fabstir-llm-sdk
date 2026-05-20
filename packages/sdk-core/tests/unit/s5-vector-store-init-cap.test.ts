// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression guard: S5VectorStore.initialize() must cap concurrent manifest
 * fetches at INIT_CONCURRENCY (= 10). The previous implementation used
 * unbounded Promise.all, which on portals with many databases triggered a
 * thundering-herd retry storm (each manifest has its own 5x exponential
 * backoff loop, and N parallel fetches all retrying at once compounded
 * latency rather than reducing it).
 */

import { describe, it, expect, vi } from 'vitest';
import { S5VectorStore } from '../../src/storage/S5VectorStore';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeFakeS5Client(directoryNames: string[]) {
  return {
    fs: {
      async *list(_basePath: string) {
        for (const name of directoryNames) {
          yield { type: 'directory', name };
        }
      },
    },
  };
}

function makeStore(directoryNames: string[]) {
  return new S5VectorStore({
    s5Client: makeFakeS5Client(directoryNames) as any,
    userAddress: '0xowner',
    encryptionManager: {} as any,
    cacheEnabled: true,
  });
}

describe('S5VectorStore.initialize — bounded concurrency on cold-path manifest fetches', () => {
  it('caps in-flight manifest fetches at INIT_CONCURRENCY (= 20) and finishes all of them', async () => {
    const dbCount = 30;
    const dirs = Array.from({ length: dbCount }, (_, i) => `db${i}`);
    const store = makeStore(dirs);

    let inFlight = 0;
    let peak = 0;

    const loadSpy = vi
      .spyOn(store as any, '_loadManifest')
      .mockImplementation(async (databaseName: any) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await wait(20);
        inFlight--;
        return {
          name: databaseName,
          owner: '0xowner',
          vectorCount: 0,
          storageSizeBytes: 0,
          created: 0,
          lastAccessed: 0,
          updated: 0,
          chunks: [],
          chunkCount: 0,
          folderPaths: [],
          deleted: false,
        };
      });

    await store.initialize();

    expect(loadSpy).toHaveBeenCalledTimes(dbCount);
    // Cap is 20. Allow some scheduling slop on the lower bound (must have
    // overlapped at least 2-way to prove it parallelized at all).
    expect(peak).toBeGreaterThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(20);

    // Sanity: all manifests landed in cache
    expect((await store.listDatabases()).length).toBe(dbCount);
  });

  it('still completes when some manifests fail (skip after retries, do not reject batch)', async () => {
    const dirs = ['ok1', 'flaky', 'ok2'];
    const store = makeStore(dirs);

    vi.spyOn(store as any, '_loadManifest').mockImplementation(async (databaseName: any) => {
      if (databaseName === 'flaky') {
        throw new Error('S5 read failed');
      }
      return {
        name: databaseName,
        owner: '0xowner',
        vectorCount: 0,
        storageSizeBytes: 0,
        created: 0,
        lastAccessed: 0,
        updated: 0,
        chunks: [],
        chunkCount: 0,
        folderPaths: [],
        deleted: false,
      };
    });

    await store.initialize();

    const dbs = (await store.listDatabases()).map((d) => d.databaseName).sort();
    expect(dbs).toEqual(['ok1', 'ok2']);
  }, 15_000);

  it('handles empty directory list without spawning workers', async () => {
    const store = makeStore([]);
    const loadSpy = vi.spyOn(store as any, '_loadManifest');
    await store.initialize();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('is idempotent under concurrent calls — second initialize() joins the in-flight first', async () => {
    // Critical for the 1.20.0 deferred-init pattern: SDK kicks off init in
    // the background while consumer code may also call initialize() directly.
    // Both should join one batch, not fan out two parallel sets of S5 fetches.
    const dirs = Array.from({ length: 5 }, (_, i) => `db${i}`);
    const store = makeStore(dirs);

    const loadSpy = vi
      .spyOn(store as any, '_loadManifest')
      .mockImplementation(async (databaseName: any) => {
        await wait(40);
        return {
          name: databaseName,
          owner: '0xowner',
          vectorCount: 0,
          storageSizeBytes: 0,
          created: 0,
          lastAccessed: 0,
          updated: 0,
          chunks: [],
          chunkCount: 0,
          folderPaths: [],
          deleted: false,
        };
      });

    // Fire two initialize() calls concurrently. Without in-flight tracking,
    // each call would invoke _loadManifest 5 times for 10 total. With it,
    // both join the same batch for 5 total.
    await Promise.all([store.initialize(), store.initialize()]);

    expect(loadSpy).toHaveBeenCalledTimes(5);
    expect((await store.listDatabases()).length).toBe(5);
  });
});
