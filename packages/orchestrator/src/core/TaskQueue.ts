import type { TaskGraph, OrchestratorTask, TaskRecord, SubTaskResult, TaskState } from '../types';

/**
 * In-memory task queue that manages the lifecycle of tasks within a TaskGraph.
 * Handles dependency tracking: tasks with unmet blockedBy remain 'blocked'
 * until all dependencies are completed, at which point they become 'pending'.
 */
export class TaskQueue {
  private tasks = new Map<string, TaskRecord>();
  private graphTasks = new Map<string, OrchestratorTask>();
  private graphId = '';

  /** Enqueue all tasks from a graph, setting initial states based on dependencies. */
  enqueue(graph: TaskGraph): void {
    this.graphId = graph.id;
    const now = new Date().toISOString();

    for (const task of graph.tasks) {
      this.graphTasks.set(task.id, task);
      const state: TaskState = task.blockedBy.length > 0 ? 'blocked' : 'pending';
      this.tasks.set(task.id, {
        id: task.id,
        graphId: graph.id,
        name: task.name,
        state,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  /** Return all tasks that are ready to be picked up (state === 'pending'). */
  getReady(): TaskRecord[] {
    return [...this.tasks.values()].filter(t => t.state === 'pending');
  }

  /** Mark a task as claimed by a specific model. */
  markClaimed(taskId: string, model: string): void {
    const task = this.getTask(taskId);
    task.state = 'claimed';
    task.assignedModel = model;
    task.updatedAt = new Date().toISOString();
  }

  /** Mark a task as completed, store the result summary, and unblock dependents. */
  markCompleted(taskId: string, result: SubTaskResult): void {
    const task = this.getTask(taskId);
    task.state = 'completed';
    task.resultSummary = result.summary;
    task.assignedModel = result.model;
    if (result.proofCID) task.proofCID = result.proofCID;
    task.updatedAt = new Date().toISOString();
    this.unblockDependents(taskId);
  }

  /** Mark a task as failed. */
  markFailed(taskId: string, error: string): void {
    const task = this.getTask(taskId);
    task.state = 'failed';
    task.updatedAt = new Date().toISOString();
  }

  /** Return a snapshot of all task records in the queue. */
  getGraphState(): TaskRecord[] {
    return [...this.tasks.values()];
  }

  /** Return the number of tasks currently ready (pending). */
  getPendingCount(): number {
    return this.getReady().length;
  }

  // --- private helpers ---

  private getTask(taskId: string): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return task;
  }

  /** Check all blocked tasks; if all blockedBy deps are completed, unblock them. */
  private unblockDependents(completedId: string): void {
    for (const [id, record] of this.tasks) {
      if (record.state !== 'blocked') continue;
      const original = this.graphTasks.get(id);
      if (!original) continue;
      const allMet = original.blockedBy.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.state === 'completed';
      });
      if (allMet) {
        record.state = 'pending';
        record.updatedAt = new Date().toISOString();
      }
    }
  }
}
