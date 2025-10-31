/**
 * Embedding Cache Tests
 * Tests LRU cache for embedding results
 * Max 200 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingProvider } from '../../src/embeddings/types.js';

describe('Embedding Cache', () => {
  let EmbeddingCache: any;
  let cache: any;
  let mockAdapter: any;
  let embedCallCount: number;

  beforeEach(async () => {
    embedCallCount = 0;

    // Create mock adapter
    mockAdapter = {
      provider: EmbeddingProvider.OpenAI,
      embedText: vi.fn(async (text: string) => {
        embedCallCount++;
        return {
          embedding: new Array(384).fill(0).map(() => Math.random()),
          text: text,
          tokenCount: text.split(' ').length * 4  // Rough estimate
        };
      }),
      embedBatch: vi.fn(async (texts: string[]) => {
        embedCallCount++;
        return {
          embeddings: texts.map(text => ({
            embedding: new Array(384).fill(0).map(() => Math.random()),
            text: text,
            tokenCount: text.split(' ').length * 4
          })),
          provider: EmbeddingProvider.OpenAI,
          model: 'text-embedding-3-small',
          totalTokens: texts.reduce((sum, t) => sum + t.split(' ').length * 4, 0),
          cost: 0.00001
        };
      })
    };

    // Import cache
    const module = await import('../../src/embeddings/EmbeddingCache.js');
    EmbeddingCache = module.EmbeddingCache;

    cache = new EmbeddingCache(mockAdapter, {
      maxSize: 10,
      expirationMs: 60000  // 60 seconds
    });
  });

  it('should initialize with adapter', () => {
    expect(cache).toBeDefined();
  });

  it('should cache embedding results', async () => {
    const text = 'Test document for caching';

    // First call - should hit API
    const result1 = await cache.embedText(text);
    expect(embedCallCount).toBe(1);

    // Second call - should hit cache
    const result2 = await cache.embedText(text);
    expect(embedCallCount).toBe(1);  // No additional API call

    // Results should be identical
    expect(result1.embedding).toEqual(result2.embedding);
  });

  it('should generate consistent cache keys', async () => {
    const text = 'Same text different calls';

    await cache.embedText(text);
    const hitRate1 = cache.getHitRate();

    await cache.embedText(text);  // Should hit cache
    const hitRate2 = cache.getHitRate();

    expect(hitRate2).toBeGreaterThan(hitRate1);
  });

  it('should handle cache misses', async () => {
    await cache.embedText('First text');
    await cache.embedText('Second text');
    await cache.embedText('Third text');

    expect(embedCallCount).toBe(3);  // All cache misses
  });

  it('should evict LRU entries when full', async () => {
    // Fill cache to max size (10 entries)
    for (let i = 0; i < 10; i++) {
      await cache.embedText(`Document ${i}`);
    }

    expect(embedCallCount).toBe(10);

    // Access first entry (makes it most recently used)
    await cache.embedText('Document 0');
    expect(embedCallCount).toBe(10);  // Should be cached

    // Add new entry (should evict least recently used, which is 'Document 1')
    await cache.embedText('Document 10');
    expect(embedCallCount).toBe(11);  // New entry, API call made

    // Access evicted entry (should require new API call)
    await cache.embedText('Document 1');
    expect(embedCallCount).toBe(12);  // Cache miss, API call

    // Access most recent entry (should still be cached)
    await cache.embedText('Document 0');
    expect(embedCallCount).toBe(12);  // Still cached
  });

  it('should respect expiration time', async () => {
    const shortCache = new EmbeddingCache(mockAdapter, {
      maxSize: 10,
      expirationMs: 100  // 100ms expiration
    });

    await shortCache.embedText('Expiring text');
    expect(embedCallCount).toBe(1);

    // Immediately access - should be cached
    await shortCache.embedText('Expiring text');
    expect(embedCallCount).toBe(1);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Access after expiration - should require new API call
    await shortCache.embedText('Expiring text');
    expect(embedCallCount).toBe(2);
  });

  it('should track hit rate', async () => {
    const text = 'Hit rate test';

    // First call - miss
    await cache.embedText(text);
    let hitRate = cache.getHitRate();
    expect(hitRate).toBe(0);  // 0 hits, 1 miss = 0%

    // Second call - hit
    await cache.embedText(text);
    hitRate = cache.getHitRate();
    expect(hitRate).toBe(0.5);  // 1 hit, 1 miss = 50%

    // Third call - hit
    await cache.embedText(text);
    hitRate = cache.getHitRate();
    expect(hitRate).toBeCloseTo(0.667, 2);  // 2 hits, 1 miss = 66.7%
  });

  it('should clear cache', async () => {
    await cache.embedText('Text 1');
    await cache.embedText('Text 2');
    expect(embedCallCount).toBe(2);

    // Clear cache
    cache.clear();

    // Access same texts - should require new API calls
    await cache.embedText('Text 1');
    await cache.embedText('Text 2');
    expect(embedCallCount).toBe(4);
  });

  it('should handle batch requests', async () => {
    const texts = ['Doc 1', 'Doc 2', 'Doc 3'];

    // First batch - all misses
    await cache.embedBatch(texts);
    expect(embedCallCount).toBe(1);

    // Second batch - all hits
    await cache.embedBatch(texts);
    expect(embedCallCount).toBe(1);  // No additional API calls
  });

  it('should handle partial batch cache hits', async () => {
    // Cache some texts
    await cache.embedText('Doc 1');
    await cache.embedText('Doc 2');
    expect(embedCallCount).toBe(2);

    // Batch with mix of cached and uncached
    const texts = ['Doc 1', 'Doc 2', 'Doc 3', 'Doc 4'];
    await cache.embedBatch(texts);

    // Should only fetch uncached ones (Doc 3, Doc 4)
    expect(embedCallCount).toBe(3);  // +1 for batch of uncached
  });

  it('should get cache size', async () => {
    expect(cache.getSize()).toBe(0);

    await cache.embedText('Text 1');
    await cache.embedText('Text 2');
    await cache.embedText('Text 3');

    expect(cache.getSize()).toBe(3);
  });

  it('should check if key exists', async () => {
    const text = 'Test existence';

    expect(cache.has(text)).toBe(false);

    await cache.embedText(text);

    expect(cache.has(text)).toBe(true);
  });

  it('should handle different providers with same text', async () => {
    // OpenAI adapter
    await cache.embedText('Same text');
    expect(embedCallCount).toBe(1);

    // Create cache with different provider
    const cohereAdapter = {
      ...mockAdapter,
      provider: EmbeddingProvider.Cohere
    };
    const cohereCache = new EmbeddingCache(cohereAdapter, { maxSize: 10 });

    // Same text, different provider - should not hit cache
    await cohereCache.embedText('Same text');
    expect(embedCallCount).toBe(2);
  });

  it('should track cache statistics', async () => {
    await cache.embedText('Text 1');
    await cache.embedText('Text 1');  // Hit
    await cache.embedText('Text 2');
    await cache.embedText('Text 1');  // Hit

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.size).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });
});
