/**
 * @fileoverview Tests for HostManager web search capability detection
 * Sub-phase 4.1: Add Capability Detection to HostManager
 *
 * Tests that HostManager can detect web search capabilities from host's
 * /v1/version endpoint and return properly typed WebSearchCapabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WebSearchCapabilities } from '../../src/types/web-search.types';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import the helper function we'll implement
import { getWebSearchCapabilitiesFromHost } from '../../src/utils/host-web-search-capabilities';

describe('getWebSearchCapabilitiesFromHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when host supports web search', () => {
    it('should return capabilities when host has web search features', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.7.0',
          features: ['host-side-web-search', 'inference-web-search', 'brave-search-api']
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(true);
      expect(capabilities.supportsInferenceSearch).toBe(true);
      expect(capabilities.supportsStreamingSearch).toBe(false); // Not in v8.7.0
      expect(capabilities.supportsWebSocketSearch).toBe(false); // Not in v8.7.0
      expect(capabilities.provider).toBe('brave');
      expect(capabilities.rateLimitPerMinute).toBe(60);
    });

    it('should detect v8.7.5+ streaming and WebSocket search features', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.7.5',
          features: [
            'host-side-web-search',
            'inference-web-search',
            'streaming-web-search',
            'websocket-web-search',
            'duckduckgo-fallback'
          ]
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(true);
      expect(capabilities.supportsInferenceSearch).toBe(true);
      expect(capabilities.supportsStreamingSearch).toBe(true);
      expect(capabilities.supportsWebSocketSearch).toBe(true);
      expect(capabilities.provider).toBe('duckduckgo');
    });

    it('should detect Brave provider correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.7.0',
          features: ['host-side-web-search', 'brave-search-api']
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.provider).toBe('brave');
    });

    it('should detect DuckDuckGo fallback correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.7.0',
          features: ['host-side-web-search', 'duckduckgo-fallback']
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.provider).toBe('duckduckgo');
    });

    it('should detect Bing provider correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.7.0',
          features: ['host-side-web-search', 'bing-search-api']
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.provider).toBe('bing');
    });
  });

  describe('when host does not support web search', () => {
    it('should return supportsWebSearch: false when feature missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.6.0',
          features: ['streaming', 'rag-support']
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.supportsInferenceSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
      expect(capabilities.rateLimitPerMinute).toBe(0);
    });

    it('should return supportsWebSearch: false when features array empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.5.0',
          features: []
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
    });

    it('should return supportsWebSearch: false when features undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '8.5.0'
          // no features property
        })
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.supportsInferenceSearch).toBe(false);
      expect(capabilities.supportsStreamingSearch).toBe(false);
      expect(capabilities.supportsWebSocketSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
      expect(capabilities.rateLimitPerMinute).toBe(0);
    });

    it('should handle non-ok HTTP response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      const capabilities = await getWebSearchCapabilitiesFromHost('http://localhost:8080');

      expect(capabilities.supportsWebSearch).toBe(false);
      expect(capabilities.provider).toBeNull();
    });
  });
});
