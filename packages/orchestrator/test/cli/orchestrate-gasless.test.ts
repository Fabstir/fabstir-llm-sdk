// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 3.2 — FABSTIR_GASLESS opt-in delegate context (RED → GREEN).
 *
 * `buildDelegateContext` is the tested seam (avoids starting servers). It calls
 * loadOrCreateDelegateKey in BOTH modes (stable hot key, Constraint 8), and only
 * on FABSTIR_GASLESS=1 wraps that SAME key as the SimpleAccount owner via
 * buildSmartDelegate (Constraint 5/7), logging the loud re-auth notice. sdk-core,
 * delegate-key, and smart-account are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { EOA_KEY, EOA_ADDR, SA, AASIGNER } = vi.hoisted(() => ({
  EOA_KEY: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  EOA_ADDR: '0xeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoa1',
  SA: '0x55555555555555555555555555555555aabbccdd',
  AASIGNER: { getAddress: async () => '0x55555555555555555555555555555555aabbccdd' },
}));

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn(),
  ChainRegistry: { getChain: vi.fn().mockReturnValue({ contracts: {}, rpcUrl: 'https://rpc' }) },
  ChainId: {},
}));
vi.mock('../../src/delegate/delegate-key', () => ({
  loadOrCreateDelegateKey: vi.fn().mockReturnValue({
    wallet: { privateKey: EOA_KEY, address: EOA_ADDR },
    address: EOA_ADDR,
  }),
  defaultDelegateKeyPath: () => '/tmp/delegate.key',
}));
vi.mock('../../src/delegate/smart-account', () => ({
  buildSmartDelegate: vi.fn().mockResolvedValue({ signer: AASIGNER, address: SA, owner: {} }),
}));

import { buildDelegateContext, CDP_BASE_SEPOLIA_RPC } from '../../src/cli/orchestrate';
import { loadOrCreateDelegateKey } from '../../src/delegate/delegate-key';
import { buildSmartDelegate } from '../../src/delegate/smart-account';

const PAYER = '0xpayerpayerpayerpayerpayerpayerpayerpaye1';
const baseOpts = (env: Record<string, string>) => ({
  payer: PAYER,
  rpcUrl: 'https://rpc',
  chainId: 84532,
  // funded by default so the legacy ETH preflight (3.3) passes; gasless skips it
  provider: { getBalance: vi.fn().mockResolvedValue(10n ** 18n) } as any,
  env: { ENTRY_POINT_ADDRESS: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', ...env },
  log: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());

describe('buildDelegateContext', () => {
  it('legacy (FABSTIR_GASLESS unset): loadOrCreateDelegateKey called, buildSmartDelegate NOT called, EOA used', async () => {
    const ctx = await buildDelegateContext(baseOpts({}));
    expect(loadOrCreateDelegateKey).toHaveBeenCalledTimes(1);
    expect(buildSmartDelegate).not.toHaveBeenCalled();
    expect(ctx.gasless).toBe(false);
    expect(ctx.address).toBe(EOA_ADDR);
  });

  it('gasless (FABSTIR_GASLESS=1 + factory): wraps the SAME persisted key as the SA owner', async () => {
    const opts = baseOpts({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: '0x4444444444444444444444444444444444444444' });
    const ctx = await buildDelegateContext(opts);
    expect(loadOrCreateDelegateKey).toHaveBeenCalledTimes(1); // stable hot key in BOTH modes
    expect(buildSmartDelegate).toHaveBeenCalledWith(expect.objectContaining({ eoaKey: EOA_KEY, autoDeploy: true }));
    expect(ctx.gasless).toBe(true);
    expect(ctx.signer).toBe(AASIGNER);
    expect(ctx.address).toBe(SA);
    // SA address logged + re-auth notice emitted
    const logged = opts.log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(SA);
    expect(logged).toMatch(/authorize|approve|does NOT carry over/i);
  });

  it('gasless without FABSTIR_ACCOUNT_FACTORY ⟹ clear config error (no fallback)', async () => {
    await expect(buildDelegateContext(baseOpts({ FABSTIR_GASLESS: '1' }))).rejects.toThrow(/FABSTIR_ACCOUNT_FACTORY/);
  });

  it('bundler/paymaster URLs default to the CDP base-sepolia endpoint when unset', async () => {
    await buildDelegateContext(baseOpts({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: '0x4444444444444444444444444444444444444444' }));
    expect(buildSmartDelegate).toHaveBeenCalledWith(
      expect.objectContaining({ bundlerUrl: CDP_BASE_SEPOLIA_RPC, paymasterUrl: CDP_BASE_SEPOLIA_RPC }),
    );
    expect(CDP_BASE_SEPOLIA_RPC).toContain('coinbase');
  });

  // EntryPoint / factory env-name tolerance — accept the NEXT_PUBLIC_ prefix the rest of the
  // chain config uses, so operators don't have to set a duplicate bare var.
  const FACTORY = '0x4444444444444444444444444444444444444444';
  const EP = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
  const noBareEntryPoint = (env: Record<string, string>) => ({
    payer: PAYER, rpcUrl: 'https://rpc', chainId: 84532,
    provider: { getBalance: vi.fn().mockResolvedValue(10n ** 18n) } as any,
    env, log: vi.fn(),
  });

  it('resolves the EntryPoint from NEXT_PUBLIC_ENTRY_POINT_ADDRESS when the bare var is unset', async () => {
    await buildDelegateContext(noBareEntryPoint({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: FACTORY, NEXT_PUBLIC_ENTRY_POINT_ADDRESS: EP }));
    expect(buildSmartDelegate).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: EP }));
  });

  it('resolves the EntryPoint from NEXT_PUBLIC_BASE_ENTRY_POINT_ADDRESS too', async () => {
    await buildDelegateContext(noBareEntryPoint({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: FACTORY, NEXT_PUBLIC_BASE_ENTRY_POINT_ADDRESS: EP }));
    expect(buildSmartDelegate).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: EP }));
  });

  it('resolves the factory from NEXT_PUBLIC_FABSTIR_ACCOUNT_FACTORY when the bare var is unset', async () => {
    await buildDelegateContext(noBareEntryPoint({ FABSTIR_GASLESS: '1', ENTRY_POINT_ADDRESS: EP, NEXT_PUBLIC_FABSTIR_ACCOUNT_FACTORY: FACTORY }));
    expect(buildSmartDelegate).toHaveBeenCalledWith(expect.objectContaining({ factory: FACTORY }));
  });

  it('no EntryPoint var at all ⟹ clear config error listing the accepted names', async () => {
    await expect(
      buildDelegateContext(noBareEntryPoint({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: FACTORY })),
    ).rejects.toThrow(/ENTRY_POINT_ADDRESS|NEXT_PUBLIC_ENTRY_POINT_ADDRESS/);
  });
});
