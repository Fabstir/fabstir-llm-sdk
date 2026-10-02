// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 10 — SDK-level classes (plan §23 DD1, DD3, DD6).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { SEED, ADDR } from '../helpers/sealed-fixtures';

const initStorage = (FabstirSDKCore.prototype as any)._initStorage;
const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** An SDK whose wallet step records the key and whose manager start waits on a gate the test opens. */
function sdkWithGates() {
  const s: any = Object.create(FabstirSDKCore.prototype);
  const gates: Array<{ release: () => void; fail: (e: unknown) => void }> = [];
  const wallets: string[] = [];
  Object.assign(s, {
    authQueue: Promise.resolve(), identityEpoch: 0, // class fields: Object.create skips their initialisers
    config: { contractAddresses: {}, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } },
    authenticateWithPrivateKey: async (key: string) => { wallets.push(key); s.userAddress = `wallet-${key}`; s.signer = { key }; },
    initializeManagers: () => new Promise<void>((release, fail) => { gates.push({ release, fail }); }),
  });
  return { s, gates, wallets };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('DD1 — identity changes run one after another', () => {
  test('a later authenticate() starts only once the earlier one settled: no mixed identity, the later one wins', async () => {
    const { s, gates, wallets } = sdkWithGates();
    const a = s.authenticate('privatekey', { privateKey: 'A' });
    const b = s.authenticate('privatekey', { privateKey: 'B' });
    await tick();
    expect(wallets).toEqual(['A']);                                   // B has not touched the identity
    gates[0].release();
    await a;
    await tick();
    expect(wallets).toEqual(['A', 'B']);
    expect(s.isAuthenticated()).toBe(false);                          // B's managers are starting
    gates[1].release();
    await b;
    expect({ authenticated: s.isAuthenticated(), user: s.userAddress }).toEqual({ authenticated: true, user: 'wallet-B' });
  });

  test('an earlier call that fails does not stop the next', async () => {
    const { s, gates } = sdkWithGates();
    const a = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    const b = s.authenticate('privatekey', { privateKey: 'B' });
    await tick();
    gates[0].fail(new Error('the first wallet went away'));
    expect(await a).toMatchObject({ code: 'AUTH_FAILED' });
    await tick();
    gates[1].release();
    await b;
    expect(s.isAuthenticated()).toBe(true);
  });

  // Revised by §24 EE4: disconnect() no longer waits for the sign-in — it supersedes it (see convergence-round-11).
  test('disconnect() during authenticate() signs out, and the sign-in does not undo it', async () => {
    const { s, gates } = sdkWithGates();
    const a = s.authenticate('privatekey', { privateKey: 'A' }).catch((e: unknown) => e);
    await tick();
    const d = s.disconnect();
    gates[0].release();
    expect(await a).toMatchObject({ code: 'AUTH_SUPERSEDED' });
    await d;
    expect({ authenticated: s.isAuthenticated(), signer: s.signer }).toEqual({ authenticated: false, signer: undefined });
  });
});

describe('DD3 — nothing is funded that cannot be reported', () => {
  async function unavailable(): Promise<any> {
    const s: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(s, {
      authenticated: true, s5Seed: SEED, userAddress: ADDR,
      transcodeManager: {}, ltxManager: {}, trainingManager: {},
      storageManager: { initialize: async () => { throw new Error('portal down'); }, isInitialized: () => true, dispose() {} },
    });
    await initStorage.call(s, false);
    return s;
  }

  test('with storage unavailable, the transcode, LTX and training managers refuse it (they need storage for results)', async () => {
    const s = await unavailable();
    for (const get of ['getTranscodeManager', 'getLtxManager', 'getTrainingManager']) {
      expect(() => s[get](), get).toThrow(expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }));
    }
  });

  test('createTranscodeJob uploads the spec first: an upload that fails funds nothing', async () => {
    const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
    const uploadFailure = Object.assign(new Error('portal busy'), { code: 'STORAGE_SAVE_ERROR' });
    const m = new TranscodeManager({ startSession }, { uploadJSON: async () => { throw uploadFailure; } }, {}, {}, {} as any, 84532);
    expect(await caught(m.createTranscodeJob({ mediaFormats: [{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1280x720' }], hostAddress: '0x' + '1'.repeat(40), chainId: 84532, maxDuration: 60 } as any))).toBe(uploadFailure);
    expect(startSession).not.toHaveBeenCalled();
  });
});

describe('DD6 — the unavailable stand-in answers only what a StorageManager has', () => {
  test('Object members are not storage calls: serialising or probing it never leaves a rejection behind', async () => {
    const s: any = Object.create(FabstirSDKCore.prototype);
    Object.assign(s, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: { initialize: async () => { throw new Error('portal down'); }, isInitialized: () => true, dispose() {} } });
    await initStorage.call(s, false);
    const store = s.storageManager;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    const listeners = process.listeners('unhandledRejection');
    for (const l of listeners) process.off('unhandledRejection', l as any);
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(JSON.stringify({ store })).toBe('{"store":{}}');
      expect(store.toJSON).toBeUndefined();
      expect(store.hasOwnProperty).toBeUndefined();
      expect(() => String(store)).toThrow(TypeError);
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      for (const l of listeners) process.on('unhandledRejection', l as any);
    }
  });
});
