import type { SessionPool } from '../core/SessionPool';
import type { ModelRouter } from '../core/ModelRouter';
import type { OrchestratorTask, SubTaskResult, SessionAdapterConfig } from '../types';

/**
 * Execute multiple independent tasks in parallel (fan-out pattern).
 *
 * Each task gets its own session from the pool. If any task fails,
 * the entire fan-out rejects (fail-fast). Supports cancellation
 * via AbortSignal.
 */
export async function fanOut(
  tasks: OrchestratorTask[],
  pool: SessionPool,
  router: ModelRouter,
  config: SessionAdapterConfig,
  options?: { signal?: AbortSignal },
): Promise<Map<string, SubTaskResult>> {
  const results = new Map<string, SubTaskResult>();

  const promises = tasks.map(async (task) => {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const assignment = router.assign(task);
    const { adapter, session } = await pool.acquire(
      assignment.model,
      config,
      options?.signal,
    );

    try {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const { response, tokensUsed } = await adapter.sendPrompt(
        session.sessionId,
        task.prompt,
        task.systemPrompt,
      );

      const result: SubTaskResult = {
        taskId: task.id,
        model: assignment.model,
        summary: response,
        artifacts: [],
        sessionId: session.sessionId,
        tokensUsed,
      };

      results.set(task.id, result);
      return result;
    } finally {
      await pool.release(adapter, session).catch(() => {});
    }
  });

  await Promise.all(promises);
  return results;
}
