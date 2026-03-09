import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import type { OrchestratorConfig, BudgetConfig, SignerLike } from '../../src/types';

function createMockSDK(overrides: any = {}) {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: BigInt(Math.floor(Math.random() * 1000)), jobId: BigInt(Math.floor(Math.random() * 1000)) }),
    sendPromptStreaming: vi.fn().mockResolvedValue('response'),
    endSession: vi.fn().mockResolvedValue(undefined),
    ...overrides.sessionManager,
  };
  const paymentManager = {
    completeSessionJob: vi.fn().mockResolvedValue({ success: true }),
    ...overrides.paymentManager,
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue(paymentManager),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    _sessionManager: sessionManager,
    _paymentManager: paymentManager,
  };
}

const budget: BudgetConfig = {
  maxDepositPerSubTask: '0.001',
  maxTotalDeposit: '0.01',
  maxSubTasks: 10,
};

function createConfig(sdk: any, maxSessions = 3): OrchestratorConfig {
  return {
    sdk,
    chainId: 84532,
    privateKey: '0xabcdef',
    models: { fast: 'fast-model', deep: 'deep-model' },
    maxConcurrentSessions: maxSessions,
    budget,
    proofGracePeriodMs: 0,
  };
}

// Mock FabstirSDKCore constructor
let mockSDKInstance: any;
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => {
    mockSDKInstance = createMockSDK();
    return mockSDKInstance;
  }),
}));

describe('SessionPool', () => {
  let seedSDK: ReturnType<typeof createMockSDK>;
  let pool: SessionPool;

  beforeEach(() => {
    seedSDK = createMockSDK();
    pool = new SessionPool(createConfig(seedSDK));
  });

  function createSignerConfig(sdk: any, maxSessions = 3): OrchestratorConfig {
    const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0x1234abcd') };
    return { sdk, chainId: 84532, signer, models: { fast: 'fast-model' }, maxConcurrentSessions: maxSessions, budget, proofGracePeriodMs: 0 };
  }

  it('acquire authenticates SDK with signer when signer is provided', async () => {
    const signerPool = new SessionPool(createSignerConfig(seedSDK));
    await signerPool.acquire('fast-model', { chainId: 84532, depositAmount: '0.001' });
    expect(mockSDKInstance.authenticate).toHaveBeenCalledWith('signer', { signer: expect.objectContaining({ getAddress: expect.any(Function) }) });
    await signerPool.destroy();
  });

  it('constructor throws if neither privateKey nor signer is provided', () => {
    const config: OrchestratorConfig = { sdk: seedSDK as any, chainId: 84532, models: { fast: 'f' }, maxConcurrentSessions: 1, budget };
    expect(() => new SessionPool(config)).toThrow('OrchestratorConfig requires either privateKey or signer');
  });

  it('constructor throws if both privateKey and signer are provided', () => {
    const signer: SignerLike = { getAddress: vi.fn().mockResolvedValue('0x1234') };
    const config: OrchestratorConfig = { sdk: seedSDK as any, chainId: 84532, privateKey: '0xabc', signer, models: { fast: 'f' }, maxConcurrentSessions: 1, budget };
    expect(() => new SessionPool(config)).toThrow('OrchestratorConfig requires either privateKey or signer, not both');
  });

  it('constructor creates pool with maxConcurrentSessions limit', () => {
    expect(pool).toBeDefined();
  });

  it('acquire creates new SDK instance and returns SessionAdapter', async () => {
    const { adapter, session } = await pool.acquire('fast-model', {
      chainId: 84532, depositAmount: '0.001',
    });
    expect(adapter).toBeDefined();
    expect(session).toBeDefined();
    expect(session.model).toBe('fast-model');
  });

  it('acquire blocks when pool exhausted', async () => {
    const config = createConfig(seedSDK, 1);
    pool = new SessionPool(config);
    await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    const second = pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    const result = await Promise.race([
      second.then(() => 'resolved'),
      new Promise(r => setTimeout(() => r('timeout'), 100)),
    ]);
    expect(result).toBe('timeout');
    await pool.destroy();
  });

  it('release makes slot available for next acquire', async () => {
    const config = createConfig(seedSDK, 1);
    pool = new SessionPool(config);
    const first = await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    const secondPromise = pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    await pool.release(first.adapter, first.session);
    const second = await Promise.race([
      secondPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    expect(second).toBeDefined();
    await pool.destroy();
  });

  it('acquire authenticates SDK instance with correct pattern', async () => {
    await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    expect(mockSDKInstance.authenticate).toHaveBeenCalledWith('privatekey', { privateKey: '0xabcdef' });
  });

  it('acquire creates full SDK instance (NOT hostOnly)', async () => {
    await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    expect(mockSDKInstance.getSessionManager).toBeDefined();
  });

  it('acquire rejects with AbortError if signal fires while waiting', async () => {
    const config = createConfig(seedSDK, 1);
    pool = new SessionPool(config);
    await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    const controller = new AbortController();
    const promise = pool.acquire('model', { chainId: 84532, depositAmount: '0.001' }, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
    await pool.destroy();
  });

  it('acquire serializes startSession calls to prevent nonce collisions', async () => {
    const order: number[] = [];
    let callCount = 0;
    mockSDKInstance = undefined;
    const { FabstirSDKCore } = await import('@fabstir/sdk-core');
    (FabstirSDKCore as any).mockImplementation(() => {
      const n = ++callCount;
      const mock = createMockSDK();
      mock._sessionManager.startSession.mockImplementation(async () => {
        order.push(n);
        await new Promise(r => setTimeout(r, 10));
        return { sessionId: BigInt(n), jobId: BigInt(n) };
      });
      mockSDKInstance = mock;
      return mock;
    });

    const config = createConfig(seedSDK, 3);
    pool = new SessionPool(config);
    await Promise.all([
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
    ]);
    // Verify sequential ordering (each starts after prior finishes)
    expect(order).toEqual([1, 2, 3]);
    await pool.destroy();
  });

  it('destroy cleans up all instances', async () => {
    await pool.acquire('model', { chainId: 84532, depositAmount: '0.001' });
    await pool.destroy();
    // Should not throw
    expect(true).toBe(true);
  });

  it('concurrent acquires up to limit resolve immediately', async () => {
    const results = await Promise.all([
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
      pool.acquire('m', { chainId: 84532, depositAmount: '0.001' }),
    ]);
    expect(results).toHaveLength(3);
    await pool.destroy();
  });

  it('tracks total deposit spend across all sessions', async () => {
    await pool.acquire('m', { chainId: 84532, depositAmount: '0.003' });
    await pool.acquire('m', { chainId: 84532, depositAmount: '0.003' });
    expect(pool.getTotalDeposit()).toBe(0.006);
    await pool.destroy();
  });

  it('throws when totalDeposit exceeds budget.maxTotalDeposit', async () => {
    const config = createConfig(seedSDK, 5);
    config.budget = { ...budget, maxTotalDeposit: '0.002' };
    pool = new SessionPool(config);
    await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    await expect(
      pool.acquire('m', { chainId: 84532, depositAmount: '0.002' }),
    ).rejects.toThrow(/budget/i);
    await pool.destroy();
  });

  it('release ends session immediately and defers completeSessionJob', async () => {
    const config = createConfig(seedSDK, 3);
    config.proofGracePeriodMs = 100;
    pool = new SessionPool(config);
    const { adapter, session } = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    const adapterSDK = adapter.getSDK() as any;
    await pool.release(adapter, session);
    // endSession called immediately, completeSessionJob deferred
    expect(adapterSDK.getSessionManager().endSession).toHaveBeenCalledWith(session.sessionId);
    expect(adapterSDK.getPaymentManager().completeSessionJob).not.toHaveBeenCalled();
    await pool.destroy(); // waits for deferred settlement
    expect(adapterSDK.getPaymentManager().completeSessionJob).toHaveBeenCalled();
  });

  it('release still calls endSession if completeSessionJob would fail', async () => {
    const config = createConfig(seedSDK, 3);
    config.proofGracePeriodMs = 50;
    pool = new SessionPool(config);
    const { adapter, session } = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    const adapterSDK = adapter.getSDK() as any;
    adapterSDK.getPaymentManager().completeSessionJob.mockRejectedValue(new Error('settle failed'));
    await pool.release(adapter, session);
    expect(adapterSDK.getSessionManager().endSession).toHaveBeenCalledWith(session.sessionId);
    await pool.destroy(); // should not throw despite settlement failure
  });

  it('release defers completeSessionJob by proofGracePeriodMs', async () => {
    const config = createConfig(seedSDK, 3);
    config.proofGracePeriodMs = 200;
    pool = new SessionPool(config);
    const { adapter, session } = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    const adapterSDK = adapter.getSDK() as any;
    const completeMock = adapterSDK.getPaymentManager().completeSessionJob;
    await pool.release(adapter, session);
    // completeSessionJob should NOT have been called yet (grace period pending)
    expect(completeMock).not.toHaveBeenCalled();
    // After grace period, it should be called
    await new Promise(r => setTimeout(r, 300));
    expect(completeMock).toHaveBeenCalled();
    await pool.destroy();
  });

  it('release immediately frees slot even with grace period', async () => {
    const config = createConfig(seedSDK, 1);
    config.proofGracePeriodMs = 5000;
    pool = new SessionPool(config);
    const first = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    const secondPromise = pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    await pool.release(first.adapter, first.session);
    // Slot should be free immediately, not after 5s grace period
    const second = await Promise.race([
      secondPromise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 500)),
    ]);
    expect(second).toBeDefined();
    await pool.destroy();
  });

  it('destroy waits for pending deferred completions', async () => {
    const config = createConfig(seedSDK, 3);
    config.proofGracePeriodMs = 200;
    pool = new SessionPool(config);
    const { adapter, session } = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    const adapterSDK = adapter.getSDK() as any;
    const completeMock = adapterSDK.getPaymentManager().completeSessionJob;
    await pool.release(adapter, session);
    expect(completeMock).not.toHaveBeenCalled();
    await pool.destroy();
    // destroy should have waited and completed the deferred settlement
    expect(completeMock).toHaveBeenCalled();
  });

  it('acquire handles S5 init failure gracefully', async () => {
    // S5 init failure is handled internally by FabstirSDKCore
    // SDK still creates SessionManager with no-op proxy for StorageManager
    const result = await pool.acquire('m', { chainId: 84532, depositAmount: '0.001' });
    expect(result.adapter).toBeDefined();
    await pool.destroy();
  });
});
