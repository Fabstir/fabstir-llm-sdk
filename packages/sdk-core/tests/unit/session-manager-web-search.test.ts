/**
 * @fileoverview Tests for SessionManager web search automatic intent detection
 * Sub-phase 5.1: Add Automatic Intent Detection to sendPromptStreaming
 *
 * Tests that SessionManager correctly detects search intent and enables
 * web_search field in inference requests sent to hosts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzePromptForSearchIntent } from '../../src/utils/search-intent-analyzer';

// Test the helper function that determines web search enablement
describe('Web Search Intent Detection Logic', () => {
  /**
   * Helper function that mirrors the logic we'll implement in SessionManager.
   * This tests the decision logic before we integrate it.
   */
  function determineWebSearchEnabled(
    prompt: string,
    config: {
      forceDisabled?: boolean;
      forceEnabled?: boolean;
      autoDetect?: boolean;
    } = {}
  ): boolean {
    if (config.forceDisabled) {
      return false;
    }
    if (config.forceEnabled) {
      return true;
    }
    if (config.autoDetect === false) {
      return false;
    }
    // Default: auto-detect search intent from prompt
    return analyzePromptForSearchIntent(prompt);
  }

  describe('automatic detection', () => {
    it('should enable web_search when search intent detected in prompt', () => {
      const prompt = 'Search for the latest NVIDIA GPU specs';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(true);
    });

    it('should disable web_search when no search intent detected', () => {
      const prompt = 'What is 2+2?';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(false);
    });

    it('should detect intent with "latest" keyword', () => {
      const prompt = 'What are the latest AI developments?';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(true);
    });

    it('should detect intent with year reference', () => {
      const prompt = 'What happened in tech in 2026?';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(true);
    });
  });

  describe('forceEnabled override', () => {
    it('should enable web_search when forceEnabled=true even without triggers', () => {
      const prompt = 'Tell me about cats'; // No search triggers
      const result = determineWebSearchEnabled(prompt, { forceEnabled: true });
      expect(result).toBe(true);
    });

    it('should enable web_search when forceEnabled=true with normal question', () => {
      const prompt = 'What is 2+2?';
      const result = determineWebSearchEnabled(prompt, { forceEnabled: true });
      expect(result).toBe(true);
    });
  });

  describe('forceDisabled override', () => {
    it('should disable web_search when forceDisabled=true even with triggers', () => {
      const prompt = 'Search for news'; // Has search trigger
      const result = determineWebSearchEnabled(prompt, { forceDisabled: true });
      expect(result).toBe(false);
    });

    it('should disable web_search when forceDisabled=true with year reference', () => {
      const prompt = 'What happened in 2026?'; // Has year trigger
      const result = determineWebSearchEnabled(prompt, { forceDisabled: true });
      expect(result).toBe(false);
    });

    it('should prefer forceDisabled over forceEnabled when both set', () => {
      const prompt = 'Search for latest news';
      const result = determineWebSearchEnabled(prompt, {
        forceEnabled: true,
        forceDisabled: true
      });
      expect(result).toBe(false); // forceDisabled checked first
    });
  });

  describe('autoDetect disabled', () => {
    it('should disable web_search when autoDetect=false even with triggers', () => {
      const prompt = 'Search for the latest NVIDIA GPU specs';
      const result = determineWebSearchEnabled(prompt, { autoDetect: false });
      expect(result).toBe(false);
    });

    it('should disable web_search when autoDetect=false with any prompt', () => {
      const prompts = [
        'latest news about AI',
        'current stock price',
        'Google the weather',
      ];

      for (const prompt of prompts) {
        const result = determineWebSearchEnabled(prompt, { autoDetect: false });
        expect(result).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty config object', () => {
      const prompt = 'Search for news';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(true);
    });

    it('should handle undefined config', () => {
      const prompt = 'latest updates';
      const result = determineWebSearchEnabled(prompt);
      expect(result).toBe(true);
    });

    it('should handle empty prompt', () => {
      const prompt = '';
      const result = determineWebSearchEnabled(prompt, {});
      expect(result).toBe(false);
    });
  });
});

describe('Web Search Request Fields', () => {
  /**
   * Helper function that mirrors how request fields will be constructed.
   */
  function buildWebSearchFields(
    enableWebSearch: boolean,
    config: { maxSearches?: number; queries?: string[] } = {}
  ): { web_search: boolean; max_searches: number; search_queries: string[] | null } {
    return {
      web_search: enableWebSearch,
      max_searches: enableWebSearch ? (config.maxSearches ?? 5) : 0,
      search_queries: config.queries ?? null,
    };
  }

  it('should set max_searches to 5 by default when search enabled', () => {
    const fields = buildWebSearchFields(true, {});
    expect(fields.web_search).toBe(true);
    expect(fields.max_searches).toBe(5);
    expect(fields.search_queries).toBeNull();
  });

  it('should set max_searches to 0 when search disabled', () => {
    const fields = buildWebSearchFields(false, {});
    expect(fields.web_search).toBe(false);
    expect(fields.max_searches).toBe(0);
    expect(fields.search_queries).toBeNull();
  });

  it('should use custom maxSearches when provided', () => {
    const fields = buildWebSearchFields(true, { maxSearches: 10 });
    expect(fields.max_searches).toBe(10);
  });

  it('should use custom queries when provided', () => {
    const queries = ['NVIDIA RTX 5090 specs', 'GPU release date 2026'];
    const fields = buildWebSearchFields(true, { queries });
    expect(fields.search_queries).toEqual(queries);
  });

  it('should ignore maxSearches when search disabled', () => {
    const fields = buildWebSearchFields(false, { maxSearches: 10 });
    expect(fields.max_searches).toBe(0); // Ignored because search disabled
  });
});

// =============================================================================
// Phase 4.2: WebSocket Search Method Tests
// =============================================================================

describe('webSearch Method Logic', () => {
  /**
   * Test validation logic for webSearch method.
   * Actual WebSocket integration is tested in E2E tests.
   */

  function validateWebSearchQuery(query: string): { valid: boolean; error?: string } {
    if (!query || query.trim().length === 0) {
      return { valid: false, error: 'Query cannot be empty' };
    }
    if (query.length > 500) {
      return { valid: false, error: 'Query must be 1-500 characters' };
    }
    return { valid: true };
  }

  it('should accept valid query', () => {
    const result = validateWebSearchQuery('Search for AI news');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject empty query', () => {
    const result = validateWebSearchQuery('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Query cannot be empty');
  });

  it('should reject query over 500 characters', () => {
    const longQuery = 'a'.repeat(501);
    const result = validateWebSearchQuery(longQuery);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Query must be 1-500 characters');
  });

  it('should accept query exactly 500 characters', () => {
    const exactQuery = 'a'.repeat(500);
    const result = validateWebSearchQuery(exactQuery);
    expect(result.valid).toBe(true);
  });

  it('should reject whitespace-only query', () => {
    const result = validateWebSearchQuery('   ');
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Phase 4.4: Direct Search API Method Tests
// =============================================================================

describe('searchDirect Method Logic', () => {
  /**
   * Test request construction logic for searchDirect method.
   * Actual HTTP integration is tested in E2E tests.
   */

  function buildSearchRequest(
    query: string,
    options: { numResults?: number; chainId?: number } = {},
    defaultChainId: number = 84532
  ): { query: string; numResults: number; chainId: number; requestId: string } | { error: string } {
    // Validate query
    if (!query || query.length > 500) {
      return { error: 'Query must be 1-500 characters' };
    }

    return {
      query,
      numResults: Math.min(Math.max(options.numResults || 10, 1), 20),
      chainId: options.chainId || defaultChainId,
      requestId: `search-${Date.now()}`
    };
  }

  it('should build request with defaults', () => {
    const request = buildSearchRequest('test query');
    expect(request).not.toHaveProperty('error');
    if (!('error' in request)) {
      expect(request.query).toBe('test query');
      expect(request.numResults).toBe(10);
      expect(request.chainId).toBe(84532);
      expect(request.requestId).toMatch(/^search-\d+$/);
    }
  });

  it('should respect custom numResults within bounds', () => {
    const request = buildSearchRequest('test', { numResults: 5 });
    if (!('error' in request)) {
      expect(request.numResults).toBe(5);
    }
  });

  it('should cap numResults at 20', () => {
    const request = buildSearchRequest('test', { numResults: 50 });
    if (!('error' in request)) {
      expect(request.numResults).toBe(20);
    }
  });

  it('should floor numResults at 1 (negative values)', () => {
    const request = buildSearchRequest('test', { numResults: -5 });
    if (!('error' in request)) {
      expect(request.numResults).toBe(1);
    }
  });

  it('should use default 10 when numResults is 0 (falsy)', () => {
    const request = buildSearchRequest('test', { numResults: 0 });
    if (!('error' in request)) {
      expect(request.numResults).toBe(10); // 0 is falsy, so falls back to default 10
    }
  });

  it('should use custom chainId', () => {
    const request = buildSearchRequest('test', { chainId: 5611 });
    if (!('error' in request)) {
      expect(request.chainId).toBe(5611);
    }
  });

  it('should return error for empty query', () => {
    const request = buildSearchRequest('');
    expect(request).toHaveProperty('error');
  });

  it('should return error for query over 500 characters', () => {
    const longQuery = 'a'.repeat(501);
    const request = buildSearchRequest(longQuery);
    expect(request).toHaveProperty('error');
  });
});
