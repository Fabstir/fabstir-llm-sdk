// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 14 — HH3 on the Base Account path: no seed is cached once a sign-out superseded the sign-in, not
 * even one that came during the seed derivation (plan §27). Its own file: the wallet module is mocked for every test.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const seeds = vi.hoisted(() => ({ gate: undefined as Promise<void> | undefined, reached: false }));
vi.mock('../../src/utils/s5-seed-derivation', async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    generateS5SeedFromAddress: async (address: string, chainId: number) => {
      seeds.reached = true;
      if (seeds.gate) await seeds.gate;
      return real.generateS5SeedFromAddress(address, chainId);
    },
  };
});
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
vi.mock('../../src/wallet', () => ({
  AASigner: class {},
  ensureSubAccount: async () => ({ address: '0x' + 'ab'.repeat(20), isExisting: true }),
  createSubAccountSigner: () => ({
    provider: {
      getTransactionReceipt: async () => ({ status: 1, logs: [], confirmations: async () => 1 }),
      getBlockNumber: async () => 1, on: async () => {}, off: async () => {}, once: async () => {},
    },
    getAddress: async () => '0x' + 'ab'.repeat(20),
    sendTransaction: async () => ({ hash: '0x' + '11'.repeat(32) }),
  }),
}));
import { realSdk } from '../helpers/sdk-instance';

const options = { provider: { request: async () => null }, primaryAccount: '0x' + 'cd'.repeat(20) };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.assign(seeds, { gate: undefined, reached: false });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('HH3 — Base Account: no seed cached after a sign-out', () => {
  test('a sign-out during the seed derivation: AUTH_SUPERSEDED, nothing in localStorage', async () => {
    const stored = new Map<string, string>();
    const localStorage = {
      getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); },
      removeItem: (k: string) => { stored.delete(k); }, get length() { return stored.size; }, key: (i: number) => [...stored.keys()][i] ?? null,
    };
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('localStorage', localStorage);
    let derive!: () => void;
    seeds.gate = new Promise<void>((r) => { derive = r; });
    const s = realSdk({
      authenticateWithSigner: async (signer: any) => { s.signer = signer; s.provider = {}; s.userAddress = await signer.getAddress(); s.s5Seed = 'seed'; },
      initializeManagers: async () => { s.paymentManager = { setDelegatePayer() {} }; },
    });
    const signIn = s.authenticateWithBaseAccount(options).then(() => 'resolved', (e: any) => e?.code);
    for (let i = 0; i < 50 && !seeds.reached; i++) await tick();
    expect(seeds.reached).toBe(true);
    await s.disconnect();
    derive();
    expect(await signIn).toBe('AUTH_SUPERSEDED');
    expect([...stored.keys()]).toEqual([]);
  });
});
