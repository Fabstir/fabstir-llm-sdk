// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 11 — SDK-level classes (plan §24 EE4–EE8), on the release candidate.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, encryptionManager as em } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const SRC = join(__dirname, '../../src');
const initStorage = (FabstirSDKCore.prototype as any)._initStorage;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** A real-prototype SDK whose wallet step records the key and whose manager start waits on a gate the test opens. */
function sdkWithGates() {
  const s: any = Object.create(FabstirSDKCore.prototype);
  const gates: Array<{ release: () => void; fail: (e: unknown) => void }> = [];
  const wallets: string[] = [];
  Object.assign(s, {
    authQueue: Promise.resolve(), identityEpoch: 0, // class fields: Object.create skips their initialisers
    config: { contractAddresses: {}, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } },
    authenticateWithPrivateKey: async (key: string) => { wallets.push(key); s.userAddress = `wallet-${key}`; s.s5Seed = `seed-${key}`; s.signer = { key }; },
    authenticateWithSigner: async (signer: any) => { wallets.push(signer.key); s.userAddress = `wallet-${signer.key}`; s.signer = signer; },
    initializeManagers: () => new Promise<void>((release, fail) => {
      gates.push({ release: () => { s.paymentManager = { setDelegatePayer: (p: string) => { s.paymentManager.payer = p; } }; release(); }, fail });
    }),
  });
  return { s, gates, wallets };
}

function manager(tab: FakeS5Tab) {
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
  });
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

describe('EE4 — a sign-in that does not settle never holds sign-out hostage', () => {
  test('disconnect() takes effect at once; the sign-in it superseded removes what it wrote and rejects AUTH_SUPERSEDED', async () => {
    const { s, gates } = sdkWithGates();
    const a = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();                                              // resolves while A's start is still pending
    expect({ authenticated: s.isAuthenticated(), user: s.userAddress, seed: s.s5Seed }).toEqual({ authenticated: false, user: undefined, seed: undefined });
    gates[0].release();
    expect(await a).toMatchObject({ code: 'AUTH_SUPERSEDED', details: { retryable: false } });
    expect({ authenticated: s.isAuthenticated(), user: s.userAddress, seed: s.s5Seed, signer: s.signer }).toEqual({ authenticated: false, user: undefined, seed: undefined, signer: undefined });
  });

  test('a sign-in requested before the sign-out never runs; one requested after it does', async () => {
    const { s, gates, wallets } = sdkWithGates();
    const a = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    const b = s.authenticate('privatekey', { privateKey: 'B' }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    const c = s.authenticate('privatekey', { privateKey: 'C' });
    gates[0].release();
    expect(await a).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect(await b).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    await tick();
    gates[gates.length - 1].release();
    await c;
    expect({ wallets, user: s.userAddress, authenticated: s.isAuthenticated() }).toEqual({ wallets: ['A', 'C'], user: 'wallet-C', authenticated: true });
  });

  test('a storage start that never settles ends as STORAGE_UNAVAILABLE (bounded), not a hang', async () => {
    vi.useFakeTimers();
    const s: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(s, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: { initialize: () => new Promise(() => {}), isInitialized: () => false, dispose() {} } });
    const started = initStorage.call(s, false);
    await vi.advanceTimersByTimeAsync(120_000);
    await started;
    expect(s.storageUnavailable).toMatchObject({ code: 'STORAGE_UNAVAILABLE', details: { cause: { code: 'STORAGE_START_TIMEOUT' } } });
  });

  test('network detection that never answers is NETWORK_UNREACHABLE (bounded, retryable)', async () => {
    vi.useFakeTimers();
    const s: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(s, { readProviderSource: 'rpcUrl', readProvider: { getNetwork: () => new Promise(() => {}) }, signer: { provider: { getNetwork: async () => ({ chainId: 84532n }) } } });
    const check = (FabstirSDKCore.prototype as any).assertReadWriteChainParity.call(s).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await check).toMatchObject({ code: 'NETWORK_UNREACHABLE', details: { retryable: true } });
  });
});

describe('EE4 — the registration backend is bounded too', () => {
  test('a backend call that stalls is aborted, never left pending', async () => {
    vi.useFakeTimers();
    const { registerS5WithBackend } = await import('../../src/utils/s5-secure-registration');
    vi.stubGlobal('fetch', vi.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })));
    try {
      const s5 = { identity: {}, getSigningPublicKey: async () => 'pk-0123456789abcdefghij', sign: async () => 'sig' };
      const registration = registerS5WithBackend(s5 as any, { backendUrl: 'https://backend', portalHost: 'portal', portalUrl: 'https://portal' }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await registration).toMatchObject({ name: 'AbortError' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('EE5 — a composite sign-in is one identity change', () => {
  test('authenticateAsDelegate superseded by disconnect(): no delegate state survives; it rejects AUTH_SUPERSEDED', async () => {
    const { s, gates } = sdkWithGates();
    const d = s.authenticateAsDelegate({ signer: { key: 'D' }, payer: '0x' + 'a'.repeat(40) }).catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    gates[0].release();
    expect(await d).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    expect({ mode: s.authMode, payer: s.getDelegatePayer() }).toEqual({ mode: undefined, payer: undefined });
  });

  test('a plain sign-in after a delegate one carries no payer', async () => {
    const { s, gates } = sdkWithGates();
    const d = s.authenticateAsDelegate({ signer: { key: 'D' }, payer: '0x' + 'a'.repeat(40) });
    await tick();
    gates[0].release();
    await d;
    expect(s.getDelegatePayer()).toBe('0x' + 'a'.repeat(40));
    const b = s.authenticate('signer', { signer: { key: 'B' } });
    await tick();
    gates[1].release();
    await b;
    expect({ mode: s.authMode, payer: s.getDelegatePayer() }).toEqual({ mode: 'signer', payer: undefined });
  });
});

describe('EE6 — the manager never throws an uncoded error from its helpers', () => {
  test('addVectors on a database another tab created: no error after the write; the mirror is upserted', async () => {
    const net = new FakeS5Network();
    const a = manager(net.tab());
    await a.initialize();
    const b = manager(net.tab());
    await b.initialize();
    await b.createSession('kb');                                       // created after A started
    const session = await a.getOrCreateSessionId('kb');
    expect(a.listDatabases().map((d) => d.databaseName)).toContain('kb');   // learnt when opened
    await a.addVectors(session, [{ id: 'v1', vector: [0.1, 0.2], metadata: {} }] as any);
    expect(a.listDatabases().find((d) => d.databaseName === 'kb')?.vectorCount).toBe(1);
  });

  test('addVectors after another tab deleted and re-created the database (A refreshed in between): no error after the write', async () => {
    const net = new FakeS5Network();
    const a = manager(net.tab());
    await a.initialize();
    const session = await a.getOrCreateSessionId('kb');
    const b = manager(net.tab());
    await b.initialize();
    await b.deleteDatabase('kb');
    await a.refreshDatabases();                                        // A's list drops it
    await b.createSession('kb');                                       // and it comes back
    await a.addVectors(session, [{ id: 'v1', vector: [0.1, 0.2], metadata: {} }] as any);
    expect(a.listDatabases().find((d) => d.databaseName === 'kb')?.vectorCount).toBe(1);
  });

  test('config validation and the metadata service throw coded errors', async () => {
    const m = manager(new FakeS5Network().tab());
    await m.initialize();
    expect(await caught(m.createSession('kb', { chunkSize: -1 } as any))).toMatchObject({ code: 'RAG_CONFIG_INVALID', details: { retryable: false } });
    expect(() => new VectorRAGManager({ userAddress: ADDR, seedPhrase: SEED, config: { ...DEFAULT_RAG_CONFIG, chunkSize: -1 }, sessionManager: {} as any, s5Client: {} as any, encryptionManager: em() } as any))
      .toThrow(expect.objectContaining({ code: 'RAG_CONFIG_INVALID' }));
    expect(() => m.updateDatabaseMetadata('never-listed', { description: 'x' })).toThrow(expect.objectContaining({ code: 'RAG_DATABASE_NOT_FOUND', details: expect.objectContaining({ retryable: false }) }));
    const service = new DatabaseMetadataService();
    expect(() => service.create('  ', 'vector', ADDR)).toThrow(expect.objectContaining({ code: 'RAG_DATABASE_NAME_INVALID' }));
  });

  test('no plain Error is thrown from the metadata service or the RAG config', () => {
    const offenders = ['database/DatabaseMetadataService.ts', 'rag/config.ts'].filter((f) => /throw new Error\(/.test(readFileSync(join(SRC, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('EE7 — a disposed manager refuses every call', () => {
  test('deleteDatabase, refreshDatabases, getDatabaseMetadata, listDatabases — and nothing is deleted', async () => {
    const net = new FakeS5Network();
    const m = manager(net.tab());
    await m.initialize();
    await m.createSession('kb');
    await m.dispose();
    for (const call of [() => m.deleteDatabase('kb'), () => m.refreshDatabases(), () => m.getDatabaseMetadata('kb')]) {
      expect(await caught(call())).toMatchObject({ code: 'RAG_MANAGER_DISPOSED' });
    }
    expect(() => m.listDatabases()).toThrow(expect.objectContaining({ code: 'RAG_MANAGER_DISPOSED' }));
    const other = manager(net.tab());
    await other.initialize();
    await expect(other.getDatabaseMetadata('kb')).resolves.toMatchObject({ databaseName: 'kb' });
  });
});

describe('EE8 — createTranscodeJob reaches funding only when nothing after it can fail', () => {
  test('a malformed format fails before anything is uploaded or funded', async () => {
    const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
    const uploadJSON = vi.fn(async () => 'cid');
    const m = new TranscodeManager({ startSession }, { uploadJSON }, {}, {}, {} as any, 84532);
    await caught(m.createTranscodeJob({ mediaFormats: [{ id: 1, ext: 'mp4', vcodec: 264, vf: null }], hostAddress: '0x' + '1'.repeat(40), chainId: 84532, maxDuration: 60 } as any));
    expect(startSession).not.toHaveBeenCalled();
  });
});
