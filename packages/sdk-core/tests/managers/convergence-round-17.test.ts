// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 17 — SDK-level classes (plan §30 KK1–KK3): one supersession model for the opt-in bridge; a plain
 * cleanup()'s queue; pins.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
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

const SRC = join(__dirname, '../../src');
const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

/** A bridge whose P2P client opens numbered sockets; `health` answers the bridge's health check. */
function bridge(health: () => Promise<{ healthy: boolean }> = async () => ({ healthy: true })) {
  const b = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);
  const sockets: Array<{ id: number; open: boolean }> = [];
  let current: { id: number; open: boolean } | undefined;
  const p2p = {
    connect: vi.fn(async () => {
      if (current?.open) throw Object.assign(new Error('already connected'), { code: 'P2P_ALREADY_CONNECTED' });
      current = { id: sockets.length + 1, open: true };
      sockets.push(current);
    }),
    disconnect: vi.fn(async () => { if (current) current.open = false; }),
  };
  Object.assign(b as any, { checkHealth: health, p2pClient: p2p, proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: vi.fn(), stopHealthMonitoring: vi.fn() });
  return { b, p2p, sockets, open: () => sockets.filter((s) => s.open).length };
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KK1 — a connect is superseded by any disconnect() after it was called, and by nothing else', () => {
  test('a connect waiting behind a superseded one, then a sign-out during its wait: superseded too — never up after it', async () => {
    let healthy!: () => void;
    const { b, open, sockets } = bridge(() => new Promise((r) => { healthy = () => r({ healthy: true }); }));
    const first = b.connect().catch((e: unknown) => e);
    await tick();
    await b.disconnect();
    (b as any).checkHealth = async () => ({ healthy: true });
    const second = b.connect().catch((e: unknown) => e);              // waits behind the superseded first
    await tick();
    await b.disconnect();                                             // the sign-out, during its wait
    healthy();
    expect(await first).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' } } });
    expect(await second).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' }, retryable: false } });
    expect({ connected: (b as any).connected, open: open() }).toEqual({ connected: false, open: 0 });
    expect(sockets).toHaveLength(0);                                  // neither attempt asked for a socket after its sign-out (§33 NN1)
  });

  test('a superseded attempt whose health check never answers does not hold the next connect: the check is bounded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let calls = 0;
    vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) => {
      calls++;
      if (calls > 1) return Promise.resolve({ ok: true, json: async () => ({ status: 'healthy', services: {} }) });
      return new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));  // never answers
    });
    const b = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);
    const p2p = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
    Object.assign(b as any, { p2pClient: p2p, proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: vi.fn() });
    const first = b.connect().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    await b.disconnect();
    let second: unknown = 'pending';
    void b.connect().then(() => { second = 'connected'; }, (e: any) => { second = e?.code; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await first).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED' });
    expect(second).toBe('connected');
  });

  test("the proof service's check is bounded too: a connect whose proof check never answers fails, and closes its socket", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const b = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);  // the real proof client
    const p2p = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
    Object.assign(b as any, { checkHealth: async () => ({ healthy: true }), p2pClient: p2p, startHealthMonitoring: vi.fn() });
    let outcome: unknown = 'pending';
    void b.connect().then(() => { outcome = 'connected'; }, (e: any) => { outcome = e?.details?.cause?.code ?? e?.code; });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(outcome).toBe('PROOF_SERVICE_UNAVAILABLE');
    expect(p2p.disconnect).toHaveBeenCalledTimes(1);
  });

  test("an old retry of the health monitor's reconnect never tears down a connection the UI made since", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let up = true;
    const { b, p2p } = bridge(async () => ({ healthy: up }));
    await b.connect();
    up = false;                                                       // the bridge goes down
    const reconnecting = (b as any).reconnect();
    await vi.advanceTimersByTimeAsync(2_500);                         // its connect fails: a retry is due in 10 s
    await reconnecting;
    up = true;
    await b.connect();                                                // the UI reconnects
    const closes = p2p.disconnect.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect({ connected: (b as any).connected, closes: p2p.disconnect.mock.calls.length }).toEqual({ connected: true, closes });
  });

  test("the monitor's retry never fails, nor closes the socket of, a connect the UI is running — only a disconnect() supersedes", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let up = true;
    const { b, open } = bridge(async () => ({ healthy: up }));
    await b.connect();
    up = false;
    const reconnecting = (b as any).reconnect();
    await vi.advanceTimersByTimeAsync(2_500);
    await reconnecting;                                               // failed: a retry is due in 10 s
    up = true;
    let release!: () => void;
    (b as any).proofClient = { connect: () => new Promise<void>((r) => { release = r; }), isAvailable: () => true };  // held after its socket opened
    let ui: unknown = 'pending';
    void b.connect().then(() => { ui = 'connected'; }, (e: any) => { ui = e?.details?.cause?.code ?? e?.code; });
    await vi.advanceTimersByTimeAsync(15_000);                        // the retry comes while the UI's connect runs
    release();
    await vi.advanceTimersByTimeAsync(5_000);
    expect({ ui, open: open() }).toEqual({ ui: 'connected', open: 1 });
  });

  test("with nothing in its way, the monitor's reconnect recovers: connected again on a new socket", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { b, p2p, open } = bridge();
    await b.connect();
    const reconnecting = (b as any).reconnect();
    await vi.advanceTimersByTimeAsync(2_500);
    await reconnecting;
    expect({ connected: (b as any).connected, connects: p2p.connect.mock.calls.length, open: open() }).toEqual({ connected: true, connects: 2, open: 1 });
  });

  test('a failed connect, then a retry with no disconnect between: the retry connects', async () => {
    let up = false;
    const { b } = bridge(async () => ({ healthy: up }));
    expect(await caught(b.connect())).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED' });
    up = true;
    await b.connect();
    expect((b as any).connected).toBe(true);
  });

  test('connectToBridge() needs a signed-in identity: during a sign-in it refuses NOT_AUTHENTICATED — no orphan client', async () => {
    const s = realSdk();
    expect(await caught(s.connectToBridge('http://bridge.invalid'))).toMatchObject({ code: 'NOT_AUTHENTICATED', details: { retryable: false } });
    expect(s.getBridgeClient()).toBeUndefined();
  });
});

describe('KK2 — a plain cleanup() (a UI unmount) and the write the flush runs', () => {
  test('that write settles with its own outcome, and one queued after cleanup() still runs', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    let land!: () => void;
    const landed = new Promise<void>((r) => { land = r; });
    const put = tab.fs.put.bind(tab.fs);
    let first = true;
    (tab.fs as any).put = async (path: string, data: unknown) => { if (first) { first = false; await landed; } return put(path, data); };
    const store = sm(tab);
    (store as any).connectionStatus = 'disconnected';
    const running = store.putWithRetry('home/x/1', { a: 1 }).then(() => 'resolved', (e: any) => e?.code);
    (store as any).connectionStatus = 'connected';
    void (store as any).flushQueue();
    await tick();
    store.cleanup();
    (store as any).connectionStatus = 'disconnected';
    const later = store.putWithRetry('home/x/2', { a: 2 }).then(() => 'resolved', (e: any) => e?.code);
    land();
    expect(await running).toBe('resolved');
    expect(await Promise.race([later, new Promise((r) => setTimeout(() => r('never settled'), 2_000))])).toBe('resolved');
    expect(net.filePaths()).toEqual(expect.arrayContaining(['home/x/1', 'home/x/2']));
  });
});

describe('KK3 — pins', () => {
  test('every NOT_AUTHENTICATED thrown in src says it is not retryable (a static pin per site)', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(SRC);
    const sites = files.flatMap((f) => (readFileSync(f, 'utf8').replace(/\r/g, '').match(/new SDKError\([^;]*?'NOT_AUTHENTICATED'[^;]*?\)/g) ?? []).map((t) => [f, t]));
    expect(sites.length).toBeGreaterThanOrEqual(5);
    expect(sites.filter(([, t]) => !/retryable: false/.test(t))).toEqual([]);
  });

  test("no console argument holds a seed's word indices (13 integers below 1024)", async () => {
    const logged: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'debug', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args); });
    }
    const wallet = ethers.Wallet.createRandom();
    const derived = [
      await seeds.generateS5SeedFromAddress(wallet.address, 84532),
      await seeds.generateS5SeedFromPrivateKey(wallet.privateKey),
      seeds.entropyToS5Phrase(ethers.randomBytes(16)),
    ];
    const indices = derived.map((phrase) => phrase.split(' ').slice(0, 13).map((w) => wordlist.indexOf(w)).join(','));
    const lists = (value: unknown, depth = 0): number[][] => {
      if (depth > 4 || value == null) return [];
      if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        const nums = Array.from(value as ArrayLike<unknown>);
        return nums.every((n) => Number.isInteger(n)) ? [nums as number[]] : nums.flatMap((v) => lists(v, depth + 1));
      }
      if (typeof value === 'string') return (value.match(/\b\d{1,4}(?:[\s,]+\d{1,4}){12,}\b/g) ?? []).map((run) => run.split(/[\s,]+/).map(Number));
      if (typeof value === 'object') return Object.values(value as object).flatMap((v) => lists(v, depth + 1));
      return [];
    };
    const windows = logged.flat().flatMap((arg) => lists(arg)).flatMap((nums) =>
      nums.length < 13 ? [] : Array.from({ length: nums.length - 12 }, (_, i) => nums.slice(i, i + 13).join(',')));
    expect(windows.filter((w) => indices.includes(w))).toEqual([]);
  });
});
