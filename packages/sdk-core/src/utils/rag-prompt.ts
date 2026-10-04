// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * What a RAG turn looks like: its documents travel in a block that ends with RAG_CONTEXT_END_MARKER, and the
 * user's text follows it. Every route the SDK picks from a prompt reads the user's text, never the block (1.39.2).
 */
export const RAG_CONTEXT_START_MARKER = '--- Relevant Information from Knowledge Base ---';
export const RAG_CONTEXT_END_MARKER = '--- End of Knowledge Base Context ---';

/** Whether RAG context — located by its end marker alone — appears at or after `from` (0: anywhere). */
export function hasRagContext(prompt: string, from = 0): boolean {
  return prompt.indexOf(RAG_CONTEXT_END_MARKER, from) !== -1;
}

/** rawQuery when given, else the text after the LAST end marker (a document quoting it sits before the real
 *  one), else the whole prompt (no marker: no documents the SDK can locate). */
export function userTextOf(prompt: string, rawQuery?: string): string {
  if (rawQuery) return rawQuery;
  const idx = prompt.lastIndexOf(RAG_CONTEXT_END_MARKER);
  if (idx === -1) return prompt;
  return prompt.substring(idx + RAG_CONTEXT_END_MARKER.length).trim();
}
