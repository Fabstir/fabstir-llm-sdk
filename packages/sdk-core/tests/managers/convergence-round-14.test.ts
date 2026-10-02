// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 14 — SDK-level classes (plan §27 HH1–HH6, HH8–HH11). Every SDK here is a real instance.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

// An S5 that starts at once, except for the last step of its start — which waits on `s5.gate`.
const s5 = vi.hoisted(() => ({ gate: Promise.resolve() as Promise<void>, reachedGate: false }));
vi.mock('@julesl23/s5js', () => ({
  isS5RegistryUnavailableError: () => false, // beta.56's root export (plan §19 Z1)
  S5: {
    create: async () => ({
      recoverIdentityFromSeedPhrase: async () => {},
      onConnectionChange: (cb: (status: string) => void) => { cb('connected'); return () => {}; },
      registerOnNewPortal: async () => {},
      reconnect: async () => {},
      fs: { ensureIdentityInitialized: () => { s5.reachedGate = true; return s5.gate; } },
    }),
  },
}));
// The private-key seed derivation, held open on `seeds.gate` when a test sets one.
const seeds = vi.hoisted(() => ({ gate: undefined as Promise<void> | undefined, reached: false }));
vi.mock('../../src/utils/s5-seed-derivation', async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    generateS5SeedFromPrivateKey: async (key: string) => {
      seeds.reached = true;
      if (seeds.gate) await seeds.gate;
      return real.generateS5SeedFromPrivateKey(key);
    },
  };
});
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { AuthManager } from '../../src/managers/AuthManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import { SDKError } from '../../src/types';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const HOST = '0x' + '12'.repeat(20);
const tick = () => new Promise((r) => setTimeout(r, 0));
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const conversation = (id: string, messages: any[] = []) => ({
  id, messages, metadata: { model: 'm', jobId: '7', status: 'active' }, createdAt: 1, updatedAt: 1,
});
const msg = (role: 'user' | 'assistant', content: string) => ({ role, content, timestamp: 1 });

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

const contents = async (tab: FakeS5Tab, id: string) => ((await sm(tab).loadConversation(id))?.messages ?? []).map((m: any) => m.content);

function memoryStorage() {
  const stored = new Map<string, string>();
  return {
    stored,
    getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); },
    removeItem: (k: string) => { stored.delete(k); }, get length() { return stored.size; }, key: (i: number) => [...stored.keys()][i] ?? null,
  };
}

/** Rejections nobody handled while `run` ran (and a turn after). */
async function unhandledDuring(run: () => Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => { seen.push(reason); };
  process.on('unhandledRejection', listener);
  try {
    await run();
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off('unhandledRejection', listener);
  }
  return seen;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  Object.assign(s5, { gate: Promise.resolve(), reachedGate: false });
  Object.assign(seeds, { gate: undefined, reached: false });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HH1 — an exchange is logged whole: a sign-out never tears it', () => {
  test('one exchange is one write, both messages together', async () => {
    const net = new FakeS5Network();
    const store = sm(net.tab());
    await store.saveConversation(conversation('41') as any);
    const writes = net.writes.length;
    await store.appendMessages('41', [msg('user', 'Q1'), msg('assistant', 'A1')] as any);
    expect(net.writes.length - writes).toBe(1);
    expect(await contents(net.tab(), '41')).toEqual(['Q1', 'A1']);
  });

  test('exchanges asked for before the store is disposed land whole and in order; one asked for after is refused whole', async () => {
    const net = new FakeS5Network();
    const store = sm(net.tab());
    await store.saveConversation(conversation('41') as any);
    const first = store.appendMessages('41', [msg('user', 'Q1'), msg('assistant', 'A1')] as any);
    const second = store.appendMessages('41', [msg('user', 'Q2'), msg('assistant', 'A2')] as any);
    store.dispose();                                                    // a sign-out
    await Promise.all([first, second]);
    expect(await caught(store.appendMessages('41', [msg('user', 'Q3'), msg('assistant', 'A3')] as any)))
      .toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
    expect(await contents(net.tab(), '41')).toEqual(['Q1', 'A1', 'Q2', 'A2']);
  });

  test("a burst of exchanges on a slow portal waits its turn in the store — never the lock's 120 s bound on its own tab", async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const store = sm(tab);
    await store.saveConversation(conversation('41') as any);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const put = tab.fs.put.bind(tab.fs);
    (tab.fs as any).put = async (path: string, data: unknown) => { await new Promise((r) => setTimeout(r, 70_000)); return put(path, data); };
    const appends = [1, 2, 3].map((n) => store.appendMessages('41', [msg('user', `Q${n}`), msg('assistant', `A${n}`)] as any)
      .then(() => 'logged', (e: any) => e?.code));
    for (let step = 0; step < 30; step++) {
      await vi.advanceTimersByTimeAsync(10_000);
      await new Promise((r) => setImmediate(r));
    }
    expect(await Promise.all(appends)).toEqual(['logged', 'logged', 'logged']);
    vi.useRealTimers();
    expect(await contents(net.tab(), '41')).toEqual(['Q1', 'A1', 'Q2', 'A2', 'Q3', 'A3']);
  });

  test('end to end: a sign-out right after the reply — the log keeps the question AND the paid answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ response: 'the paid answer' }) })));
    const net = new FakeS5Network();
    const store = sm(net.tab());
    const sessions = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, store as any);
    await sessions.initialize();
    await sessions.startSession({ chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false } as any);
    expect(await sessions.sendPrompt(77n, 'the question')).toBe('the paid answer');
    store.dispose();                                                    // the sign-out, before the log write settles
    await vi.waitFor(async () => expect(await contents(net.tab(), '77')).toEqual(['the question', 'the paid answer']));
  });
});

describe("HH2 — the session-group manager's calls in flight at a disposal", () => {
  test('a write waiting for the group lock runs on: never an uncoded TypeError', async () => {
    let open!: () => void;
    let gate: Promise<void> = Promise.resolve();
    const saved: string[] = [];
    const storage = {
      save: async (g: any) => { const name = g.name; await gate; saved.push(name); }, // the name as it was saved
      load: async () => { throw new Error('not found'); }, loadAll: async () => [], delete: async () => {},
    };
    const groups = new SessionGroupManager(storage as any);
    const group = await groups.createSessionGroup({ name: 'g0', description: '', owner: ADDR } as any);
    gate = new Promise<void>((r) => { open = r; });
    const first = groups.updateSessionGroup(group.id, ADDR, { name: 'g1' } as any).catch((e) => e);
    const second = groups.updateSessionGroup(group.id, ADDR, { name: 'g2' } as any).catch((e) => e);
    await tick();
    groups.dispose();
    open();
    const outcomes = await Promise.all([first, second]);
    expect(outcomes.filter((o) => o instanceof TypeError)).toEqual([]);
    expect(saved).toEqual(['g0', 'g1', 'g2']);
  });

  test("a write in flight whose store was disposed rejects the store's refusal — never a silent success", async () => {
    const storage = {
      save: async () => { throw new SDKError('disposed', 'STORAGE_MANAGER_DISPOSED', { retryable: false }); },
      load: async () => { throw new Error('not found'); }, loadAll: async () => [], delete: async () => {},
    };
    const groups = new SessionGroupManager(storage as any);
    expect(await caught(groups.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any)))
      .toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
  });

  test('a chat message in flight: the same — the refusal, not a resolved call with nothing written', async () => {
    let refuse = false;
    const storage = {
      save: async () => { if (refuse) throw new SDKError('disposed', 'STORAGE_MANAGER_DISPOSED', { retryable: false }); },
      load: async () => { throw new Error('not found'); }, loadAll: async () => [], delete: async () => {},
    };
    const groups = new SessionGroupManager(storage as any);
    const group = await groups.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
    const chat = await groups.startChatSession(group.id, 'hello');
    refuse = true;
    expect(await caught(groups.addMessage(group.id, chat.sessionId, { role: 'user', content: 'x', timestamp: 1 } as any)))
      .toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
  });
});

describe('HH3 — a superseded sign-in caches no seed', () => {
  function browserWithWallet(prompt: Promise<void>) {
    const ls = memoryStorage();
    const accounts = ['0x' + 'cd'.repeat(20)];
    const ethereum = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') { await prompt; return accounts; }
        if (method === 'eth_accounts') return accounts;
        if (method === 'eth_chainId') return '0x14a34';
        if (method === 'net_version') return '84532';
        return null;
      },
    };
    vi.stubGlobal('window', { localStorage: ls, ethereum });
    vi.stubGlobal('localStorage', ls);
    return ls;
  }

  test('MetaMask: a sign-out during the account prompt — AUTH_SUPERSEDED, nothing in localStorage', async () => {
    let answer!: () => void;
    const ls = browserWithWallet(new Promise<void>((r) => { answer = r; }));
    const s = realSdk({ initializeManagers: async () => {} });
    const signIn = s.authenticate('metamask').catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    answer();
    expect(await signIn).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect([...ls.stored.keys()]).toEqual([]);
  });

  test('private key: a sign-out during the seed derivation — AUTH_SUPERSEDED, nothing in localStorage', async () => {
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);                                  // cacheSeed writes through the global
    let derive!: () => void;
    seeds.gate = new Promise<void>((r) => { derive = r; });
    const s = realSdk({ initializeManagers: async () => {} });
    const signIn = s.authenticate('privatekey', { privateKey: ethers.Wallet.createRandom().privateKey }).catch((e: unknown) => e);
    for (let i = 0; i < 50 && !seeds.reached; i++) await tick();
    await s.disconnect();
    derive();
    expect(await signIn).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect([...ls.stored.keys()]).toEqual([]);
  });

  test('a sign-in that stays current caches its derived seed; a provided seedPhrase is never cached', async () => {
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);
    const key = ethers.Wallet.createRandom();
    const s = realSdk({ initializeManagers: async () => {} });
    await s.authenticate('privatekey', { privateKey: key.privateKey });
    expect([...ls.stored.keys()]).toEqual([expect.stringContaining(key.address.toLowerCase())]);
    ls.stored.clear();
    const provided = realSdk({ initializeManagers: async () => {} });
    provided.config = { ...provided.config, s5Config: { seedPhrase: SEED } };
    await provided.authenticate('privatekey', { privateKey: key.privateKey });
    expect([...ls.stored.keys()]).toEqual([]);
  });
});

describe('HH4 — no seed word reaches the console', () => {
  test('derivation (address, private key, signature), caching and the cached lookup log no part of the seed', async () => {
    const real: any = await vi.importActual('../../src/utils/s5-seed-derivation');
    const logged: string[] = [];
    for (const level of ['log', 'info', 'warn', 'debug', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
    }
    const ls = memoryStorage();
    vi.stubGlobal('window', { localStorage: ls });
    vi.stubGlobal('localStorage', ls);
    const wallet = ethers.Wallet.createRandom();
    const fromAddress: string = await real.generateS5SeedFromAddress(wallet.address, 84532);
    const fromKey: string = await real.generateS5SeedFromPrivateKey(wallet.privateKey);
    real.cacheSeed(wallet.address, fromAddress);
    await real.getOrGenerateS5Seed(wallet);                             // the cached one
    const fromSignature: string = await real.getOrGenerateS5Seed(wallet, true); // a new one, from a signature
    const prefixes = [fromAddress, fromKey, fromSignature].map((seed) => seed.split(' ').slice(0, 3).join(' '));
    expect(logged.filter((line) => prefixes.some((p) => line.includes(p)))).toEqual([]);
  });
});

describe('HH5 — a kept AuthManager forgets the seed at a sign-out', () => {
  test('its seed, signer and address are gone', async () => {
    const held = new AuthManager({ getAddress: async () => ADDR } as any, {} as any, ADDR, SEED);
    const s = realSdk({ authenticated: true, authManager: held });
    await s.disconnect();
    expect(() => held.getS5Seed()).toThrow();
    expect(held.isAuthenticated()).toBe(false);
  });
});

describe('HH6 — an async progress callback that rejects (the log side)', () => {
  test('every legacy log is sealed, and no rejection is left unhandled', async () => {
    const net = new FakeS5Network();
    for (let i = 1; i <= 3; i++) await net.tab().fs.put(logPath(String(i)), conversation(String(i), [msg('user', `q${i}`)]));
    let report: any;
    const unhandled = await unhandledDuring(async () => {
      report = await sm(net.tab()).migrateLegacyConversationLogs({ onProgress: async () => { throw new Error('UI state update failed'); } });
    });
    expect(report).toMatchObject({ sealed: 3, failed: [] });
    expect(unhandled).toEqual([]);
  });
});

describe('HH8 — a disconnect supersedes a bridge connect in flight', () => {
  test('the connect closes what it opened and fails; a later connect works', async () => {
    const bridge = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);
    let healthy!: () => void;
    const p2p = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
    const monitor = vi.fn();
    Object.assign(bridge as any, {
      checkHealth: () => new Promise((r) => { healthy = () => r({ healthy: true }); }),
      p2pClient: p2p, proofClient: { connect: async () => {}, isAvailable: () => true }, startHealthMonitoring: monitor,
    });
    const connecting = bridge.connect().catch((e: unknown) => e);
    await tick();
    await bridge.disconnect();
    healthy();
    expect(await connecting).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { error: { code: 'BRIDGE_CLOSED' } } });
    expect({ connected: (bridge as any).connected, monitors: monitor.mock.calls.length }).toEqual({ connected: false, monitors: 0 });
    expect(p2p.disconnect).toHaveBeenCalled();
    (bridge as any).checkHealth = async () => ({ healthy: true });
    await bridge.connect();
    expect((bridge as any).connected).toBe(true);
  });
});

describe('HH9 — disposal rejects the waiting queued writes only', () => {
  test('the write the flush is running settles with its own outcome', async () => {
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
    const waiting = store.putWithRetry('home/x/2', { a: 2 }).then(() => 'resolved', (e: any) => e?.code);
    (store as any).connectionStatus = 'connected';
    void (store as any).flushQueue();
    await tick();
    store.dispose();
    land();
    expect({ running: await running, waiting: await waiting }).toEqual({ running: 'resolved', waiting: 'STORAGE_MANAGER_DISPOSED' });
    expect(net.filePaths()).toContain('home/x/1');
  });
});

describe('HH10 — the storage start works on the store it started', () => {
  test('a sign-out during it, then the start fails: no TypeError, and that store is disposed', async () => {
    let fail!: (e: Error) => void;
    s5.gate = new Promise<void>((_r, f) => { fail = f; });
    const started = new StorageManager();
    const s = realSdk({ storageManager: started, s5Seed: SEED, userAddress: ADDR, authenticated: true });
    const starting = s._initStorage(false).then(() => 'settled', (e: unknown) => e);
    for (let i = 0; i < 50 && !s5.reachedGate; i++) await tick();
    await s.disconnect();
    fail(new Error('portal down'));
    expect(await starting).toBe('settled');
    expect(() => started.isInitialized()).toThrow(expect.objectContaining({ code: 'STORAGE_MANAGER_DISPOSED' }));
  });
});

describe('HH11 — pins round 13 lacked', () => {
  test('GG1: a start that FAILED (not stalled) disposes the store it abandons', async () => {
    s5.gate = Promise.reject(new Error('portal refused'));
    s5.gate.catch(() => undefined);
    const abandoned = new StorageManager();
    const s = realSdk({ storageManager: abandoned, s5Seed: SEED, userAddress: ADDR });
    await s._initStorage(false);
    expect(s.storageManager).not.toBe(abandoned);
    expect(() => abandoned.isInitialized()).toThrow(expect.objectContaining({ code: 'STORAGE_MANAGER_DISPOSED' }));
  });

  test("GG2: a superseded migration carries each side's error too", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const rag = { dispose: async () => {}, migrateLegacyRagStorage: async () => { await gate; throw new SDKError('gone', 'RAG_MANAGER_DISPOSED', { retryable: false }); } };
    const logs = { dispose: () => {}, migrateLegacyConversationLogs: async () => { await gate; throw new SDKError('gone', 'STORAGE_MANAGER_DISPOSED', { retryable: false }); } };
    const s = realSdk({ authenticated: true, vectorRAGManager: rag, storageManager: logs, vectorRAGReady: Promise.resolve() });
    const migration = s.migrateToSealedStorage().catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    release();
    expect(await migration).toMatchObject({
      code: 'AUTH_SUPERSEDED',
      details: { ragError: { code: 'RAG_MANAGER_DISPOSED' }, logsError: { code: 'STORAGE_MANAGER_DISPOSED' } },
    });
  });

  test('GG8: disconnect() resolves once the bridge has closed', async () => {
    let closed = false;
    const bridge = { disconnect: () => new Promise<void>((r) => setTimeout(() => { closed = true; r(); }, 10)) };
    const s = realSdk({ authenticated: true, bridgeClient: bridge });
    await s.disconnect();
    expect(closed).toBe(true);
  });
});
