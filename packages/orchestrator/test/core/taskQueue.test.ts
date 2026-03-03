import { describe, it, expect, beforeEach } from 'vitest';
import { TaskQueue } from '../../src/core/TaskQueue';
import type { TaskGraph, SubTaskResult } from '../../src/types';

function makeGraph(): TaskGraph {
  return {
    id: 'graph-1',
    goal: 'Test goal',
    createdAt: new Date().toISOString(),
    tasks: [
      { id: 't1', name: 'Research', prompt: 'p1', systemPrompt: 's1', taskType: 'analysis', blockedBy: [] },
      { id: 't2', name: 'Write', prompt: 'p2', systemPrompt: 's2', taskType: 'synthesis', blockedBy: ['t1'] },
      { id: 't3', name: 'Review', prompt: 'p3', systemPrompt: 's3', taskType: 'analysis', blockedBy: [] },
    ],
  };
}

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it('enqueue stores all tasks from graph', () => {
    const graph = makeGraph();
    queue.enqueue(graph);
    const state = queue.getGraphState();
    expect(state).toHaveLength(3);
    expect(state.map(t => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('tasks with no blockedBy start as pending', () => {
    queue.enqueue(makeGraph());
    const state = queue.getGraphState();
    const t1 = state.find(t => t.id === 't1')!;
    const t3 = state.find(t => t.id === 't3')!;
    expect(t1.state).toBe('pending');
    expect(t3.state).toBe('pending');
  });

  it('tasks with blockedBy start as blocked', () => {
    queue.enqueue(makeGraph());
    const state = queue.getGraphState();
    const t2 = state.find(t => t.id === 't2')!;
    expect(t2.state).toBe('blocked');
  });

  it('getReady returns only pending tasks', () => {
    queue.enqueue(makeGraph());
    const ready = queue.getReady();
    expect(ready).toHaveLength(2);
    expect(ready.every(t => t.state === 'pending')).toBe(true);
    expect(ready.map(t => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('markCompleted transitions task to completed', () => {
    queue.enqueue(makeGraph());
    const result: SubTaskResult = {
      taskId: 't1', model: 'fast-model', summary: 'Done', artifacts: [],
    };
    queue.markCompleted('t1', result);
    const t1 = queue.getGraphState().find(t => t.id === 't1')!;
    expect(t1.state).toBe('completed');
    expect(t1.resultSummary).toBe('Done');
  });

  it('markCompleted unblocks dependent tasks', () => {
    queue.enqueue(makeGraph());
    // t2 is blocked by t1
    expect(queue.getGraphState().find(t => t.id === 't2')!.state).toBe('blocked');
    const result: SubTaskResult = {
      taskId: 't1', model: 'fast-model', summary: 'Done', artifacts: [],
    };
    queue.markCompleted('t1', result);
    // t2 should now be pending since its only dependency is completed
    expect(queue.getGraphState().find(t => t.id === 't2')!.state).toBe('pending');
  });

  it('markFailed transitions task to failed', () => {
    queue.enqueue(makeGraph());
    queue.markFailed('t1', 'Something went wrong');
    const t1 = queue.getGraphState().find(t => t.id === 't1')!;
    expect(t1.state).toBe('failed');
  });

  it('getGraphState returns all task records', () => {
    queue.enqueue(makeGraph());
    const result: SubTaskResult = {
      taskId: 't1', model: 'fast-model', summary: 'Done', artifacts: [],
    };
    queue.markCompleted('t1', result);
    queue.markFailed('t3', 'Error');
    const state = queue.getGraphState();
    expect(state).toHaveLength(3);
    expect(state.find(t => t.id === 't1')!.state).toBe('completed');
    expect(state.find(t => t.id === 't2')!.state).toBe('pending'); // unblocked by t1
    expect(state.find(t => t.id === 't3')!.state).toBe('failed');
  });
});
