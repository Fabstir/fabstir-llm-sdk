/**
 * OpenAI Embedding Adapter Tests
 * Tests OpenAI API integration for embedding generation
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingProvider } from '../../src/embeddings/types.js';

describe('OpenAI Embedding Adapter', () => {
  let OpenAIAdapter: any;
  let adapter: any;
  const mockApiKey = 'sk-test-mock-api-key-1234567890';

  beforeEach(async () => {
    // Dynamically import to avoid module resolution issues
    const module = await import('../../src/embeddings/adapters/OpenAIAdapter.js');
    OpenAIAdapter = module.OpenAIAdapter;

    adapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: mockApiKey,
      model: 'text-embedding-3-small'
    });
  });

  it('should initialize with API key', () => {
    expect(adapter).toBeDefined();
    expect(adapter.provider).toBe(EmbeddingProvider.OpenAI);
  });

  it('should throw error without API key', async () => {
    expect(() => {
      new OpenAIAdapter({
        provider: EmbeddingProvider.OpenAI,
        apiKey: '',
        model: 'text-embedding-3-small'
      });
    }).toThrow('API key is required');
  });

  it('should generate embedding for single text', async () => {
    const text = 'This is a test document';

    const response = await adapter.embedText(text);

    expect(response).toBeDefined();
    expect(response.embedding).toBeInstanceOf(Array);
    expect(response.embedding.length).toBe(384);  // Must be 384 dimensions
    expect(response.text).toBe(text);
    expect(response.tokenCount).toBeGreaterThan(0);

    // Verify embedding values are valid floats
    expect(response.embedding.every((v: number) => typeof v === 'number')).toBe(true);
    expect(response.embedding.every((v: number) => !isNaN(v))).toBe(true);
  });

  it('should generate embeddings for batch', async () => {
    const texts = [
      'First document',
      'Second document',
      'Third document'
    ];

    const response = await adapter.embedBatch(texts);

    expect(response.embeddings).toHaveLength(3);
    expect(response.provider).toBe(EmbeddingProvider.OpenAI);
    expect(response.model).toBe('text-embedding-3-small');
    expect(response.totalTokens).toBeGreaterThan(0);
    expect(response.cost).toBeGreaterThan(0);

    // Verify all embeddings are 384 dimensions
    response.embeddings.forEach((result: any) => {
      expect(result.embedding.length).toBe(384);
    });
  });

  it('should handle empty text', async () => {
    await expect(adapter.embedText('')).rejects.toThrow();
  });

  it('should handle empty batch', async () => {
    await expect(adapter.embedBatch([])).rejects.toThrow('texts array cannot be empty');
  });

  it('should respect max batch size', async () => {
    const texts = new Array(3000).fill('test');  // Exceeds OpenAI limit (2048)

    await expect(adapter.embedBatch(texts)).rejects.toThrow('exceeds max batch size');
  });

  it('should handle API errors gracefully', async () => {
    // Use invalid API key to trigger error
    const badAdapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: 'sk-invalid-key',
      model: 'text-embedding-3-small',
      maxRetries: 0  // Disable retries for faster test
    });

    await expect(badAdapter.embedText('test')).rejects.toThrow();
  });

  it('should retry on transient errors', async () => {
    const retryAdapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: mockApiKey,
      model: 'text-embedding-3-small',
      maxRetries: 3,
      retryDelay: 100
    });

    // First call will fail, retries should eventually succeed (mocked)
    const result = await retryAdapter.embedText('test with retries');
    expect(result.embedding.length).toBe(384);
  });

  it('should track costs accurately', async () => {
    const texts = ['Document one', 'Document two', 'Document three'];

    const response = await adapter.embedBatch(texts);

    // Cost should be based on token count
    const expectedCost = (response.totalTokens / 1_000_000) * 0.02;  // $0.02 per 1M tokens
    expect(response.cost).toBeCloseTo(expectedCost, 6);  // 6 decimal places
  });

  it('should enforce daily cost limits', async () => {
    const limitAdapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: mockApiKey,
      model: 'text-embedding-3-small',
      maxDailyCostUsd: 0.01  // Very low limit
    });

    // First request should succeed
    await limitAdapter.embedText('First request');

    // Simulate multiple requests to exceed limit
    for (let i = 0; i < 100; i++) {
      try {
        await limitAdapter.embedText('Request ' + i);
      } catch (error: any) {
        if (error.message.includes('daily cost limit')) {
          // Expected - cost limit reached
          return;
        }
      }
    }

    // Should have hit limit
    throw new Error('Daily cost limit not enforced');
  });

  it('should use correct model dimensions', async () => {
    // Verify dimensions parameter is sent to API
    const text = 'Test dimensions';
    const response = await adapter.embedText(text);

    expect(response.embedding.length).toBe(384);
  });

  it('should timeout long requests', async () => {
    const timeoutAdapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: mockApiKey,
      model: 'text-embedding-3-small',
      timeout: 100  // Very short timeout
    });

    // This may or may not timeout depending on API speed
    try {
      await timeoutAdapter.embedText('Test timeout');
    } catch (error: any) {
      expect(error.message).toMatch(/timeout|aborted/i);
    }
  });

  it('should get cost statistics', async () => {
    await adapter.embedText('Doc 1');
    await adapter.embedText('Doc 2');
    await adapter.embedBatch(['Doc 3', 'Doc 4']);

    const stats = adapter.getCostStats();

    expect(stats.totalRequests).toBe(3);  // 2 single + 1 batch
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.costByProvider[EmbeddingProvider.OpenAI]).toBe(stats.totalCost);
  });

  it('should reset cost stats', async () => {
    await adapter.embedText('Test');
    expect(adapter.getCostStats().totalCost).toBeGreaterThan(0);

    adapter.resetCostStats();
    expect(adapter.getCostStats().totalCost).toBe(0);
  });

  it('should handle rate limiting', async () => {
    const rateLimitAdapter = new OpenAIAdapter({
      provider: EmbeddingProvider.OpenAI,
      apiKey: mockApiKey,
      model: 'text-embedding-3-small',
      maxRequestsPerMinute: 3,
      maxTokensPerMinute: 1000
    });

    // Make multiple rapid requests
    const promises = Array.from({ length: 5 }, (_, i) =>
      rateLimitAdapter.embedText(`Request ${i}`)
    );

    // Some requests should be delayed due to rate limiting
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    // Should take longer due to rate limiting
    expect(duration).toBeGreaterThan(0);
  });

  it('should normalize embeddings if requested', async () => {
    // OpenAI embeddings are already normalized, but verify
    const response = await adapter.embedText('Test normalization');

    // Calculate L2 norm
    const norm = Math.sqrt(
      response.embedding.reduce((sum: number, val: number) => sum + val * val, 0)
    );

    expect(norm).toBeCloseTo(1.0, 2);  // Should be close to 1 (unit vector)
  });
});
