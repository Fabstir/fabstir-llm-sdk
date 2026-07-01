// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 3.3 — legacy delegate ETH preflight → DELEGATE_UNFUNDED (RED → GREEN).
 *
 * In the legacy (non-gasless) delegate path, a 0-ETH hot EOA would hang silently
 * at createSessionForModelAsDelegate. We preflight the balance and fail fast with
 * DELEGATE_UNFUNDED (naming the address + suggesting FABSTIR_GASLESS=1). The
 * gasless path skips the check entirely (structurally no EOA gas).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

const { EOA_ADDR, SA } = vi.hoisted(() => ({
  EOA_ADDR: '0xeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoaeoa1',
  SA: '0x55555555555555555555555555555555aabbccdd',
}));

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn(),
  ChainRegistry: { getChain: vi.fn().mockReturnValue({ contracts: {}, rpcUrl: 'https://rpc' }) },
  ChainId: {},
}));
vi.mock('../../src/delegate/delegate-key', () => ({
  loadOrCreateDelegateKey: vi.fn().mockReturnValue({
    wallet: { privateKey: '0x' + '11'.repeat(32), address: EOA_ADDR },
    address: EOA_ADDR,
  }),
  defaultDelegateKeyPath: () => '/tmp/delegate.key',
}));
vi.mock('../../src/delegate/smart-account', () => ({
  buildSmartDelegate: vi.fn().mockResolvedValue({ signer: { getAddress: async () => SA }, address: SA, owner: {} }),
}));

import { buildDelegateContext } from '../../src/cli/orchestrate';

const PAYER = '0xpayerpayerpayerpayerpayerpayerpayerpaye1';
function opts(env: Record<string, string>, balance: bigint) {
  return {
    payer: PAYER,
    rpcUrl: 'https://rpc',
    chainId: 84532,
    provider: { getBalance: vi.fn().mockResolvedValue(balance) } as any,
    env: { ENTRY_POINT_ADDRESS: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', ...env },
    log: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('legacy delegate ETH preflight', () => {
  it('legacy + 0 ETH ⟹ throws DELEGATE_UNFUNDED naming the delegate address', async () => {
    await expect(buildDelegateContext(opts({}, 0n))).rejects.toMatchObject({ code: 'DELEGATE_UNFUNDED' });
    await expect(buildDelegateContext(opts({}, 0n))).rejects.toThrow(new RegExp(EOA_ADDR));
  });

  it('legacy + funded (> threshold) ⟹ no throw', async () => {
    const ctx = await buildDelegateContext(opts({}, ethers.parseEther('1')));
    expect(ctx.gasless).toBe(false);
    expect(ctx.address).toBe(EOA_ADDR);
  });

  it('gasless mode skips the ETH preflight entirely', async () => {
    const o = opts({ FABSTIR_GASLESS: '1', FABSTIR_ACCOUNT_FACTORY: '0x4444444444444444444444444444444444444444' }, 0n);
    const ctx = await buildDelegateContext(o);
    expect(ctx.gasless).toBe(true);
    expect(o.provider.getBalance).not.toHaveBeenCalled();
  });
});
