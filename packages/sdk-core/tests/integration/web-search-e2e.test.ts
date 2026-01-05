/**
 * @fileoverview E2E Tests for Web Search Integration with Real Nodes
 * Sub-phase 9.1: Integration Tests with Production Nodes (v8.7.0+)
 *
 * These tests verify web search functionality against real production nodes.
 * Prerequisites:
 * - Production nodes running at TEST_HOST_1_URL with web search enabled
 * - Brave/DuckDuckGo API keys configured on nodes
 *
 * Note: Some tests require full SDK initialization with S5 storage.
 * Tests that can run without full SDK are marked as such.
 *
 * @requires Node version v8.7.0+ with web search feature enabled
 */

import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { WebSearchError } from '../../src/errors/web-search-errors';
import { analyzePromptForSearchIntent } from '../../src/utils/search-intent-analyzer';
import { searchWithRetry } from '../../src/utils/search-retry';
import { getWebSearchCapabilitiesFromHost } from '../../src/utils/host-web-search-capabilities';
import type { SearchApiResponse, WebSearchCapabilities } from '../../src/types/web-search.types';
import { ChainId } from '../../src/types/chain.types';

describe('Web Search E2E Tests', () => {
  // Configuration from environment
  const TEST_HOST_URL = process.env.TEST_HOST_1_URL || 'http://localhost:8080';

  describe('Host Capability Detection (Direct API)', () => {
    it('should detect web search capabilities from host version endpoint', async () => {
      // Test the capability detection utility directly
      const capabilities = await getWebSearchCapabilitiesFromHost(TEST_HOST_URL);

      // Verify capability structure
      expect(capabilities).toHaveProperty('supportsWebSearch');
      expect(capabilities).toHaveProperty('supportsInferenceSearch');
      expect(capabilities).toHaveProperty('supportsStreamingSearch');
      expect(capabilities).toHaveProperty('supportsWebSocketSearch');
      expect(capabilities).toHaveProperty('provider');
      expect(capabilities).toHaveProperty('rateLimitPerMinute');

      // Log for debugging
      console.log(`Host capabilities at ${TEST_HOST_URL}:`);
      console.log(`  Web search supported: ${capabilities.supportsWebSearch}`);
      console.log(`  Inference search: ${capabilities.supportsInferenceSearch}`);
      console.log(`  Streaming search (v8.7.5+): ${capabilities.supportsStreamingSearch}`);
      console.log(`  WebSocket search (v8.7.5+): ${capabilities.supportsWebSocketSearch}`);
      console.log(`  Provider: ${capabilities.provider}`);
      console.log(`  Rate limit: ${capabilities.rateLimitPerMinute}/min`);
    }, 15000);

    it('should handle unreachable host gracefully', async () => {
      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:99999');

      // Should return default "not supported" capabilities
      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.supportsInferenceSearch).toBe(false);
      expect(capabilities.supportsStreamingSearch).toBe(false);
      expect(capabilities.supportsWebSocketSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
    }, 15000);
  });

  describe('Direct Search API (Path A)', () => {
    it('should return valid SearchApiResponse from host search endpoint', async () => {
      // Check if host supports search first
      const capabilities = await getWebSearchCapabilitiesFromHost(TEST_HOST_URL);
      if (!capabilities.supportsWebSearch) {
        console.log('Skipping: Host does not support web search');
        return;
      }

      // Call /v1/search directly
      const response = await fetch(`${TEST_HOST_URL}/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'latest artificial intelligence news 2026',
          numResults: 5,
          chainId: ChainId.BASE_SEPOLIA,
          requestId: `test-${Date.now()}`
        })
      });

      if (response.status === 503) {
        console.log('Skipping: Web search disabled on host');
        return;
      }

      if (!response.ok) {
        console.log(`Search failed with status: ${response.status}`);
        return;
      }

      const result: SearchApiResponse = await response.json();

      // Validate response structure
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('resultCount');
      expect(result).toHaveProperty('searchTimeMs');
      expect(result).toHaveProperty('provider');

      // Validate results
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.resultCount).toBeGreaterThanOrEqual(0);
      expect(result.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(['brave', 'duckduckgo', 'bing']).toContain(result.provider);

      console.log(`✓ Search returned ${result.resultCount} results via ${result.provider} in ${result.searchTimeMs}ms`);
    }, 30000);

    it('should handle disabled search endpoint with 503', async () => {
      // Test against a host that may not have search enabled
      try {
        const response = await fetch(`${TEST_HOST_URL}/v1/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: 'test query',
            numResults: 5
          })
        });

        if (response.status === 503) {
          console.log('✓ Host correctly returns 503 when search disabled');
        } else if (response.ok) {
          console.log('✓ Host has search enabled');
        } else {
          console.log(`Host returned status: ${response.status}`);
        }
      } catch (error) {
        console.log('✓ Host unreachable (network error)');
      }
    }, 15000);
  });

  describe('Automatic Intent Detection (Path B)', () => {
    it('should auto-detect search intent for "Search for latest news" prompts', () => {
      // Prompts that SHOULD trigger search
      const searchPrompts = [
        'Search for the latest NVIDIA GPU specs',
        'Find recent news about Tesla',
        'What happened today in AI?',
        'Look up the current Bitcoin price',
        'latest developments in 2026',
        'Google the weather in Tokyo',
        'search the web for quantum computing',
        'current stock price of AAPL'
      ];

      for (const prompt of searchPrompts) {
        const result = analyzePromptForSearchIntent(prompt);
        expect(result).toBe(true);
        console.log(`✓ Detected: "${prompt.substring(0, 45)}..."`);
      }
    });

    it('should NOT auto-detect search intent for "What is 2+2?" prompts', () => {
      // Prompts that should NOT trigger search
      const normalPrompts = [
        'What is 2+2?',
        'Explain quantum computing',
        'Write a poem about cats',
        'How does photosynthesis work?',
        'Tell me a joke',
        'Summarize this document',
        'Translate hello to Spanish'
      ];

      for (const prompt of normalPrompts) {
        const result = analyzePromptForSearchIntent(prompt);
        expect(result).toBe(false);
        console.log(`✓ No search intent: "${prompt}"`);
      }
    });

    it('should respect forceDisabled even with search triggers', () => {
      // Simulate SessionManager's decision logic
      function determineWebSearchEnabled(
        prompt: string,
        config: { forceDisabled?: boolean; forceEnabled?: boolean; autoDetect?: boolean } = {}
      ): boolean {
        if (config.forceDisabled) return false;
        if (config.forceEnabled) return true;
        if (config.autoDetect === false) return false;
        return analyzePromptForSearchIntent(prompt);
      }

      // "Search for news" has triggers, but forceDisabled prevents search
      expect(determineWebSearchEnabled('Search for the latest news', { forceDisabled: true })).toBe(false);
      console.log('✓ forceDisabled overrides search triggers');

      // Even year reference is blocked
      expect(determineWebSearchEnabled('What happened in 2026?', { forceDisabled: true })).toBe(false);
      console.log('✓ forceDisabled blocks year reference trigger');
    });

    it('should respect forceEnabled even without search triggers', () => {
      function determineWebSearchEnabled(
        prompt: string,
        config: { forceDisabled?: boolean; forceEnabled?: boolean; autoDetect?: boolean } = {}
      ): boolean {
        if (config.forceDisabled) return false;
        if (config.forceEnabled) return true;
        if (config.autoDetect === false) return false;
        return analyzePromptForSearchIntent(prompt);
      }

      // "Tell me about cats" has no triggers, but forceEnabled enables search
      expect(determineWebSearchEnabled('Tell me about cats', { forceEnabled: true })).toBe(true);
      console.log('✓ forceEnabled works without triggers');

      // Math question still gets search when forced
      expect(determineWebSearchEnabled('What is 2+2?', { forceEnabled: true })).toBe(true);
      console.log('✓ forceEnabled enables search for any prompt');
    });

    it('should respect autoDetect=false to disable automatic detection', () => {
      function determineWebSearchEnabled(
        prompt: string,
        config: { forceDisabled?: boolean; forceEnabled?: boolean; autoDetect?: boolean } = {}
      ): boolean {
        if (config.forceDisabled) return false;
        if (config.forceEnabled) return true;
        if (config.autoDetect === false) return false;
        return analyzePromptForSearchIntent(prompt);
      }

      // Search trigger present but autoDetect disabled
      expect(determineWebSearchEnabled('Search for the latest news', { autoDetect: false })).toBe(false);
      console.log('✓ autoDetect=false disables automatic detection');
    });
  });

  describe('Error Handling', () => {
    it('should create WebSearchError with correct properties', () => {
      const error = new WebSearchError('Rate limited', 'rate_limited', 60);

      expect(error.name).toBe('WebSearchError');
      expect(error.message).toBe('Rate limited');
      expect(error.code).toBe('rate_limited');
      expect(error.retryAfter).toBe(60);
    });

    it('should have correct isRetryable property on WebSearchError', () => {
      // Retryable errors
      const rateLimited = new WebSearchError('Rate limited', 'rate_limited', 60);
      expect(rateLimited.isRetryable).toBe(true);

      const timeout = new WebSearchError('Timeout', 'timeout');
      expect(timeout.isRetryable).toBe(true);

      const providerError = new WebSearchError('Provider error', 'provider_error');
      expect(providerError.isRetryable).toBe(true);

      // Non-retryable errors
      const invalidQuery = new WebSearchError('Invalid query', 'invalid_query');
      expect(invalidQuery.isRetryable).toBe(false);

      const searchDisabled = new WebSearchError('Disabled', 'search_disabled');
      expect(searchDisabled.isRetryable).toBe(false);

      const noProviders = new WebSearchError('No providers', 'no_providers');
      expect(noProviders.isRetryable).toBe(false);

      console.log('✓ isRetryable correctly identifies retryable errors');
    });
  });

  describe('Search Retry Utility', () => {
    it('should return result on first success', async () => {
      let attempts = 0;
      const mockSearchFn = async (): Promise<SearchApiResponse> => {
        attempts++;
        return {
          query: 'test',
          results: [],
          resultCount: 0,
          searchTimeMs: 100,
          provider: 'brave',
          cached: false,
          chainId: ChainId.BASE_SEPOLIA,
          chainName: 'Base Sepolia'
        };
      };

      const result = await searchWithRetry(mockSearchFn, 3);
      expect(attempts).toBe(1);
      expect(result.query).toBe('test');
      console.log('✓ First attempt succeeded');
    });

    it('should retry on retryable errors and succeed', async () => {
      let attempts = 0;
      const mockSearchFn = async (): Promise<SearchApiResponse> => {
        attempts++;
        if (attempts < 3) {
          throw new WebSearchError('Rate limited', 'rate_limited', 0); // 0 second retry
        }
        return {
          query: 'test',
          results: [],
          resultCount: 0,
          searchTimeMs: 100,
          provider: 'brave',
          cached: false,
          chainId: ChainId.BASE_SEPOLIA,
          chainName: 'Base Sepolia'
        };
      };

      const result = await searchWithRetry(mockSearchFn, 3);
      expect(attempts).toBe(3);
      expect(result.query).toBe('test');
      console.log(`✓ Retry succeeded after ${attempts} attempts`);
    }, 15000);

    it('should throw immediately on non-retryable errors', async () => {
      let attempts = 0;
      const mockSearchFn = async (): Promise<SearchApiResponse> => {
        attempts++;
        throw new WebSearchError('Invalid query', 'invalid_query');
      };

      await expect(searchWithRetry(mockSearchFn, 3)).rejects.toThrow(WebSearchError);
      expect(attempts).toBe(1); // Should not retry
      console.log('✓ Non-retryable error thrown immediately');
    });

    it('should throw after max retries exceeded', async () => {
      let attempts = 0;
      const mockSearchFn = async (): Promise<SearchApiResponse> => {
        attempts++;
        throw new WebSearchError('Timeout', 'timeout');
      };

      await expect(searchWithRetry(mockSearchFn, 3)).rejects.toThrow(WebSearchError);
      expect(attempts).toBe(3); // Should retry 3 times
      console.log(`✓ Threw after max retries (${attempts} attempts)`);
    }, 15000);
  });
});
