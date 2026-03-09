/**
 * User prompt that asks the model to synthesise sub-task results into a
 * single coherent response for the original goal.
 */
export function synthesisPrompt(
  goal: string,
  results: Map<string, { taskId: string; summary: string }>,
): string {
  const entries = Array.from(results.values())
    .map((r) => `- [${r.taskId}]: ${r.summary}`)
    .join('\n');

  return `You were given the following goal:
"""
${goal}
"""

The sub-tasks produced these results:
${entries}

Synthesise the results above into a single, coherent response that directly
addresses the original goal. Preserve important details from each sub-task.
Be concise but thorough.`;
}
