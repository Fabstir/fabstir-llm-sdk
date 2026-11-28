import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import type { OrchestratorConfig, BudgetConfig, SignerLike } from '../../src/types';

/**
 * sdk-core 1.39.27 storage region: a per-acquire SDK inherits the parent's storageRegion (its hosts only), and in a
 * region the parent's base seed (a region never uses the address-derived identity). Global children are unchanged.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md R13.
 */

function createMockSDK(config: any = {}) {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 5n, jobId: 5n }),
    sendPromptStreaming: vi.fn().mockResolvedValue('ok'),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  return {
    config,
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue({ completeSessionJob: vi.fn().mockResolvedValue({ success: true }) }),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    authenticateAsDelegate: vi.fn().mockResolvedValue(undefined),
  };
}

const childConfigs: any[] = [];
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation((cfg: any) => { childConfigs.push(cfg); return createMockSDK(cfg); }),
}));

const budget: BudgetConfig = { maxDepositPerSubTask: '0.001', maxTotalDeposit: '0.01', maxSubTasks: 10 };
const config = (parent: any): OrchestratorConfig => {
  const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0xself') };
  return { sdk: createMockSDK(parent) as any, chainId: 84532, signer, models: { fast: 'fast-model' }, maxConcurrentSessions: 3, budget, proofGracePeriodMs: 0 };
};
const BASE = 'abandon adjust boy rush advice believe inform achieve alter club rural educate address peace myself';

describe('SessionPool storage region (sdk-core 1.39.27)', () => {
  beforeEach(() => { vi.clearAllMocks(); childConfigs.length = 0; });

  it('a regional parent: the child has its region and its base seed', async () => {
    const pool = new SessionPool(config({ rpcUrl: 'https://rpc', storageRegion: 'uk', s5Config: { seedPhrase: BASE, authApiUrl: 'https://a' } }));
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(childConfigs[0]).toMatchObject({ storageRegion: 'uk', skipS5: true, s5Config: { seedPhrase: BASE } });
    expect(childConfigs[0].s5Config.authApiUrl).toBeUndefined();   // skipS5: no storage, no registration
    await pool.destroy();
  });

  it('a Global parent: the child is as before (no region forced, no seed passed)', async () => {
    const pool = new SessionPool(config({ rpcUrl: 'https://rpc', storageRegion: 'global', s5Config: { seedPhrase: BASE } }));
    await pool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(childConfigs[0].storageRegion).toBe('global');
    expect(childConfigs[0].s5Config).toBeUndefined();
    const legacy = new SessionPool(config({ rpcUrl: 'https://rpc' }));
    await legacy.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect('storageRegion' in childConfigs[1]).toBe(false);
    await pool.destroy(); await legacy.destroy();
  });
});
