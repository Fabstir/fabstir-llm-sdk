/**
 * Resolves search_queries to send to the node.
 * Priority: customQueries > rawQuery > stripRAGContext(prompt) > prompt
 */
export function resolveSearchQueries(
  enableWebSearch: boolean,
  prompt: string,
  customQueries: string[] | undefined,
  rawQuery?: string
): string[] | null {
  if (!enableWebSearch) return null;
  if (customQueries && customQueries.length > 0) return customQueries;
  if (rawQuery) return [rawQuery];
  return [stripRAGContext(prompt)];
}

function stripRAGContext(prompt: string): string {
  const endMarker = '--- End of Knowledge Base Context ---';
  const idx = prompt.lastIndexOf(endMarker);
  if (idx === -1) return prompt;
  return prompt.substring(idx + endMarker.length).trim();
}
