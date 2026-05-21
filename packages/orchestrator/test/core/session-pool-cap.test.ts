import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import type { OrchestratorConfig, BudgetConfig, SignerLike } from '../../src/types';

/**
 * Sub-phase 3.3 — SDK spend cap as defense-in-depth.
 *
 * Before any session/contract creation, acquire refuses (typed) when the next
 * deposit would exceed (a) the live on-chain remaining allowance or (b) the
 * configured SDK budget. The authoritative cap is the on-chain approval; this is
 * a clean pre-flight refusal. Committed deposits are refundable (decrement on free).
 */

const PAYER = '0x2222222222222222222222222222222222222222';
const toBase = (usdc: number) => BigInt(Math.round(usdc * 1e6)); // USDC base units
const createdSDKs: any[] = [];

function createPerAcquireSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: BigInt(Math.floor(Math.random() * 1e6)), jobId: BigInt(Math.floor(Math.random() * 1e6)) }),
    sendPromptStreaming: vi.fn().mockResolvedValue('ok'),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const paymentManager = { completeSessionJob: vi.fn().mockResolvedValue({}), getDelegatePayer: vi.fn(() => PAYER) };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue(paymentManager),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    authenticateAsDelegate: vi.fn().mockResolvedValue(undefined),
    _sessionManager: sessionManager,
  };
}
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => { const s = createPerAcquireSDK(); createdSDKs.push(s); return s; }),
}));

function daemonSDK(remaining: bigint) {
  const getDelegateAuthorization = vi.fn().mockResolvedValue({ authorized: true, remaining });
  return { sdk: { getPaymentManager: () => ({ getDelegateAuthorization }) } as any, getDelegateAuthorization };
}
function cfg(remaining: bigint, maxTotalDeposit = '100'): { config: OrchestratorConfig; getDelegateAuthorization: any } {
  const { sdk, getDelegateAuthorization } = daemonSDK(remaining);
  const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0xdelegate') };
  const budget: BudgetConfig = { maxDepositPerSubTask: '1', maxTotalDeposit, maxSubTasks: 100 };
  return { config: { sdk, chainId: 84532, signer, delegatePayer: PAYER, models: { fast: 'm' }, maxConcurrentSessions: 5, budget, proofGracePeriodMs: 0 }, getDelegateAuthorization };
}
const dep = (amount: string) => ({ chainId: 84532, depositAmount: amount });

describe('SessionPool spend cap defense-in-depth (3.3)', () => {
  beforeEach(() => { vi.clearAllMocks(); createdSDKs.length = 0; });

  it('refuses with CAP_EXCEEDED_ALLOWANCE when next deposit exceeds live allowance', async () => {
    const { config, getDelegateAuthorization } = cfg(toBase(0.5)); // 0.5 USDC remaining
    const pool = new SessionPool(config);
    await expect(pool.acquire('m', dep('1'))).rejects.toMatchObject({ code: 'CAP_EXCEEDED_ALLOWANCE' });
    // Must query with BOTH payer and the delegate address (else the on-chain read reverts).
    expect(getDelegateAuthorization).toHaveBeenCalledWith({ payer: PAYER, delegate: '0xdelegate' });
  });

  it('refuses with CAP_EXCEEDED_SDK_BUDGET when next deposit exceeds configured maxTotalDeposit', async () => {
    const { config } = cfg(toBase(1000), '0.002');
    const pool = new SessionPool(config);
    await pool.acquire('m', dep('0.001'));
    await expect(pool.acquire('m', dep('0.002'))).rejects.toMatchObject({ code: 'CAP_EXCEEDED_SDK_BUDGET' });
    await pool.destroy();
  });

  it('pre-flight refusal happens BEFORE any session/contract call (no per-acquire SDK created)', async () => {
    const { config } = cfg(toBase(0.5));
    const pool = new SessionPool(config);
    await expect(pool.acquire('m', dep('1'))).rejects.toMatchObject({ code: 'CAP_EXCEEDED_ALLOWANCE' });
    expect(createdSDKs.length).toBe(0);
  });

  it('committed deposit decrements on free/refund (no false CAP_EXCEEDED after churn)', async () => {
    const { config } = cfg(toBase(2)); // 2 USDC remaining
    const pool = new SessionPool(config);
    const a = await pool.acquire('m', dep('1'));
    const b = await pool.acquire('m', dep('1')); // committed = 2 (fits 2 USDC)
    await pool.release(a.adapter, a.session); // caches 'm' — committed stays 2
    await pool.release(b.adapter, b.session); // free path → committed decrements to 1
    expect(pool.getTotalDeposit()).toBe(1);
    // A new (non-cached) model would be committed=2 ≤ remaining 2; only passes because b decremented.
    await expect(pool.acquire('n', dep('1'))).resolves.toBeTruthy();
    await pool.destroy();
  });
});
