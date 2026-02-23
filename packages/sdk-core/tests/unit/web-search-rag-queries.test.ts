/**
 * @fileoverview Tests for resolveSearchQueries utility
 *
 * When RAG context is enabled alongside web search, the node's DuckDuckGo
 * search fails because it extracts the query from the full RAG-augmented
 * prompt (~5000 chars). resolveSearchQueries auto-populates search_queries
 * with the raw user question so the node uses it directly.
 */

import { describe, it, expect } from 'vitest';
import { resolveSearchQueries } from '../../src/utils/search-query-resolver';

describe('resolveSearchQueries', () => {
  it('returns [rawPrompt] when web search enabled and no custom queries', () => {
    const result = resolveSearchQueries(true, 'What is AI?', undefined);
    expect(result).toEqual(['What is AI?']);
  });

  it('returns custom queries when explicitly provided', () => {
    const result = resolveSearchQueries(true, 'What is AI?', ['custom q']);
    expect(result).toEqual(['custom q']);
  });

  it('returns null when web search is disabled', () => {
    const result = resolveSearchQueries(false, 'What is AI?', undefined);
    expect(result).toBeNull();
  });

  it('returns [rawPrompt] when custom queries is empty array', () => {
    const result = resolveSearchQueries(true, 'What is AI?', []);
    expect(result).toEqual(['What is AI?']);
  });

  it('returns null when disabled even with custom queries', () => {
    const result = resolveSearchQueries(false, 'prompt', ['q']);
    expect(result).toBeNull();
  });

  it('preserves raw prompt exactly (no mutation)', () => {
    const raw = 'What are the latest AI developments?';
    const result = resolveSearchQueries(true, raw, undefined);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(raw);
  });

  it('works with long RAG-style prompts — still returns only raw prompt', () => {
    const longPrompt = 'A'.repeat(500);
    const result = resolveSearchQueries(true, longPrompt, undefined);
    expect(result).toEqual([longPrompt]);
    expect(result![0]).toHaveLength(500);
  });

  // v2 tests: rawQuery + RAG marker stripping

  it('uses rawQuery when provided instead of prompt', () => {
    const result = resolveSearchQueries(true, 'bloated prompt with extra context', undefined, 'raw q');
    expect(result).toEqual(['raw q']);
  });

  it('uses rawQuery even when prompt contains RAG markers', () => {
    const ragPrompt = '\n\n--- Relevant Information from Knowledge Base ---\n[1] chunk data\n--- End of Knowledge Base Context ---\n\nWhat is AI?';
    const result = resolveSearchQueries(true, ragPrompt, undefined, 'What is AI?');
    expect(result).toEqual(['What is AI?']);
  });

  it('strips RAG markers when no rawQuery provided', () => {
    const ragPrompt = '\n\n--- Relevant Information from Knowledge Base ---\n[1] Some RAG chunk content here\n--- End of Knowledge Base Context ---\n\nUser question';
    const result = resolveSearchQueries(true, ragPrompt, undefined);
    expect(result).toEqual(['User question']);
  });

  it('returns full prompt when no markers and no rawQuery', () => {
    const result = resolveSearchQueries(true, 'plain prompt', undefined);
    expect(result).toEqual(['plain prompt']);
  });

  it('rawQuery takes priority over marker stripping', () => {
    const ragPrompt = '\n\n--- Relevant Information from Knowledge Base ---\nchunk\n--- End of Knowledge Base Context ---\n\nextracted question';
    const result = resolveSearchQueries(true, ragPrompt, undefined, 'my raw query');
    expect(result).toEqual(['my raw query']);
  });
});
