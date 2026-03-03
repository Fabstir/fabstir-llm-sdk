import type { SessionPool } from '../core/SessionPool';
import type { ModelRouter } from '../core/ModelRouter';
import type { OrchestratorTask, SubTaskResult, SessionAdapterConfig } from '../types';

/**
 * MapReduce pattern: execute N mappers in parallel, then feed all results
 * into a single reducer that produces the final output.
 */
export async function mapReduce(
  mapTasks: OrchestratorTask[],
  reduceTask: OrchestratorTask,
  pool: SessionPool,
  router: ModelRouter,
  config: SessionAdapterConfig,
): Promise<SubTaskResult> {
  // --- Map phase: run all mappers in parallel ---
  const mapResults: SubTaskResult[] = [];

  const promises = mapTasks.map(async (task) => {
    const assignment = router.assign(task);
    const { adapter, session } = await pool.acquire(assignment.model, config);
    try {
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
      mapResults.push(result);
      return result;
    } finally {
      await pool.release(adapter, session).catch(() => {});
    }
  });

  await Promise.all(promises);

  // --- Reduce phase: combine all map results into one ---
  const context = mapResults.map((r) => `[${r.taskId}]: ${r.summary}`).join('\n');
  const reduceAssignment = router.assign(reduceTask);
  const { adapter, session } = await pool.acquire(reduceAssignment.model, config);

  try {
    const prompt = `Map results:\n${context}\n\n${reduceTask.prompt}`;
    const { response, tokensUsed } = await adapter.sendPrompt(
      session.sessionId,
      prompt,
      reduceTask.systemPrompt,
    );
    return {
      taskId: reduceTask.id,
      model: reduceAssignment.model,
      summary: response,
      artifacts: [],
      sessionId: session.sessionId,
      tokensUsed,
    };
  } finally {
    await pool.release(adapter, session).catch(() => {});
  }
}
