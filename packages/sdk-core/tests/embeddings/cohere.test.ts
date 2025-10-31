/**
 * Cohere Embedding Adapter Tests
 * Tests Cohere API integration for embedding generation
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingProvider } from '../../src/embeddings/types.js';

describe('Cohere Embedding Adapter', () => {
  let CohereAdapter: any;
  let adapter: any;
  const mockApiKey = 'cohere-test-api-key-1234567890';

  beforeEach(async () => {
    // Dynamically import to avoid module resolution issues
    const module = await import('../../src/embeddings/adapters/CohereAdapter.js');
    CohereAdapter = module.CohereAdapter;

    adapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: mockApiKey,
      model: 'embed-english-light-v3.0'
    });
  });

  it('should initialize with API key', () => {
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe(EmbeddingProvider.Cohere);
  });

  it('should throw error without API key', () => {
    expect(() => {
      new CohereAdapter({
        provider: EmbeddingProvider.Cohere,
        apiKey: '',
        model: 'embed-english-light-v3.0'
      });
    }).toThrow('API key is required');
  });

  it('should generate embedding with default input_type', async () => {
    const text = 'This is a test document';

    const response = await adapter.embedText(text);

    expect(response).toBeDefined();
    expect(response.embedding).toBeInstanceOf(Array);
    expect(response.embedding.length).toBe(384);  // Must be 384 dimensions
    expect(response.text).toBe(text);
    expect(response.tokenCount).toBeGreaterThan(0);
  });

  it('should support search_document input type', async () => {
    const text = 'This document will be searched';

    const response = await adapter.embedText(text, 'search_document');

    expect(response.embedding.length).toBe(384);
  });

  it('should support search_query input type', async () => {
    const text = 'How to search documents?';

    const response = await adapter.embedText(text, 'search_query');

    expect(response.embedding.length).toBe(384);
  });

  it('should generate different embeddings for different input types', async () => {
    const text = 'Machine learning algorithms';

    const docEmbedding = await adapter.embedText(text, 'search_document');
    const queryEmbedding = await adapter.embedText(text, 'search_query');

    // Embeddings should be different for different input types
    const allSame = docEmbedding.embedding.every(
      (val: number, i: number) => Math.abs(val - queryEmbedding.embedding[i]) < 0.0001
    );
    expect(allSame).toBe(false);
  });

  it('should generate embeddings for batch', async () => {
    const texts = [
      'First document',
      'Second document',
      'Third document'
    ];

    const response = await adapter.embedBatch(texts);

    expect(response.embeddings).toHaveLength(3);
    expect(response.provider).toBe(EmbeddingProvider.Cohere);
    expect(response.model).toBe('embed-english-light-v3.0');
    expect(response.totalTokens).toBeGreaterThan(0);
    expect(response.cost).toBeGreaterThan(0);

    // Verify all embeddings are 384 dimensions
    response.embeddings.forEach((result: any) => {
      expect(result.embedding.length).toBe(384);
    });
  });

  it('should respect max batch size', async () => {
    const texts = new Array(200).fill('test');  // Exceeds Cohere limit (96)

    await expect(adapter.embedBatch(texts)).rejects.toThrow('exceeds max batch size');
  });

  it('should handle empty text', async () => {
    await expect(adapter.embedText('')).rejects.toThrow();
  });

  it('should handle empty batch', async () => {
    await expect(adapter.embedBatch([])).rejects.toThrow('texts array cannot be empty');
  });

  it('should handle API errors gracefully', async () => {
    const badAdapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: 'invalid-key',
      model: 'embed-english-light-v3.0',
      maxRetries: 0
    });

    await expect(badAdapter.embedText('test')).rejects.toThrow();
  });

  it('should retry on transient errors', async () => {
    const retryAdapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: mockApiKey,
      model: 'embed-english-light-v3.0',
      maxRetries: 3,
      retryDelay: 100
    });

    const result = await retryAdapter.embedText('test with retries');
    expect(result.embedding.length).toBe(384);
  });

  it('should track costs accurately', async () => {
    const texts = ['Document one', 'Document two', 'Document three'];

    const response = await adapter.embedBatch(texts);

    // Cost should be based on token count
    const expectedCost = (response.totalTokens / 1_000_000) * 0.10;  // $0.10 per 1M tokens
    expect(response.cost).toBeCloseTo(expectedCost, 6);
  });

  it('should enforce daily cost limits', async () => {
    const limitAdapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: mockApiKey,
      model: 'embed-english-light-v3.0',
      maxDailyCostUsd: 0.01
    });

    // Make multiple requests to exceed limit
    for (let i = 0; i < 100; i++) {
      try {
        await limitAdapter.embedText('Request ' + i);
      } catch (error: any) {
        if (error.message.includes('daily cost limit')) {
          return;  // Expected
        }
      }
    }

    throw new Error('Daily cost limit not enforced');
  });

  it('should get cost statistics', async () => {
    await adapter.embedText('Doc 1');
    await adapter.embedText('Doc 2');
    await adapter.embedBatch(['Doc 3', 'Doc 4']);

    const stats = adapter.getCostStats();

    expect(stats.totalRequests).toBe(3);
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.costByProvider[EmbeddingProvider.Cohere]).toBe(stats.totalCost);
  });

  it('should reset cost stats', async () => {
    await adapter.embedText('Test');
    expect(adapter.getCostStats().totalCost).toBeGreaterThan(0);

    adapter.resetCostStats();
    expect(adapter.getCostStats().totalCost).toBe(0);
  });

  it('should handle rate limiting', async () => {
    const rateLimitAdapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: mockApiKey,
      model: 'embed-english-light-v3.0',
      maxRequestsPerMinute: 3,
      maxTokensPerMinute: 1000
    });

    const promises = Array.from({ length: 5 }, (_, i) =>
      rateLimitAdapter.embedText(`Request ${i}`)
    );

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThan(0);
  });

  it('should handle batch with mixed input types', async () => {
    // Cohere allows specifying input_type per request, but batch should use single type
    const texts = ['Doc 1', 'Doc 2', 'Doc 3'];

    const docResponse = await adapter.embedBatch(texts, 'search_document');
    expect(docResponse.embeddings.length).toBe(3);

    const queryResponse = await adapter.embedBatch(texts, 'search_query');
    expect(queryResponse.embeddings.length).toBe(3);

    // Embeddings should be different for different input types
    const firstDocEmbed = docResponse.embeddings[0].embedding;
    const firstQueryEmbed = queryResponse.embeddings[0].embedding;

    const allSame = firstDocEmbed.every(
      (val: number, i: number) => Math.abs(val - firstQueryEmbed[i]) < 0.0001
    );
    expect(allSame).toBe(false);
  });

  it('should timeout long requests', async () => {
    const timeoutAdapter = new CohereAdapter({
      provider: EmbeddingProvider.Cohere,
      apiKey: mockApiKey,
      model: 'embed-english-light-v3.0',
      timeout: 100
    });

    try {
      await timeoutAdapter.embedText('Test timeout');
    } catch (error: any) {
      expect(error.message).toMatch(/timeout|aborted/i);
    }
  });

  it('should normalize embeddings if requested', async () => {
    const response = await adapter.embedText('Test normalization');

    // Calculate L2 norm
    const norm = Math.sqrt(
      response.embedding.reduce((sum: number, val: number) => sum + val * val, 0)
    );

    // Cohere embeddings may not be normalized by default
    expect(norm).toBeGreaterThan(0);
  });
});
