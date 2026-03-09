import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskPlanner } from '../../src/core/TaskPlanner';
import type { SessionAdapter } from '../../src/core/SessionAdapter';
import type { OrchestratorSession, SubTaskResult } from '../../src/types';

const validPlan = JSON.stringify({
  tasks: [
    { id: 't1', name: 'Research', prompt: 'Research topic', systemPrompt: 'Be thorough', taskType: 'analysis', blockedBy: [] },
    { id: 't2', name: 'Write', prompt: 'Write report', systemPrompt: 'Be concise', taskType: 'synthesis', blockedBy: ['t1'] },
  ],
});

function createMockAdapter(response = validPlan) {
  return {
    sendPrompt: vi.fn().mockResolvedValue({ response, tokensUsed: 100 }),
    createSession: vi.fn(),
    endSession: vi.fn(),
    getSDK: vi.fn(),
  } as unknown as SessionAdapter;
}

const session: OrchestratorSession = { sessionId: 1n, jobId: 10n, model: 'deep-model', chainId: 84532 };
const models = { fast: 'fast-model', deep: 'deep-model' };

describe('TaskPlanner', () => {
  let adapter: ReturnType<typeof createMockAdapter>;
  let planner: TaskPlanner;

  beforeEach(() => {
    adapter = createMockAdapter();
    planner = new TaskPlanner(adapter as any, session, models);
  });

  it('decompose returns a TaskGraph with id and goal', async () => {
    const graph = await planner.decompose('Analyze data');
    expect(graph.id).toBeDefined();
    expect(graph.goal).toBe('Analyze data');
    expect(graph.tasks).toHaveLength(2);
    expect(graph.createdAt).toBeDefined();
  });

  it('decompose creates correct OrchestratorTask objects', async () => {
    const graph = await planner.decompose('Analyze data');
    expect(graph.tasks[0].id).toBe('t1');
    expect(graph.tasks[0].name).toBe('Research');
    expect(graph.tasks[0].prompt).toBe('Research topic');
    expect(graph.tasks[0].taskType).toBe('analysis');
    expect(graph.tasks[0].blockedBy).toEqual([]);
    expect(graph.tasks[1].blockedBy).toEqual(['t1']);
  });

  it('decompose respects maxSubTasks budget', async () => {
    await planner.decompose('Goal', { maxSubTasks: 3 });
    const call = (adapter.sendPrompt as any).mock.calls[0];
    expect(call[1]).toContain('3');
  });

  it('decompose throws on invalid JSON from model', async () => {
    adapter = createMockAdapter('not json at all {{{');
    planner = new TaskPlanner(adapter as any, session, models);
    await expect(planner.decompose('Goal')).rejects.toThrow();
  });

  it('decompose extracts JSON from markdown-fenced response', async () => {
    adapter = createMockAdapter('```json\n' + validPlan + '\n```');
    planner = new TaskPlanner(adapter as any, session, models);
    const graph = await planner.decompose('Goal');
    expect(graph.tasks).toHaveLength(2);
  });

  it('decompose extracts JSON from mixed text response', async () => {
    adapter = createMockAdapter('Here is the plan:\n' + validPlan + '\nDone.');
    planner = new TaskPlanner(adapter as any, session, models);
    const graph = await planner.decompose('Goal');
    expect(graph.tasks).toHaveLength(2);
  });

  it('decompose throws on empty tasks array', async () => {
    adapter = createMockAdapter(JSON.stringify({ tasks: [] }));
    planner = new TaskPlanner(adapter as any, session, models);
    await expect(planner.decompose('Goal')).rejects.toThrow(/empty/i);
  });

  it('decompose throws on invalid blockedBy reference', async () => {
    const badPlan = JSON.stringify({
      tasks: [{ id: 't1', name: 'A', prompt: 'p', systemPrompt: 's', taskType: 'analysis', blockedBy: ['nonexistent'] }],
    });
    adapter = createMockAdapter(badPlan);
    planner = new TaskPlanner(adapter as any, session, models);
    await expect(planner.decompose('Goal')).rejects.toThrow(/blockedBy/i);
  });

  it('synthesise merges results into coherent response', async () => {
    adapter = createMockAdapter('Final synthesis result');
    planner = new TaskPlanner(adapter as any, session, models);
    const results = new Map<string, SubTaskResult>([
      ['t1', { taskId: 't1', model: 'fast', summary: 'Result A', artifacts: [] }],
    ]);
    const synthesis = await planner.synthesise('Goal', results);
    expect(synthesis).toBe('Final synthesis result');
  });

  it('synthesise includes all sub-task summaries in prompt', async () => {
    const results = new Map<string, SubTaskResult>([
      ['t1', { taskId: 't1', model: 'fast', summary: 'Summary A', artifacts: [] }],
      ['t2', { taskId: 't2', model: 'deep', summary: 'Summary B', artifacts: [] }],
    ]);
    await planner.synthesise('Goal', results);
    const call = (adapter.sendPrompt as any).mock.calls[0];
    expect(call[1]).toContain('Summary A');
    expect(call[1]).toContain('Summary B');
  });

  it('decompose uses provided adapter and session (no pool acquire)', async () => {
    await planner.decompose('Goal');
    expect(adapter.sendPrompt).toHaveBeenCalledWith(
      1n, expect.any(String), expect.any(String), undefined, undefined,
    );
  });

  it('synthesise uses provided adapter and session (no pool acquire)', async () => {
    const results = new Map<string, SubTaskResult>();
    await planner.synthesise('Goal', results);
    expect(adapter.sendPrompt).toHaveBeenCalledWith(
      1n, expect.any(String), undefined, undefined, undefined,
    );
  });
});
