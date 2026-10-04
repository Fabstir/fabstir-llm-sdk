// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 15 — II5: the Base Account composite caches no seed of its own; it hands the seed to the signer
 * step, and `_authenticate` caches it once the sign-in is current (plan §28). The real signer step runs here. Its own
 * file: the wallet module is mocked for every test in it.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const wallet = vi.hoisted(() => ({ addressGate: undefined as Promise<void> | undefined, atSignerStep: false, derivations: 0 }));
vi.mock('../../src/utils/s5-seed-derivation', async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    generateS5SeedFromAddress: async (address: string, chainId: number) => {
      wallet.derivations++;
      return real.generateS5SeedFromAddress(address, chainId);
    },
  };
});
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
vi.mock('../../src/wallet', () => ({
  AASigner: class {},
  ensureSubAccount: async () => ({ address: '0x' + 'ab'.repeat(20), isExisting: true }),
  createSubAccountSigner: () => ({
    provider: { getBlockNumber: async () => 1 },
    getAddress: async () => { wallet.atSignerStep = true; if (wallet.addressGate) await wallet.addressGate; return '0x' + 'ab'.repeat(20); },
    sendTransaction: async () => ({ hash: '0x' + '11'.repeat(32) }),
  }),
}));
import { realSdk } from '../helpers/sdk-instance';
import { SEED } from '../helpers/sealed-fixtures';
import { generateS5SeedFromAddress } from '../../src/utils/s5-seed-derivation';

const PRIMARY = '0x' + 'cd'.repeat(20);
const SUB = '0x' + 'ab'.repeat(20);
const options = { provider: { request: async () => null }, primaryAccount: PRIMARY };
const tick = () => new Promise((r) => setTimeout(r, 0));

function browser() {
  const stored = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); },
    removeItem: (k: string) => { stored.delete(k); }, get length() { return stored.size; }, key: (i: number) => [...stored.keys()][i] ?? null,
  };
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('localStorage', localStorage);
  return stored;
}

/** The real signer step; no approval (no marketplace configured); managers stubbed. */
function sdk(fields: Record<string, unknown> = {}): any {
  const s = realSdk({ initializeManagers: async () => { s.paymentManager = { setDelegatePayer() {} }; }, ...fields });
  s.config = { ...s.config, contractAddresses: { ...s.config.contractAddresses, jobMarketplace: undefined } };
  return s;
}

beforeEach(() => {
  Object.assign(wallet, { addressGate: undefined, atSignerStep: false, derivations: 0 });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('II5 — the Base Account seed reaches the cache only through the sign-in', () => {
  test("a sign-in that stays current: the primary account's seed is the sub-account's S5 identity, cached under it", async () => {
    const stored = browser();
    const s = sdk();
    await s.authenticateWithBaseAccount(options);
    const expected = await generateS5SeedFromAddress(PRIMARY, 84532);
    expect(s.s5Seed).toBe(expected);
    expect([...stored.keys()]).toEqual([expect.stringContaining(SUB)]);
    expect(JSON.parse([...stored.values()][0]).seed).toBe(expected);
  });

  test('a sign-out during the signer step: AUTH_SUPERSEDED, and nothing cached', async () => {
    const stored = browser();
    let answer!: () => void;
    wallet.addressGate = new Promise<void>((r) => { answer = r; });
    const s = sdk();
    const signIn = s.authenticateWithBaseAccount(options).then(() => 'resolved', (e: any) => e?.code);
    for (let i = 0; i < 200 && !wallet.atSignerStep; i++) await tick();
    expect(wallet.atSignerStep).toBe(true);
    await s.disconnect();
    answer();
    expect(await signIn).toBe('AUTH_SUPERSEDED');
    expect([...stored.keys()]).toEqual([]);
  });

  test('a provided seedPhrase (the vault): nothing derived, nothing cached — the provided seed is the identity', async () => {
    const stored = browser();
    const s = sdk();
    s.config = { ...s.config, s5Config: { seedPhrase: SEED } };
    await s.authenticateWithBaseAccount(options);
    expect(s.s5Seed).toBe(SEED);
    expect(wallet.derivations).toBe(0);
    expect([...stored.keys()]).toEqual([]);
  });
});
