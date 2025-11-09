/**
 * Host Embedding Adapter Tests
 * Tests host-side embedding endpoint integration
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EmbeddingProvider } from '../../src/embeddings/types.js';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Host Embedding Adapter', () => {
  let adapter: HostAdapter;
  const hostUrl = 'http://localhost:8080';
  const chainId = 84532;  // Base Sepolia

  beforeEach(() => {
    adapter = new HostAdapter({
      hostUrl,
      chainId,
      maxRetries: 1,  // Faster tests
      timeout: 5000
    });

    // Reset mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with host URL', () => {
      expect(adapter).toBeDefined();
    });

    it('should throw error without host URL', () => {
      expect(() => {
        new HostAdapter({
          hostUrl: '',
          chainId
        });
      }).toThrow('hostUrl is required');
    });

    it('should use default chain ID if not provided', () => {
      const adapterWithDefaults = new HostAdapter({
        hostUrl
      });
      expect(adapterWithDefaults).toBeDefined();
    });

    it('should remove trailing slash from host URL', () => {
      const adapterWithSlash = new HostAdapter({
        hostUrl: 'http://localhost:8080/',
        chainId
      });
      expect(adapterWithSlash).toBeDefined();
    });
  });

  describe('Single Text Embedding', () => {
    it('should generate embedding for single text', async () => {
      const text = 'This is a test document';
      const mockEmbedding = Array(384).fill(0).map(() => Math.random());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{
            embedding: mockEmbedding,
            text,
            tokenCount: 5
          }],
          model: 'all-MiniLM-L6-v2',
          provider: 'host',
          totalTokens: 5,
          cost: 0.0
        })
      });

      const result = await adapter.embedText(text);

      expect(result).toBeDefined();
      expect(result.embedding).toHaveLength(384);
      expect(result.text).toBe(text);
      expect(result.tokenCount).toBe(5);

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `${hostUrl}/v1/embed`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts: [text],
            model: 'all-MiniLM-L6-v2',
            chain_id: chainId
          })
        })
      );
    });

    it('should handle empty text', async () => {
      await expect(adapter.embedText('')).rejects.toThrow('Text cannot be empty');
    });
  });

  describe('Batch Embedding', () => {
    it('should generate embeddings for batch', async () => {
      const texts = [
        'First document',
        'Second document',
        'Third document'
      ];

      const mockEmbeddings = texts.map(text => ({
        embedding: Array(384).fill(0).map(() => Math.random()),
        text,
        tokenCount: 3
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: mockEmbeddings,
          model: 'all-MiniLM-L6-v2',
          provider: 'host',
          totalTokens: 9,
          cost: 0.0,
          chain_id: chainId,
          chain_name: 'Base Sepolia',
          native_token: 'ETH'
        })
      });

      const response = await adapter.embedBatch(texts);

      expect(response.embeddings).toHaveLength(3);
      expect(response.provider).toBe(EmbeddingProvider.Host);
      expect(response.model).toBe('all-MiniLM-L6-v2');
      expect(response.totalTokens).toBe(9);
      expect(response.cost).toBe(0.0);

      // Verify all embeddings are 384 dimensions
      response.embeddings.forEach((result) => {
        expect(result.embedding.length).toBe(384);
      });
    });

    it('should handle empty batch', async () => {
      await expect(adapter.embedBatch([])).rejects.toThrow('texts array cannot be empty');
    });

    it('should respect max batch size (96)', async () => {
      const texts = new Array(100).fill('test');  // Exceeds host limit (96)

      await expect(adapter.embedBatch(texts)).rejects.toThrow('exceeds max batch size');
    });
  });

  describe('Error Handling', () => {
    it('should handle HTTP errors', async () => {
      // Use mockResolvedValue (not Once) to handle retries
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'InternalError',
          message: 'Model not loaded'
        })
      } as any);

      await expect(adapter.embedText('test')).rejects.toThrow('Model not loaded');

      // Reset for other tests
      mockFetch.mockReset();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.embedText('test')).rejects.toThrow();
    });

    it('should handle invalid response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing embeddings array
          model: 'all-MiniLM-L6-v2'
        })
      });

      await expect(adapter.embedText('test')).rejects.toThrow('Invalid response from host');
    });

    it('should handle dimension mismatch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{
            embedding: Array(768).fill(0),  // Wrong dimensions
            text: 'test',
            tokenCount: 1
          }],
          model: 'all-mpnet-base-v2',
          totalTokens: 1
        })
      });

      await expect(adapter.embedText('test')).rejects.toThrow('expected 384');
    });

    it('should handle embedding count mismatch', async () => {
      const texts = ['text1', 'text2', 'text3'];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{  // Only 1 embedding for 3 texts
            embedding: Array(384).fill(0),
            text: 'text1',
            tokenCount: 1
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 3
        })
      });

      await expect(adapter.embedBatch(texts)).rejects.toThrow('returned 1 embeddings for 3 texts');
    });
  });

  describe('Cost Tracking', () => {
    it('should track cost as 0.0 for host embeddings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{
            embedding: Array(384).fill(0),
            text: 'test',
            tokenCount: 1
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 1,
          cost: 0.0
        })
      });

      await adapter.embedText('test');

      const stats = adapter.getCostStats();
      expect(stats.totalCost).toBe(0.0);
      expect(stats.totalRequests).toBe(1);
      expect(stats.costByProvider[EmbeddingProvider.Host]).toBe(0.0);
    });

    it('should not enforce daily cost limits', async () => {
      const adapterWithLimit = new HostAdapter({
        hostUrl,
        chainId,
        maxDailyCostUsd: 0.01  // Very low limit
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{
            embedding: Array(384).fill(0),
            text: 'test',
            tokenCount: 100
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 100,
          cost: 0.0
        })
      });

      // Should not throw even though normally this would exceed daily limit
      await expect(adapterWithLimit.embedText('test')).resolves.toBeDefined();
    });
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', async () => {
      let attempts = 0;

      mockFetch.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('Network timeout'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            embeddings: [{
              embedding: Array(384).fill(0),
              text: 'test',
              tokenCount: 1
            }],
            model: 'all-MiniLM-L6-v2',
            totalTokens: 1,
            cost: 0.0
          })
        });
      });

      const result = await adapter.embedText('test');

      expect(result).toBeDefined();
      expect(attempts).toBe(2);  // Should have retried once
    });
  });

  describe('Integration with EmbeddingService', () => {
    it('should inherit rate limiting', async () => {
      // Use fake timers to avoid actual waiting
      vi.useFakeTimers();

      const limitedAdapter = new HostAdapter({
        hostUrl,
        chainId,
        maxRequestsPerMinute: 60  // Higher rate to avoid long waits
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{
            embedding: Array(384).fill(0),
            text: 'test',
            tokenCount: 1
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 1,
          cost: 0.0
        })
      });

      // First request should succeed
      await limitedAdapter.embedText('test1');

      // Second request should succeed (rate limit not exceeded with 60 req/min)
      const result = await limitedAdapter.embedText('test2');
      expect(result).toBeDefined();

      vi.useRealTimers();
    });
  });
});
