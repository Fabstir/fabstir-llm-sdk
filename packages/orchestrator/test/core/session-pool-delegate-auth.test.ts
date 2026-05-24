import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import type { OrchestratorConfig, BudgetConfig, SignerLike } from '../../src/types';

/**
 * Sub-phase 3.1 — SessionPool delegate authentication.
 *
 * When config.delegatePayer is set, each per-acquire SDK must authenticate via
 * authenticateAsDelegate({signer, payer}) (so Phase 2.1's delegate branch fires),
 * NOT authenticate('signer'/'privatekey'). This is the link that makes the whole
 * delegate-pays flow work inside the pool.
 */

const PAYER = '0x2222222222222222222222222222222222222222';

function createMockSDK() {
  let recordedPayer: string | undefined;
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 5n, jobId: 5n }),
    sendPromptStreaming: vi.fn().mockResolvedValue('ok'),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const paymentManager = {
    completeSessionJob: vi.fn().mockResolvedValue({ success: true }),
    getDelegatePayer: vi.fn(() => recordedPayer),
    getDelegateAuthorization: vi.fn().mockResolvedValue({ authorized: true, remaining: 10n ** 18n }),
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue(paymentManager),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    authenticateAsDelegate: vi.fn().mockImplementation(async ({ payer }: any) => { recordedPayer = payer; }),
    _paymentManager: paymentManager,
  };
}

let lastSDK: any;
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => { lastSDK = createMockSDK(); return lastSDK; }),
}));

const budget: BudgetConfig = { maxDepositPerSubTask: '0.001', maxTotalDeposit: '0.01', maxSubTasks: 10 };

function delegateConfig(): OrchestratorConfig {
  const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0xdelegate') };
  return { sdk: createMockSDK() as any, chainId: 84532, signer, delegatePayer: PAYER, models: { fast: 'fast-model' }, maxConcurrentSessions: 3, budget, proofGracePeriodMs: 0 };
}
function signerConfig(): OrchestratorConfig {
  const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0xself') };
  return { sdk: createMockSDK() as any, chainId: 84532, signer, models: { fast: 'fast-model' }, maxConcurrentSessions: 3, budget, proofGracePeriodMs: 0 };
}

describe('SessionPool delegate authentication (3.1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acquire with delegatePayer calls authenticateAsDelegate({signer, payer}) — not authenticate()', async () => {
    const cfg = delegateConfig();
    const pool = new SessionPool(cfg);
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(lastSDK.authenticateAsDelegate).toHaveBeenCalledWith({ signer: cfg.signer, payer: PAYER });
    expect(lastSDK.authenticate).not.toHaveBeenCalled();
    await pool.destroy();
  });

  it('acquire WITHOUT delegatePayer uses the existing authenticate("signer") path (unchanged)', async () => {
    const pool = new SessionPool(signerConfig());
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(lastSDK.authenticate).toHaveBeenCalledWith('signer', expect.objectContaining({ signer: expect.anything() }));
    expect(lastSDK.authenticateAsDelegate).not.toHaveBeenCalled();
    await pool.destroy();
  });

  it('the resulting SDK paymentManager.getDelegatePayer() === config.delegatePayer', async () => {
    const pool = new SessionPool(delegateConfig());
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(lastSDK.getPaymentManager().getDelegatePayer()).toBe(PAYER);
    await pool.destroy();
  });

  it('cached-session reuse path does not re-authenticate', async () => {
    const pool = new SessionPool(delegateConfig());
    const { adapter, session } = await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    await pool.release(adapter, session); // caches it
    const callsAfterFirst = lastSDK.authenticateAsDelegate.mock.calls.length;
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' }); // reuse cache
    expect(lastSDK.authenticateAsDelegate.mock.calls.length).toBe(callsAfterFirst);
    await pool.destroy();
  });
});
