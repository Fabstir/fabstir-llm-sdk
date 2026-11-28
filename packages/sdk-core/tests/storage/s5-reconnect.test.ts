// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 reconnect without browser events (1.39.30, IMPLEMENTATION-S5-RECONNECT.md D2–D5, D8): the reconnector's loop and
 * the connection gate on the S5 surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FS5, S5 } from '@julesl23/s5js';
import { S5Reconnector, S5_RECONNECT_DELAYS_MS, S5_STABLE_LINK_MS } from '../../src/storage/s5-reconnect';
import { withConnectionGate, GATED_FS_METHODS, GATED_S5_METHODS, UNGATED_S5_METHODS } from '../../src/storage/s5-guards';

type Status = 'connected' | 'connecting' | 'disconnected';

/** An s5js P2P as F3 describes it: `reconnect()` notifies connecting, then connects or (after 10 s) throws. */
function fakeP2P() {
  const p = {
    up: false,               // whether the portal accepts a connection
    inFlight: 0, maxInFlight: 0, calls: 0,
    onStatus: (_s: Status) => {},
    reconnect: vi.fn(async () => {
      p.calls++; p.inFlight++; p.maxInFlight = Math.max(p.maxInFlight, p.inFlight);
      try {
        p.onStatus('connecting');
        if (p.up) { await Promise.resolve(); p.onStatus('connected'); return; }
        await new Promise((r) => setTimeout(r, 10_000));
        p.onStatus('disconnected');
        throw new Error('Reconnection timeout: failed to connect within 10 seconds');
      } finally { p.inFlight--; }
    }),
  };
  return p;
}

function setup(random = () => 0) {
  const p2p = fakeP2P();
  const lines: string[] = [];
  const r = new S5Reconnector({ reconnect: p2p.reconnect }, { random, log: (l) => lines.push(l) });
  p2p.onStatus = (s) => r.onStatus(s);
  r.onStatus('connected');
  return { p2p, r, lines };
}

describe('S5Reconnector (D2, D3, D8)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('R1: a drop starts reconnecting with no browser event, and a portal that is back reconnects it', async () => {
    const { p2p, r } = setup();
    r.onStatus('disconnected');
    expect(p2p.calls).toBe(0);
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(S5_RECONNECT_DELAYS_MS[0]);
    expect(p2p.calls).toBe(1);
    expect(r.status).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
    r.stop();
  });

  it('R2: delays follow 1,2,4,8,16,32,60 s capped, equal jitter, one attempt at a time', async () => {
    expect(S5_RECONNECT_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000]);
    const { p2p, r } = setup(() => 0); // jitter 0 → half the delay
    r.onStatus('disconnected');
    const starts: number[] = [];
    p2p.reconnect.mockImplementation(async () => {
      starts.push(Date.now());
      p2p.calls++; p2p.inFlight++; p2p.maxInFlight = Math.max(p2p.maxInFlight, p2p.inFlight);
      try { await new Promise((res) => setTimeout(res, 10_000)); throw new Error('Reconnection timeout'); } finally { p2p.inFlight--; }
    });
    const t0 = Date.now();
    await vi.advanceTimersByTimeAsync(1_000_000);
    const gaps = starts.map((s, i) => s - (i === 0 ? t0 : starts[i - 1] + 10_000));
    expect(gaps.slice(0, 9)).toEqual([500, 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(p2p.maxInFlight).toBe(1);
    r.stop();
  });

  it('R2: random 1 gives the full delay', async () => {
    const { p2p, r } = setup(() => 1);
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(999);
    expect(p2p.calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(p2p.calls).toBe(1);
    r.stop();
  });

  it('R3: a connected event ends the loop without an attempt', async () => {
    const { p2p, r } = setup();
    r.onStatus('disconnected');
    r.onStatus('connected');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(p2p.calls).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R3: stop() ends the loop and leaves no timer, even with an attempt in flight', async () => {
    const { p2p, r } = setup();
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(600);
    expect(p2p.calls).toBe(1);
    r.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(p2p.calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R3: connecting flicker is not a drop', async () => {
    const { p2p, r, lines } = setup();
    r.onStatus('connecting');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(p2p.calls).toBe(0);
    expect(lines).toEqual([]);
    r.stop();
  });

  it('the backoff timer does not keep a Node process alive (unref)', () => {
    vi.useRealTimers();
    const unref = vi.fn();
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((..._a: any[]) => ({ unref })) as any);
    try {
      const { r } = setup();
      r.onStatus('disconnected');
      expect(unref).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); }
  });

  it('R7: logs one line per state change: lost, cap reached once, back', async () => {
    const { p2p, r, lines } = setup(() => 1);
    r.onStatus('disconnected');
    r.onStatus('disconnected'); // a second close of the same drop is not a new state
    await vi.advanceTimersByTimeAsync(1000 + 10_000 + 2000 + 10_000 + 4000 + 10_000 + 8000 + 10_000 + 16000 + 10_000 + 32000 + 10_000 + 60000 + 10_000 + 60000 + 10_000);
    expect(p2p.calls).toBe(8);
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.status).toBe('connected');
    expect(lines).toEqual([
      '[StorageManager] S5 connection lost; reconnecting',
      '[StorageManager] S5 still unreachable after 6 attempts; retrying every 60s',
      expect.stringMatching(/^\[StorageManager\] S5 reconnected after 9 attempts, \d+s$/),
    ]);
  });

  it('R7: a reconnect after one attempt says "1 attempt"', async () => {
    const { p2p, r, lines } = setup(() => 1);
    r.onStatus('disconnected');
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(lines[1]).toBe('[StorageManager] S5 reconnected after 1 attempt, 1s');
    r.stop();
  });
});

describe('S5Reconnector — a second outage, and after stop (mutation round 1)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a second outage after a stable link starts the backoff over at 1 s and counts its own attempts', async () => {
    const { p2p, r, lines } = setup(() => 1);
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(1000 + 10_000 + 2000 + 10_000);   // two failures: next step would be 4 s
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(4000);
    expect(r.status).toBe('connected');
    expect(S5_STABLE_LINK_MS).toBe(30_000);
    await vi.advanceTimersByTimeAsync(S5_STABLE_LINK_MS);
    p2p.up = false;
    lines.length = 0;
    const before = p2p.calls;
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(999);
    expect(p2p.calls).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(p2p.calls).toBe(before + 1);
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(10_000 + 2000);
    expect(lines[1]).toMatch(/after 2 attempts/);
    r.stop();
  });

  it('a second outage that reaches the cap logs the cap line again', async () => {
    const { p2p, r, lines } = setup(() => 1);
    const toCap = 1000 + 10_000 + 2000 + 10_000 + 4000 + 10_000 + 8000 + 10_000 + 16000 + 10_000 + 32000 + 10_000;
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(toCap);
    p2p.up = true;
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(S5_STABLE_LINK_MS);
    p2p.up = false;
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(toCap);
    expect(lines.filter((l) => l.includes('still unreachable'))).toHaveLength(2);
    r.stop();
  });

  it('after stop(), a status change logs nothing and starts nothing', async () => {
    const { p2p, r, lines } = setup();
    r.stop();
    r.onStatus('disconnected');
    r.onStatus('connected');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(lines).toEqual([]);
    expect(p2p.calls).toBe(0);
  });

  it('review MINOR 1: connected-then-dropped during an attempt leaves one timer, and stop() ends every dial', async () => {
    const { p2p, r } = setup(() => 1);
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(1000);            // the loop's attempt is in flight (portal down: 10 s)
    expect(p2p.calls).toBe(1);
    r.onStatus('connected');                            // the handshake completes...
    await vi.advanceTimersByTimeAsync(200);
    r.onStatus('disconnected');                         // ...and the link drops again while the attempt still runs
    expect(vi.getTimerCount()).toBe(1);                 // only the attempt's own 10 s wait
    await vi.advanceTimersByTimeAsync(10_000);          // the attempt fails and schedules the next step
    expect(vi.getTimerCount()).toBe(1);
    r.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(p2p.calls).toBe(1);
  });

  it('review MINOR 2: a portal that accepts and drops again within 30 s is not redialled every second', async () => {
    const { p2p, r } = setup(() => 1);
    p2p.up = true;
    const gaps: number[] = [];
    let last = Date.now();
    p2p.reconnect.mockImplementation(async () => { p2p.calls++; gaps.push(Date.now() - last); r.onStatus('connected'); });
    r.onStatus('disconnected');
    for (let i = 0; i < 8; i++) {
      const before = p2p.calls;
      while (p2p.calls === before) await vi.advanceTimersByTimeAsync(500);   // the next reconnect...
      last = Date.now();
      r.onStatus('disconnected');                       // ...drops at once (a flapping portal)
    }
    expect(gaps.slice(0, 8)).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    r.stop();
  });

  it('the 30 s window: a drop 29.999 s after a reconnect still counts as the same trouble', async () => {
    const { p2p, r } = setup(() => 1);
    p2p.up = true;
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(1000);            // reconnects on the first attempt
    expect(r.status).toBe('connected');
    await vi.advanceTimersByTimeAsync(S5_STABLE_LINK_MS - 1);
    r.onStatus('disconnected');
    const before = p2p.calls;
    await vi.advanceTimersByTimeAsync(1999);
    expect(p2p.calls).toBe(before);                     // step 1: 2 s, not 1 s
    await vi.advanceTimersByTimeAsync(1);
    expect(p2p.calls).toBe(before + 1);
    r.stop();
  });

  it('a call that starts an attempt cancels the pending backoff step (no early second dial)', async () => {
    const { p2p, r } = setup(() => 1);
    p2p.reconnect.mockImplementation(async () => { p2p.calls++; throw new Error('refused'); }); // fails at once
    r.onStatus('disconnected');                         // loop's step due at 1 s
    await expect(r.whenConnected()).rejects.toMatchObject({ code: 'STORAGE_OFFLINE' });
    expect(p2p.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1999);            // next step is 2 s after the call's failure, not the old 1 s
    expect(p2p.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p2p.calls).toBe(2);
    r.stop();
  });
});

describe('S5Reconnector.whenConnected — the gate (D4)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('R4: connected → resolves with no attempt', async () => {
    const { p2p, r } = setup();
    await r.whenConnected();
    expect(p2p.calls).toBe(0);
    r.stop();
  });

  it('R4: disconnected, none in flight → starts one now (no backoff wait) and resolves once connected', async () => {
    const { p2p, r } = setup(() => 1);
    r.onStatus('disconnected');
    p2p.up = true;
    await r.whenConnected();
    expect(p2p.calls).toBe(1);
    expect(r.status).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('R4: joins the attempt in flight (one dial for many callers)', async () => {
    const { p2p, r } = setup();
    r.onStatus('disconnected');
    await vi.advanceTimersByTimeAsync(500); // the loop's attempt is now in flight
    expect(p2p.calls).toBe(1);
    const results = [r.whenConnected(), r.whenConnected(), r.whenConnected()].map((p) => p.then(() => 'ok', (e) => e.code));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await Promise.all(results)).toEqual(['STORAGE_OFFLINE', 'STORAGE_OFFLINE', 'STORAGE_OFFLINE']);
    expect(p2p.calls).toBe(1);
    r.stop();
  });

  it('R4: a failed attempt rejects STORAGE_OFFLINE, retryable, and the backoff keeps growing', async () => {
    const { p2p, r } = setup(() => 1);
    r.onStatus('disconnected');
    const call = r.whenConnected().catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const err = await call;
    expect(err.code).toBe('STORAGE_OFFLINE');
    expect(err.details.retryable).toBe(true);
    expect(p2p.calls).toBe(1);
    // The call's attempt counted: the next loop attempt is 2 s away, not 1 s.
    await vi.advanceTimersByTimeAsync(1999);
    expect(p2p.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p2p.calls).toBe(2);
    r.stop();
  });

  it('R4: s5js reporting a joiner\'s failed attempt as success still rejects (judged by status, F3)', async () => {
    const { p2p, r } = setup();
    p2p.reconnect.mockImplementationOnce(async () => { p2p.calls++; }); // resolves, nothing connected
    r.onStatus('disconnected');
    await expect(r.whenConnected()).rejects.toMatchObject({ code: 'STORAGE_OFFLINE' });
    r.stop();
  });

  it('R4: the status is judged after the attempt even when reconnect() throws but a socket came up', async () => {
    const { p2p, r } = setup();
    p2p.reconnect.mockImplementationOnce(async () => { p2p.calls++; r.onStatus('connected'); throw new Error('late'); });
    r.onStatus('disconnected');
    await expect(r.whenConnected()).resolves.toBeUndefined();
    r.stop();
  });

  it('after stop(): connected passes, disconnected rejects STORAGE_CLEANUP (not retryable) without dialling', async () => {
    const { p2p, r } = setup();
    r.stop();
    await r.whenConnected();
    r.onStatus('disconnected');
    await expect(r.whenConnected()).rejects.toMatchObject({ code: 'STORAGE_CLEANUP', details: { retryable: false } });
    expect(p2p.calls).toBe(0);
  });

  it('review MINOR 4: a call waiting on an attempt when stop() comes rejects STORAGE_CLEANUP', async () => {
    const { r } = setup();
    r.onStatus('disconnected');
    const call = r.whenConnected().catch((e) => e);
    r.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await call).code).toBe('STORAGE_CLEANUP');
  });

  it('kick(): starts an attempt now while disconnected, nothing while connected', async () => {
    const { p2p, r } = setup();
    r.kick();
    expect(p2p.calls).toBe(0);
    r.onStatus('disconnected');
    r.kick();
    await vi.advanceTimersByTimeAsync(0);
    expect(p2p.calls).toBe(1);
    r.kick(); // joins
    expect(p2p.calls).toBe(1);
    r.stop();
  });
});

describe('withConnectionGate (D5)', () => {
  function gatedClient(gate: () => Promise<void>) {
    const calls: string[] = [];
    const fs: any = {
      put: vi.fn(async function (this: unknown, path: string) { calls.push(`put ${path}`); fs.lastThis = this; }),
      get: vi.fn(async (path: string) => { calls.push(`get ${path}`); return 'v'; }),
      list: vi.fn(async function* (path: string) { calls.push(`list ${path}`); yield { name: 'a' }; yield { name: 'b' }; }),
      ensureIdentityInitialized: vi.fn(async () => { calls.push('ensure'); }),
      _internal: vi.fn(async () => { calls.push('internal'); }),
      syncThing: vi.fn(() => 'sync'),
      api: { tag: 'api' },
    };
    const s5: any = {
      fs,
      reconnect: vi.fn(async () => { calls.push('reconnect'); }),
      getConnectionStatus: vi.fn(() => 'disconnected'),
      downloadByCID: vi.fn(async () => { calls.push('download'); return new Uint8Array(1); }),
      recoverIdentityFromSeedPhrase: vi.fn(async () => { calls.push('recover'); }),
    };
    return { s5, fs, calls, gated: withConnectionGate(s5, gate) as any };
  }

  it('R4: a gated call waits for the gate, then runs on the real object with its arguments', async () => {
    let open!: () => void;
    const gate = vi.fn(() => new Promise<void>((r) => { open = r; }));
    const { fs, calls, gated } = gatedClient(gate);
    const p = gated.fs.put('home/x', 1);
    await Promise.resolve();
    expect(calls).toEqual([]);
    open();
    await p;
    expect(calls).toEqual(['put home/x']);
    expect(fs.put).toHaveBeenCalledWith('home/x', 1);
    expect(fs.lastThis).toBe(fs);
  });

  it('R4: a gate rejection rejects the call and never reaches s5js', async () => {
    const offline = Object.assign(new Error('offline'), { code: 'STORAGE_OFFLINE' });
    const { calls, gated } = gatedClient(() => Promise.reject(offline));
    await expect(gated.fs.get('home/x')).rejects.toBe(offline);
    await expect(gated.downloadByCID(new Uint8Array(1))).rejects.toBe(offline);
    expect(calls).toEqual([]);
  });

  it('R4: list waits for the gate on its first next(), then yields every entry', async () => {
    let open!: () => void;
    const gate = vi.fn(() => new Promise<void>((r) => { open = r; }));
    const { calls, gated } = gatedClient(gate);
    const it = gated.fs.list('home');
    expect(gate).not.toHaveBeenCalled();
    const first = it.next();
    await Promise.resolve();
    expect(calls).toEqual([]);
    open();
    expect(await first).toEqual({ done: false, value: { name: 'a' } });
    const rest: string[] = [];
    for await (const e of it) rest.push(e.name);
    expect(rest).toEqual(['b']);
    expect(gate).toHaveBeenCalledTimes(1);
  });

  it('review NIT 6: a list closed before its first next() never opens', async () => {
    const gate = vi.fn(async () => {});
    const { calls, gated } = gatedClient(gate);
    const it = gated.fs.list('home');
    await it.return(undefined);
    expect(await it.next()).toEqual({ done: true, value: undefined });
    expect(gate).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('review NIT 7: over a raw object, a replaced fs whose method is the same function runs on the new fs', async () => {
    const put = vi.fn(async function (this: unknown) { return this; });
    const first = { put }; const second = { put };
    const s5: any = { fs: first };
    const gated: any = withConnectionGate(s5, async () => {});
    expect(await gated.fs.put()).toBe(first);
    s5.fs = second;
    expect(await gated.fs.put()).toBe(second);
  });

  it('R4: list rejects its first next() when the gate rejects; return() before next() needs no gate', async () => {
    const offline = Object.assign(new Error('offline'), { code: 'STORAGE_OFFLINE' });
    const gate = vi.fn(() => Promise.reject(offline));
    const { calls, gated } = gatedClient(gate);
    await expect(gated.fs.list('home').next()).rejects.toBe(offline);
    expect(await gated.fs.list('home').return(undefined)).toEqual({ done: true, value: undefined });
    expect(calls).toEqual([]);
  });

  it('R5: ungated members never wait: reconnect, status, identity recovery, internals, sync methods, properties', async () => {
    const gate = vi.fn(() => new Promise<void>(() => {})); // never opens
    const { s5, calls, gated } = gatedClient(gate);
    await gated.reconnect();
    expect(gated.getConnectionStatus()).toBe('disconnected');
    await gated.recoverIdentityFromSeedPhrase('x');
    await gated.fs._internal();
    expect(gated.fs.syncThing()).toBe('sync');
    expect(gated.fs.api).toBe(s5.fs.api);
    expect(calls).toEqual(['reconnect', 'recover', 'internal']);
    expect(gate).not.toHaveBeenCalled();
  });

  it('R5: only the listed methods wait — an unlisted async method on fs or the instance passes straight through', async () => {
    const gate = vi.fn(() => new Promise<void>(() => {}));
    const { s5, fs, gated } = gatedClient(gate);
    fs.copyNew = vi.fn(async () => 'copied');
    s5.sign = vi.fn(async () => 'signed');
    expect(await gated.fs.copyNew()).toBe('copied');
    expect(await gated.sign()).toBe('signed');
    expect(gate).not.toHaveBeenCalled();
  });

  it('a method\'s own properties (a test double\'s mock) pass through, and wrappers are stable', () => {
    const { fs, gated } = gatedClient(async () => {});
    expect(gated.fs.put.mock).toBe(fs.put.mock);
    expect(gated.fs.put).toBe(gated.fs.put);
    expect(gated.fs).toBe(gated.fs);
  });

  it('a replaced fs (s5js swaps it on identity recovery) is the one used', async () => {
    const { s5, gated } = gatedClient(async () => {});
    const next = { put: vi.fn(async () => {}) };
    s5.fs = next;
    await gated.fs.put('p');
    expect(next.put).toHaveBeenCalledWith('p');
  });

  it('R9: the gated list is exactly the public async methods of s5js FS5; S5 async methods are all classified', () => {
    const asyncNames = (proto: object) => Object.getOwnPropertyNames(proto).filter((n) => {
      const d = Object.getOwnPropertyDescriptor(proto, n)!;
      return typeof d.value === 'function' && /Async(Generator)?Function/.test(Object.prototype.toString.call(d.value));
    });
    expect([...GATED_FS_METHODS].sort()).toEqual(asyncNames(FS5.prototype).filter((n) => !n.startsWith('_')).sort());
    expect([...GATED_S5_METHODS, ...UNGATED_S5_METHODS].sort()).toEqual(asyncNames(S5.prototype).sort());
    expect([...GATED_S5_METHODS]).toEqual(['downloadByCID']);
  });
});
