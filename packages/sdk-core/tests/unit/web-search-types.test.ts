/**
 * @fileoverview Type compilation tests for web search types
 * Sub-phase 2.1: Add Web Search Types
 *
 * These tests verify that all web search types compile correctly
 * and have the expected interface shapes.
 */

import { describe, it, expect } from 'vitest';
import type {
  SearchIntentConfig,
  SearchApiRequest,
  SearchResultItem,
  SearchApiResponse,
  WebSearchOptions,
  WebSearchMetadata,
  WebSearchCapabilities,
  WebSearchErrorCode,
  WebSearchRequest,
  WebSearchStarted,
  WebSearchResults,
  WebSearchError,
} from '../../src/types/web-search.types';

describe('Web Search Types', () => {
  describe('SearchIntentConfig', () => {
    it('should accept valid config object', () => {
      const config: SearchIntentConfig = {
        autoDetect: true,
        forceEnabled: false,
        forceDisabled: false,
      };
      expect(config.autoDetect).toBe(true);
    });

    it('should allow all fields to be optional', () => {
      const config: SearchIntentConfig = {};
      expect(config).toBeDefined();
    });
  });

  describe('SearchApiRequest', () => {
    it('should require query field', () => {
      const request: SearchApiRequest = {
        query: 'test query',
      };
      expect(request.query).toBe('test query');
    });

    it('should accept optional fields', () => {
      const request: SearchApiRequest = {
        query: 'test',
        numResults: 10,
        chainId: 84532,
        requestId: 'req-123',
      };
      expect(request.numResults).toBe(10);
    });
  });

  describe('SearchResultItem', () => {
    it('should have all required fields', () => {
      const item: SearchResultItem = {
        title: 'Test Title',
        url: 'https://example.com',
        snippet: 'Test snippet',
        source: 'example.com',
      };
      expect(item.title).toBe('Test Title');
    });

    it('should accept optional published_date', () => {
      const item: SearchResultItem = {
        title: 'Test',
        url: 'https://example.com',
        snippet: 'Test',
        source: 'example.com',
        published_date: '2026-01-05',
      };
      expect(item.published_date).toBe('2026-01-05');
    });
  });

  describe('SearchApiResponse', () => {
    it('should have all required fields', () => {
      const response: SearchApiResponse = {
        query: 'test',
        results: [],
        resultCount: 0,
        searchTimeMs: 100,
        provider: 'duckduckgo',
        cached: false,
        chainId: 84532,
        chainName: 'Base Sepolia',
      };
      expect(response.provider).toBe('duckduckgo');
    });
  });

  describe('WebSearchOptions', () => {
    it('should accept enabled and maxSearches', () => {
      const options: WebSearchOptions = {
        enabled: true,
        maxSearches: 5,
      };
      expect(options.enabled).toBe(true);
    });
  });

  describe('WebSearchMetadata', () => {
    it('should track search metadata', () => {
      const metadata: WebSearchMetadata = {
        performed: true,
        queriesCount: 3,
        provider: 'brave',
      };
      expect(metadata.performed).toBe(true);
    });
  });

  describe('WebSearchCapabilities', () => {
    it('should describe host capabilities', () => {
      const capabilities: WebSearchCapabilities = {
        supportsWebSearch: true,
        supportsInferenceSearch: true,
        provider: 'brave',
        rateLimitPerMinute: 60,
      };
      expect(capabilities.supportsWebSearch).toBe(true);
    });
  });

  describe('WebSearchErrorCode', () => {
    it('should accept valid error codes', () => {
      const codes: WebSearchErrorCode[] = [
        'search_disabled',
        'invalid_query',
        'rate_limited',
        'provider_error',
        'timeout',
        'no_providers',
      ];
      expect(codes).toHaveLength(6);
    });
  });

  describe('WebSocket Message Types', () => {
    it('WebSearchRequest should have correct shape', () => {
      const msg: WebSearchRequest = {
        type: 'searchRequest',
        query: 'test',
        num_results: 5,
        request_id: 'req-123',
      };
      expect(msg.type).toBe('searchRequest');
    });

    it('WebSearchStarted should have correct shape', () => {
      const msg: WebSearchStarted = {
        type: 'searchStarted',
        query: 'test',
        provider: 'brave',
      };
      expect(msg.type).toBe('searchStarted');
    });

    it('WebSearchResults should have correct shape', () => {
      const msg: WebSearchResults = {
        type: 'searchResults',
        query: 'test',
        results: [],
        result_count: 0,
        search_time_ms: 100,
        provider: 'brave',
        cached: false,
      };
      expect(msg.type).toBe('searchResults');
    });

    it('WebSearchError should have correct shape', () => {
      const msg: WebSearchError = {
        type: 'searchError',
        error: 'Search failed',
        error_code: 'provider_error',
      };
      expect(msg.type).toBe('searchError');
    });
  });
});
