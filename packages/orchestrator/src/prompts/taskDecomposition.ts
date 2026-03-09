/**
 * User prompt that asks the planning model to decompose a goal into sub-tasks.
 */
export function decompositionPrompt(
  goal: string,
  options?: { maxSubTasks?: number },
): string {
  const budget = options?.maxSubTasks
    ? `\nYou have a budget of at most ${options.maxSubTasks} sub-tasks. Do not exceed this limit.`
    : '';

  return `Decompose the following goal into a TaskGraph of independent or dependent sub-tasks.
${budget}
Goal:
"""
${goal}
"""

Respond with JSON only. The root object must have:
  - id    (string)  a unique graph identifier
  - goal  (string)  the original goal
  - tasks (array)   the sub-task objects

Each task object must follow the schema described in your system prompt.
Do not include any text outside the JSON object.`;
}
