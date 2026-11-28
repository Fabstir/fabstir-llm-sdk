// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StorageManager reconnects to S5 without browser events (1.39.30, IMPLEMENTATION-S5-RECONNECT.md D1, D4, D6–D8):
 * the wiring of the reconnector and the gate into the manager.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

const h = vi.hoisted(() => ({
  s5: undefined as any,
  emit: undefined as undefined | ((s: string) => void),
  // A hook into the start: runs at ensureIdentityInitialized (the last S5 step of initialize()).
  duringInit: undefined as undefined | (() => Promise<void> | void),
}));

vi.mock('@julesl23/s5js', () => ({
  isS5RegistryUnavailableError: () => false,
  S5: {
    create: vi.fn(async () => {
      h.emit = undefined;
      h.s5 = {
        portalUp: true,
        recoverIdentityFromSeedPhrase: vi.fn(async () => {}),
        registerOnNewPortal: vi.fn(async () => {}),
        getConnectionStatus: vi.fn(() => 'connected'),
        onConnectionChange: vi.fn((cb: (s: string) => void) => { h.emit = cb; cb('connected'); return () => { h.emit = undefined; }; }),
        // As s5js: connecting, then connected (portal up) or a throw after its 10 s poll.
        reconnect: vi.fn(async () => {
          h.emit?.('connecting');
          if (h.s5.portalUp) { h.emit?.('connected'); return; }
          await new Promise((r) => setTimeout(r, 10_000));
          h.emit?.('disconnected');
          throw new Error('Reconnection timeout: failed to connect within 10 seconds');
        }),
        downloadByCID: vi.fn(async () => new Uint8Array([1])),
        fs: {
          ensureIdentityInitialized: vi.fn(async () => { await h.duringInit?.(); }),
          put: vi.fn(async () => {}),
          get: vi.fn(async () => ({ data: 'v' })),
          delete: vi.fn(async () => true),
          getMetadata: vi.fn(async () => null),
          list: vi.fn(async function* () { yield { name: 'a', type: 'file' }; }),
        },
      };
      return h.s5;
    }),
  },
}));

import { StorageManager } from '../../src/managers/StorageManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';

describe('StorageManager reconnect (1.39.30)', () => {
  let sm: StorageManager;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    h.duringInit = undefined;
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sm = new StorageManager('wss://test-portal');
  });

  afterEach(() => {
    sm.cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs in Node: no document, no window', () => {
    expect(typeof (globalThis as any).document).toBe('undefined');
    expect(typeof (globalThis as any).window).toBe('undefined');
  });

  it('R1: a drop in Node reconnects by itself, with no restart and no browser event', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    expect(sm.getConnectionStatus()).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(1000 + 10_000);   // one failed attempt
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    h.s5.portalUp = true;
    await vi.advanceTimersByTimeAsync(2000);            // the next attempt finds the portal back
    expect(h.s5.reconnect).toHaveBeenCalledTimes(2);
    expect(sm.getConnectionStatus()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R4: a write through getS5Client().fs while disconnected waits for the reconnect, then lands', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    await sm.getS5Client().fs.put('home/x', { a: 1 });
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/x', { a: 1 });
    expect(h.s5.reconnect.mock.invocationCallOrder[0]).toBeLessThan(h.s5.fs.put.mock.invocationCallOrder[0]);
    expect(sm.getConnectionStatus()).toBe('connected');
  });

  it('R4: a storage call while the portal stays down rejects STORAGE_OFFLINE after one attempt and never reaches s5js', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    const call = sm.getS5Client().fs.get('home/x').catch((e: any) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await call;
    expect(err.code).toBe('STORAGE_OFFLINE');
    expect(err.details.retryable).toBe(true);
    expect(h.s5.fs.get).not.toHaveBeenCalled();
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
  });

  it('R4: a read in the manager\'s own API is gated too (getWithRetry, downloadByCID)', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    expect(await sm.getWithRetry('home/x')).toEqual({ data: 'v' });
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    h.emit!('disconnected');
    await sm.getS5Client().downloadByCID(new Uint8Array(1));
    expect(h.s5.reconnect).toHaveBeenCalledTimes(2);
  });

  it('R4: connected — no attempt, no wait', async () => {
    await sm.initialize('test-seed', '0x1234');
    await sm.getS5Client().fs.put('home/x', 1);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
  });

  it('R5: the gate is open during initialize() (its own steps do not wait for a reconnect)', async () => {
    h.duringInit = () => { h.emit!('disconnected'); };
    await sm.initialize('test-seed', '0x1234');
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    expect(h.s5.fs.ensureIdentityInitialized).toHaveBeenCalled();
  });

  it('R5: a drop during initialize() is reconnected once the start completes', async () => {
    h.duringInit = () => { h.emit!('disconnected'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const started = sm.initialize('test-seed', '0x1234');
    await vi.advanceTimersByTimeAsync(0);
    await started;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    expect(sm.getConnectionStatus()).toBe('connected');
  });

  it('R6: disconnected → connecting → connected flushes the queue (F5)', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    const queued = sm.putWithRetry('home/q', { q: 1 });
    expect(sm.getPendingOperationCount()).toBe(1);
    h.emit!('connecting');
    h.emit!('connected');
    await queued;
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/q', { q: 1 });
    expect(sm.getPendingOperationCount()).toBe(0);
  });

  it('review MINOR 3: a drop during the flush leaves the rest queued, and the next reconnect sends it', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.emit!('disconnected');
    const a = sm.putWithRetry('home/a', 1);
    const b = sm.putWithRetry('home/b', 2);
    h.s5.portalUp = false;
    h.s5.fs.put.mockImplementationOnce(async () => { h.emit!('disconnected'); throw new Error('WebSocket is CLOSED'); });
    h.emit!('connected');                                 // the flush starts; its first put meets the drop
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sm.getPendingOperationCount()).toBe(2);
    expect(sm.getSyncStatus()).toBe('pending');
    h.s5.portalUp = true;
    await vi.advanceTimersByTimeAsync(60_000);            // the loop reconnects; the flush runs again
    await Promise.all([a, b]);
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/b', 2);
    expect(sm.getPendingOperationCount()).toBe(0);
  });

  it('a flush failure that comes with a drop keeps the write queued; one while connected rejects it', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    const kept = sm.putWithRetry('home/k', 1);
    h.s5.fs.put.mockImplementationOnce(async () => { h.emit!('disconnected'); throw new Error('boom'); });
    h.emit!('connected');
    await new Promise((r) => setImmediate(r));
    expect(sm.getPendingOperationCount()).toBe(1);
    h.emit!('connected');
    await kept;
    const failed = sm.putWithRetry('home/f', 2);   // connected now: not queued, rejects as before
    h.s5.fs.put.mockRejectedValueOnce(new Error('boom'));
    await expect(failed).rejects.toThrow('boom');
    h.emit!('disconnected');
    const rejected = sm.putWithRetry('home/r', 3);
    h.s5.fs.put.mockRejectedValueOnce(new Error('Permission denied'));
    h.emit!('connected');                          // the flush meets a plain failure while connected: rejected
    await expect(rejected).rejects.toThrow('Permission denied');
    expect(sm.getPendingOperationCount()).toBe(0);
  });

  it('putWithRetry while a reconnect is in progress (connecting) queues instead of failing', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    h.emit!('connecting');
    const p = sm.putWithRetry('home/c', 3);
    expect(sm.getPendingOperationCount()).toBe(1);
    h.emit!('connected');
    await p;
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/c', 3);
  });

  it('R6: a queued write drains after a reconnect the loop made, with no forceSync()', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.emit!('disconnected');
    const queued = sm.putWithRetry('home/q', { q: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await queued;
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/q', { q: 1 });
  });

  it('R7: the manager logs one line per state change, not one per s5js status or attempt', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    log.mockClear();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    await vi.advanceTimersByTimeAsync(1000 + 10_000 + 2000 + 10_000);  // two failed attempts
    h.s5.portalUp = true;
    await vi.advanceTimersByTimeAsync(4000);
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('S5'));
    expect(lines).toEqual([
      '[StorageManager] S5 connection lost; reconnecting',
      expect.stringMatching(/^\[StorageManager\] S5 reconnected after 3 attempts, \d+s$/),
    ]);
  });

  it('R3: cleanup() and dispose() stop the loop and leave no timer', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    sm.cleanup();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const other = new StorageManager('wss://test-portal');
    vi.useRealTimers();
    await other.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    other.dispose();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a second initialize() stops the first instance\'s loop', async () => {
    await sm.initialize('test-seed', '0x1234');
    const first = h.s5;
    const firstEmit = h.emit!;
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    first.portalUp = false;
    firstEmit('disconnected');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(first.reconnect).not.toHaveBeenCalled();
  });

  it('a second initialize() ends a backoff already pending on the first instance', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const start1 = sm.initialize('test-seed', '0x1234');
    await vi.advanceTimersByTimeAsync(0);
    await start1;
    const first = h.s5;
    first.portalUp = false;
    h.emit!('disconnected');                         // the first instance's loop is now waiting on a timer
    const start2 = sm.initialize('test-seed', '0x1234');
    await vi.advanceTimersByTimeAsync(0);
    await start2;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(first.reconnect).not.toHaveBeenCalled();
  });

  it('a replaced instance\'s late event does not change the status', async () => {
    await sm.initialize('test-seed', '0x1234');
    const firstEmit = h.emit!;
    await sm.initialize('test-seed', '0x1234');
    firstEmit('disconnected');
    expect(sm.getConnectionStatus()).toBe('connected');
    await sm.getS5Client().fs.put('x', 1);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
  });

  it('D6: a drop during a slow start dials nothing until the start completes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let reached = false;
    h.duringInit = async () => { h.emit!('disconnected'); reached = true; await new Promise((r) => setTimeout(r, 5000)); };
    const started = sm.initialize('test-seed', '0x1234');
    while (!reached) await new Promise((r) => setImmediate(r));   // the start's earlier steps run on real I/O
    await vi.advanceTimersByTimeAsync(4999);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    let done = false;
    void started.then(() => { done = true; });
    for (let i = 0; i < 100 && !done; i++) await vi.advanceTimersByTimeAsync(10);
    expect(done).toBe(true);
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
  });

  it('D6: a call through getS5Client() during the start does not wait for a reconnect', async () => {
    let during: Promise<unknown> | undefined;
    h.duringInit = () => { h.emit!('disconnected'); during = sm.getS5Client().fs.put('home/early', 1); };
    await sm.initialize('test-seed', '0x1234');
    await during;
    expect(h.s5.fs.put).toHaveBeenCalledWith('home/early', 1);
    expect(h.s5.reconnect.mock.invocationCallOrder[0] ?? Infinity).toBeGreaterThan(h.s5.fs.put.mock.invocationCallOrder[0]);
  });

  it('forceSync() with the portal still down resolves (as before), leaving the status disconnected', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    const done = sm.forceSync();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(done).resolves.toBeUndefined();
    expect(sm.getConnectionStatus()).toBe('disconnected');
  });

  it('whenConnected(): public, resolves when connected, waits for the reconnect, refuses before init and after dispose', async () => {
    await expect(sm.whenConnected()).rejects.toMatchObject({ code: 'STORAGE_NOT_INITIALIZED' });
    await sm.initialize('test-seed', '0x1234');
    await sm.whenConnected();
    expect(h.s5.reconnect).not.toHaveBeenCalled();
    h.emit!('disconnected');
    await sm.whenConnected();
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    sm.dispose();
    await expect(sm.whenConnected()).rejects.toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
  });

  it('forceSync() goes through the same single-flight attempt', async () => {
    await sm.initialize('test-seed', '0x1234');
    h.emit!('disconnected');
    await Promise.all([sm.forceSync(), sm.forceSync(), sm.getS5Client().fs.get('x')]);
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
  });

  it('an S5 without the connection API gets no reconnector and no gate', async () => {
    const { S5 } = await import('@julesl23/s5js');
    (S5.create as any).mockImplementationOnce(async () => ({
      recoverIdentityFromSeedPhrase: async () => {}, registerOnNewPortal: async () => {},
      fs: { ensureIdentityInitialized: async () => {}, put: vi.fn(async () => {}) },
    }));
    const old = new StorageManager();
    await old.initialize('test-seed', '0x1234');
    await old.getS5Client().fs.put('x', 1);
    expect(old.getConnectionStatus()).toBe('connected');
    old.cleanup();
  });

  it('capability flag s5AutoReconnect', () => {
    expect((SDK_CAPABILITIES as any).s5AutoReconnect).toBe(true);
  });
});

describe('StorageManager reconnect in a browser (R8)', () => {
  const listeners = new Map<string, () => void>();
  let sm: StorageManager;

  beforeEach(() => {
    listeners.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const target = (kind: string) => ({
      addEventListener: (t: string, fn: () => void) => listeners.set(`${kind}:${t}`, fn),
      removeEventListener: (t: string) => listeners.delete(`${kind}:${t}`),
    });
    vi.stubGlobal('document', { ...target('document'), visibilityState: 'visible' });
    vi.stubGlobal('window', target('window'));
    sm = new StorageManager('wss://test-portal');
  });

  afterEach(() => {
    sm.cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('online and visibilitychange still start an attempt at once', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.s5.portalUp = false;
    h.emit!('disconnected');
    listeners.get('window:online')!();
    await flushTimers();
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    h.s5.portalUp = true;
    listeners.get('document:visibilitychange')!();
    await flushTimers();
    expect(h.s5.reconnect).toHaveBeenCalledTimes(2);
    expect(sm.getConnectionStatus()).toBe('connected');
  });

  it('F2: a visible tab that stays online reconnects by itself after a portal restart', async () => {
    await sm.initialize('test-seed', '0x1234');
    vi.useFakeTimers();
    h.emit!('disconnected');
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.s5.reconnect).toHaveBeenCalledTimes(1);
    expect(sm.getConnectionStatus()).toBe('connected');
  });

  it('dispose() removes the browser listeners and stops the loop', async () => {
    await sm.initialize('test-seed', '0x1234');
    expect(listeners.size).toBe(2);
    sm.dispose();
    expect(listeners.size).toBe(0);
  });

  async function flushTimers() { await vi.advanceTimersByTimeAsync(0); }
});
