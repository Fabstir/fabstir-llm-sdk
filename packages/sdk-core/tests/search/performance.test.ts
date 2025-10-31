/**
 * Vector Search Performance Tests
 * Tests search speed, caching, and scalability
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Vector Search Performance', () => {
  let VectorRAGManager: any;
  let vectorManager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;

  beforeEach(async () => {
    const module = await import('../../src/managers/VectorRAGManager.js');
    const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');
    VectorRAGManager = module.VectorRAGManager;

    testUserAddress = process.env.TEST_USER_1_ADDRESS!;
    testSeedPhrase = process.env.S5_SEED_PHRASE!;

    vectorManager = new VectorRAGManager({
      userAddress: testUserAddress,
      seedPhrase: testSeedPhrase,
      config: DEFAULT_RAG_CONFIG
    });
  });

  afterEach(async () => {
    if (vectorManager) {
      await vectorManager.cleanup();
    }
  });

  it('should search 1K vectors in < 100ms', async () => {
    const dbName = 'test-perf-1k';
    await vectorManager.createSession(dbName);

    // Add 1000 vectors
    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const query = vectors[0].values;

    // Warm up
    await vectorManager.search(dbName, query, 10);

    // Measure
    const start = Date.now();
    const results = await vectorManager.search(dbName, query, 10);
    const duration = Date.now() - start;

    expect(results.length).toBe(10);
    expect(duration).toBeLessThan(100);
  });

  it('should search 10K vectors in < 200ms', async () => {
    const dbName = 'test-perf-10k';
    await vectorManager.createSession(dbName);

    // Add 10K vectors in batches
    const batchSize = 1000;
    for (let batch = 0; batch < 10; batch++) {
      const vectors = Array.from({ length: batchSize }, (_, i) => ({
        id: `doc-${batch * batchSize + i}`,
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { batch, index: i }
      }));

      await vectorManager.addVectors(dbName, vectors);
    }

    const query = new Array(384).fill(0).map(() => Math.random());

    // Warm up
    await vectorManager.search(dbName, query, 10);

    // Measure
    const start = Date.now();
    const results = await vectorManager.search(dbName, query, 10);
    const duration = Date.now() - start;

    expect(results.length).toBe(10);
    expect(duration).toBeLessThan(200);
  }, 30000); // 30s timeout for setup

  it('should handle concurrent searches efficiently', async () => {
    const dbName = 'test-perf-concurrent';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const query = vectors[0].values;

    // Run 10 concurrent searches
    const start = Date.now();
    const promises = Array.from({ length: 10 }, () =>
      vectorManager.search(dbName, query, 10)
    );

    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    expect(results.length).toBe(10);
    expect(results.every(r => r.length === 10)).toBe(true);
    expect(duration).toBeLessThan(500); // Should be faster than 10 sequential searches
  });

  it.skip('should cache search results (DEFERRED - needs caching layer)', async () => {
    // Search caching deferred to later phase
    // Would require: LRU cache, cache key generation, cache invalidation on updates
    // Skipping for Sub-phase 3.2
    const dbName = 'test-cache';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const query = vectors[0].values;

    // First search (uncached)
    const start1 = Date.now();
    const results1 = await vectorManager.search(dbName, query, 10);
    const duration1 = Date.now() - start1;

    // Second search (should be cached)
    const start2 = Date.now();
    const results2 = await vectorManager.search(dbName, query, 10);
    const duration2 = Date.now() - start2;

    expect(results1.length).toBe(results2.length);
    expect(results1[0].id).toBe(results2[0].id);

    // Cached search should be significantly faster (at least 50% faster)
    expect(duration2).toBeLessThan(duration1 * 0.5);
  });

  it('should invalidate cache after vector updates', async () => {
    const dbName = 'test-cache-invalidation';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { version: 1 }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const query = vectors[0].values;

    // Search and cache
    const results1 = await vectorManager.search(dbName, query, 10);
    expect(results1[0].metadata.version).toBe(1);

    // Update metadata
    await vectorManager.updateMetadata(dbName, 'doc-0', { version: 2 });

    // Search again - should reflect update (cache invalidated)
    const results2 = await vectorManager.search(dbName, query, 10);
    expect(results2[0].metadata.version).toBe(2);
  });

  it.skip('should track search history (DEFERRED - needs storage layer)', async () => {
    // Full search history implementation deferred to later phase
    // Would require: in-memory history buffer, persistence to S5, query API
    // Skipping for Sub-phase 3.2
    const dbName = 'test-search-history';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Perform multiple searches
    await vectorManager.search(dbName, vectors[0].values, 5);
    await vectorManager.search(dbName, vectors[1].values, 10);
    await vectorManager.search(dbName, vectors[2].values, 3);

    // Get search history
    const history = await vectorManager.getSearchHistory(dbName);

    expect(history.length).toBe(3);
    expect(history[0].topK).toBe(5);
    expect(history[1].topK).toBe(10);
    expect(history[2].topK).toBe(3);
  });

  it.skip('should limit search history size (DEFERRED - needs storage layer)', async () => {
    // Full search history implementation deferred to later phase
    // Skipping for Sub-phase 3.2
    const dbName = 'test-history-limit';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Perform 50 searches
    for (let i = 0; i < 50; i++) {
      await vectorManager.search(dbName, vectors[0].values, 5);
    }

    // History should be limited to last 20
    const history = await vectorManager.getSearchHistory(dbName);
    expect(history.length).toBeLessThanOrEqual(20);
  });

  it('should measure search latency accurately', async () => {
    const dbName = 'test-latency';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const query = vectors[0].values;

    // Measure 10 searches
    const latencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await vectorManager.search(dbName, query, 10);
      latencies.push(Date.now() - start);
    }

    // Calculate average
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    expect(avgLatency).toBeLessThan(100);

    // Verify consistency (std dev < 50% of mean)
    const stdDev = Math.sqrt(
      latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length
    );
    expect(stdDev).toBeLessThan(avgLatency * 0.5);
  });

  it('should handle memory efficiently with large result sets', async () => {
    const dbName = 'test-memory';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i, data: 'x'.repeat(1000) } // 1KB per vector
    }));

    await vectorManager.addVectors(dbName, vectors);

    const memBefore = process.memoryUsage().heapUsed;

    // Search without vectors (should use less memory)
    await vectorManager.search(dbName, vectors[0].values, 100, {
      includeVectors: false
    });

    const memWithoutVectors = process.memoryUsage().heapUsed - memBefore;

    // Search with vectors (should use more memory)
    await vectorManager.search(dbName, vectors[0].values, 100, {
      includeVectors: true
    });

    const memWithVectors = process.memoryUsage().heapUsed - memBefore;

    // With vectors should use significantly more memory
    expect(memWithVectors).toBeGreaterThan(memWithoutVectors * 2);
  });
});
