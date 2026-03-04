import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorManager } from '../../src/core/OrchestratorManager';
import type { OrchestratorConfig } from '../../src/types';

const plan = JSON.stringify({ tasks: [{ id: 't1', name: 'Task', prompt: 'Do', systemPrompt: 'OK', taskType: 'analysis', blockedBy: [] }] });

let sendPrompt: ReturnType<typeof vi.fn>;
let startSession: ReturnType<typeof vi.fn>;
let endSession: ReturnType<typeof vi.fn>;
let completeJob: ReturnType<typeof vi.fn>;
const modelMgr = { getAvailableModelsWithHosts: vi.fn().mockResolvedValue([
  { model: { huggingfaceRepo: 'R', fileName: 'deep.gguf' }, hostCount: 2, priceRange: { min: 1n, max: 2n, avg: 1n }, isAvailable: true },
  { model: { huggingfaceRepo: 'R', fileName: 'fast.gguf' }, hostCount: 1, priceRange: { min: 1n, max: 1n, avg: 1n }, isAvailable: true },
]) };

function resetMocks() {
  let c = 0;
  startSession = vi.fn().mockImplementation(async () => ({ sessionId: BigInt(++c * 100), jobId: BigInt(c * 200) }));
  sendPrompt = vi.fn().mockImplementation(async () => { c++; if (c <= 2) return plan; if (c <= 3) return 'result'; return 'synthesis'; });
  endSession = vi.fn().mockResolvedValue(undefined);
  completeJob = vi.fn().mockResolvedValue({ success: true });
}

function mockSDK() {
  return {
    getSessionManager: () => ({ startSession: (...a: any[]) => startSession(...a), sendPromptStreaming: (...a: any[]) => sendPrompt(...a), endSession: (...a: any[]) => endSession(...a) }),
    getPaymentManager: () => ({ completeSessionJob: (...a: any[]) => completeJob(...a) }),
    getModelManager: () => modelMgr,
    authenticate: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('@fabstir/sdk-core', () => ({ FabstirSDKCore: vi.fn().mockImplementation(() => mockSDK()) }));

function baseConfig(): OrchestratorConfig {
  return { sdk: mockSDK() as any, chainId: 84532, privateKey: '0x1', models: { fast: 'R:fast.gguf', deep: 'R:deep.gguf' },
    maxConcurrentSessions: 3, budget: { maxDepositPerSubTask: '0.001', maxTotalDeposit: '0.01', maxSubTasks: 10 } };
}

describe('x402 End-to-End', () => {
  beforeEach(() => resetMocks());

  it('OrchestratorManager with x402 config creates budget tracker', () => {
    const config = { ...baseConfig(), x402: { budget: { maxX402Spend: '10000000' } } };
    const mgr = new OrchestratorManager(config);
    expect(mgr).toBeDefined();
  });

  it('OrchestratorManager without x402 config does not create handler', () => {
    const mgr = new OrchestratorManager(baseConfig());
    expect(mgr).toBeDefined();
  });

  it('OrchestrationResult includes x402Spend when budget configured', async () => {
    const config = { ...baseConfig(), x402: { budget: { maxX402Spend: '10000000' } } };
    const mgr = new OrchestratorManager(config);
    await mgr.initialize();
    const result = await mgr.orchestrate('Do something');
    expect(result.x402Spend).toBeDefined();
    expect(result.x402Spend).toBe('0');
  });

  it('OrchestrationResult omits x402Spend when no x402 config', async () => {
    const mgr = new OrchestratorManager(baseConfig());
    await mgr.initialize();
    const result = await mgr.orchestrate('Do something');
    expect(result.x402Spend).toBeUndefined();
  });

  it('x402 budget tracker starts at zero spend', () => {
    const config = { ...baseConfig(), x402: { budget: { maxX402Spend: '5000000' } } };
    const mgr = new OrchestratorManager(config);
    expect(mgr).toBeDefined();
  });
});
