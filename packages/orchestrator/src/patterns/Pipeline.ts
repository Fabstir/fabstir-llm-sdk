import type { SessionPool } from '../core/SessionPool';
import type { ModelRouter } from '../core/ModelRouter';
import type { OrchestratorTask, SubTaskResult, SessionAdapterConfig } from '../types';

/**
 * Executes tasks sequentially, passing each task's result as context
 * to the next task. Returns the final task's result.
 * Stops immediately on the first failure.
 */
export async function pipeline(
  tasks: OrchestratorTask[],
  pool: SessionPool,
  router: ModelRouter,
  config: SessionAdapterConfig,
): Promise<SubTaskResult> {
  let lastResult: SubTaskResult | undefined;

  for (const task of tasks) {
    const assignment = router.assign(task);
    const { adapter, session } = await pool.acquire(assignment.model, config);
    try {
      // Prepend prior result as context
      let prompt = task.prompt;
      if (lastResult) {
        prompt = `Context from previous step: ${lastResult.summary}\n\n${prompt}`;
      }

      const { response, tokensUsed } = await adapter.sendPrompt(
        session.sessionId,
        prompt,
        task.systemPrompt,
      );

      lastResult = {
        taskId: task.id,
        model: assignment.model,
        summary: response,
        artifacts: [],
        sessionId: session.sessionId,
        tokensUsed,
      };
    } finally {
      await pool.release(adapter, session).catch(() => {});
    }
  }

  return lastResult!;
}
