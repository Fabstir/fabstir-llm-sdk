// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 2 — cross-tab coherence (plan D8, D14 tombstones, I4).
 *
 * The lock serialises each read-modify-write across tabs; the lock holder commits a head record to IndexedDB, which
 * vouches for the SDK's in-memory caches and carries tombstones (§19 Z5 — never over a fresh read). Outside a
 * browser there are no other tabs: a module-level in-process mutex and head map are the complete semantics.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { FakeLockManager } from '../../helpers/fake-locks';
import { createRagCoherence, __resetInProcessCoherenceForTests } from '../../../src/storage/sealed/rag-coherence';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => __resetInProcessCoherenceForTests());

describe('in-process coherence (no window)', () => {
  test('serialises two writers on the same database; different databases run concurrently', async () => {
    const c = createRagCoherence({ isBrowser: false });
    const log: string[] = [];
    const run = (db: string, tag: string) => c.withLock(db, async () => {
      log.push(`${tag}+`);
      await sleep(20);
      log.push(`${tag}-`);
    });
    await Promise.all([run('db1', 'a'), run('db1', 'b'), run('db2', 'c')]);
    expect(log.indexOf('a-')).toBeLessThan(log.indexOf('b+'));
    expect(log.indexOf('c+')).toBeLessThan(log.indexOf('a-'));
  });

  test('two SDK instances in one process share the mutex and the heads', async () => {
    const one = createRagCoherence({ isBrowser: false });
    const two = createRagCoherence({ isBrowser: false });
    const log: string[] = [];
    await Promise.all([
      one.withLock('db', async () => { log.push('1+'); await sleep(20); log.push('1-'); await one.putHead('db', { revision: 1, manifestHash: 'aa' }); }),
      two.withLock('db', async () => { log.push('2+'); expect(await two.getHead('db')).toMatchObject({ revision: 1 }); log.push('2-'); }),
    ]);
    expect(log).toEqual(['1+', '1-', '2+', '2-']);
  });

  test('heads round-trip, list, and carry tombstones', async () => {
    const c = createRagCoherence({ isBrowser: false });
    expect(await c.getHead('db')).toBeUndefined();
    await c.putHead('db', { revision: 3, manifestHash: 'ab' });
    await c.putHead('gone', { revision: 5, deleted: true });
    expect(await c.getHead('db')).toEqual({ revision: 3, manifestHash: 'ab', at: expect.any(Number) }); // stamped (§15 T2)
    expect(Object.fromEntries(await c.listHeads())).toEqual({
      db: { revision: 3, manifestHash: 'ab', at: expect.any(Number) },
      gone: { revision: 5, deleted: true, at: expect.any(Number) },
    });
  });

  test('a waiter that times out fails with RAG_LOCK_TIMEOUT and never runs late', async () => {
    const c = createRagCoherence({ isBrowser: false, lockTimeoutMs: 30 });
    let ran = false;
    const holder = c.withLock('db', () => sleep(100));
    const err: any = await c.withLock('db', async () => { ran = true; }).catch((e) => e);
    expect(err.code).toBe('RAG_LOCK_TIMEOUT');
    await holder;
    await sleep(20);
    expect(ran).toBe(false);
  });

  test('a failing critical section releases the lock', async () => {
    const c = createRagCoherence({ isBrowser: false });
    await expect(c.withLock('db', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await c.withLock('db', async () => 'next')).toBe('next');
  });
});

describe('browser coherence (Web Locks + IndexedDB, injected)', () => {
  function twoTabs(lockTimeoutMs?: number) {
    const locks = new FakeLockManager();
    const indexedDB = new IDBFactory();
    const mk = () => createRagCoherence({ isBrowser: true, locks: locks as any, indexedDB: indexedDB as any, lockTimeoutMs });
    return { locks, a: mk(), b: mk() };
  }

  test('the lock is named per database and is exclusive across tabs', async () => {
    const { locks, a, b } = twoTabs();
    const log: string[] = [];
    await Promise.all([
      a.withLock('db1', async () => { log.push('a+'); await sleep(20); log.push('a-'); }),
      b.withLock('db1', async () => { log.push('b+'); log.push('b-'); }),
    ]);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-']);
    expect(locks.acquired).toEqual(['fabstir-rag:db1', 'fabstir-rag:db1']);
  });

  test('a head committed inside tab A\'s lock is what tab B reads once it holds the lock', async () => {
    const { a, b } = twoTabs();
    await Promise.all([
      a.withLock('db', async () => { await sleep(10); await a.putHead('db', { revision: 7, manifestHash: 'cafe' }); }),
      (async () => { await sleep(1); return b.withLock('db', async () => expect(await b.getHead('db')).toMatchObject({ revision: 7, manifestHash: 'cafe' })); })(),
    ]);
    expect(Object.fromEntries(await b.listHeads())).toHaveProperty('db');
  });

  test('a tab that cannot get the lock in time fails with RAG_LOCK_TIMEOUT and does not run', async () => {
    const { a, b } = twoTabs(50);
    let ran = false;
    const holder = a.withLock('db', () => sleep(200));
    const err: any = await b.withLock('db', async () => { ran = true; }).catch((e) => e);
    expect(err.code).toBe('RAG_LOCK_TIMEOUT');
    expect(ran).toBe(false);
    await holder;
  });

  test('the lock is not reentrant: a nested acquire of the same database times out (callers use *Locked internals)', async () => {
    const { a } = twoTabs(50);
    const err: any = await a.withLock('db', () => a.withLock('db', async () => 'inner')).catch((e) => e);
    expect(err.code).toBe('RAG_LOCK_TIMEOUT');
  });

  test('a browser without navigator.locks or indexedDB fails closed (RAG_COHERENCE_UNAVAILABLE)', async () => {
    const noLocks = createRagCoherence({ isBrowser: true, locks: undefined, indexedDB: new IDBFactory() as any });
    await expect(noLocks.withLock('db', async () => 1)).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    const noIdb = createRagCoherence({ isBrowser: true, locks: new FakeLockManager() as any, indexedDB: undefined });
    await expect(noIdb.getHead('db')).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    await expect(noIdb.putHead('db', { revision: 1 })).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
  });

  test('a head that fails to commit is an error to the writer, not a silent success', async () => {
    // Minimal IndexedDB whose readwrite transactions abort at commit (quota, eviction, a closing tab).
    const failingFactory = {
      open() {
        const req: any = {};
        const db = {
          transaction(_s: string, mode: string) {
            const tx: any = { objectStore: () => ({ put: () => ({}), get: () => ({}) }) };
            if (mode === 'readwrite') setTimeout(() => tx.onabort?.(), 0);
            tx.error = new Error('QuotaExceededError');
            return tx;
          },
        };
        setTimeout(() => { req.result = db; req.onsuccess?.(); }, 0);
        return req;
      },
    };
    const c = createRagCoherence({ isBrowser: true, locks: new FakeLockManager() as any, indexedDB: failingFactory as any });
    // One error shape for every head-store failure (§17 W3), the abort kept as the cause.
    await expect(c.putHead('db', { revision: 1 })).rejects.toMatchObject({
      code: 'RAG_COHERENCE_UNAVAILABLE', details: { cause: { message: 'QuotaExceededError' } },
    });
  });

  test('the defaults read the real globals: in Node (no window) the in-process path is used', async () => {
    const c = createRagCoherence();
    expect(await c.withLock('db', async () => 'ok')).toBe('ok');
  });
});
