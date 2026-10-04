// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Plan §19 Z16 (and Z1) — when storage does not start, the SDK says so: the log preflight and the RAG getters
 * reject STORAGE_UNAVAILABLE with the cause, so no session is funded with nowhere to log and no RAG call fails
 * "retryably" forever. An unsupported s5js is fatal. `skipS5` (storage deliberately off) is unchanged.
 */

import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { SDKError } from '../../src/types';
import { SEED, ADDR } from '../helpers/sealed-fixtures';

const initStorage = (FabstirSDKCore.prototype as any)._initStorage;

function sdk(initialize: () => Promise<void>, initialized = true): any {
  return {
    s5Seed: SEED, userAddress: ADDR, ensureAuthenticated() {},
    storageManager: { initialize, isInitialized: () => initialized, dispose() {} },
  };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

test('an unsupported s5js is fatal — never swallowed into a degraded store', async () => {
  const guard = new SDKError('s5js too old', 'S5JS_UNSUPPORTED_VERSION', { retryable: false });
  await expect(initStorage.call(sdk(async () => { throw guard; }), false)).rejects.toBe(guard);
});

test('a storage start that failed: the log preflight and the RAG getters say so, with the cause', async () => {
  const cause = new Error('portal down');
  const s = sdk(async () => { throw cause; });
  await initStorage.call(s, false);
  // Not retryable: nothing clears it but authenticating again (§20 AA1).
  await expect(s.storageManager.assertConversationLogWritable()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', details: { retryable: false, cause } });
  expect(() => FabstirSDKCore.prototype.getVectorRAGManager.call(s)).toThrow(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
  await expect(FabstirSDKCore.prototype.getVectorRAGReady.call(s)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
});

test('S5 that never connected (initialize returned, nothing initialised) is the same', async () => {
  const s = sdk(async () => undefined, false);
  await initStorage.call(s, false);
  await expect(s.storageManager.assertConversationLogWritable()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
});

test('skipS5 — the app chose no storage: the log preflight passes as before', async () => {
  const s = sdk(async () => { throw new Error('never called'); });
  await initStorage.call(s, true);
  await expect(s.storageManager.assertConversationLogWritable()).resolves.toBeUndefined();
});

test('MIGRATION_INCOMPLETE says whether running it again may help (§19 Z14)', async () => {
  const migrate = (FabstirSDKCore.prototype as any).migrateToSealedStorage;
  const self = (ragError: SDKError) => ({
    config: {},                                                       // a real SDK always has one (§44 YY1 reads it)
    getVectorRAGReady: async () => undefined,
    getVectorRAGManager: () => ({ migrateLegacyRagStorage: async () => { throw ragError; } }),
    getStorageManager: () => ({ migrateLegacyConversationLogs: async () => ({ sealed: 0, alreadySealed: 0, purged: [], failed: [] }) }),
  });
  await expect(migrate.call(self(new SDKError('offline', 'STORAGE_OFFLINE', { retryable: true })))).rejects.toMatchObject({ code: 'MIGRATION_INCOMPLETE', details: { retryable: true } });
  await expect(migrate.call(self(new SDKError('no locks', 'RAG_COHERENCE_UNAVAILABLE', { retryable: false })))).rejects.toMatchObject({ code: 'MIGRATION_INCOMPLETE', details: { retryable: false } });
});

test('§20 AA1 — every storage call says so, the group manager too; only the address and the presence answer', async () => {
  const s = sdk(async () => { throw new Error('portal down'); });
  await initStorage.call(s, false);
  for (const call of ['loadConversation', 'saveConversation', 'appendMessage', 'getUserSettings', 'getHostSelectionMode', 'migrateLegacyConversationLogs']) {
    await expect(s.storageManager[call]('x')).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', details: { retryable: false } });
  }
  expect(s.storageManager.getUserAddress()).toBe(ADDR);
  expect(s.storageManager.isInitialized()).toBe(true);
  expect(() => FabstirSDKCore.prototype.getSessionGroupManager.call(s)).toThrow(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
});

test('§20 AA1 — a later start that succeeds clears it, and so does disconnect()', async () => {
  const s = sdk(async () => { throw new Error('portal down'); });
  await initStorage.call(s, false);
  s.storageManager = { initialize: async () => undefined, isInitialized: () => true, dispose() {} };
  await initStorage.call(s, false);
  expect(() => FabstirSDKCore.prototype.getVectorRAGManager.call(s)).not.toThrow();
  // A real instance's queue (§23 DD1): disconnect() runs after any sign-in in flight.
  const t = Object.assign(Object.create(FabstirSDKCore.prototype), sdk(async () => { throw new Error('portal down'); }), { authQueue: Promise.resolve(), identityEpoch: 0 });
  await initStorage.call(t, false);
  await FabstirSDKCore.prototype.disconnect.call(t);
  expect(t.storageUnavailable).toBeUndefined();
});

test('§20 AA6 — authenticate passes an unsupported s5js through, and is never left half-authenticated', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const guard = new SDKError('s5js too old', 'S5JS_UNSUPPORTED_VERSION', { retryable: false });
  const s: any = Object.create(FabstirSDKCore.prototype);
  Object.assign(s, { authQueue: Promise.resolve(), identityEpoch: 0, config: { contractAddresses: {} }, authenticateWithPrivateKey: async () => undefined, initializeManagers: async () => { throw guard; } });
  await expect(s.authenticate('privatekey', { privateKey: '0x01' })).rejects.toBe(guard);
  expect(s.authenticated).toBe(false);
  const other = new SDKError('boom', 'SOME_CODE');
  s.initializeManagers = async () => { throw other; };
  expect(await s.authenticate('privatekey', { privateKey: '0x01' }).catch((e: unknown) => e)).toMatchObject({ code: 'AUTH_FAILED', details: { cause: other } });
  expect(s.authenticated).toBe(false);
});

