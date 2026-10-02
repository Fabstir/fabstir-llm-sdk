// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 12 — FF2: the Base Account composite is one identity change (plan §25). Its own file: the wallet
 * module is mocked for every test in it.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

const walletCalls: string[] = [];
let sendTransaction: (tx: any) => Promise<any> = async () => ({ hash: '0x' + '11'.repeat(32) });
let mined = true;
const provider = {
  getTransactionReceipt: async () => (mined ? { status: 1, confirmations: async () => 1 } : null),
  getBlockNumber: async () => 1, on: async () => {}, off: async () => {}, once: async () => {},
};

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
// The seed derivation's real WebCrypto would race the fake clock under load (§28 II10): a fixed seed, at once.
vi.mock('../../src/utils/s5-seed-derivation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateS5SeedFromAddress: async () => 'a fixed test seed for the base account',
}));
vi.mock('../../src/wallet', () => ({
  AASigner: class {},
  ensureSubAccount: async () => { walletCalls.push('ensureSubAccount'); return { address: '0x' + 'ab'.repeat(20), isExisting: true }; },
  createSubAccountSigner: () => ({ provider, getAddress: async () => '0x' + 'ab'.repeat(20), sendTransaction: (tx: any) => sendTransaction(tx) }),
}));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';

const token = ethers.Wallet.createRandom().address;
const marketplace = ethers.Wallet.createRandom().address;
const options = { provider: { request: async () => null }, primaryAccount: '0x' + 'cd'.repeat(20), tokenAddress: token };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const outcome = (p: Promise<unknown>) => p.then((v) => ({ resolved: v }), (e: any) => ({ rejected: e?.code }));

function sdk(): any {
  const s: any = Object.create(FabstirSDKCore.prototype);
  Object.assign(s, {
    authQueue: Promise.resolve(), identityEpoch: 0, authenticated: false, // class fields: Object.create skips them
    config: { chainId: 84532, contractAddresses: { jobMarketplace: marketplace, usdcToken: token }, bridgeConfig: { url: 'http://bridge.invalid', autoConnect: false } },
    authenticateWithSigner: async (signer: any) => { s.signer = signer; s.provider = {}; s.userAddress = await signer.getAddress(); s.s5Seed = 'seed'; },
    initializeManagers: async () => { s.paymentManager = { setDelegatePayer() {} }; },
  });
  return s;
}

beforeEach(() => {
  walletCalls.length = 0;
  mined = true;
  sendTransaction = async () => ({ hash: '0x' + '11'.repeat(32) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

describe('FF2 — a Base Account sign-in is one identity change', () => {
  test('requested before a sign-out: it never starts — no wallet step', async () => {
    const s = sdk();
    let release!: () => void;
    s.authQueue = new Promise<void>((r) => { release = r; });           // an earlier sign-in is still running
    const signIn = outcome(s.authenticateWithBaseAccount(options));
    await s.disconnect();
    release();
    expect(await signIn).toEqual({ rejected: 'AUTH_SUPERSEDED' });
    expect(walletCalls).toEqual([]);
  });

  test('it waits its turn: no wallet step while an earlier sign-in runs', async () => {
    const s = sdk();
    let release!: () => void;
    s.authQueue = new Promise<void>((r) => { release = r; });
    const signIn = s.authenticateWithBaseAccount(options);
    await tick(10);
    expect(walletCalls).toEqual([]);
    release();
    await signIn;
    expect(walletCalls).toEqual(['ensureSubAccount']);
  });

  test('a sign-out during the approval prompt: AUTH_SUPERSEDED, never a success', async () => {
    const s = sdk();
    let answer!: () => void;
    sendTransaction = () => new Promise((r) => { answer = () => r({ hash: '0x' + '22'.repeat(32) }); });
    const signIn = outcome(s.authenticateWithBaseAccount(options));
    await tick(50);
    await s.disconnect();
    answer();
    expect(await signIn).toEqual({ rejected: 'AUTH_SUPERSEDED' });
    expect(s.isAuthenticated()).toBe(false);
  });

  test('a sign-out between the sign-in and the approval: no approval is sent, and it says AUTH_SUPERSEDED', async () => {
    const s = sdk();
    const sent = vi.fn(async () => ({ hash: '0x' + '33'.repeat(32) }));
    sendTransaction = sent;
    const signedIn = s._authenticate.bind(s);
    s._authenticate = async (...args: any[]) => { await signedIn(...args); queueMicrotask(() => { void s.disconnect(); }); };
    expect(await outcome(s.authenticateWithBaseAccount(options))).toEqual({ rejected: 'AUTH_SUPERSEDED' });
    expect(sent).not.toHaveBeenCalled();
  });

  test('an approval that never confirms is bounded: the sign-in settles, and a later one runs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    mined = false;
    const s = sdk();
    let settled: unknown;
    void outcome(s.authenticateWithBaseAccount(options)).then((r) => { settled = r; });
    // Real async work (the seed derivation's WebCrypto) runs between fake-timer steps.
    for (let step = 0; step < 30 && settled === undefined; step++) {
      await vi.advanceTimersByTimeAsync(10_000);
      await new Promise((r) => setImmediate(r));
    }
    expect(settled).toMatchObject({ resolved: { subAccount: '0x' + 'ab'.repeat(20) } });
    const later = outcome(s.authenticate('signer', { signer: { getAddress: async () => '0xB' } }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await later).toEqual({ resolved: undefined });
  });
});
