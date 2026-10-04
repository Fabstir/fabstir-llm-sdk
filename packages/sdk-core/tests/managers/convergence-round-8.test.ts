// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 8 — SDK-level classes (plan §21 BB3, BB5, BB6, BB12, BB16).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { StorageManager, STORAGE_MANAGER_SYNC_MEMBERS } from '../../src/managers/StorageManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { SDKError } from '../../src/types';
import { awaitFundingReceipt } from '../../src/contracts/funding-receipt';
import { fetchCheckpointIndex } from '../../src/utils/checkpoint-recovery';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { FakeS5Network } from '../helpers/fake-s5';
import { SEED, ADDR, encryptionManager as em } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const initStorage = (FabstirSDKCore.prototype as any)._initStorage;

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function unavailable(): Promise<any> {
  const s: any = Object.create(FabstirSDKCore.prototype);
  Object.assign(s, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: { initialize: async () => { throw new Error('portal down'); }, isInitialized: () => true, dispose() {} } });
  await initStorage.call(s, false);
  return s;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('BB3 — the unavailable store refuses each member the way the real one reports', () => {
  test('synchronous members throw at once; asynchronous ones reject; the connection status answers', async () => {
    const store = (await unavailable()).storageManager;
    // Run untranspiled, the tag is the truth: it keeps STORAGE_MANAGER_SYNC_MEMBERS complete (§22 CC7). A synchronous
    // member that is neither listed nor one of these private helpers fails here until it is classified.
    const isAsync = (fn: unknown) => Object.prototype.toString.call(fn) === '[object AsyncFunction]';
    const privateHelpers = new Set(['bytesToBase64Url', 'base64UrlToBytes', 'logHead', 'logPath', 'refusePlaintextRagWrite', 'requireSealer',
      'setupConnectionHandling', 'setupAutoReconnect', 'updateSyncStatus', 'isConnectionError', 'queueOperation', 'release', 'ensureNotDisposed', '_appendLocked']);
    const listed = new Set<string>(STORAGE_MANAGER_SYNC_MEMBERS);
    const proto = StorageManager.prototype as any;
    // `dispose`: nothing started, nothing to release (§26 GG1) — a sign-out with storage unavailable never throws.
    const answers: Record<string, unknown> = { isInitialized: true, getUserAddress: ADDR, getConnectionStatus: 'disconnected', dispose: undefined, cleanup: undefined }; // §32 MM5
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || typeof proto[name] !== 'function') continue;
      if (!isAsync(proto[name])) expect(listed.has(name) || privateHelpers.has(name), `${name} is classified`).toBe(true);
      if (privateHelpers.has(name)) continue;
      if (name in answers) {
        expect(store[name](), name).toBe(answers[name]);
      } else if (isAsync(proto[name])) {
        let result: unknown;
        expect(() => { result = store[name]('x'); }, name).not.toThrow();
        await expect(result, name).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
      } else {
        expect(() => store[name]('x'), name).toThrow(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
      }
    }
  });

  test('what the SDK does with it leaves no floating rejection: checkpoint recovery rejects STORAGE_UNAVAILABLE', async () => {
    const store = (await unavailable()).storageManager;
    expect(await caught(fetchCheckpointIndex(store, '0xabc', '1'))).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });
});

describe('BB5 — every code a caller may retry on says whether to', () => {
  test('updateDocumentStatus of a document in no database: RAG_DOCUMENT_NOT_FOUND, not retryable', async () => {
    const tab = new FakeS5Network().tab();
    const m = new VectorRAGManager({
      userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
      s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
    });
    await m.initialize();
    expect(await caught(m.updateDocumentStatus('nowhere', 'processing'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND', details: { retryable: false } });
    expect(await caught(m.createSession(''))).toMatchObject({ code: 'RAG_DATABASE_NAME_INVALID', details: { retryable: false } });
  });

  test('a funding outcome is never retried automatically: SESSION_ID_UNRESOLVED and SESSION_NOT_FUNDED say not retryable', async () => {
    const unknown = { hash: '0xT', wait: async () => { throw new Error('rpc down'); } };
    expect(await caught(awaitFundingReceipt(unknown))).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: '0xT', retryable: false } });
    const cancelled = { hash: '0xT', wait: async () => { throw Object.assign(new Error('replaced'), { code: 'TRANSACTION_REPLACED', reason: 'cancelled' }); } };
    expect(await caught(awaitFundingReceipt(cancelled))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { retryable: false } });
    const reverted = { hash: '0xT', wait: async () => ({ status: 0, hash: '0xT' }) };
    expect(await caught(awaitFundingReceipt(reverted))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { retryable: false } });
  });

  test('skipS5 (no storage by choice): the migration says running it again cannot help', async () => {
    const s: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(s, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: {}, config: { skipS5: true } });
    await initStorage.call(s, true);
    expect(await caught(s.getVectorRAGReady())).toMatchObject({ code: 'VECTOR_RAG_NOT_INITIALIZED', details: { retryable: false } });
    // Since §44 YY1: refused by the configuration, before anything starts — not MIGRATION_INCOMPLETE.
    expect(await caught(s.migrateToSealedStorage())).toMatchObject({ code: 'STORAGE_NOT_AVAILABLE', details: { retryable: false } });
  });

  test('storage unavailable: the migration rejects STORAGE_UNAVAILABLE itself, not nested twice', async () => {
    const s = await unavailable();
    expect(await caught(s.migrateToSealedStorage())).toBe(s.storageUnavailable);
  });
});

describe('BB6 — the SDK is authenticated only once its managers are up', () => {
  test('during initializeManagers — a re-authentication included — isAuthenticated() is false and the getters refuse', async () => {
    const s: any = Object.create(FabstirSDKCore.prototype);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    Object.assign(s, {
      authenticated: true, authQueue: Promise.resolve(), identityEpoch: 0, config: { contractAddresses: {}, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } },
      vectorRAGManager: { owner: 'the previous wallet', dispose: async () => {} }, // disposed by the sign-in (§25 FF1)
      authenticateWithPrivateKey: async () => undefined,
      initializeManagers: () => gate,
    });
    const auth = s.authenticate('privatekey', { privateKey: '0x02' });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.isAuthenticated()).toBe(false);
    expect(() => s.getVectorRAGManager()).toThrow(expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    release();
    await auth;
    expect(s.isAuthenticated()).toBe(true);
  });
});

describe('BB12 — a session that cannot be read back is never "not found"', () => {
  test('resuming a session whose log read fails says why (the storage code), not SESSION_NOT_FOUND', async () => {
    const readFailure = new SDKError('portal busy', 'STORAGE_LOAD_ERROR', { retryable: true });
    const sm = new SessionManager({ isInitialized: () => true } as any, { isInitialized: () => true, loadConversation: async () => { throw readFailure; } } as any);
    await sm.initialize();
    expect(await caught(sm.sendPromptStreaming(42n, 'hello'))).toBe(readFailure);
    const s = await unavailable();
    const unavailableSm = new SessionManager({ isInitialized: () => true } as any, s.storageManager);
    await unavailableSm.initialize();
    expect(await caught(unavailableSm.sendPromptStreaming(42n, 'hello'))).toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
  });

  test('a session with no log is still SESSION_NOT_FOUND', async () => {
    const sm = new SessionManager({ isInitialized: () => true } as any, { isInitialized: () => true, loadConversation: async () => null } as any);
    await sm.initialize();
    expect(await caught(sm.sendPromptStreaming(42n, 'hello'))).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});

describe('BB16 — a store stand-in is never thenable (AA1 pin)', () => {
  test('awaiting the unavailable store, or the skipS5 one, yields the store itself', async () => {
    const s = await unavailable();
    const store = s.storageManager;
    expect((await Promise.resolve(store)) === store).toBe(true);
    const t: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(t, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: {} });
    await initStorage.call(t, true);
    expect((await Promise.resolve(t.storageManager)) === t.storageManager).toBe(true);
  });
});
