// Whether a prompt searches the web, and with which queries — decided on the user's text, never on the RAG
// documents a prompt carries (1.39.2).
import type { PromptOptions } from '../types';
import type { SearchIntentConfig } from '../types/web-search.types';
import { analyzePromptForSearchIntent } from './search-intent-analyzer';
import { userTextOf } from './rag-prompt';

/** search_queries for the node. Priority: customQueries > userTextOf(prompt, rawQuery) */
export function resolveSearchQueries(
  enableWebSearch: boolean,
  prompt: string,
  customQueries: string[] | undefined,
  rawQuery?: string
): string[] | null {
  if (!enableWebSearch) return null;
  if (customQueries && customQueries.length > 0) return customQueries;
  return [userTextOf(prompt, rawQuery)];
}

/** One decision for every prompt path: images → off; forceDisabled; forceEnabled; else auto-detect. */
export function resolveWebSearch(
  config: SearchIntentConfig | undefined,
  prompt: string,
  options?: Pick<PromptOptions, 'images' | 'rawQuery'>
): { enabled: boolean; maxSearches: number; queries: string[] | null } {
  const c = config ?? {};
  let enabled: boolean;
  if (options?.images && options.images.length > 0) enabled = false; // the VLM handles images locally
  else if (c.forceDisabled) enabled = false;
  else if (c.forceEnabled) enabled = true;
  else enabled = c.autoDetect !== false && analyzePromptForSearchIntent(userTextOf(prompt, options?.rawQuery));
  return {
    enabled,
    maxSearches: enabled ? (c.maxSearches ?? 5) : 0,
    queries: resolveSearchQueries(enabled, prompt, c.queries, options?.rawQuery),
  };
}
