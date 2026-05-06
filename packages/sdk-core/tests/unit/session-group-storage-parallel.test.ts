// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression guard: SessionGroupStorage.loadAll() must run per-group fetches
 * in parallel (bounded by LOAD_ALL_CONCURRENCY = 10), not sequentially.
 *
 * The bug this prevents: a previous implementation used a `for...of` loop
 * with `await` inside, multiplying per-group latency (~3.5s per S5 fetch +
 * decrypt) by the number of groups (e.g. 70s for 20 groups). Bounded
 * parallelism brings cold-path total to ~ceil(N/10) * single-load-time.
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';
import type { SessionGroup } from '../../src/types/session-groups.types';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function makeFakeGroup(id: string): SessionGroup {
  return {
    id,
    name: `Group ${id}`,
    owner: '0xowner',
    chatSessions: [],
    chatSessionsData: {},
    documents: [],
    sharedWith: [],
    permissions: {},
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as SessionGroup;
}

function makeFakeS5Client(entryNames: string[]) {
  return {
    fs: {
      async *list(_dirPath: string) {
        for (const name of entryNames) {
          yield { type: 'file', name };
        }
      },
    },
  };
}

describe('SessionGroupStorage.loadAll — parallel cold-path fetches', () => {
  it('runs per-group loads in parallel with at most LOAD_ALL_CONCURRENCY=10 in flight', async () => {
    const groupIds = Array.from({ length: 25 }, (_, i) => `g${i}`);
    const entryNames = groupIds.map((id) => `${id}.json`);
    const s5Client = makeFakeS5Client(entryNames);

    const storage = new SessionGroupStorage(s5Client, 'seed', '0xowner');

    let inFlight = 0;
    let peak = 0;
    const loadDelayMs = 30;

    const loadSpy = vi
      .spyOn(storage, 'load')
      .mockImplementation(async (groupId: string) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await wait(loadDelayMs);
        inFlight--;
        return makeFakeGroup(groupId);
      });

    const start = Date.now();
    const groups = await storage.loadAll();
    const elapsed = Date.now() - start;

    // All 25 loaded
    expect(loadSpy).toHaveBeenCalledTimes(25);
    expect(groups).toHaveLength(25);

    // Peak in-flight respects the cap
    expect(peak).toBeGreaterThanOrEqual(2); // proves we ran SOMETHING in parallel
    expect(peak).toBeLessThanOrEqual(10);

    // Sequential would be 25 * 30 = 750ms.
    // Parallel @ 10 = ceil(25/10) * 30 = 90ms minimum (plus jitter).
    // Anything under ~400ms proves we're not sequential.
    expect(elapsed).toBeLessThan(400);
  });

  it('isolates per-group failures: one bad group does not reject the whole batch', async () => {
    const entryNames = ['ok1.json', 'bad.json', 'ok2.json'];
    const s5Client = makeFakeS5Client(entryNames);
    const storage = new SessionGroupStorage(s5Client, 'seed', '0xowner');

    vi.spyOn(storage, 'load').mockImplementation(async (groupId: string) => {
      if (groupId === 'bad') throw new Error('decrypt failed');
      return makeFakeGroup(groupId);
    });

    const groups = await storage.loadAll();

    // Bad group dropped, good ones returned
    expect(groups.map((g) => g.id).sort()).toEqual(['ok1', 'ok2']);
  });

  it('preserves input order in the returned array', async () => {
    const entryNames = ['a.json', 'b.json', 'c.json', 'd.json'];
    const s5Client = makeFakeS5Client(entryNames);
    const storage = new SessionGroupStorage(s5Client, 'seed', '0xowner');

    // Make later-indexed groups resolve faster — sliding-window without order
    // preservation would jumble the result.
    vi.spyOn(storage, 'load').mockImplementation(async (groupId: string) => {
      const delay = ({ a: 40, b: 30, c: 20, d: 10 } as Record<string, number>)[groupId] ?? 0;
      await wait(delay);
      return makeFakeGroup(groupId);
    });

    const groups = await storage.loadAll();
    expect(groups.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns empty array when directory has no .json entries', async () => {
    const s5Client = makeFakeS5Client(['readme.txt', 'subdir']);
    const storage = new SessionGroupStorage(s5Client, 'seed', '0xowner');
    vi.spyOn(storage, 'load').mockImplementation(async () => makeFakeGroup('unused'));

    const groups = await storage.loadAll();
    expect(groups).toEqual([]);
  });
});
