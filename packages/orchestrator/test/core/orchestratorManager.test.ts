import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorManager } from '../../src/core/OrchestratorManager';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

const validPlan = JSON.stringify({
  tasks: [
    { id: 't1', name: 'Research', prompt: 'Do research', systemPrompt: 'Be thorough', taskType: 'analysis', blockedBy: [] },
    { id: 't2', name: 'Summarize', prompt: 'Summarize', systemPrompt: 'Be brief', taskType: 'synthesis', blockedBy: ['t1'] },
  ],
});

// Shared mock state — all FabstirSDKCore instances use these
let sharedSendPrompt: ReturnType<typeof vi.fn>;
let sharedStartSession: ReturnType<typeof vi.fn>;
let sharedEndSession: ReturnType<typeof vi.fn>;
let sharedCompleteJob: ReturnType<typeof vi.fn>;

const modelManagerMock = {
  getAvailableModelsWithHosts: vi.fn().mockResolvedValue([
    { model: { huggingfaceRepo: 'Repo', fileName: 'deep.gguf' }, hostCount: 2, priceRange: { min: 1n, max: 2n, avg: 1n }, isAvailable: true },
    { model: { huggingfaceRepo: 'Repo', fileName: 'fast.gguf' }, hostCount: 1, priceRange: { min: 1n, max: 1n, avg: 1n }, isAvailable: true },
  ]),
};

function resetSharedMocks(planResponse = validPlan) {
  let callCount = 0;
  sharedStartSession = vi.fn().mockImplementation(async () => ({
    sessionId: BigInt(++callCount * 100), jobId: BigInt(callCount * 200),
  }));
  sharedSendPrompt = vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount <= 2) return planResponse;
    if (callCount <= 4) return 'sub-task result';
    return 'Final synthesis';
  });
  sharedEndSession = vi.fn().mockResolvedValue(undefined);
  sharedCompleteJob = vi.fn().mockResolvedValue({ success: true });
}

function makeMockInstance() {
  return {
    getSessionManager: () => ({
      startSession: (...args: any[]) => sharedStartSession(...args),
      sendPromptStreaming: (...args: any[]) => sharedSendPrompt(...args),
      endSession: (...args: any[]) => sharedEndSession(...args),
    }),
    getPaymentManager: () => ({
      completeSessionJob: (...args: any[]) => sharedCompleteJob(...args),
    }),
    getModelManager: () => modelManagerMock,
    authenticate: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => makeMockInstance()),
}));

const budget: BudgetConfig = { maxDepositPerSubTask: '0.001', maxTotalDeposit: '1.0', maxSubTasks: 10 };

function makeConfig(): OrchestratorConfig {
  return {
    sdk: makeMockInstance() as any,
    chainId: 84532, privateKey: '0xabc',
    models: { fast: 'Repo:fast.gguf', deep: 'Repo:deep.gguf' },
    maxConcurrentSessions: 4, budget, proofGracePeriodMs: 0,
  };
}

describe('OrchestratorManager', () => {
  let manager: OrchestratorManager;

  beforeEach(async () => {
    resetSharedMocks();
    manager = new OrchestratorManager(makeConfig());
    await manager.initialize();
  });

  it('orchestrate acquires a planning session at start', async () => {
    const result = await manager.orchestrate('Do something');
    expect(result).toBeDefined();
    expect(sharedStartSession).toHaveBeenCalled();
  });

  it('orchestrate decomposes goal into task graph', async () => {
    const result = await manager.orchestrate('Analyze data');
    expect(result.taskGraphId).toBeDefined();
  });

  it('orchestrate executes all tasks to completion', async () => {
    const result = await manager.orchestrate('Goal');
    expect(result.subTaskResults.size).toBe(2);
  });

  it('orchestrate respects task dependencies', async () => {
    const order: string[] = [];
    let sendCount = 0;
    sharedSendPrompt.mockImplementation(async () => {
      sendCount++;
      if (sendCount === 1) return validPlan;
      order.push(`task-${sendCount}`);
      if (sendCount <= 3) return 'result';
      return 'synthesis';
    });
    await manager.orchestrate('Goal');
    expect(order.length).toBeGreaterThanOrEqual(2);
  });

  it('orchestrate passes dependency context to dependent tasks', async () => {
    const capturedPrompts: string[] = [];
    let sendCount = 0;
    sharedSendPrompt.mockImplementation(async (_sid: any, prompt: string) => {
      sendCount++;
      if (sendCount === 1) return validPlan;
      capturedPrompts.push(prompt);
      if (sendCount <= 3) return 'sub-task result';
      return 'synthesis';
    });
    await manager.orchestrate('Goal');
    expect(capturedPrompts.length).toBeGreaterThanOrEqual(2);
    expect(capturedPrompts[1]).toContain('sub-task result');
  });

  it('orchestrate synthesises all results', async () => {
    const result = await manager.orchestrate('Goal');
    expect(result.synthesis).toBeDefined();
    expect(typeof result.synthesis).toBe('string');
  });

  it('orchestrate releases planning session after synthesise', async () => {
    await manager.orchestrate('Goal');
    expect(sharedCompleteJob).toHaveBeenCalled();
  });

  it('orchestrate returns OrchestrationResult with all fields', async () => {
    const result = await manager.orchestrate('Goal');
    expect(result.taskGraphId).toBeDefined();
    expect(result.synthesis).toBeDefined();
    expect(result.subTaskResults).toBeInstanceOf(Map);
    expect(result.proofCIDs).toBeInstanceOf(Array);
    expect(typeof result.totalTokensUsed).toBe('number');
  });

  it('orchestrate reports progress via onProgress callback', async () => {
    const updates: any[] = [];
    await manager.orchestrate('Goal', { onProgress: (u) => updates.push(u) });
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0].message).toBeDefined();
  });

  it('orchestrate detects deadlock and throws', async () => {
    const circularPlan = JSON.stringify({
      tasks: [
        { id: 't1', name: 'A', prompt: 'p', systemPrompt: 's', taskType: 'analysis', blockedBy: ['t2'] },
        { id: 't2', name: 'B', prompt: 'p', systemPrompt: 's', taskType: 'analysis', blockedBy: ['t1'] },
      ],
    });
    resetSharedMocks(circularPlan);
    manager = new OrchestratorManager(makeConfig());
    await manager.initialize();
    await expect(manager.orchestrate('Goal')).rejects.toThrow(/deadlock/i);
  });

  it('orchestrate aborts on signal', async () => {
    const controller = new AbortController();
    let sendCount = 0;
    sharedSendPrompt.mockImplementation(async () => {
      sendCount++;
      if (sendCount === 1) return validPlan;
      if (sendCount === 2) {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      }
      return 'synthesis';
    });
    await expect(manager.orchestrate('Goal', { signal: controller.signal })).rejects.toThrow(/abort/i);
  });

  it('orchestrate enforces maxSubTasks budget', async () => {
    const config = makeConfig();
    config.budget = { ...budget, maxSubTasks: 1 };
    manager = new OrchestratorManager(config);
    await manager.initialize();
    await expect(manager.orchestrate('Goal')).rejects.toThrow(/budget|maxSubTasks/i);
  });

  it('orchestrate tracks total tokens used', async () => {
    const result = await manager.orchestrate('Goal');
    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it('orchestrate cleans up all sessions on failure', async () => {
    let sendCount = 0;
    sharedSendPrompt.mockImplementation(async () => {
      sendCount++;
      if (sendCount === 1) return validPlan;
      throw new Error('inference failed');
    });
    await expect(manager.orchestrate('Goal')).rejects.toThrow('inference failed');
    expect(sharedEndSession).toHaveBeenCalled();
  });

  it('orchestrate calls onProgress with phase decomposing before decompose', async () => {
    const updates: any[] = [];
    await manager.orchestrate('Goal', { onProgress: (u) => updates.push(u) });
    const first = updates[0];
    expect(first.phase).toBe('decomposing');
    expect(first.message).toContain('Decomposing');
  });

  it('orchestrate calls onProgress with phase decomposing after decompose with task count', async () => {
    const updates: any[] = [];
    await manager.orchestrate('Goal', { onProgress: (u) => updates.push(u) });
    const decomposed = updates.find((u: any) => u.phase === 'decomposing' && u.totalTasks > 0);
    expect(decomposed).toBeDefined();
    expect(decomposed.totalTasks).toBe(2);
  });

  it('orchestrate calls onProgress with phase executing and taskId per sub-task', async () => {
    const updates: any[] = [];
    await manager.orchestrate('Goal', { onProgress: (u) => updates.push(u) });
    const executing = updates.filter((u: any) => u.phase === 'executing' && u.taskId);
    expect(executing.length).toBeGreaterThanOrEqual(1);
    expect(executing[0].taskId).toBeDefined();
    expect(executing[0].taskName).toBeDefined();
  });

  it('orchestrate calls onProgress with phase synthesising before synthesis', async () => {
    const updates: any[] = [];
    await manager.orchestrate('Goal', { onProgress: (u) => updates.push(u) });
    const synth = updates.find((u: any) => u.phase === 'synthesising');
    expect(synth).toBeDefined();
    expect(synth.message).toContain('Synthe');
  });
});
