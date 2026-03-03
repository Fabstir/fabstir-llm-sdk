import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pipeline } from '../../src/patterns/Pipeline';
import type { OrchestratorTask, SessionAdapterConfig } from '../../src/types';

// --- Mocks ---
const callOrder: string[] = [];
let sendPromptMock: ReturnType<typeof vi.fn>;

const mockAdapter = {
  sendPrompt: (...args: any[]) => sendPromptMock(...args),
};
const mockSession = { sessionId: 1n, jobId: 10n, model: 'test-model', chainId: 84532 };

const mockPool = {
  acquire: vi.fn().mockResolvedValue({ adapter: mockAdapter, session: mockSession }),
  release: vi.fn().mockResolvedValue(undefined),
};

const mockRouter = {
  assign: vi.fn().mockReturnValue({ target: 'internal', model: 'test-model', reason: 'test' }),
};

const adapterConfig: SessionAdapterConfig = { chainId: 84532, depositAmount: '0.001' };

function makeTask(id: string, prompt: string): OrchestratorTask {
  return { id, name: id, prompt, systemPrompt: 'sys', taskType: 'analysis', blockedBy: [] };
}

beforeEach(() => {
  callOrder.length = 0;
  vi.clearAllMocks();
  sendPromptMock = vi.fn();
});

describe('pipeline', () => {
  it('executes tasks sequentially', async () => {
    sendPromptMock.mockImplementation(async (_sid: any, prompt: string) => {
      if (prompt.includes('A')) callOrder.push('A');
      else if (prompt.includes('B')) callOrder.push('B');
      else callOrder.push('C');
      return { response: 'ok', tokensUsed: 10 };
    });
    const tasks = [makeTask('t1', 'A'), makeTask('t2', 'B'), makeTask('t3', 'C')];
    await pipeline(tasks, mockPool as any, mockRouter as any, adapterConfig);
    expect(callOrder).toEqual(['A', 'B', 'C']);
  });

  it('passes result of task N to task N+1', async () => {
    const capturedPrompts: string[] = [];
    sendPromptMock.mockImplementation(async (_sid: any, prompt: string) => {
      capturedPrompts.push(prompt);
      return { response: `result-of-${prompt.slice(-1)}`, tokensUsed: 5 };
    });
    const tasks = [makeTask('t1', 'step-A'), makeTask('t2', 'step-B')];
    await pipeline(tasks, mockPool as any, mockRouter as any, adapterConfig);
    expect(capturedPrompts[0]).toBe('step-A');
    expect(capturedPrompts[1]).toContain('result-of-A');
    expect(capturedPrompts[1]).toContain('step-B');
  });

  it('returns final task result', async () => {
    sendPromptMock
      .mockResolvedValueOnce({ response: 'first', tokensUsed: 5 })
      .mockResolvedValueOnce({ response: 'second', tokensUsed: 5 })
      .mockResolvedValueOnce({ response: 'final-answer', tokensUsed: 8 });
    const tasks = [makeTask('t1', 'A'), makeTask('t2', 'B'), makeTask('t3', 'C')];
    const result = await pipeline(tasks, mockPool as any, mockRouter as any, adapterConfig);
    expect(result.taskId).toBe('t3');
    expect(result.summary).toBe('final-answer');
    expect(result.tokensUsed).toBe(8);
  });

  it('stops on first failure', async () => {
    sendPromptMock
      .mockResolvedValueOnce({ response: 'ok', tokensUsed: 5 })
      .mockRejectedValueOnce(new Error('task-2-failed'));
    const tasks = [makeTask('t1', 'A'), makeTask('t2', 'B'), makeTask('t3', 'C')];
    await expect(
      pipeline(tasks, mockPool as any, mockRouter as any, adapterConfig),
    ).rejects.toThrow('task-2-failed');
    expect(sendPromptMock).toHaveBeenCalledTimes(2);
    expect(mockPool.release).toHaveBeenCalledTimes(2);
  });
});
