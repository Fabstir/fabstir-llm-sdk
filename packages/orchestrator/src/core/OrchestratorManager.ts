import type { FabstirSDKCore } from '@fabstir/sdk-core';
import { SessionAdapter } from './SessionAdapter';
import { SessionPool } from './SessionPool';
import { ModelRouter } from './ModelRouter';
import { TaskPlanner } from './TaskPlanner';
import { TaskQueue } from './TaskQueue';
import { ProofCollector } from './ProofCollector';
import type {
  OrchestratorConfig,
  OrchestrationResult,
  OrchestrationOptions,
  SubTaskResult,
  OrchestratorTask,
  OrchestratorSession,
  TaskGraph,
} from '../types';

export class OrchestratorManager {
  private readonly config: OrchestratorConfig;
  private readonly pool: SessionPool;
  private readonly router: ModelRouter;
  private readonly queue: TaskQueue;
  private readonly proofCollector: ProofCollector;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.pool = new SessionPool(config);
    this.router = new ModelRouter(config.sdk, config.models);
    this.queue = new TaskQueue();
    this.proofCollector = new ProofCollector();
  }

  async initialize(): Promise<void> {
    if (this.config.maxConcurrentSessions < 2) {
      throw new Error('maxConcurrentSessions must be >= 2 (planning session uses 1 slot)');
    }
    if (this.config.maxConcurrentSessions < 3) {
      console.warn('maxConcurrentSessions < 3: only 1 sub-task at a time (no parallelism)');
    }
    const planningModel = this.config.models.planning ?? this.config.models.deep;
    if (!planningModel) {
      throw new Error('Planning model required: set models.planning or models.deep');
    }
    await this.router.initialize();
  }

  async orchestrate(goal: string, options?: OrchestrationOptions): Promise<OrchestrationResult> {
    const planningModel = this.config.models.planning ?? this.config.models.deep!;
    const adapterConfig = {
      chainId: this.config.chainId,
      depositAmount: this.config.budget.maxDepositPerSubTask,
    };

    const { adapter: planAdapter, session: planSession } = await this.pool.acquire(
      planningModel, adapterConfig, options?.signal,
    );

    let totalTokensUsed = 0;

    try {
      const planner = new TaskPlanner(planAdapter, planSession, this.config.models);
      options?.onProgress?.({ phase: 'decomposing', message: 'Decomposing goal into sub-tasks', completedTasks: 0, totalTasks: 0 });
      const graph = await planner.decompose(goal, options);
      options?.onProgress?.({ phase: 'decomposing', message: `Decomposed into ${graph.tasks.length} sub-tasks`, completedTasks: 0, totalTasks: graph.tasks.length });

      if (graph.tasks.length > this.config.budget.maxSubTasks) {
        throw new Error(
          `Task graph has ${graph.tasks.length} tasks, exceeds maxSubTasks budget of ${this.config.budget.maxSubTasks}`,
        );
      }

      this.queue.enqueue(graph);
      const results = await this.executeTaskGraph(graph, options);

      for (const r of results.values()) {
        totalTokensUsed += r.tokensUsed ?? 0;
      }

      options?.onProgress?.({ phase: 'synthesising', message: 'Synthesising final answer', completedTasks: graph.tasks.length, totalTasks: graph.tasks.length });
      const synthesis = await planner.synthesise(goal, results);
      const proofCIDs = this.proofCollector.getProofCIDs();

      return {
        taskGraphId: graph.id,
        synthesis,
        subTaskResults: results,
        proofCIDs,
        totalTokensUsed,
      };
    } finally {
      try {
        await this.pool.release(planAdapter, planSession);
      } catch {
        // Planning session cleanup best-effort
      }
    }
  }

  private async executeTaskGraph(
    graph: TaskGraph,
    options?: OrchestrationOptions,
  ): Promise<Map<string, SubTaskResult>> {
    const results = new Map<string, SubTaskResult>();
    let completedCount = 0;
    const totalTasks = graph.tasks.length;

    while (completedCount < totalTasks) {
      if (options?.signal?.aborted) {
        throw new DOMException('Orchestration aborted', 'AbortError');
      }

      const ready = this.queue.getReady();
      if (ready.length === 0 && completedCount < totalTasks) {
        throw new Error('Deadlock detected: no ready tasks but pending tasks remain');
      }

      const batch = ready.map(async (record) => {
        const task = graph.tasks.find(t => t.id === record.id)!;
        const assignment = this.router.assign(task);
        options?.onProgress?.({ phase: 'executing', message: `Starting task "${task.name}"`, taskId: task.id, taskName: task.name, completedTasks: completedCount, totalTasks });
        this.queue.markClaimed(task.id, assignment.model);

        try {
          const result = await this.executeSubTask(task, assignment.model, results, options);
          this.queue.markCompleted(task.id, result);
          this.proofCollector.collect(result);
          results.set(task.id, result);
        } catch (err) {
          this.queue.markFailed(task.id, (err as Error).message);
          throw err;
        }
      });

      await Promise.all(batch);
      completedCount = [...results.keys()].length;

      options?.onProgress?.({
        phase: 'executing',
        message: `Completed ${completedCount}/${totalTasks} tasks`,
        completedTasks: completedCount,
        totalTasks,
      });
    }

    return results;
  }

  private async executeSubTask(
    task: OrchestratorTask,
    model: string,
    priorResults: Map<string, SubTaskResult>,
    options?: OrchestrationOptions,
  ): Promise<SubTaskResult> {
    const adapterConfig = {
      chainId: this.config.chainId,
      depositAmount: this.config.budget.maxDepositPerSubTask,
    };
    const { adapter, session } = await this.pool.acquire(model, adapterConfig, options?.signal);

    try {
      let prompt = task.prompt;
      for (const depId of task.blockedBy) {
        const depResult = priorResults.get(depId);
        if (depResult) {
          prompt = `Context from "${depId}": ${depResult.summary}\n\n${prompt}`;
        }
      }

      const { response, tokensUsed } = await adapter.sendPrompt(
        session.sessionId, prompt, task.systemPrompt, undefined,
        options?.signal ? { signal: options.signal } : undefined,
      );

      return {
        taskId: task.id,
        model,
        summary: response,
        artifacts: [],
        sessionId: session.sessionId,
        tokensUsed,
      };
    } finally {
      try {
        await this.pool.release(adapter, session);
      } catch {
        // Sub-task cleanup best-effort
      }
    }
  }

  async destroy(): Promise<void> {
    await this.pool.destroy();
    this.proofCollector.clear();
  }
}
