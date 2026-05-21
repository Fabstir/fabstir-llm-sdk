// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.2 — FabstirSDKCore.authenticateAsDelegate({ signer, payer }).
 *
 * Authenticates with a plain EOA delegate signer, records the payer, and
 * propagates it to PaymentManager.setDelegatePayer. Reuses authenticate('signer').
 * `authenticate` is spied so we don't run real S5/manager init; it simulates the
 * signer path and injects a real PaymentManager so setter propagation is exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { ChainId } from '../../src/types/chain.types';

const PAYER = '0x2222222222222222222222222222222222222222';
const ZERO = '0x0000000000000000000000000000000000000000';

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

  const signer = ethers.Wallet.createRandom();
  const pm = new PaymentManager(undefined, ChainId.BASE_SEPOLIA);

  // Simulate a successful signer authentication without real init.
  const authSpy = vi
    .spyOn(sdk, 'authenticate')
    .mockImplementation(async (method: any, opts: any) => {
      (sdk as any).signer = opts.signer;
      (sdk as any).authenticated = true;
      (sdk as any).authMode = method;
      (sdk as any).paymentManager = pm;
    });

  return { sdk, signer, pm, authSpy };
}

describe('FabstirSDKCore.authenticateAsDelegate (1.2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets authenticated=true and authMode=delegate via authenticate("signer")', async () => {
    const { sdk, signer, authSpy } = makeSdk();
    await sdk.authenticateAsDelegate({ signer, payer: PAYER });
    expect(authSpy).toHaveBeenCalledWith('signer', { signer });
    expect((sdk as any).authenticated).toBe(true);
    expect((sdk as any).authMode).toBe('delegate');
  });

  it('getAddress() returns the delegate signer address; getDelegatePayer() returns payer', async () => {
    const { sdk, signer } = makeSdk();
    await sdk.authenticateAsDelegate({ signer, payer: PAYER });
    expect(await sdk.getAddress()).toBe(await signer.getAddress());
    expect(sdk.getDelegatePayer()).toBe(PAYER);
  });

  it('propagates the payer to PaymentManager.getDelegatePayer() post manager-init', async () => {
    const { sdk, signer, pm } = makeSdk();
    await sdk.authenticateAsDelegate({ signer, payer: PAYER });
    expect(pm.getDelegatePayer()).toBe(PAYER);
  });

  it('getSigner() returns the delegate signer (default path, not aa-signer)', async () => {
    const { sdk, signer } = makeSdk();
    await sdk.authenticateAsDelegate({ signer, payer: PAYER });
    expect(sdk.getSigner()).toBe(signer);
  });

  it('missing signer throws DELEGATE_SIGNER_MISSING before authenticate()', async () => {
    const { sdk, authSpy } = makeSdk();
    await expect(
      sdk.authenticateAsDelegate({ signer: undefined as any, payer: PAYER })
    ).rejects.toMatchObject({ code: 'DELEGATE_SIGNER_MISSING' });
    expect(authSpy).not.toHaveBeenCalled();
  });

  it('missing/zero payer throws DELEGATE_PAYER_MISSING before authenticate()', async () => {
    const { sdk, signer, authSpy } = makeSdk();
    await expect(
      sdk.authenticateAsDelegate({ signer, payer: ZERO })
    ).rejects.toMatchObject({ code: 'DELEGATE_PAYER_MISSING' });
    await expect(
      sdk.authenticateAsDelegate({ signer, payer: '' as any })
    ).rejects.toMatchObject({ code: 'DELEGATE_PAYER_MISSING' });
    expect(authSpy).not.toHaveBeenCalled();
  });

  it('disconnect() clears authMode and delegatePayer', async () => {
    const { sdk, signer } = makeSdk();
    await sdk.authenticateAsDelegate({ signer, payer: PAYER });
    await sdk.disconnect();
    expect((sdk as any).authMode).toBeUndefined();
    expect(sdk.getDelegatePayer()).toBeUndefined();
  });

  it('existing authenticate("signer") path is unchanged — no payer recorded', async () => {
    const { sdk, signer } = makeSdk();
    await sdk.authenticate('signer', { signer });
    expect(sdk.getDelegatePayer()).toBeUndefined();
    expect((sdk as any).authMode).toBe('signer');
  });
});
