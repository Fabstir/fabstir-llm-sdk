// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.2 — startSession delegate flow (tests only; SessionManager UNCHANGED).
 *
 * Because delegate routing lives entirely in PaymentManager.createSessionJob (2.1),
 * SessionManager.startSession produces a delegated session transparently when the
 * PaymentManager is in delegate mode — same host auto-selection, same {sessionId,
 * jobId} mapping from the wrapper's numeric id. No SessionManager source change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManagerMultiChain';
import { ChainId } from '../../src/types/chain.types';
import { HostSelectionMode } from '../../src/types/settings.types';
import { HostInfo } from '../../src/types/models';

const PAYER = '0x2222222222222222222222222222222222222222';
const DELEGATE_ADDR = '0x3333333333333333333333333333333333333333';
const HOST_ADDR = '0x1111111111111111111111111111111111111111';
const MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

function mockHost(address: string): HostInfo {
  return {
    address, apiUrl: `http://${address.slice(0, 10)}:8080`,
    metadata: { hardware: { gpu: 'x', vram: 24, ram: 64 }, capabilities: ['inference'], location: 'US', maxConcurrent: 10, costPerToken: 0.001 },
    supportedModels: [MODEL_ID], isActive: true, stake: 1n, minPricePerTokenNative: 1000n, minPricePerTokenStable: 2000n,
  } as any;
}
function mockStorage() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    getHostSelectionMode: vi.fn().mockResolvedValue(HostSelectionMode.AUTO),
    getUserSettings: vi.fn().mockResolvedValue({ hostSelectionMode: HostSelectionMode.AUTO, preferredHostAddress: null }),
    updateUserSettings: vi.fn().mockResolvedValue(undefined),
    getUserAddress: vi.fn().mockResolvedValue('0xUser'),
    storeConversation: vi.fn().mockResolvedValue({ cid: 'cid' }),
    loadConversation: vi.fn().mockResolvedValue(null),
    saveConversation: vi.fn().mockResolvedValue({ cid: 'cid' }),
  } as any;
}
function mockHostManager() {
  return { getModelPricing: vi.fn().mockResolvedValue(2000n), getHostInfo: vi.fn().mockImplementation(async (a: string) => mockHost(a)) } as any;
}
function mockSelection(host: HostInfo) {
  return { selectHostForModel: vi.fn().mockResolvedValue(host), getRankedHostsForModel: vi.fn().mockResolvedValue([]), calculateHostScore: vi.fn().mockReturnValue(0.5), setHostManager: vi.fn() } as any;
}

function makePaymentManager(delegate: boolean) {
  const pm = new PaymentManager(undefined, ChainId.BASE_SEPOLIA);
  const usdc = pm.getChainConfig().contracts.usdcToken;
  (pm as any).signer = { getAddress: vi.fn().mockResolvedValue(DELEGATE_ADDR), provider: null };
  (pm as any).initialized = true;
  (pm as any).isInitialized = vi.fn().mockReturnValue(true);
  if (delegate) pm.setDelegatePayer(PAYER);
  const createSessionForModelAsDelegate = vi.fn().mockResolvedValue(777);
  const createSessionJob = vi.fn().mockResolvedValue(55);
  const fakeWrapper = {
    createSessionForModelAsDelegate, createSessionJob, createSessionFromDeposit: vi.fn().mockResolvedValue(66),
    isDelegateAuthorized: vi.fn().mockResolvedValue(true), getContractAddress: () => '0xmkt',
  };
  (pm as any).getWrapper = vi.fn().mockReturnValue(fakeWrapper);
  vi.spyOn(pm, 'checkAllowance').mockResolvedValue(ethers.parseUnits('1000', 6));
  vi.spyOn(pm, 'getTokenBalance').mockResolvedValue(ethers.parseUnits('1000', 6));
  return { pm, usdc, createSessionForModelAsDelegate, createSessionJob };
}

async function start(delegate: boolean) {
  const { pm, usdc, createSessionForModelAsDelegate, createSessionJob } = makePaymentManager(delegate);
  const selection = mockSelection(mockHost(HOST_ADDR));
  const sm = new SessionManager(pm as any, mockStorage(), mockHostManager());
  sm.setHostSelectionService(selection);
  await sm.initialize();
  const result = await sm.startSession({
    modelId: MODEL_ID, chainId: 84532, paymentMethod: 'deposit',
    depositAmount: '10', paymentToken: usdc, useDeposit: false,
  } as any);
  return { result, selection, createSessionForModelAsDelegate, createSessionJob };
}

describe('startSession delegate flow (2.2 — SessionManager unchanged)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegate mode routes startSession through createSessionForModelAsDelegate (transparent)', async () => {
    const { createSessionForModelAsDelegate, createSessionJob } = await start(true);
    expect(createSessionForModelAsDelegate).toHaveBeenCalledTimes(1);
    expect(createSessionForModelAsDelegate).toHaveBeenCalledWith(
      expect.objectContaining({ payer: PAYER, modelId: MODEL_ID, host: HOST_ADDR })
    );
    expect(createSessionJob).not.toHaveBeenCalled();
  });

  it('returns {sessionId, jobId} mapped from the wrapper numeric id (same shape as self-funded)', async () => {
    const { result } = await start(true);
    expect(result.sessionId).toBe(777n);
    expect(result.jobId).toBe(777n);
  });

  it('host auto-selection runs identically in delegate mode (no pinning)', async () => {
    const { selection } = await start(true);
    expect(selection.selectHostForModel).toHaveBeenCalledWith(MODEL_ID, HostSelectionMode.AUTO, undefined);
  });

  it('non-delegate startSession is byte-identical (self-funded path, no delegate call)', async () => {
    const { result, createSessionForModelAsDelegate, createSessionJob } = await start(false);
    expect(createSessionJob).toHaveBeenCalledTimes(1);
    expect(createSessionForModelAsDelegate).not.toHaveBeenCalled();
    expect(result.sessionId).toBe(55n);
  });
});
