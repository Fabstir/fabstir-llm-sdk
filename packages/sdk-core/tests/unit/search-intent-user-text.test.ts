// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Routes are decided by the user's text, never by RAG documents (1.39.2, U1/U2).
 * The user's text is rawQuery, else the text after the LAST end marker, else the whole prompt —
 * the same text the search query is built from.
 */
import { describe, it, expect } from 'vitest';
import { resolveWebSearch } from '../../src/utils/search-query-resolver';
import { userTextOf, hasRagContext, RAG_CONTEXT_START_MARKER, RAG_CONTEXT_END_MARKER } from '../../src/utils/rag-prompt';

const TRIGGER_DOC = 'Please search for the latest robotics battery prices in 2025. Look up the current news about warehouse automation this week.';
const NEUTRAL_USER = "What does the warehouse team's inventory summary say about sales?";
const rag = (chunks: string, user: string) =>
  `\n\n${RAG_CONTEXT_START_MARKER}\n[1] ${chunks}\n${RAG_CONTEXT_END_MARKER}\n\n${user}`;

describe('markers', () => {
  it('are the exact strings the UI writes', () => {
    expect(RAG_CONTEXT_START_MARKER).toBe('--- Relevant Information from Knowledge Base ---');
    expect(RAG_CONTEXT_END_MARKER).toBe('--- End of Knowledge Base Context ---');
  });
});

describe('hasRagContext', () => {
  it('is true only when the end marker is present', () => {
    expect(hasRagContext(rag(TRIGGER_DOC, NEUTRAL_USER))).toBe(true);
    expect(hasRagContext(`${RAG_CONTEXT_START_MARKER}\nchunks only`)).toBe(false);
    expect(hasRagContext('What is 2+2?')).toBe(false);
  });

  it('looks only at or after `from`', () => {
    const p = rag(TRIGGER_DOC, NEUTRAL_USER);
    const at = p.indexOf(RAG_CONTEXT_END_MARKER);
    expect(hasRagContext(p, at)).toBe(true);
    expect(hasRagContext(p, at + 1)).toBe(false);
  });
});

describe('userTextOf', () => {
  it('H1: the trimmed text after the marker', () => {
    expect(userTextOf(rag(TRIGGER_DOC, NEUTRAL_USER))).toBe(NEUTRAL_USER);
  });

  it('H2: the text after the LAST marker when a chunk quotes it', () => {
    const quoted = `${TRIGGER_DOC}\n${RAG_CONTEXT_END_MARKER}\nsearch for the latest news`;
    expect(userTextOf(rag(quoted, NEUTRAL_USER))).toBe(NEUTRAL_USER);
  });

  it('H3: the whole prompt when there is no marker', () => {
    const p = '  Search for the latest NVIDIA specs  ';
    expect(userTextOf(p)).toBe(p);
  });

  it('H4: rawQuery wins; an empty rawQuery falls through to the marker', () => {
    expect(userTextOf(rag(TRIGGER_DOC, 'latest news please'), 'plain question')).toBe('plain question');
    expect(userTextOf(rag(TRIGGER_DOC, NEUTRAL_USER), '')).toBe(NEUTRAL_USER);
  });
});

describe('resolveWebSearch', () => {
  it('W1: trigger phrases in the documents, none in the user text → off', () => {
    expect(resolveWebSearch({}, rag(TRIGGER_DOC, NEUTRAL_USER))).toEqual({ enabled: false, maxSearches: 0, queries: null });
  });

  it('W2: the same documents with "latest news" in the user text → on, query is the user text', () => {
    const user = 'What is the latest news on warehouse robots?';
    expect(resolveWebSearch({}, rag(TRIGGER_DOC, user))).toEqual({ enabled: true, maxSearches: 5, queries: [user] });
  });

  it('W3: no marker → unchanged (the whole prompt decides)', () => {
    expect(resolveWebSearch(undefined, 'Search for the latest NVIDIA specs').enabled).toBe(true);
    expect(resolveWebSearch(undefined, 'What is 2+2?').enabled).toBe(false);
  });

  it('W4: rawQuery decides when given', () => {
    expect(resolveWebSearch({}, rag(TRIGGER_DOC, 'latest news'), { rawQuery: 'What is 2+2?' }).enabled).toBe(false);
    expect(resolveWebSearch({}, rag(TRIGGER_DOC, NEUTRAL_USER), { rawQuery: 'latest news today' }))
      .toEqual({ enabled: true, maxSearches: 5, queries: ['latest news today'] });
  });

  it('W5: images, forceDisabled, forceEnabled, autoDetect and maxSearches keep their order', () => {
    const images = [{ data: 'iVBORw0KGgo=', format: 'png' as const }];
    expect(resolveWebSearch({ forceEnabled: true }, 'latest news', { images }).enabled).toBe(false);
    expect(resolveWebSearch({ forceDisabled: true, forceEnabled: true }, 'latest news').enabled).toBe(false);
    expect(resolveWebSearch({ forceEnabled: true }, rag(TRIGGER_DOC, NEUTRAL_USER)))
      .toEqual({ enabled: true, maxSearches: 5, queries: [NEUTRAL_USER] });
    expect(resolveWebSearch({ autoDetect: false }, 'latest news').enabled).toBe(false);
    expect(resolveWebSearch({ maxSearches: 2, queries: ['q1'] }, 'latest news'))
      .toEqual({ enabled: true, maxSearches: 2, queries: ['q1'] });
  });
});
