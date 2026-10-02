// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 13 — SDK-level classes (plan §26 GG1, GG2, GG3, GG5, GG8). Every SDK here is a real instance
 * (`realSdk`), never `Object.create` (GG9).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// An S5 that starts at once, except for the last step of its start — which waits on `s5.gate`.
const s5 = vi.hoisted(() => ({ gate: Promise.resolve() as Promise<void>, reachedGate: false, unsubscribed: 0 }));
vi.mock('@julesl23/s5js', () => ({
  isS5RegistryUnavailableError: () => false, // beta.56's root export (plan §19 Z1)
  S5: {
    create: async () => ({
      recoverIdentityFromSeedPhrase: async () => {},
      onConnectionChange: (cb: (status: string) => void) => { cb('connected'); return () => { s5.unsubscribed++; }; },
      registerOnNewPortal: async () => {},
      reconnect: async () => {},
      fs: { ensureIdentityInitialized: () => { s5.reachedGate = true; return s5.gate; } },
    }),
  },
}));
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { SDKError } from '../../src/types';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const SRC = join(__dirname, '../../src');
const tick = () => new Promise((r) => setTimeout(r, 0));
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const conversation = (id: string, messages: any[] = []) => ({
  id, messages, metadata: { model: 'm', jobId: '7', status: 'active' }, createdAt: 1, updatedAt: 1,
});
const msg = (content: string) => ({ role: 'user', content, timestamp: 1 });

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** A started store on a fake S5 tab (as the sealed-log suites build one). */
function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

/** The members a class declares `private` — read from its source, so a new public member is walked automatically. */
function privateMembers(file: string): Set<string> {
  const source = readFileSync(join(SRC, file), 'utf8');
  return new Set([...source.matchAll(/^\s+private\s+(?:static\s+)?(?:readonly\s+)?(?:async\s+)?(\w+)\s*[(<]/gm)].map((m) => m[1]));
}

/** Every public method of `proto` called on `instance`: the code each one refuses with (sync throw or rejection). */
async function walk(proto: object, instance: any, skip: Set<string>): Promise<Record<string, unknown>> {
  const outcomes: Record<string, unknown> = {};
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (skip.has(name) || typeof (proto as any)[name] !== 'function') continue;
    let outcome: any;
    try { outcome = await instance[name]('x', 'y', 'z'); } catch (e) { outcome = e; }
    outcomes[name] = outcome?.code;
  }
  return outcomes;
}

/** `document` and `window` that record the listeners added to and removed from them. */
function eventTargets() {
  const added: Array<[string, unknown]> = [];
  const removed: Array<[string, unknown]> = [];
  const target = {
    addEventListener: (type: string, fn: unknown) => { added.push([type, fn]); },
    removeEventListener: (type: string, fn: unknown) => { removed.push([type, fn]); },
  };
  vi.stubGlobal('document', { ...target, visibilityState: 'visible' });
  vi.stubGlobal('window', target);
  return { added, removed };
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  Object.assign(s5, { gate: Promise.resolve(), reachedGate: false, unsubscribed: 0 });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GG1 — a sign-out disposes the storage and session-group managers too', () => {
  test('a StorageManager the UI held from before a sign-out refuses: nothing read, nothing written', async () => {
    const net = new FakeS5Network();
    const held = sm(net.tab());
    await held.saveConversation(conversation('41', [msg('the custody hearing moved to Friday')]) as any);
    const writes = net.writes.length;
    const s = realSdk({ authenticated: true, storageManager: held });
    void s.disconnect();                                                // not even awaited
    expect(await caught(held.loadConversation('41'))).toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED', details: { retryable: false } });
    expect(await caught(held.saveConversation(conversation('42') as any))).toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
    expect(() => held.isInitialized()).toThrow(expect.objectContaining({ code: 'STORAGE_MANAGER_DISPOSED' }));
    expect(net.writes.length).toBe(writes);
  });

  test('a disposed StorageManager refuses every public member (a prototype walk)', async () => {
    const held = sm(new FakeS5Network().tab());
    held.dispose();
    const outcomes = await walk(StorageManager.prototype, held,
      new Set(['constructor', 'dispose', 'cleanup', ...privateMembers('managers/StorageManager.ts')]));
    expect(Object.keys(outcomes).length).toBeGreaterThanOrEqual(60);
    expect(Object.entries(outcomes).filter(([, code]) => code !== 'STORAGE_MANAGER_DISPOSED')).toEqual([]);
  });

  test('a SessionGroupManager held from before a sign-out refuses every public member (a prototype walk)', async () => {
    const held = new SessionGroupManager();
    await held.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
    const s = realSdk({ authenticated: true, sessionGroupManager: held });
    await s.disconnect();
    const outcomes = await walk(SessionGroupManager.prototype, held,
      new Set(['constructor', 'dispose', ...privateMembers('managers/SessionGroupManager.ts')]));
    expect(Object.keys(outcomes).length).toBeGreaterThanOrEqual(19);
    expect(Object.entries(outcomes).filter(([, code]) => code !== 'SESSION_GROUP_MANAGER_DISPOSED')).toEqual([]);
  });

  test('disposal releases the store: its listeners (the same handlers) removed, its connection unsubscribed, its seed dropped, its queue rejected', async () => {
    const m = new StorageManager();
    const ev = eventTargets();
    await m.initialize(SEED, ADDR);
    expect(ev.added.map(([type]) => type).sort()).toEqual(['online', 'visibilitychange']);
    (m as any).connectionStatus = 'disconnected';
    const queued = m.putWithRetry('home/x', { a: 1 }).catch((e) => e);
    m.dispose();
    expect(ev.removed).toEqual(expect.arrayContaining(ev.added));
    expect(ev.removed).toHaveLength(ev.added.length);
    expect(s5.unsubscribed).toBe(1);
    expect((m as any).userSeed).toBeUndefined();
    expect(await queued).toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
  });

  test('a store disposed while its start still runs releases what the start sets up, once it ends', async () => {
    let open!: () => void;
    s5.gate = new Promise<void>((r) => { open = r; });
    const m = new StorageManager();
    const ev = eventTargets();
    const start = m.initialize(SEED, ADDR).catch(() => undefined);
    for (let i = 0; i < 50 && !s5.reachedGate; i++) await tick();
    expect(s5.reachedGate).toBe(true);
    m.dispose();
    open();
    await start;
    expect(ev.removed).toEqual(expect.arrayContaining(ev.added));
    expect(ev.removed).toHaveLength(ev.added.length);
    expect(s5.unsubscribed).toBe(1);
  });

  test('a storage start that stalls disposes the store it abandons', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s5.gate = new Promise<void>(() => {});                              // the portal never answers
    const abandoned = new StorageManager();
    const s = realSdk({ storageManager: abandoned, s5Seed: SEED, userAddress: ADDR });
    let settled = false;
    const started = s._initStorage(false).then(() => { settled = true; });
    for (let step = 0; step < 20 && !settled; step++) {
      await vi.advanceTimersByTimeAsync(10_000);
      await new Promise((r) => setImmediate(r));
    }
    await started;
    expect(s.storageManager).not.toBe(abandoned);
    expect(() => abandoned.isInitialized()).toThrow(expect.objectContaining({ code: 'STORAGE_MANAGER_DISPOSED' }));
  });

  test('with storage unavailable, a sign-out still settles — the stand-in has nothing to dispose', async () => {
    s5.gate = Promise.reject(new Error('portal refused'));
    s5.gate.catch(() => undefined);
    const s = realSdk({ storageManager: new StorageManager(), s5Seed: SEED, userAddress: ADDR, authenticated: true });
    await s._initStorage(false);
    expect(s.storageUnavailable).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    await expect(s.disconnect()).resolves.toBeUndefined();
  });
});

describe("GG2 — a migration superseded by the user's sign-out or next sign-in", () => {
  function sides() {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const rag = {
      dispose: async () => {},
      migrateLegacyRagStorage: async (o: any) => {
        o.onProgress?.({ phase: 'rag', done: 1, total: 2, item: 'a' });
        await gate;
        o.onProgress?.({ phase: 'rag', done: 2, total: 2, item: 'b' });
        return { databases: [{ name: 'a', status: 'migrated' }, { name: 'b', status: 'migrated' }] };
      },
    };
    const logs = {
      dispose: () => {},
      migrateLegacyConversationLogs: async (o: any) => {
        await gate;
        o.onProgress?.({ phase: 'logs', done: 1, total: 1, item: '41' });
        return { sealed: 1, alreadySealed: 0, purged: [], failed: [] };
      },
    };
    return { rag, logs, release };
  }

  test('a sign-out: AUTH_SUPERSEDED (not retryable) with both reports — and no progress after it', async () => {
    const { rag, logs, release } = sides();
    const s = realSdk({ authenticated: true, vectorRAGManager: rag, storageManager: logs, vectorRAGReady: Promise.resolve() });
    const events: string[] = [];
    const migration = s.migrateToSealedStorage({ onProgress: (e: any) => events.push(e.item) }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    release();
    expect(await migration).toMatchObject({
      code: 'AUTH_SUPERSEDED',
      details: { retryable: false, rag: { databases: [{ name: 'a' }, { name: 'b' }] }, logs: { sealed: 1 } },
    });
    expect(events).toEqual(['a']);
  });

  test('another sign-in: AUTH_SUPERSEDED too', async () => {
    const { rag, logs, release } = sides();
    const s = realSdk({
      authenticated: true, vectorRAGManager: rag, storageManager: logs, vectorRAGReady: Promise.resolve(),
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-B'; s.signer = {}; },
      initializeManagers: async () => { s.storageManager = { dispose() {} }; },
    });
    const migration = s.migrateToSealedStorage().catch((e: unknown) => e);
    await tick();
    await s.authenticate('privatekey', { privateKey: 'B' });
    release();
    expect(await migration).toMatchObject({ code: 'AUTH_SUPERSEDED', details: { retryable: false } });
  });
});

describe('GG3 — a progress callback that throws never stops the log migration', () => {
  test('every legacy log is sealed; the throw is warned about', async () => {
    const net = new FakeS5Network();
    for (let i = 1; i <= 7; i++) await net.tab().fs.put(logPath(String(i)), conversation(String(i), [msg(`q${i}`)]));
    const report = await sm(net.tab()).migrateLegacyConversationLogs({ onProgress: () => { throw new TypeError('ui bug'); } });
    expect(report).toMatchObject({ sealed: 7, failed: [] });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('onProgress'), expect.any(TypeError));
  });
});

describe('GG5 — a sign-in failing S5JS_UNSUPPORTED_VERSION forgets its attempt', () => {
  test('no seed, signer or address of the attempt remain', async () => {
    const s = realSdk({
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-A'; s.s5Seed = 'seed-A'; s.signer = { a: 1 }; },
      initializeManagers: async () => { throw new SDKError('old s5js', 'S5JS_UNSUPPORTED_VERSION', { retryable: false }); },
    });
    expect(await caught(s.authenticate('privatekey', { privateKey: 'A' }))).toMatchObject({ code: 'S5JS_UNSUPPORTED_VERSION' });
    expect({ user: s.userAddress, seed: s.s5Seed, signer: s.signer }).toEqual({ user: undefined, seed: undefined, signer: undefined });
  });
});

describe('GG8 — the bridge client goes with the identity', () => {
  test('a sign-out closes and drops it', async () => {
    const bridge = { disconnect: vi.fn(async () => {}) };
    const s = realSdk({ authenticated: true, bridgeClient: bridge });
    await s.disconnect();
    expect(bridge.disconnect).toHaveBeenCalled();
    expect(s.getBridgeClient()).toBeUndefined();
  });

  test('a superseded sign-in closes the bridge it built', async () => {
    let finish!: () => void;
    const bridge = { disconnect: vi.fn(async () => {}) };
    const s = realSdk({
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-A'; s.signer = {}; },
      initializeManagers: () => new Promise<void>((r) => { finish = () => { s.bridgeClient = bridge; r(); }; }),
    });
    const signIn = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    finish();
    expect(await signIn).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect(bridge.disconnect).toHaveBeenCalled();
    expect(s.getBridgeClient()).toBeUndefined();
  });
});
