import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorExecutor } from '../../src/a2a/server/OrchestratorExecutor';
import type { OrchestrationResult } from '../../src/types';

function makeResult(synthesis = 'Final answer'): OrchestrationResult {
  return { taskGraphId: 'g-1', synthesis, subTaskResults: new Map(), proofCIDs: ['cid-1'], totalTokensUsed: 500 };
}

function mockManager(result?: OrchestrationResult) {
  return { orchestrate: vi.fn().mockResolvedValue(result ?? makeResult()) };
}

function mockBus() { return { publish: vi.fn() }; }

function ctx(text = 'Do research', taskId = 'task-42') {
  return { task: { id: taskId }, message: { parts: [{ type: 'text', text }] } };
}

describe('OrchestratorExecutor', () => {
  let mgr: ReturnType<typeof mockManager>;
  let bus: ReturnType<typeof mockBus>;
  let exec: OrchestratorExecutor;

  beforeEach(() => {
    mgr = mockManager();
    bus = mockBus();
    exec = new OrchestratorExecutor(mgr as any);
  });

  it('execute extracts goal from user message text parts', async () => {
    const multiPart = {
      task: { id: 't-1' },
      message: { parts: [{ type: 'text', text: 'Do research' }, { type: 'text', text: 'on AI' }] },
    };
    await exec.execute(multiPart, bus);
    expect(mgr.orchestrate).toHaveBeenCalledWith(
      'Do research on AI',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('execute publishes working status on start', async () => {
    await exec.execute(ctx(), bus);
    const first = bus.publish.mock.calls[0][0];
    expect(first).toMatchObject({ type: 'status-update', state: 'working', taskId: 'task-42' });
  });

  it('execute publishes synthesis as artifact on success', async () => {
    mgr = mockManager(makeResult('The synthesis output'));
    exec = new OrchestratorExecutor(mgr as any);
    await exec.execute(ctx(), bus);
    const evt = bus.publish.mock.calls.find((c: any[]) => c[0].type === 'artifact-update');
    expect(evt).toBeDefined();
    expect(evt![0].artifact.text).toBe('The synthesis output');
  });

  it('execute publishes completed status on success', async () => {
    await exec.execute(ctx(), bus);
    const last = bus.publish.mock.calls[bus.publish.mock.calls.length - 1][0];
    expect(last).toMatchObject({ type: 'status-update', state: 'completed' });
  });

  it('execute publishes failed status on error', async () => {
    mgr.orchestrate.mockRejectedValue(new Error('LLM timeout'));
    await exec.execute(ctx(), bus);
    const fail = bus.publish.mock.calls.find((c: any[]) => c[0].state === 'failed');
    expect(fail).toBeDefined();
    expect(fail![0].message).toBe('LLM timeout');
  });

  it('cancelTask aborts running orchestration', async () => {
    let signal: AbortSignal | undefined;
    mgr.orchestrate.mockImplementation(async (_g: string, opts: any) => {
      signal = opts?.signal;
      await new Promise((r) => setTimeout(r, 100));
      return makeResult();
    });
    const promise = exec.execute(ctx('Long task', 'task-99'), bus);
    await new Promise((r) => setTimeout(r, 10));
    exec.cancelTask('task-99', bus);
    expect(signal?.aborted).toBe(true);
    expect(bus.publish.mock.calls.find((c: any[]) => c[0].state === 'cancelled')).toBeDefined();
    await promise;
  });

  it('execute streams progress updates through A2A SSE', async () => {
    mgr.orchestrate.mockImplementation(async (_g: string, opts: any) => {
      opts.onProgress({ message: 'Step 1/3', completedTasks: 1, totalTasks: 3 });
      opts.onProgress({ message: 'Step 2/3', completedTasks: 2, totalTasks: 3 });
      opts.onProgress({ message: 'Step 3/3', completedTasks: 3, totalTasks: 3 });
      return makeResult();
    });
    await exec.execute(ctx(), bus);
    const working = bus.publish.mock.calls.filter(
      (c: any[]) => c[0].type === 'status-update' && c[0].state === 'working',
    );
    expect(working.length).toBeGreaterThanOrEqual(4); // initial + 3 progress
    expect(working[1][0].message).toBe('Step 1/3');
    expect(working[2][0].message).toBe('Step 2/3');
    expect(working[3][0].message).toBe('Step 3/3');
  });
});
