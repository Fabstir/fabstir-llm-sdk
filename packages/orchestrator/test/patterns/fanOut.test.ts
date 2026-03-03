import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fanOut } from '../../src/patterns/FanOut';
import type { OrchestratorTask, SessionAdapterConfig } from '../../src/types';

// --- Mock helpers ---
function createMockAdapter() {
  return {
    sendPrompt: vi.fn().mockResolvedValue({ response: 'result', tokensUsed: 10 }),
    endSession: vi.fn().mockResolvedValue(undefined),
    getSDK: vi.fn(),
  };
}

function createMockSession(id = 1n) {
  return { sessionId: id, jobId: id, model: 'test-model', chainId: 84532 };
}

function createMockPool() {
  const adapter = createMockAdapter();
  const session = createMockSession();
  return {
    acquire: vi.fn().mockResolvedValue({ adapter, session }),
    release: vi.fn().mockResolvedValue(undefined),
    _adapter: adapter,
    _session: session,
  };
}

function createMockRouter() {
  return {
    assign: vi.fn().mockReturnValue({ target: 'internal', model: 'test-model', reason: 'test' }),
  };
}

function makeTask(id: string): OrchestratorTask {
  return { id, name: `task-${id}`, prompt: `prompt-${id}`, systemPrompt: 'sys', taskType: 'analysis', blockedBy: [] };
}

const adapterConfig: SessionAdapterConfig = { chainId: 84532, depositAmount: '0.001' };

describe('fanOut', () => {
  let pool: ReturnType<typeof createMockPool>;
  let router: ReturnType<typeof createMockRouter>;

  beforeEach(() => {
    pool = createMockPool();
    router = createMockRouter();
  });

  it('executes all tasks in parallel', async () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c')];
    const results = await fanOut(tasks, pool as any, router as any, adapterConfig);
    expect(results.size).toBe(3);
    expect(pool.acquire).toHaveBeenCalledTimes(3);
    expect(pool.release).toHaveBeenCalledTimes(3);
  });

  it('returns all results keyed by taskId', async () => {
    const tasks = [makeTask('x'), makeTask('y'), makeTask('z')];
    const results = await fanOut(tasks, pool as any, router as any, adapterConfig);
    expect(results.has('x')).toBe(true);
    expect(results.has('y')).toBe(true);
    expect(results.has('z')).toBe(true);
    expect(results.get('x')!.taskId).toBe('x');
    expect(results.get('y')!.model).toBe('test-model');
    expect(results.get('z')!.tokensUsed).toBe(10);
  });

  it('fails fast if any task fails', async () => {
    const failAdapter = createMockAdapter();
    failAdapter.sendPrompt.mockRejectedValue(new Error('LLM down'));
    let callIdx = 0;
    pool.acquire.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 2) return { adapter: failAdapter, session: createMockSession(2n) };
      return { adapter: createMockAdapter(), session: createMockSession(BigInt(callIdx)) };
    });

    const tasks = [makeTask('1'), makeTask('2'), makeTask('3')];
    await expect(fanOut(tasks, pool as any, router as any, adapterConfig)).rejects.toThrow('LLM down');
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    pool.acquire.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { adapter: createMockAdapter(), session: createMockSession() };
    });

    const tasks = [makeTask('s1'), makeTask('s2'), makeTask('s3')];
    const promise = fanOut(tasks, pool as any, router as any, adapterConfig, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow();
  });
});
