// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 12 — SDK-level classes (plan §25 FF1, FF3, FF5).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, encryptionManager as em } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function manager(tab: FakeS5Tab) {
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
  });
}

/** A real-prototype SDK (class fields set by hand: Object.create skips their initialisers). */
function sdk(fields: Record<string, unknown> = {}): any {
  const s: any = Object.create(FabstirSDKCore.prototype);
  Object.assign(s, { authQueue: Promise.resolve(), identityEpoch: 0, config: { contractAddresses: {}, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } } }, fields);
  return s;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

describe('FF1 — an operation never outlives the identity it was asked for', () => {
  test("migrateToSealedStorage binds its managers when called: another identity's never run it", async () => {
    let ready!: () => void;
    const ragA = { migrateLegacyRagStorage: vi.fn(async () => ({ databases: [] })) };
    const ragB = { migrateLegacyRagStorage: vi.fn(async () => ({ databases: [] })) };
    const logsA = { migrateLegacyConversationLogs: vi.fn(async () => ({ failed: [] })) };
    const logsB = { migrateLegacyConversationLogs: vi.fn(async () => ({ failed: [] })) };
    const s = sdk({ authenticated: true, vectorRAGManager: ragA, storageManager: logsA, vectorRAGReady: new Promise<void>((r) => { ready = r; }) });
    const migration = s.migrateToSealedStorage({ discardUnreadable: { kb: { chunks: [0] } } });
    Object.assign(s, { vectorRAGManager: ragB, storageManager: logsB });   // another identity meanwhile
    ready();
    await migration;
    expect(ragA.migrateLegacyRagStorage).toHaveBeenCalled();
    expect(ragB.migrateLegacyRagStorage).not.toHaveBeenCalled();
    expect(logsB.migrateLegacyConversationLogs).not.toHaveBeenCalled();
  });

  test('a manager the UI held from before a sign-out refuses at once — reads and writes', async () => {
    const rag = manager(new FakeS5Network().tab());
    await rag.initialize();
    await rag.createSession('kb');
    const s = sdk({ authenticated: true, vectorRAGManager: rag });
    void s.disconnect();                                                // not even awaited
    expect(() => rag.listDatabases()).toThrow(expect.objectContaining({ code: 'RAG_MANAGER_DISPOSED' }));
    expect(await caught(rag.addPendingDocument('kb', { id: 'd' }))).toMatchObject({ code: 'RAG_MANAGER_DISPOSED' });
  });

  test("a sign-in starts by forgetting the previous identity: its manager refuses while the new one starts", async () => {
    const rag = manager(new FakeS5Network().tab());
    await rag.initialize();
    let release!: () => void;
    const s = sdk({
      authenticated: true, vectorRAGManager: rag,
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-B'; s.signer = {}; },
      initializeManagers: () => new Promise<void>((r) => { release = r; }),
    });
    const signIn = s.authenticate('privatekey', { privateKey: 'B' });
    await tick();
    expect(() => rag.listDatabases()).toThrow(expect.objectContaining({ code: 'RAG_MANAGER_DISPOSED' }));
    release();
    await signIn;
  });

  test('a sign-in that fails forgets what it wrote: no seed, signer or address of the attempt remain', async () => {
    const s = sdk({
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-A'; s.s5Seed = 'seed-A'; s.signer = { a: 1 }; },
      initializeManagers: async () => { throw new Error('a manager did not start'); },
    });
    expect(await caught(s.authenticate('privatekey', { privateKey: 'A' }))).toMatchObject({ code: 'AUTH_FAILED' });
    expect({ user: s.userAddress, seed: s.s5Seed, signer: s.signer }).toEqual({ user: undefined, seed: undefined, signer: undefined });
  });
});

describe("FF3 — AUTH_FAILED carries its cause's explicit verdict", () => {
  test('network detection that never answers: AUTH_FAILED retryable, the code nested', async () => {
    const s = sdk({
      authenticateWithPrivateKey: async () => { s.signer = {}; },
      initializeManagers: async () => { throw Object.assign(new Error('no answer'), { code: 'NETWORK_UNREACHABLE', details: { retryable: true } }); },
    });
    expect(await caught(s.authenticate('privatekey', { privateKey: 'A' }))).toMatchObject({ code: 'AUTH_FAILED', details: { retryable: true, cause: { code: 'NETWORK_UNREACHABLE' } } });
  });

  test('a cause without a verdict (a wallet rejection) gives none: never auto-retried', async () => {
    const s = sdk({
      authenticateWithPrivateKey: async () => { throw Object.assign(new Error('user rejected'), { code: 'ACTION_REJECTED' }); },
    });
    const error = await caught(s.authenticate('privatekey', { privateKey: 'A' }));
    expect(error.code).toBe('AUTH_FAILED');
    expect(error.details.retryable).toBeUndefined();
  });
});

describe('FF5 — pins round 11 lacked', () => {
  test('a sign-in superseded while it fails says AUTH_SUPERSEDED and forgets what it wrote after the sign-out', async () => {
    let fail!: (e: unknown) => void;
    const s = sdk({
      authenticateWithPrivateKey: async () => { s.userAddress = 'wallet-A'; s.signer = {}; },
      initializeManagers: () => new Promise<void>((_r, f) => { fail = f; }),
    });
    const signIn = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    s.sessionManager = { written: 'after the sign-out' };
    fail(new Error('a manager did not start'));
    expect(await signIn).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect(s.sessionManager).toBeUndefined();
  });

  test('a sign-out forgets every identity-bound manager, the keys included', async () => {
    const s = sdk({
      authenticated: true, encryptionManager: {}, ltxManager: {}, trainingManager: {}, sessionGroupManager: { dispose() {} },
      vectorRAGManager: { dispose: async () => {} },
    });
    await s.disconnect();
    expect({ e: s.encryptionManager, l: s.ltxManager, t: s.trainingManager, g: s.sessionGroupManager, r: s.vectorRAGManager })
      .toEqual({ e: undefined, l: undefined, t: undefined, g: undefined, r: undefined });
  });

  test('MetaMask network detection that never answers is bounded: NETWORK_UNREACHABLE', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const accounts = ['0x' + '12'.repeat(20)];
    vi.stubGlobal('window', { ethereum: { request: ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return Promise.resolve(accounts);
      return new Promise(() => {});                                     // eth_chainId never answers
    } } });
    try {
      const s = sdk({ config: { chainId: 84532, contractAddresses: {}, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } } });
      const signIn = (FabstirSDKCore.prototype as any).authenticateWithMetaMask.call(s).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await signIn).toMatchObject({ code: 'NETWORK_UNREACHABLE' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('a disposed manager refuses every public method (a walk over its prototype)', async () => {
    const rag = manager(new FakeS5Network().tab());
    await rag.initialize();
    await rag.dispose();
    const proto = VectorRAGManager.prototype as any;
    const isPrivate = new Set(['ensureNotDisposed', 'mirror', 'checkPermission', '_cosineSimilarity']);
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name === 'dispose' || typeof proto[name] !== 'function' || isPrivate.has(name) || name.startsWith('_')) continue;
      let outcome: any;
      try { outcome = await (rag as any)[name]('kb', 'x', 'y'); } catch (e) { outcome = e; }
      expect(outcome?.code, name).toBe('RAG_MANAGER_DISPOSED');
    }
  });

  test("EE8: a malformed format fails before the upload, too", async () => {
    const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
    const uploadJSON = vi.fn(async () => 'cid');
    const m = new TranscodeManager({ startSession }, { uploadJSON }, {}, {}, {} as any, 84532);
    await caught(m.createTranscodeJob({ mediaFormats: [{ id: 1, ext: 'mp4', vcodec: 264, vf: null }], hostAddress: '0x' + '1'.repeat(40), chainId: 84532, maxDuration: 60 } as any));
    expect(uploadJSON).not.toHaveBeenCalled();
    expect(startSession).not.toHaveBeenCalled();
  });
});
