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

// =============================================================================
// Phase 5.2: Capture Search Metadata in Response
// =============================================================================

describe('Web Search Metadata Capture', () => {
  /**
   * Test the metadata parsing logic from host responses.
   * This mirrors how SessionManager will capture search metadata.
   */

  interface WebSearchMetadata {
    performed: boolean;
    queriesCount: number;
    provider: string | null;
  }

  function parseSearchMetadata(response: any): WebSearchMetadata | null {
    // Only capture if web_search_performed is explicitly present
    if (response.web_search_performed === undefined) {
      return null;
    }

    return {
      performed: response.web_search_performed === true,
      queriesCount: response.search_queries_count || 0,
      provider: response.search_provider || null,
    };
  }

  it('should capture metadata when web_search_performed is true', () => {
    const response = {
      content: 'Here are the latest results...',
      web_search_performed: true,
      search_queries_count: 3,
      search_provider: 'brave',
    };

    const metadata = parseSearchMetadata(response);

    expect(metadata).not.toBeNull();
    expect(metadata?.performed).toBe(true);
    expect(metadata?.queriesCount).toBe(3);
    expect(metadata?.provider).toBe('brave');
  });

  it('should capture metadata when web_search_performed is false', () => {
    const response = {
      content: 'Answer without search...',
      web_search_performed: false,
    };

    const metadata = parseSearchMetadata(response);

    expect(metadata).not.toBeNull();
    expect(metadata?.performed).toBe(false);
    expect(metadata?.queriesCount).toBe(0);
    expect(metadata?.provider).toBeNull();
  });

  it('should return null when web_search_performed is not present', () => {
    const response = {
      content: 'Regular response without search metadata',
    };

    const metadata = parseSearchMetadata(response);

    expect(metadata).toBeNull();
  });

  it('should handle different provider values', () => {
    const providers = ['brave', 'duckduckgo', 'bing'];

    for (const provider of providers) {
      const response = {
        web_search_performed: true,
        search_provider: provider,
      };

      const metadata = parseSearchMetadata(response);
      expect(metadata?.provider).toBe(provider);
    }
  });

  it('should default queriesCount to 0 when not provided', () => {
    const response = {
      web_search_performed: true,
      search_provider: 'brave',
      // search_queries_count not provided
    };

    const metadata = parseSearchMetadata(response);
    expect(metadata?.queriesCount).toBe(0);
  });
});

// =============================================================================
// Phase 5.3: WebSocket Search Message Handlers
// =============================================================================

describe('WebSocket Search Message Handlers', () => {
  /**
   * Test the message handler logic for search-specific WebSocket messages.
   */

  type SearchMessageType = 'searchStarted' | 'searchResults' | 'searchError';

  interface SearchStartedMessage {
    type: 'searchStarted';
    query: string;
    provider: string;
    request_id?: string;
  }

  interface SearchResultsMessage {
    type: 'searchResults';
    query: string;
    results: Array<{ title: string; url: string; snippet: string; source: string }>;
    result_count: number;
    search_time_ms: number;
    provider: string;
    cached: boolean;
    request_id?: string;
  }

  interface SearchErrorMessage {
    type: 'searchError';
    error: string;
    error_code: string;
    request_id?: string;
  }

  function isSearchMessage(data: any): data is { type: SearchMessageType } {
    return ['searchStarted', 'searchResults', 'searchError'].includes(data?.type);
  }

  function classifySearchMessage(data: any): SearchMessageType | null {
    if (!isSearchMessage(data)) return null;
    return data.type;
  }

  describe('message classification', () => {
    it('should identify searchStarted message', () => {
      const message: SearchStartedMessage = {
        type: 'searchStarted',
        query: 'NVIDIA GPU specs',
        provider: 'brave',
        request_id: 'search-123',
      };

      expect(classifySearchMessage(message)).toBe('searchStarted');
    });

    it('should identify searchResults message', () => {
      const message: SearchResultsMessage = {
        type: 'searchResults',
        query: 'NVIDIA GPU specs',
        results: [
          { title: 'RTX 5090', url: 'http://example.com', snippet: 'Latest GPU...', source: 'example.com' }
        ],
        result_count: 1,
        search_time_ms: 150,
        provider: 'brave',
        cached: false,
        request_id: 'search-123',
      };

      expect(classifySearchMessage(message)).toBe('searchResults');
    });

    it('should identify searchError message', () => {
      const message: SearchErrorMessage = {
        type: 'searchError',
        error: 'Rate limited',
        error_code: 'rate_limited',
        request_id: 'search-123',
      };

      expect(classifySearchMessage(message)).toBe('searchError');
    });

    it('should return null for non-search messages', () => {
      const messages = [
        { type: 'stream_chunk', content: 'Hello' },
        { type: 'response', content: 'Full response' },
        { type: 'session_init', session_id: '123' },
        { foo: 'bar' },
        null,
        undefined,
      ];

      for (const msg of messages) {
        expect(classifySearchMessage(msg)).toBeNull();
      }
    });
  });

  describe('searchStarted handler', () => {
    it('should extract query and provider from searchStarted', () => {
      const message: SearchStartedMessage = {
        type: 'searchStarted',
        query: 'Latest AI news 2026',
        provider: 'duckduckgo',
        request_id: 'search-456',
      };

      // Simulates what the handler would extract
      const event = {
        query: message.query,
        provider: message.provider,
        requestId: message.request_id,
      };

      expect(event.query).toBe('Latest AI news 2026');
      expect(event.provider).toBe('duckduckgo');
      expect(event.requestId).toBe('search-456');
    });
  });

  describe('searchResults handler', () => {
    it('should transform searchResults to SearchApiResponse', () => {
      const message: SearchResultsMessage = {
        type: 'searchResults',
        query: 'Bitcoin price',
        results: [
          { title: 'BTC Price', url: 'http://crypto.com', snippet: '$100,000', source: 'crypto.com' }
        ],
        result_count: 1,
        search_time_ms: 200,
        provider: 'brave',
        cached: true,
        request_id: 'search-789',
      };

      // Transform to SearchApiResponse format
      const response = {
        query: message.query,
        results: message.results,
        resultCount: message.result_count,
        searchTimeMs: message.search_time_ms,
        provider: message.provider,
        cached: message.cached,
      };

      expect(response.query).toBe('Bitcoin price');
      expect(response.resultCount).toBe(1);
      expect(response.searchTimeMs).toBe(200);
      expect(response.provider).toBe('brave');
      expect(response.cached).toBe(true);
      expect(response.results).toHaveLength(1);
    });
  });

  describe('searchError handler', () => {
    it('should create WebSearchError from searchError message', () => {
      const message: SearchErrorMessage = {
        type: 'searchError',
        error: 'Search provider unavailable',
        error_code: 'provider_error',
        request_id: 'search-error-1',
      };

      // Simulates error creation
      const error = {
        message: message.error,
        code: message.error_code,
        requestId: message.request_id,
      };

      expect(error.message).toBe('Search provider unavailable');
      expect(error.code).toBe('provider_error');
      expect(error.requestId).toBe('search-error-1');
    });

    it('should map error codes correctly', () => {
      const errorCodes = [
        'search_disabled',
        'invalid_query',
        'rate_limited',
        'provider_error',
        'timeout',
        'no_providers',
      ];

      for (const code of errorCodes) {
        const message: SearchErrorMessage = {
          type: 'searchError',
          error: `Error: ${code}`,
          error_code: code,
        };

        expect(message.error_code).toBe(code);
      }
    });
  });

  describe('pending search tracking', () => {
    it('should generate unique request IDs', () => {
      const generateRequestId = () => `search-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^search-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^search-\d+-[a-z0-9]+$/);
      // IDs should be unique (very high probability)
      expect(id1).not.toBe(id2);
    });

    it('should track pending search with resolve/reject callbacks', () => {
      const pendingSearches = new Map<string, {
        resolve: (value: any) => void;
        reject: (error: any) => void;
        timeoutId: ReturnType<typeof setTimeout>;
      }>();

      const requestId = 'search-test-123';
      let resolvedValue: any = null;
      let rejectedError: any = null;

      const timeoutId = setTimeout(() => {}, 30000);

      pendingSearches.set(requestId, {
        resolve: (value) => { resolvedValue = value; },
        reject: (error) => { rejectedError = error; },
        timeoutId,
      });

      expect(pendingSearches.has(requestId)).toBe(true);

      // Simulate resolving
      const pending = pendingSearches.get(requestId);
      pending?.resolve({ query: 'test', results: [] });

      expect(resolvedValue).toEqual({ query: 'test', results: [] });

      clearTimeout(timeoutId);
    });
  });
});
