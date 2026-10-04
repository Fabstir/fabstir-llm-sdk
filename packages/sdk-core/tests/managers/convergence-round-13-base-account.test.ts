// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 13 — GG4: the Base Account approval, bounded whole and reported; nothing cached after a sign-out
 * during the sub-account prompt (plan §26). Its own file: the wallet module is mocked for every test in it.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const wallet = vi.hoisted(() => ({
  prompt: undefined as Promise<void> | undefined,                       // the sub-account prompt, while it is open
  sendTransaction: (async () => ({ hash: '0x' + '11'.repeat(32) })) as (tx: any) => Promise<any>,
}));
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
// The seed derivation's real WebCrypto would race the fake clock under load (§28 II10): a fixed seed, at once.
vi.mock('../../src/utils/s5-seed-derivation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateS5SeedFromAddress: async () => 'a fixed test seed for the base account',
}));
vi.mock('../../src/wallet', () => ({
  AASigner: class {},
  ensureSubAccount: async () => {
    if (wallet.prompt) await wallet.prompt;
    return { address: '0x' + 'ab'.repeat(20), isExisting: true };
  },
  createSubAccountSigner: () => ({
    provider: {
      getTransactionReceipt: async () => ({ status: 1, logs: [], confirmations: async () => 1 }),
      getBlockNumber: async () => 1, on: async () => {}, off: async () => {}, once: async () => {},
    },
    getAddress: async () => '0x' + 'ab'.repeat(20),
    sendTransaction: (tx: any) => wallet.sendTransaction(tx),
  }),
}));
import { realSdk } from '../helpers/sdk-instance';

const options = { provider: { request: async () => null }, primaryAccount: '0x' + 'cd'.repeat(20) };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const outcome = (p: Promise<unknown>) => p.then((v) => ({ resolved: v }), (e: any) => ({ rejected: e?.code }));

function sdk(): any {
  const s = realSdk({
    authenticateWithSigner: async (signer: any) => { s.signer = signer; s.provider = {}; s.userAddress = await signer.getAddress(); s.s5Seed = 'seed'; },
    initializeManagers: async () => { s.paymentManager = { setDelegatePayer() {} }; },
  });
  return s;
}

/** Fake time, with the real async work (the seed derivation's WebCrypto) run between steps. */
async function settleWithin(p: Promise<unknown>, ms: number): Promise<unknown> {
  let settled: unknown;
  void p.then((r) => { settled = r; });
  for (let elapsed = 0; elapsed < ms && settled === undefined; elapsed += 10_000) {
    await vi.advanceTimersByTimeAsync(10_000);
    await new Promise((r) => setImmediate(r));
  }
  return settled;
}

beforeEach(() => {
  wallet.prompt = undefined;
  wallet.sendTransaction = async () => ({ hash: '0x' + '11'.repeat(32) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GG4 — the whole approval is bounded, and its outcome is in the result', () => {
  test("a send that never answers (no prompt to close) is bounded: 'unconfirmed', and a later sign-in runs", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    wallet.sendTransaction = () => new Promise(() => {});
    const s = sdk();
    expect(await settleWithin(outcome(s.authenticateWithBaseAccount(options)), 300_000))
      .toMatchObject({ resolved: { subAccount: '0x' + 'ab'.repeat(20), approval: 'unconfirmed', approvalError: { code: 'APPROVAL_UNCONFIRMED' } } });
    expect(await settleWithin(outcome(s.authenticate('signer', { signer: { getAddress: async () => '0xB' } })), 60_000))
      .toEqual({ resolved: undefined });
  });

  test("a confirmed approval: 'confirmed'", async () => {
    const result = await sdk().authenticateWithBaseAccount(options);
    expect(result).toMatchObject({ approval: 'confirmed' });
    expect(result.approvalError).toBeUndefined();
  });

  test("an approval that fails: 'failed', with its error", async () => {
    wallet.sendTransaction = async () => { throw new Error('user rejected the approval'); };
    const result = await sdk().authenticateWithBaseAccount(options);
    expect(result).toMatchObject({ approval: 'failed' });
    expect(String(result.approvalError?.message)).toContain('user rejected the approval');
  });

  test("no marketplace configured: 'skipped' — nothing is sent", async () => {
    const sent = vi.fn(async () => ({ hash: '0x' + '22'.repeat(32) }));
    wallet.sendTransaction = sent;
    const s = sdk();
    s.config = { ...s.config, contractAddresses: { ...s.config.contractAddresses, jobMarketplace: undefined } };
    expect(await s.authenticateWithBaseAccount(options)).toMatchObject({ approval: 'skipped' });
    expect(sent).not.toHaveBeenCalled();
  });
});

describe('GG4 — a sign-out during the sub-account prompt caches nothing', () => {
  test('AUTH_SUPERSEDED, and no seed is written to localStorage', async () => {
    const stored = new Map<string, string>();
    const localStorage = {
      getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); },
      removeItem: (k: string) => { stored.delete(k); }, get length() { return stored.size; }, key: (i: number) => [...stored.keys()][i] ?? null,
    };
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('localStorage', localStorage);
    let answer!: () => void;
    wallet.prompt = new Promise<void>((r) => { answer = r; });
    const s = sdk();
    const signIn = outcome(s.authenticateWithBaseAccount(options));
    await tick(10);
    await s.disconnect();                                               // the user signs out while the prompt is open
    answer();
    expect(await signIn).toEqual({ rejected: 'AUTH_SUPERSEDED' });
    expect([...stored.keys()]).toEqual([]);
  });
});
