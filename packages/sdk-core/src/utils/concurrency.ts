// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Concurrency utilities for bounded parallel async work.
 */

/**
 * Run `fn` over `items` with at most `limit` calls in flight at any time.
 *
 * Sliding-window scheduler: each worker picks up the next item as soon as its
 * previous one resolves, so total throughput is gated by `limit` rather than
 * by the slowest item in any fixed batch. Order of `results` matches order of
 * `items`.
 *
 * If `fn` rejects for an item, the entire returned promise rejects (matching
 * `Promise.all` semantics). If callers want per-item error isolation, the
 * caller's `fn` should catch and translate the failure into a sentinel value
 * (e.g. `null`) rather than throwing.
 */
export async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit <= 0) {
    throw new Error(`mapWithConcurrency: limit must be > 0 (got ${limit})`);
  }
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
