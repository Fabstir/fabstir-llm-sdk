// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 18 — plan §31 LL1–LL3: every step of a bridge connect bounded; the P2P socket's own events;
 * connectToBridge(url); a write after a plain cleanup(); pins.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import * as seeds from '../../src/utils/s5-seed-derivation';
import { wordlist } from '../../src/utils/s5-wordlist-correct';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** A WebSocket double: opens on the next turn unless `FakeSocket.opens` is false; `close()` only records (the close event comes when a test fires it). */
class FakeSocket {
  static opens = true;
  static all: FakeSocket[] = [];
  onopen?: () => void; onerror?: (e: unknown) => void; onclose?: () => void; onmessage?: (e: unknown) => void;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
    if (FakeSocket.opens) setTimeout(() => this.onopen?.(), 0);
  }
  close() { this.closed = true; }
  send() {}
}

/** A bridge with the real P2P client over FakeSocket; health and proof answer at once unless replaced. */
function realP2pBridge(url = 'http://bridge.invalid') {
  const b = new UnifiedBridgeClient({ bridgeUrl: url } as any);
  Object.assign(b as any, { checkHealth: async () => ({ healthy: true }), proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: vi.fn() });
  return b;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  FakeSocket.opens = true;
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

describe('LL1 — every step of a bridge connect is bounded', () => {
  test('a health check that sends its headers and then stalls its body: the connect fails, and the next one runs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let calls = 0;
    vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) => {
      calls++;
      if (calls > 1) return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', services: {} }) });
      return Promise.resolve({ ok: true, json: () => new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
    });
    const b = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);  // the real health check
    Object.assign(b as any, { proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: vi.fn() });
    const first = b.connect().then(() => 'connected', (e: any) => e?.code);
    await vi.advanceTimersByTimeAsync(10);
    await b.disconnect();
    let second: unknown = 'pending';
    void b.connect().then(() => { second = 'connected'; }, (e: any) => { second = e?.code; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect({ first: await first, second }).toEqual({ first: 'BRIDGE_CONNECTION_FAILED', second: 'connected' });
  });

  test('a socket that never opens: the connect fails, that socket is closed, and a later connect works', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    FakeSocket.opens = false;
    const b = realP2pBridge();
    let outcome: unknown = 'pending';
    void b.connect().then(() => { outcome = 'connected'; }, (e: any) => { outcome = e?.code; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect({ outcome, closed: FakeSocket.all[0].closed }).toEqual({ outcome: 'BRIDGE_CONNECTION_FAILED', closed: true });
    FakeSocket.opens = true;
    const later = b.connect();
    await vi.advanceTimersByTimeAsync(10);
    await later;
    expect((b as any).connected).toBe(true);
  });

  test("an old socket's late close event leaves the new socket alone — and a sign-out closes the new one", async () => {
    const b = realP2pBridge();
    await b.connect();
    await b.disconnect();                                             // socket 1 closing: its close event comes later
    await b.connect();                                                // socket 2
    FakeSocket.all[0].onclose?.();                                    // socket 1's late close event
    expect({ bridge: (b as any).connected, p2p: (b as any).p2pClient.connected }).toEqual({ bridge: true, p2p: true });
    await b.disconnect();
    expect(FakeSocket.all.map((s) => s.closed)).toEqual([true, true]);
  });

  test('a monitor tick whose check spans a sign-out and a reconnect stands down: the new connection stays', async () => {
    const b = realP2pBridge();
    await b.connect();
    let answer!: (healthy: boolean) => void;
    (b as any).checkHealth = () => new Promise((r) => { answer = (healthy) => r({ healthy }); });
    const ticking = (b as any).healthTick();
    await tick();
    await b.disconnect();
    (b as any).checkHealth = async () => ({ healthy: true });
    await b.connect();                                                // the UI's new connection
    answer(false);                                                    // the stale tick's "unhealthy"
    await ticking;
    // The UI's socket (the second) is the one open — never torn down and replaced by a third.
    expect({ connected: (b as any).connected, sockets: FakeSocket.all.map((s) => s.closed) }).toEqual({ connected: true, sockets: [true, false] });
  });

  test('connectToBridge(url) never silently uses another URL (since §32 MM1: it refuses — the URL is configuration)', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { asked.push(url); return { ok: true, json: async () => ({ status: 'healthy', services: {} }) }; });
    const held = { disconnect: vi.fn(async () => {}), getBridgeUrl: () => 'http://localhost:3000' };
    const s = realSdk({ authenticated: true, bridgeClient: held });
    expect(await caught(s.connectToBridge('https://my-bridge.example'))).toMatchObject({ code: 'BRIDGE_URL_MISMATCH' });
    expect({ asked, sockets: FakeSocket.all.length, same: s.getBridgeClient() === held }).toEqual({ asked: [], sockets: 0, same: true });
  });
});

describe('LL2 — after a plain cleanup(), a write never hangs', () => {
  test('one that could only wait for a reconnect refuses STORAGE_CLEANUP, not retryable', async () => {
    const net = new FakeS5Network();
    const store = new StorageManager();
    Object.assign(store as any, { initialized: true, s5Client: net.tab() as FakeS5Tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    store.cleanup();
    (store as any).connectionStatus = 'disconnected';                 // an S5 blip the store no longer hears the end of
    const write = store.putWithRetry('home/x/1', { a: 1 }).then(() => 'resolved', (e: any) => [e?.code, e?.details?.retryable]);
    expect(await Promise.race([write, new Promise((r) => setTimeout(() => r('never settled'), 1_000))])).toEqual(['STORAGE_CLEANUP', false]);
  });
});

describe('LL3 — pins', () => {
  test('no console line carries a seed in digits, whatever separates them (entropy bytes or word indices)', async () => {
    const lines: string[] = [];
    for (const level of ['log', 'info', 'warn', 'debug', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map((a) => (ArrayBuffer.isView(a) ? Array.from(a as Uint8Array).join(',') : typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      });
    }
    const wallet = ethers.Wallet.createRandom();
    const derived = [
      await seeds.generateS5SeedFromAddress(wallet.address, 84532),
      await seeds.generateS5SeedFromPrivateKey(wallet.privateKey),
      await seeds.getOrGenerateS5Seed(wallet, true),                  // the exported signature helper (§32 MM7; no SDK sign-in calls it — §33 NN3)
      seeds.entropyToS5Phrase(ethers.randomBytes(16)),
    ];
    // Stop capturing before rebuilding: a log inside the rebuild must fail an assertion, not grow the log forever.
    const captured = [...lines];
    vi.restoreAllMocks();
    const indices = derived.map((phrase) => phrase.split(' ').slice(0, 13).map((w) => wordlist.indexOf(w)).join(','));
    const found: string[] = [];
    for (const line of captured) {
      const nums = line.split(/\D+/).filter(Boolean).map(Number);
      for (let i = 0; i + 16 <= nums.length; i++) {
        const window = nums.slice(i, i + 16);
        if (window.every((n) => n <= 255) && derived.includes(seeds.entropyToS5Phrase(Uint8Array.from(window)))) found.push(line);
      }
      for (let i = 0; i + 13 <= nums.length; i++) if (indices.includes(nums.slice(i, i + 13).join(','))) found.push(line);
    }
    expect(found).toEqual([]);
  });

  test('the second registration call (/register-complete) is bounded too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { registerS5WithBackend } = await import('../../src/utils/s5-secure-registration');
    vi.stubGlobal('fetch', vi.fn((url: string, init: any) => {
      if (url.endsWith('/register')) {
        const body = JSON.stringify({ challenge: ethers.encodeBase64(ethers.randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') });
        return Promise.resolve({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
      }
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    }));
    const s5 = { identity: {}, getSigningPublicKey: async () => 'pk-0123456789abcdefghij', sign: async () => 'sig', crypto: { hashBlake3: async () => new Uint8Array(32) } };
    let outcome: unknown = 'pending';
    void registerS5WithBackend(s5 as any, { backendUrl: 'https://backend', portalHost: 'portal', portalUrl: 'https://portal' })
      .then(() => { outcome = 'registered'; }, (e: any) => { outcome = e?.name === 'AbortError' ? e.name : String(e?.message); });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(outcome).toBe('AbortError');
  });
});
