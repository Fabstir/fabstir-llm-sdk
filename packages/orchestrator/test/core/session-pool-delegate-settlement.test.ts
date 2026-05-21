import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import type { OrchestratorConfig, BudgetConfig, SignerLike } from '../../src/types';

/**
 * Sub-phase 3.2 — delegate-mode settlement no-op.
 *
 * In delegate mode the pool must NOT call completeSessionJob (only payer/host may
 * settle — it would revert). It ends the WS session and lets the host settle on
 * disconnect. Self-funded mode still settles. Slot/cache semantics are preserved.
 */

const PAYER = '0x2222222222222222222222222222222222222222';
const createdSDKs: any[] = [];

function createMockSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: BigInt(Math.floor(Math.random() * 1e6)), jobId: BigInt(Math.floor(Math.random() * 1e6)) }),
    sendPromptStreaming: vi.fn().mockResolvedValue('ok'),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  const paymentManager = {
    completeSessionJob: vi.fn().mockResolvedValue({ success: true }),
    getDelegatePayer: vi.fn(() => PAYER),
    getDelegateAuthorization: vi.fn().mockResolvedValue({ authorized: true, remaining: 10n ** 18n }),
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue(paymentManager),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    authenticateAsDelegate: vi.fn().mockResolvedValue(undefined),
    _sessionManager: sessionManager,
    _paymentManager: paymentManager,
  };
}

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => { const s = createMockSDK(); createdSDKs.push(s); return s; }),
}));

const budget: BudgetConfig = { maxDepositPerSubTask: '1', maxTotalDeposit: '100', maxSubTasks: 10 };
const anyComplete = () => createdSDKs.some(s => s._paymentManager.completeSessionJob.mock.calls.length > 0);
const anyEnd = () => createdSDKs.some(s => s._sessionManager.endSession.mock.calls.length > 0);

function delegateCfg(): OrchestratorConfig {
  const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0xdelegate') };
  return { sdk: createMockSDK() as any, chainId: 84532, signer, delegatePayer: PAYER, models: { fast: 'm' }, maxConcurrentSessions: 3, budget, proofGracePeriodMs: 0 };
}
function selfFundedCfg(): OrchestratorConfig {
  return { sdk: createMockSDK() as any, chainId: 84532, privateKey: '0xabc', models: { fast: 'm' }, maxConcurrentSessions: 3, budget, proofGracePeriodMs: 0 };
}
const dep = { chainId: 84532, depositAmount: '1' };

// acquire same model twice then release both → 2nd release hits the duplicate
// (non-cached) path that ends + settles a session.
async function acquireTwiceReleaseBoth(pool: SessionPool) {
  const a = await pool.acquire('m', dep);
  const b = await pool.acquire('m', dep);
  await pool.release(a.adapter, a.session); // caches a
  await pool.release(b.adapter, b.session); // duplicate → endSession + settle
}

describe('SessionPool delegate settlement no-op (3.2)', () => {
  beforeEach(() => { vi.clearAllMocks(); createdSDKs.length = 0; });

  it('release() in delegate mode calls endSession but NEVER completeSessionJob', async () => {
    const pool = new SessionPool(delegateCfg());
    await acquireTwiceReleaseBoth(pool);
    expect(anyEnd()).toBe(true);
    expect(anyComplete()).toBe(false);
    await pool.destroy();
  });

  it('destroy() in delegate mode ends all sessions but NEVER completeSessionJob', async () => {
    const pool = new SessionPool(delegateCfg());
    await pool.acquire('m', dep);
    await pool.destroy();
    expect(anyEnd()).toBe(true);
    expect(anyComplete()).toBe(false);
  });

  it('release() in self-funded mode STILL calls completeSessionJob (unchanged)', async () => {
    const pool = new SessionPool(selfFundedCfg());
    await acquireTwiceReleaseBoth(pool);
    expect(anyComplete()).toBe(true);
    await pool.destroy();
  });

  it('delegate-mode release still frees the pool slot + cache reuse intact', async () => {
    const pool = new SessionPool(delegateCfg());
    const a = await pool.acquire('m', dep);
    const created = createdSDKs.length;
    await pool.release(a.adapter, a.session); // caches → frees slot
    const b = await pool.acquire('m', dep);   // reuse cache, no new SDK
    expect(createdSDKs.length).toBe(created);
    expect(b.session).toEqual(a.session);
    await pool.destroy();
  });
});
