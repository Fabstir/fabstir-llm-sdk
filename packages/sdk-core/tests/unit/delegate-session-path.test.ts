// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.1 — createSessionJob delegate branch.
 *
 * When delegatePayer is set, createSessionJob routes through the wrapper's
 * createSessionForModelAsDelegate with USDC-only enforcement, pre-flight checks
 * (authorized / allowance / balance) and typed errors. Self-funded paths stay
 * byte-identical and createSessionJob keeps its Promise<number> contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { ChainId } from '../../src/types/chain.types';

const PAYER = '0x2222222222222222222222222222222222222222';
const DELEGATE_ADDR = '0x3333333333333333333333333333333333333333';
const HOST = '0x1111111111111111111111111111111111111111';
const MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
const ZERO = '0x0000000000000000000000000000000000000000';

function makeManager(delegate = true) {
  const pm = new PaymentManager(undefined, ChainId.BASE_SEPOLIA);
  const chain = pm.getChainConfig();
  const usdc = chain.contracts.usdcToken;
  const mkt = chain.contracts.jobMarketplace;

  (pm as any).signer = { getAddress: vi.fn().mockResolvedValue(DELEGATE_ADDR), provider: null };
  if (delegate) pm.setDelegatePayer(PAYER);

  const createSessionForModelAsDelegate = vi.fn().mockResolvedValue(777);
  const createSessionJob = vi.fn().mockResolvedValue(11);
  const createSessionFromDeposit = vi.fn().mockResolvedValue(22);
  const isDelegateAuthorized = vi.fn().mockResolvedValue(true);
  const fakeWrapper = {
    createSessionForModelAsDelegate,
    createSessionJob,
    createSessionFromDeposit,
    isDelegateAuthorized,
    getContractAddress: () => mkt,
  };
  (pm as any).getWrapper = vi.fn().mockReturnValue(fakeWrapper);
  const checkAllowance = vi.spyOn(pm, 'checkAllowance').mockResolvedValue(ethers.parseUnits('1000', 6));
  const getTokenBalance = vi.spyOn(pm, 'getTokenBalance').mockResolvedValue(ethers.parseUnits('1000', 6));

  return { pm, usdc, mkt, fakeWrapper, createSessionForModelAsDelegate, createSessionJob, createSessionFromDeposit, isDelegateAuthorized, checkAllowance, getTokenBalance };
}

function params(usdc: string, over: Partial<any> = {}) {
  return { host: HOST, amount: '10', pricePerToken: 1000, duration: 3600, proofInterval: 60, modelId: MODEL_ID, paymentToken: usdc, ...over };
}

describe('createSessionJob delegate branch (2.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegate mode calls createSessionForModelAsDelegate (not createSessionJob/FromDeposit)', async () => {
    const { pm, usdc, createSessionForModelAsDelegate, createSessionJob, createSessionFromDeposit } = makeManager();
    const id = await pm.createSessionJob(params(usdc));
    expect(createSessionForModelAsDelegate).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: PAYER, modelId: MODEL_ID, host: HOST, paymentToken: usdc,
        amount: '10', pricePerToken: 1000, duration: 3600, proofInterval: 60,
      })
    );
    expect(createSessionJob).not.toHaveBeenCalled();
    expect(createSessionFromDeposit).not.toHaveBeenCalled();
    expect(id).toBe(777);
  });

  it('no delegatePayer → self-funded path byte-identical (useDeposit/direct)', async () => {
    const { pm, usdc, createSessionForModelAsDelegate, createSessionJob, createSessionFromDeposit } = makeManager(false);
    await pm.createSessionJob(params(usdc, { useDeposit: false }));
    expect(createSessionJob).toHaveBeenCalledTimes(1);
    await pm.createSessionJob(params(usdc, { useDeposit: true }));
    expect(createSessionFromDeposit).toHaveBeenCalledTimes(1);
    expect(createSessionForModelAsDelegate).not.toHaveBeenCalled();
  });

  it('delegate mode rejects a missing/zero paymentToken with DELEGATE_USDC_REQUIRED (before wrapper call)', async () => {
    const { pm, createSessionForModelAsDelegate } = makeManager();
    await expect(pm.createSessionJob(params(ZERO))).rejects.toMatchObject({ code: 'DELEGATE_USDC_REQUIRED' });
    await expect(pm.createSessionJob(params(undefined as any))).rejects.toMatchObject({ code: 'DELEGATE_USDC_REQUIRED' });
    expect(createSessionForModelAsDelegate).not.toHaveBeenCalled();
  });

  it('pre-flight isDelegateAuthorized=false throws DELEGATE_NOT_AUTHORIZED', async () => {
    const { pm, usdc, isDelegateAuthorized, createSessionForModelAsDelegate } = makeManager();
    isDelegateAuthorized.mockResolvedValue(false);
    await expect(pm.createSessionJob(params(usdc))).rejects.toMatchObject({ code: 'DELEGATE_NOT_AUTHORIZED' });
    expect(createSessionForModelAsDelegate).not.toHaveBeenCalled();
  });

  it('pre-flight allowance < amount throws DELEGATE_ALLOWANCE_INSUFFICIENT (remaining + needed)', async () => {
    const { pm, usdc, checkAllowance } = makeManager();
    checkAllowance.mockResolvedValue(ethers.parseUnits('5', 6)); // < 10
    await expect(pm.createSessionJob(params(usdc))).rejects.toMatchObject({
      code: 'DELEGATE_ALLOWANCE_INSUFFICIENT',
      details: { remaining: '5000000', needed: '10000000' },
    });
  });

  it('pre-flight balance < amount throws DELEGATE_BALANCE_INSUFFICIENT', async () => {
    const { pm, usdc, getTokenBalance } = makeManager();
    getTokenBalance.mockResolvedValue(ethers.parseUnits('5', 6)); // < 10
    await expect(pm.createSessionJob(params(usdc))).rejects.toMatchObject({ code: 'DELEGATE_BALANCE_INSUFFICIENT' });
  });

  it('maps contract reverts: NotDelegate / ERC20Only / BadDelegateParams → SDK codes', async () => {
    for (const [name, code] of [
      ['NotDelegate', 'DELEGATE_NOT_AUTHORIZED'],
      ['ERC20Only', 'DELEGATE_USDC_REQUIRED'],
      ['BadDelegateParams', 'DELEGATE_BAD_PARAMS'],
    ] as const) {
      const { pm, usdc, createSessionForModelAsDelegate } = makeManager();
      createSessionForModelAsDelegate.mockRejectedValue(new Error(`execution reverted: ${name}()`));
      await expect(pm.createSessionJob(params(usdc))).rejects.toMatchObject({ code });
    }
  });

  it('returns the numeric sessionId from the wrapper (Promise<number> unchanged)', async () => {
    const { pm, usdc, createSessionForModelAsDelegate } = makeManager();
    createSessionForModelAsDelegate.mockResolvedValue(4242);
    const id = await pm.createSessionJob(params(usdc));
    expect(id).toBe(4242);
    expect(typeof id).toBe('number');
  });
});
