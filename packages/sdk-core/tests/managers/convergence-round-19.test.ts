// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 19 — plan §32 MM1–MM6: the bridge URL is configuration (no client replaced mid-call); a monitor
 * tick and the monitor's own reconnect; a sign-out closes the socket an attempt opened; registration bodies bounded;
 * the unavailable stand-in's cleanup(); a late error from an old socket.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import { SEED, ADDR } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** A WebSocket double: opens on the next turn; `close()` only records (events come when a test fires them). */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen?: () => void; onerror?: (e: unknown) => void; onclose?: () => void; onmessage?: (e: unknown) => void;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  close() { this.closed = true; }
  send() {}
}

/** A bridge with the real P2P client over FakeSocket; health and proof answer at once unless replaced. */
function bridge(url = 'http://bridge.invalid') {
  const b = new UnifiedBridgeClient({ bridgeUrl: url } as any);
  Object.assign(b as any, { checkHealth: async () => ({ healthy: true }), proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: vi.fn() });
  return b;
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MM1 — the bridge URL is configuration: no client is replaced mid-call', () => {
  test('connectToBridge(another url) refuses BRIDGE_URL_MISMATCH, not retryable — the held client untouched', async () => {
    const held = bridge('http://localhost:3000');
    const close = vi.spyOn(held, 'disconnect');
    const s = realSdk({ authenticated: true, bridgeClient: held });
    expect(await caught(s.connectToBridge('https://my-bridge.example'))).toMatchObject({ code: 'BRIDGE_URL_MISMATCH', details: { retryable: false } });
    expect({ same: s.getBridgeClient() === held, closed: close.mock.calls.length, sockets: FakeSocket.all.length }).toEqual({ same: true, closed: 0, sockets: 0 });
  });

  test('two calls for different URLs in one turn: the second refuses — the first connects to the URL it asked for', async () => {
    const s = realSdk({ authenticated: true, bridgeClient: bridge('http://a.invalid') });
    const a = s.connectToBridge('http://a.invalid').then(() => 'connected', (e: any) => e?.code);
    const c = s.connectToBridge('http://c.invalid').then(() => 'connected', (e: any) => e?.code);
    expect({ a: await a, c: await c, sockets: FakeSocket.all.map((x) => x.url) }).toEqual({ a: 'connected', c: 'BRIDGE_URL_MISMATCH', sockets: ['ws://a.invalid/ws'] });
  });

  test('connectToBridge() then a sign-out in the same turn: superseded, and nothing connected is left behind', async () => {
    const s = realSdk({ authenticated: true });
    s.bridgeClient = bridge(s.config.bridgeConfig.url);               // the sign-in's client, for the configured URL
    const p = s.connectToBridge().then(() => 'connected', (e: any) => e?.details?.cause?.code ?? e?.code);
    await s.disconnect();
    expect(await p).toBe('BRIDGE_CLOSED');
    expect({ held: s.getBridgeClient(), open: FakeSocket.all.filter((x) => !x.closed).length }).toEqual({ held: undefined, open: 0 });
  });
});

describe("MM2 — a monitor tick whose check began before the monitor's own reconnect stands down", () => {
  test('the stale "unhealthy" of an overlapping tick leaves the reconnected socket alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const b = bridge();
    const opened = b.connect();
    await vi.advanceTimersByTimeAsync(10);
    await opened;
    const answers: Array<(healthy: boolean) => void> = [];
    (b as any).checkHealth = () => new Promise((r) => { answers.push((healthy) => r({ healthy })); });
    const first = (b as any).healthTick();
    const second = (b as any).healthTick();                           // the next tick, while the first still checks
    await vi.advanceTimersByTimeAsync(10);
    (b as any).checkHealth = async () => ({ healthy: true });         // the bridge is back for the reconnect
    answers[0](false);                                                // the first: unhealthy -> the monitor reconnects
    await vi.advanceTimersByTimeAsync(2_500);
    await first;
    answers[1](false);                                                // the second's answer, from before that reconnect
    await second;
    await vi.advanceTimersByTimeAsync(5_000);
    expect({ connected: (b as any).connected, sockets: FakeSocket.all.map((x) => x.closed) }).toEqual({ connected: true, sockets: [true, false] });
  });
});

describe('MM3 — a sign-out closes the socket a connect in flight had opened, at once', () => {
  test('disconnect() during the proof step: the socket is closed when it resolves', async () => {
    const b = bridge();
    let release!: () => void;
    (b as any).proofClient = { connect: () => new Promise<void>((r) => { release = r; }), isAvailable: () => true };
    const connecting = b.connect().catch((e: unknown) => e);
    await tick(); await tick();                                       // its socket opens; the proof step waits
    expect(FakeSocket.all.map((x) => x.closed)).toEqual([false]);
    await b.disconnect();
    expect(FakeSocket.all.map((x) => x.closed)).toEqual([true]);
    release();
    expect(await connecting).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' } } });
  });
});

describe('MM3 — a superseded attempt says so whatever step it failed at', () => {
  test('a sign-out, then its proof step fails: BRIDGE_CLOSED (not retryable) — never the step\'s own error', async () => {
    const b = bridge();
    let fail!: () => void;
    (b as any).proofClient = { connect: () => new Promise<void>((_r, f) => { fail = () => f(new Error('proof service down')); }), isAvailable: () => true };
    const connecting = b.connect().catch((e: unknown) => e);
    await tick(); await tick();
    await b.disconnect();
    fail();
    expect(await connecting).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' }, retryable: false } });
  });
});

describe('MM4 — the registration calls read their bodies under the bound', () => {
  for (const stalled of ['/register', '/register-complete']) {
    test(`${stalled}: headers, then a body that never comes — aborted, never pending`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { registerS5WithBackend } = await import('../../src/utils/s5-secure-registration');
      const challenge = ethers.encodeBase64(ethers.randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const stall = (signal: AbortSignal) => new Promise((_r, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
        const text = url.endsWith(stalled) ? () => stall(init.signal) : async () => JSON.stringify(url.endsWith('/register') ? { challenge } : { authToken: 't' });
        return { ok: true, status: 200, text, json: async () => JSON.parse(await text() as string) };
      }));
      const s5 = { identity: {}, getSigningPublicKey: async () => 'pk-0123456789abcdefghij', sign: async () => 'sig', crypto: { hashBlake3: async () => new Uint8Array(32) } };
      let outcome: unknown = 'pending';
      void registerS5WithBackend(s5 as any, { backendUrl: 'https://backend', portalHost: 'portal', portalUrl: 'https://portal' })
        .then(() => { outcome = 'registered'; }, (e: any) => { outcome = e?.name === 'AbortError' ? e.name : String(e?.message); });
      await vi.advanceTimersByTimeAsync(31_000);
      expect(outcome).toBe('AbortError');
    });
  }
});

describe('MM5 — the unavailable stand-in answers cleanup(), as a real store does', () => {
  test('cleanup() on the STORAGE_UNAVAILABLE store does not throw', async () => {
    const s = realSdk({ storageManager: { initialize: async () => { throw new Error('portal down'); }, isInitialized: () => true, dispose() {} }, s5Seed: SEED, userAddress: ADDR });
    await s._initStorage(false);
    expect(s.storageUnavailable).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    expect(() => s.storageManager.cleanup()).not.toThrow();
  });
});

describe("MM6 — a late error from an old socket leaves the new one alone", () => {
  test('the P2P client stays connected on the new socket', async () => {
    const b = bridge();
    const first = b.connect();
    await tick(); await first;
    await b.disconnect();                                             // socket 1 closing: its error/close come later
    const second = b.connect();
    await tick(); await second;
    FakeSocket.all[0].onerror?.(new Error('closed while closing'));   // socket 1's late error
    expect({ bridge: (b as any).connected, p2p: (b as any).p2pClient.connected }).toEqual({ bridge: true, p2p: true });
  });
});
