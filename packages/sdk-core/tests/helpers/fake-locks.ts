// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { IDBFactory } from 'fake-indexeddb';
import { createRagCoherence, type RagCoherence } from '../../src/storage/sealed/rag-coherence';

/**
 * A Web Locks `LockManager` fake: exclusive, FIFO per name, NOT reentrant (a nested request for a held
 * name waits like any other), and `signal` aborts a waiting request with an AbortError — the three
 * properties of `navigator.locks.request(name, { signal }, callback)` the RAG coherence layer relies on.
 * One instance = one browser origin; share it between "tabs".
 */
export class FakeLockManager {
  private queues = new Map<string, Array<() => void>>();
  private held = new Set<string>();
  readonly acquired: string[] = [];

  async request<T>(name: string, options: { signal?: AbortSignal }, callback: () => Promise<T>): Promise<T> {
    await this.acquire(name, options.signal);
    this.acquired.push(name);
    try {
      return await callback();
    } finally {
      this.release(name);
    }
  }

  private acquire(name: string, signal?: AbortSignal): Promise<void> {
    if (!this.held.has(name)) {
      this.held.add(name);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const q = this.queues.get(name) ?? [];
      const grant = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
      const onAbort = () => {
        const i = q.indexOf(grant);
        if (i >= 0) q.splice(i, 1);
        reject(Object.assign(new Error('The request was aborted.'), { name: 'AbortError' }));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      q.push(grant);
      this.queues.set(name, q);
    });
  }

  private release(name: string): void {
    const next = this.queues.get(name)?.shift();
    if (next) next(); // the lock passes straight to the next waiter
    else this.held.delete(name);
  }
}

/**
 * One browser origin: a shared lock manager and IndexedDB. Each call of the returned factory is one tab's
 * coherence layer over them.
 */
export function browserOrigin(opts: { lockTimeoutMs?: number; now?: () => number } = {}): () => RagCoherence {
  const locks = new FakeLockManager();
  const indexedDB = new IDBFactory();
  return () => createRagCoherence({ isBrowser: true, locks: locks as any, indexedDB: indexedDB as any, ...opts });
}
