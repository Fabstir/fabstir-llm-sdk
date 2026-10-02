// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 16 — SDK-level classes (plan §29 JJ2–JJ6). Every SDK here is a real instance.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { AuthManager } from '../../src/managers/AuthManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import * as seeds from '../../src/utils/s5-seed-derivation';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

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

function memoryStorage() {
  const stored = new Map<string, string>();
  return {
    stored,
    getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); },
    removeItem: (k: string) => { stored.delete(k); }, get length() { return stored.size; }, key: (i: number) => [...stored.keys()][i] ?? null,
  };
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

describe('JJ2 — one bridge connect at a time', () => {
  /** A bridge whose P2P client opens numbered sockets; `health` gates the first step. */
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
    return { b, p2p, sockets };
  }

  test("overlapping connects (autoConnect's two) share one attempt: one socket, both resolve, connected", async () => {
    let healthy!: () => void;
    const { b, p2p, sockets } = bridge(() => new Promise((r) => { healthy = () => r({ healthy: true }); }));
    const first = b.connect();
    const second = b.connect();
    healthy();
    await Promise.all([first, second]);
    expect({ connects: p2p.connect.mock.calls.length, open: sockets.filter((s) => s.open).length, connected: (b as any).connected })
      .toEqual({ connects: 1, open: 1, connected: true });
  });

  test('a connect superseded by a disconnect, then a new connect: the new one waits for it, and stays up', async () => {
    let healthy!: () => void;
    const { b, sockets } = bridge(() => new Promise((r) => { healthy = () => r({ healthy: true }); }));
    const first = b.connect().catch((e: unknown) => e);
    await tick();
    await b.disconnect();                                             // a sign-out
    (b as any).checkHealth = async () => ({ healthy: true });
    const second = b.connect();
    healthy();
    expect(await first).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' } } });
    await second;
    expect({ connected: (b as any).connected, open: sockets.filter((s) => s.open).map((s) => s.id) }).toEqual({ connected: true, open: [sockets.length] });
  });

  test('the health monitor’s reconnect gives up after a sign-out that came during its pause — and never retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { b, p2p } = bridge();
    await b.connect();
    const reconnecting = (b as any).reconnect();
    await vi.advanceTimersByTimeAsync(500);
    await b.disconnect();                                             // the sign-out, during the 2 s pause
    await vi.advanceTimersByTimeAsync(30_000);
    await reconnecting;
    expect({ connects: p2p.connect.mock.calls.length, connected: (b as any).connected }).toEqual({ connects: 1, connected: false });
  });

  test('…and its 10 s retry stops too, after a sign-out that came once a reconnect had failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const health = vi.fn(async () => ({ healthy: true }));
    const { b } = bridge(health);
    await b.connect();
    (b as any).checkHealth = health.mockImplementation(async () => ({ healthy: false }));  // the bridge goes down
    const reconnecting = (b as any).reconnect();
    await vi.advanceTimersByTimeAsync(2_500);                         // the pause, then a failed connect: a retry is due
    await reconnecting;
    const attempts = health.mock.calls.length;
    await b.disconnect();                                             // the sign-out, before the retry
    await vi.advanceTimersByTimeAsync(60_000);
    expect(health.mock.calls.length).toBe(attempts);
  });
});

describe('JJ3 — the composite seed is no public option', () => {
  test("authenticate('signer', { derivedSeed }) ignores it: the identity is the signer's own, and nothing injected is cached", async () => {
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);
    const wallet = ethers.Wallet.createRandom();
    const s = realSdk({ initializeManagers: async () => {} });
    await s.authenticate('signer', { signer: wallet, derivedSeed: 'an injected seed' });
    expect(s.s5Seed).toBe(await seeds.generateS5SeedFromAddress(wallet.address, 84532));
    expect([...ls.stored.values()].some((v) => v.includes('an injected seed'))).toBe(false);
  });
});

describe('JJ4 — no console argument, of any shape, lets anyone rebuild a seed', () => {
  /** Every byte sequence an argument carries: byte arrays, number lists, objects (recursively), and strings' runs. */
  function byteRuns(value: unknown, depth = 0): Uint8Array[] {
    if (depth > 4 || value == null) return [];
    if (value instanceof Uint8Array) return [value];
    if (value instanceof ArrayBuffer) return [new Uint8Array(value)];
    if (Array.isArray(value) && value.length >= 16 && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return [Uint8Array.from(value)];
    if (typeof value === 'string') {
      const runs: Uint8Array[] = [];
      for (const hex of value.match(/(?:[0-9a-fA-F]{2}[\s:,-]?){16,}/g) ?? []) runs.push(ethers.getBytes('0x' + hex.replace(/[^0-9a-fA-F]/g, '')));
      for (const dec of value.match(/\b\d{1,3}(?:[\s,]+\d{1,3}){15,}\b/g) ?? []) {
        const nums = dec.split(/[\s,]+/).map(Number);
        if (nums.every((n) => n <= 255)) runs.push(Uint8Array.from(nums));
      }
      for (const b64 of value.match(/[A-Za-z0-9+/]{22,}={0,2}/g) ?? []) {
        try { runs.push(Uint8Array.from(Buffer.from(b64, 'base64'))); } catch { /* not base64 */ }
      }
      return runs;
    }
    if (typeof value === 'object') return Object.values(value as object).flatMap((v) => byteRuns(v, depth + 1));
    return [];
  }

  test('raw bytes, decimal, hex or base64, in any argument: nothing logged rebuilds the phrase', async () => {
    const logged: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'debug', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args); });
    }
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);
    const wallet = ethers.Wallet.createRandom();
    const derived = [
      await seeds.generateS5SeedFromAddress(wallet.address, 84532),
      await seeds.generateS5SeedFromPrivateKey(wallet.privateKey),
      await seeds.getOrGenerateS5Seed(wallet, true),
      seeds.entropyToS5Phrase(ethers.randomBytes(16)),
    ];
    const rebuilt: string[] = [];
    for (const run of logged.flat().flatMap((arg) => byteRuns(arg))) {
      for (let i = 0; i + 16 <= run.length; i++) rebuilt.push(seeds.entropyToS5Phrase(run.slice(i, i + 16)));
    }
    expect(rebuilt.filter((phrase) => derived.includes(phrase))).toEqual([]);
  });
});

describe('JJ5 — NOT_AUTHENTICATED is coded, and never retryable, everywhere', () => {
  test("a kept AuthManager's initializeS5 after a sign-out", async () => {
    const held = new AuthManager({ getAddress: async () => ADDR } as any, {} as any, ADDR, SEED);
    await realSdk({ authenticated: true, authManager: held }).disconnect();
    expect(await caught(held.initializeS5())).toMatchObject({ code: 'NOT_AUTHENTICATED', details: { retryable: false } });
  });

  test("the SDK's own: a getter, the migration, the delegate calls", async () => {
    const s = realSdk();
    expect(() => s.getStorageManager()).toThrow(expect.objectContaining({ code: 'NOT_AUTHENTICATED', details: expect.objectContaining({ retryable: false }) }));
    expect(await caught(s.migrateToSealedStorage())).toMatchObject({ code: 'NOT_AUTHENTICATED', details: { retryable: false } });
    expect(await caught(s.enableDelegatePayments({ signer: {} as any, payer: ADDR }))).toMatchObject({ code: 'NOT_AUTHENTICATED', details: { retryable: false } });
    expect(await caught(s.disableDelegatePayments())).toMatchObject({ code: 'NOT_AUTHENTICATED', details: { retryable: false } });
  });
});

describe('JJ6 — cleanup() after dispose() leaves the write the flush runs alone', () => {
  test('it settles with its own outcome — not STORAGE_CLEANUP while it lands', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    let land!: () => void;
    const landed = new Promise<void>((r) => { land = r; });
    const put = tab.fs.put.bind(tab.fs);
    (tab.fs as any).put = async (path: string, data: unknown) => { await landed; return put(path, data); };
    const store = sm(tab);
    (store as any).connectionStatus = 'disconnected';
    const running = store.putWithRetry('home/x/1', { a: 1 }).then(() => 'resolved', (e: any) => e?.code);
    (store as any).connectionStatus = 'connected';
    void (store as any).flushQueue();
    await tick();
    store.dispose();
    store.cleanup();
    land();
    expect(await running).toBe('resolved');
    expect(net.filePaths()).toContain('home/x/1');
  });
});
