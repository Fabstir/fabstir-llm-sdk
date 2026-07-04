// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FabstirSDKCore.enableDelegatePayments({ signer, payer }) / disableDelegatePayments().
 *
 * Enables delegate-pays on an ALREADY-authenticated primary session: the PaymentManager
 * signs escrow with the sub-account (popup-free) while `payer` funds via its USDC allowance.
 * The authenticated identity (userAddress, signer, authMode) MUST stay the primary — unlike
 * authenticateAsDelegate, which re-authenticates AS the delegate and hijacks the identity.
 *
 * `authenticate` is spied to simulate a primary signer auth without real S5/manager init; a
 * real PaymentManager is injected so signer-swap + payer propagation are exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { ChainId } from '../../src/types/chain.types';

const CHAIN = ChainId.BASE_SEPOLIA;

function makeSdk() {
  const sdk = new FabstirSDKCore({
    mode: 'production',
    chainId: 84532,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org',
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
      usdcToken: process.env.CONTRACT_USDC_TOKEN,
    },
  } as any);

  const primary = ethers.Wallet.createRandom();
  const subAccount = ethers.Wallet.createRandom();
  const pm = new PaymentManager(undefined, CHAIN);

  // Simulate a successful PRIMARY signer authentication (identity = primary), no real init.
  const authSpy = vi
    .spyOn(sdk, 'authenticate')
    .mockImplementation(async (method: any, opts: any) => {
      (sdk as any).signer = opts.signer;
      (sdk as any).userAddress = await opts.signer.getAddress();
      (sdk as any).authenticated = true;
      (sdk as any).authMode = method;
      (sdk as any).paymentManager = pm;
      await pm.initialize(opts.signer); // builds a wrapper bound to the PRIMARY signer
    });

  return { sdk, primary, subAccount, pm, authSpy };
}

async function authedPrimary() {
  const ctx = makeSdk();
  await ctx.sdk.authenticate('signer', { signer: ctx.primary });
  return ctx;
}

describe('FabstirSDKCore.enableDelegatePayments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the authenticated identity as the primary (userAddress, signer, authMode all unchanged)', async () => {
    const { sdk, primary, subAccount } = await authedPrimary();
    const primaryAddr = await primary.getAddress();

    await sdk.enableDelegatePayments({ signer: subAccount, payer: primaryAddr });

    expect(await sdk.getAddress()).toBe(primaryAddr);            // identity signer, not the delegate
    expect(sdk.getSigner()).toBe(primary);
    expect((sdk as any).userAddress).toBe(primaryAddr);          // storage/ownership key untouched
    expect((sdk as any).authMode).toBe('signer');                // NOT 'delegate' — identity mode unchanged
  });

  it('routes payments through the delegate: PaymentManager signs with the sub-account and knows the payer', async () => {
    const { sdk, primary, subAccount, pm } = await authedPrimary();
    const primaryAddr = await primary.getAddress();

    await sdk.enableDelegatePayments({ signer: subAccount, payer: primaryAddr });

    expect(sdk.getDelegatePayer()).toBe(primaryAddr);
    expect(pm.getDelegatePayer()).toBe(primaryAddr);
    // the PaymentManager's OWN signer (used for delegateAddr + wrapper) is now the sub-account
    expect(await (pm as any).signer.getAddress()).toBe(await subAccount.getAddress());
  });

  it('rebuilds the marketplace wrapper so escrow is signed by the sub-account, not a cached primary wrapper', async () => {
    const { sdk, primary, subAccount, pm } = await authedPrimary();
    const before = (pm as any).marketplaceWrappers.get(CHAIN);     // primary-bound wrapper from auth
    expect(before).toBeTruthy();

    await sdk.enableDelegatePayments({ signer: subAccount, payer: await primary.getAddress() });

    const after = (pm as any).marketplaceWrappers.get(CHAIN);
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);                                // cache cleared + rebuilt with the sub-account
  });

  it('requires an authenticated session (NOT_AUTHENTICATED before any signer swap)', async () => {
    const { sdk, subAccount, primary, pm } = makeSdk();            // never authenticated
    await expect(
      sdk.enableDelegatePayments({ signer: subAccount, payer: await primary.getAddress() })
    ).rejects.toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(pm.getDelegatePayer()).toBeUndefined();
  });

  it('missing signer throws DELEGATE_SIGNER_MISSING; identity untouched', async () => {
    const { sdk, primary } = await authedPrimary();
    await expect(
      sdk.enableDelegatePayments({ signer: undefined as any, payer: await primary.getAddress() })
    ).rejects.toMatchObject({ code: 'DELEGATE_SIGNER_MISSING' });
    expect(sdk.getDelegatePayer()).toBeUndefined();
  });

  it('missing/zero payer throws DELEGATE_PAYER_MISSING', async () => {
    const { sdk, subAccount } = await authedPrimary();
    await expect(
      sdk.enableDelegatePayments({ signer: subAccount, payer: ethers.ZeroAddress })
    ).rejects.toMatchObject({ code: 'DELEGATE_PAYER_MISSING' });
    await expect(
      sdk.enableDelegatePayments({ signer: subAccount, payer: '' as any })
    ).rejects.toMatchObject({ code: 'DELEGATE_PAYER_MISSING' });
  });
});

describe('FabstirSDKCore.disableDelegatePayments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reverts payments to the primary signer and clears the payer, identity still primary', async () => {
    const { sdk, primary, subAccount, pm } = await authedPrimary();
    const primaryAddr = await primary.getAddress();
    await sdk.enableDelegatePayments({ signer: subAccount, payer: primaryAddr });

    await sdk.disableDelegatePayments();

    expect(sdk.getDelegatePayer()).toBeUndefined();
    expect(pm.getDelegatePayer()).toBeUndefined();
    expect(await (pm as any).signer.getAddress()).toBe(primaryAddr); // PaymentManager back on the primary signer
    expect(await sdk.getAddress()).toBe(primaryAddr);                // identity never moved
  });
});
