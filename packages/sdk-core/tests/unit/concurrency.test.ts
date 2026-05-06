// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi } from 'vitest';
import { mapWithConcurrency } from '../../src/utils/concurrency';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('returns results in input order', async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('runs in parallel up to the limit (sliding window)', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await wait(20);
      inFlight--;
      return null;
    });

    expect(peak).toBe(3);
  });

  it('keeps workers busy: ~ceil(N/limit) batch-time on uniform-latency work', async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const start = Date.now();
    await mapWithConcurrency(items, 10, async () => {
      await wait(50);
    });
    const elapsed = Date.now() - start;

    // 30 items / concurrency 10 = 3 batches × 50ms = 150ms minimum.
    // Allow generous slop for Node timer jitter and CI scheduling.
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(450);
  });

  it('caps workerCount when items < limit (no idle worker overhead)', async () => {
    let started = 0;
    await mapWithConcurrency([1, 2], 100, async () => {
      started++;
      return null;
    });
    expect(started).toBe(2);
  });

  it('handles empty input without spawning workers', async () => {
    const fn = vi.fn();
    const out = await mapWithConcurrency([], 5, fn);
    expect(out).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects on first error (matches Promise.all semantics)', async () => {
    const err = new Error('boom');
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw err;
        return n;
      }),
    ).rejects.toBe(err);
  });

  it('throws on non-positive limit', async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(/limit must be > 0/);
    await expect(mapWithConcurrency([1], -1, async (n) => n)).rejects.toThrow(/limit must be > 0/);
  });

  it('passes the index of each item to the callback', async () => {
    const seen: Array<[unknown, number]> = [];
    await mapWithConcurrency(['a', 'b', 'c'], 2, async (item, i) => {
      seen.push([item, i]);
      return null;
    });
    expect(seen.sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });
});
