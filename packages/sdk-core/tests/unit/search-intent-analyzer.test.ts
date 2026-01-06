/**
 * @fileoverview Tests for search intent analyzer
 * Sub-phase 1.1: Create Search Intent Analyzer Module
 *
 * Tests that the analyzer correctly detects search intent from user prompts.
 */

import { describe, it, expect } from 'vitest';
import { analyzePromptForSearchIntent } from '../../src/utils/search-intent-analyzer';

describe('analyzePromptForSearchIntent', () => {
  describe('should detect search intent (return true)', () => {
    // Explicit search requests
    it('detects "Search for NVIDIA specs"', () => {
      expect(analyzePromptForSearchIntent('Search for NVIDIA specs')).toBe(true);
    });

    it('detects "search the web for AI news"', () => {
      expect(analyzePromptForSearchIntent('search the web for AI news')).toBe(true);
    });

    it('detects "look up current Bitcoin price"', () => {
      expect(analyzePromptForSearchIntent('look up current Bitcoin price')).toBe(true);
    });

    it('detects "find online the latest updates"', () => {
      expect(analyzePromptForSearchIntent('find online the latest updates')).toBe(true);
    });

    it('detects "Google the weather"', () => {
      expect(analyzePromptForSearchIntent('Google the weather')).toBe(true);
    });

    // Time-sensitive queries
    it('detects "latest AI breakthroughs"', () => {
      expect(analyzePromptForSearchIntent('latest AI breakthroughs')).toBe(true);
    });

    it('detects "recent news about Tesla"', () => {
      expect(analyzePromptForSearchIntent('recent news about Tesla')).toBe(true);
    });

    it('detects "current stock price of AAPL"', () => {
      expect(analyzePromptForSearchIntent('current stock price of AAPL')).toBe(true);
    });

    it('detects "What happened today in tech?"', () => {
      expect(analyzePromptForSearchIntent('What happened today in tech?')).toBe(true);
    });

    // Year references
    it('detects "news about AI developments in 2026"', () => {
      expect(analyzePromptForSearchIntent('news about AI developments in 2026')).toBe(true);
    });
  });

  describe('should NOT detect search intent (return false)', () => {
    it('does not detect "What is 2+2?"', () => {
      expect(analyzePromptForSearchIntent('What is 2+2?')).toBe(false);
    });

    it('does not detect "Explain quantum computing"', () => {
      expect(analyzePromptForSearchIntent('Explain quantum computing')).toBe(false);
    });

    it('does not detect "Write a poem about cats"', () => {
      expect(analyzePromptForSearchIntent('Write a poem about cats')).toBe(false);
    });

    it('does not detect "How does photosynthesis work?"', () => {
      expect(analyzePromptForSearchIntent('How does photosynthesis work?')).toBe(false);
    });

    it('does not detect empty string', () => {
      expect(analyzePromptForSearchIntent('')).toBe(false);
    });
  });
});
