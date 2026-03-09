import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapReduce } from '../../src/patterns/MapReduce';
import type { OrchestratorTask, SessionAdapterConfig } from '../../src/types';

function mockAdapter(response = 'result') {
  return {
    sendPrompt: vi.fn().mockResolvedValue({ response, tokensUsed: 10 }),
    endSession: vi.fn().mockResolvedValue(undefined),
    getSDK: vi.fn(),
  };
}
function mockSession(id = 1n) {
  return { sessionId: id, jobId: id, model: 'test-model', chainId: 84532 };
}
function mockPool() {
  return {
    acquire: vi.fn().mockResolvedValue({ adapter: mockAdapter(), session: mockSession() }),
    release: vi.fn().mockResolvedValue(undefined),
  };
}
function mockRouter() {
  return { assign: vi.fn().mockReturnValue({ target: 'internal', model: 'test-model', reason: 'test' }) };
}
function task(id: string, prompt?: string): OrchestratorTask {
  return { id, name: `task-${id}`, prompt: prompt ?? `prompt-${id}`, systemPrompt: 'sys', taskType: 'analysis', blockedBy: [] };
}

const cfg: SessionAdapterConfig = { chainId: 84532, depositAmount: '0.001' };

describe('mapReduce', () => {
  let pool: ReturnType<typeof mockPool>;
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => { pool = mockPool(); router = mockRouter(); });

  it('runs all map tasks in parallel', async () => {
    const result = await mapReduce([task('m1'), task('m2'), task('m3')], task('r', 'Reduce'), pool as any, router as any, cfg);
    expect(pool.acquire).toHaveBeenCalledTimes(4); // 3 map + 1 reduce
    expect(pool.release).toHaveBeenCalledTimes(4);
    expect(result).toBeDefined();
  });

  it('passes all map results to reducer', async () => {
    let idx = 0;
    pool.acquire.mockImplementation(async () => {
      idx++;
      return { adapter: mockAdapter(idx <= 3 ? `summary-${idx}` : 'final'), session: mockSession(BigInt(idx)) };
    });
    await mapReduce([task('m1'), task('m2'), task('m3')], task('r', 'Combine'), pool as any, router as any, cfg);
    const reducerResult = await pool.acquire.mock.results[3].value;
    const prompt: string = reducerResult.adapter.sendPrompt.mock.calls[0][1];
    expect(prompt).toContain('[m1]');
    expect(prompt).toContain('[m2]');
    expect(prompt).toContain('[m3]');
  });

  it('returns reducer result', async () => {
    let idx = 0;
    pool.acquire.mockImplementation(async () => {
      idx++;
      return { adapter: mockAdapter(idx <= 3 ? `map-${idx}` : 'final-synthesis'), session: mockSession(BigInt(idx)) };
    });
    const result = await mapReduce([task('m1'), task('m2'), task('m3')], task('r', 'Synthesise'), pool as any, router as any, cfg);
    expect(result.taskId).toBe('r');
    expect(result.summary).toBe('final-synthesis');
  });

  it('handles single mapper', async () => {
    const result = await mapReduce([task('only')], task('r', 'Reduce single'), pool as any, router as any, cfg);
    expect(pool.acquire).toHaveBeenCalledTimes(2); // 1 map + 1 reduce
    expect(pool.release).toHaveBeenCalledTimes(2);
    expect(result.taskId).toBe('r');
  });
});
