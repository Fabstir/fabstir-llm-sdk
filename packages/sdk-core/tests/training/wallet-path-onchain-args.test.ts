// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The UI developer's question on 1.38.7: "is there a test asserting the ON-CHAIN arguments for the
 * delegated creation with training's 14400 / 1000 / 3600?" There was not — the wallet-path test asserted
 * at the mocked-startSession boundary. This pins every hop below it with the REAL class at each layer:
 *   SessionManager.startSession → PaymentManagerMultiChain.createSessionJob (both branches) →
 *   JobMarketplaceWrapper.createSessionJob → the contract call's uint256 arguments.
 * It also pins where the chain's 86400 / 300 shape comes from: a caller that passes 86400 and omits the
 * window (the wrapper defaults it to 300) — the chat shape. No SDK training path can produce it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager as PaymentManagerMultiChain } from '../../src/managers/PaymentManagerMultiChain';   // the root re-exports it under this name
import { JobMarketplaceWrapper, DEFAULT_PROOF_TIMEOUT } from '../../src/contracts/JobMarketplace';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { MODEL, USDC, HOST } from './fixtures';

const TRAINING = { duration: 14400, proofInterval: 1000, proofTimeoutWindow: 3600 };
const signer: any = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };

afterEach(() => { vi.restoreAllMocks(); });

describe('layer 1 — the REAL SessionManager.startSession forwards training lifecycle to the payment manager', () => {
  it('duration / proofInterval / proofTimeoutWindow reach createSessionJob unchanged; no useDeposit', async () => {
    const paymentManager: any = { isInitialized: () => true, createSessionJob: vi.fn(async () => 123), signer };
    const storage: any = { isInitialized: () => true, storeConversation: vi.fn(async () => {}), appendMessage: vi.fn(async () => {}) };
    const hostManager: any = {
      getHostInfo: vi.fn(async () => ({ address: HOST, apiUrl: 'https://host2.fabstir.net', isActive: true, supportedModels: [MODEL], stake: 0n, minPricePerToken: 904n })),
      resolveModelPricePerToken: vi.fn(async () => 904n),
      getModelPricing: vi.fn(async () => 904n),                                                // what startSession reads
    };
    const sm: any = new SessionManager(paymentManager, storage);
    sm.setHostManager(hostManager);
    await sm.initialize();
    await sm.startSession({
      chainId: 84532, host: HOST, endpoint: 'https://host2.fabstir.net', modelId: MODEL, paymentToken: USDC,
      depositAmount: '9.11232', encryption: true, pricePerToken: 904, ...TRAINING,           // what TrainingManager sends
    });
    const sent = paymentManager.createSessionJob.mock.calls[0][0];
    expect(sent).toMatchObject(TRAINING);
    expect(sent.useDeposit).toBeFalsy();
  });
});

describe('layer 2 — the REAL PaymentManagerMultiChain.createSessionJob forwards them to the wrapper, on BOTH branches', () => {
  function pmWithFakeWrapper() {
    const pm: any = new PaymentManagerMultiChain(undefined, 84532);
    pm.signer = signer;
    const wrapper: any = {
      createSessionJob: vi.fn(async () => 1), createSessionFromDeposit: vi.fn(async () => 1),
      createSessionForModelAsDelegate: vi.fn(async () => 1), isDelegateAuthorized: vi.fn(async () => true),
    };
    pm.marketplaceWrappers.set(84532, wrapper);
    return { pm, wrapper };
  }
  const params = { host: HOST, amount: '9.11232', pricePerToken: 904, paymentToken: USDC, modelId: MODEL, chainId: 84532, ...TRAINING };

  it('direct payment (the wallet path): the three values, not the 3600 / LLM defaults', async () => {
    const { pm, wrapper } = pmWithFakeWrapper();
    await pm.createSessionJob(params);
    expect(wrapper.createSessionJob).toHaveBeenCalledWith(expect.objectContaining({ ...TRAINING, modelId: MODEL }));
  });

  it('delegate-pays (the popup-free V2 delegation the UI uses): the same three values', async () => {
    const { pm, wrapper } = pmWithFakeWrapper();
    const usdc = ChainRegistry.getChain(84532).contracts.usdcToken;                            // from the registry, never a literal
    pm.delegatePayer = `0x${'dd'.repeat(20)}`;
    vi.spyOn(pm, 'checkAllowance').mockResolvedValue(10n ** 12n);
    vi.spyOn(pm, 'getTokenBalance').mockResolvedValue(10n ** 12n);
    await pm.createSessionJob({ ...params, paymentToken: usdc });
    expect(wrapper.createSessionForModelAsDelegate).toHaveBeenCalledWith(expect.objectContaining({ ...TRAINING, payer: pm.delegatePayer }));
    expect(wrapper.createSessionJob).not.toHaveBeenCalled();
  });

  it('a missing duration falls to 3600 (the payment manager default) — never 86400', async () => {
    const { pm, wrapper } = pmWithFakeWrapper();
    const { duration: _d, ...noDuration } = params;
    await pm.createSessionJob(noDuration);
    expect(wrapper.createSessionJob.mock.calls[0][0].duration).toBe(3600);
  });
});

describe('layer 3 — the REAL JobMarketplaceWrapper puts them on the contract call as uint256', () => {
  function wrapperWithFakeContract() {
    const w: any = new JobMarketplaceWrapper(84532, signer);
    const contract: any = {
      paused: vi.fn(async () => false),
      createSessionJobForModelWithToken: vi.fn(async () => ({ wait: async () => ({ logs: [] }) })),
      createSessionJobForModel: vi.fn(async () => ({ wait: async () => ({ logs: [] }) })),
    };
    w.contract = contract;
    return { w, contract };
  }

  it('14400n / 1000n / 3600n are the last three arguments of createSessionJobForModelWithToken', async () => {
    const { w, contract } = wrapperWithFakeContract();
    await w.createSessionJob({ host: HOST, pricePerToken: 904, paymentAmount: '9.11232', paymentToken: USDC, modelId: MODEL, ...TRAINING });
    const args = contract.createSessionJobForModelWithToken.mock.calls[0];
    expect(args.slice(-3)).toEqual([14400n, 1000n, 3600n]);
  });

  it('WHERE 86400 / 300 COMES FROM: a caller passing 86400 and no window gets the wrapper default 300 — the chat shape', async () => {
    const { w, contract } = wrapperWithFakeContract();
    await w.createSessionJob({ host: HOST, pricePerToken: 904, paymentAmount: '1', paymentToken: USDC, modelId: MODEL, duration: 86400, proofInterval: 1000 });
    const args = contract.createSessionJobForModelWithToken.mock.calls[0];
    expect(DEFAULT_PROOF_TIMEOUT).toBe(300);
    expect(args.slice(-3)).toEqual([86400n, 1000n, 300n]);
  });
});
