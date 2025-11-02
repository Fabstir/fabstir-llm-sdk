/**
 * Profiling Tests
 * Tests for profiling and optimization features
 * Max 200 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LazyLoader } from '../../src/optimization/lazy-loader.js';
import { BatchProcessor } from '../../src/optimization/batch-processor.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';

describe('Lazy Loading', () => {
  let lazyLoader: LazyLoader;

  beforeEach(() => {
    lazyLoader = new LazyLoader({
      chunkSize: 100,
      preloadSize: 2
    });
  });

  describe('Chunk Loading', () => {
    it('should load chunks on demand', async () => {
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i }
        });
      }

      await lazyLoader.initialize(vectors);

      // Should only load first chunk initially
      expect(lazyLoader.getLoadedChunkCount()).toBe(1);

      // Request vectors from second chunk
      const chunk2 = await lazyLoader.getChunk(1);
      expect(chunk2.length).toBe(100);
      // Should have chunk 0, chunk 1, and preloaded chunks 2 and 3 (preloadSize=2)
      expect(lazyLoader.getLoadedChunkCount()).toBe(4);
    });

    it('should preload adjacent chunks', async () => {
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 500; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i }
        });
      }

      await lazyLoader.initialize(vectors);
      await lazyLoader.getChunk(2); // Request chunk 2

      // Should have loaded chunk 2 and preloaded chunks 3 and 4
      expect(lazyLoader.getLoadedChunkCount()).toBeGreaterThanOrEqual(3);
    });

    it('should unload chunks when memory limit is reached', async () => {
      const loader = new LazyLoader({
        chunkSize: 100,
        maxLoadedChunks: 3
      });

      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i }
        });
      }

      await loader.initialize(vectors);

      // Load 5 different chunks
      await loader.getChunk(0);
      await loader.getChunk(1);
      await loader.getChunk(2);
      await loader.getChunk(3);
      await loader.getChunk(4);

      // Should only keep 3 chunks in memory
      expect(loader.getLoadedChunkCount()).toBeLessThanOrEqual(3);
    });

    it('should track access patterns', async () => {
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 300; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i }
        });
      }

      await lazyLoader.initialize(vectors);

      await lazyLoader.getChunk(0);
      await lazyLoader.getChunk(1);
      await lazyLoader.getChunk(0); // Access chunk 0 again

      const stats = lazyLoader.getStats();
      expect(stats.totalAccesses).toBe(3);
      expect(stats.chunkAccesses.get(0)).toBe(2);
      expect(stats.chunkAccesses.get(1)).toBe(1);
    });
  });
});

describe('Batch Processing', () => {
  let batchProcessor: BatchProcessor;

  beforeEach(() => {
    batchProcessor = new BatchProcessor({
      maxBatchSize: 10,
      maxWaitTime: 100
    });
  });

  describe('Batching', () => {
    it('should batch multiple operations together', async () => {
      const operations: Promise<number>[] = [];

      // Submit 5 operations
      for (let i = 0; i < 5; i++) {
        operations.push(
          batchProcessor.submit('test-op', async (batch) => {
            return batch.length; // Return batch size
          })
        );
      }

      const results = await Promise.all(operations);

      // All operations should see the same batch size
      expect(results[0]).toBe(5);
      expect(results.every(r => r === 5)).toBe(true);
    });

    it('should flush batch when max size is reached', async () => {
      const processor = new BatchProcessor({
        maxBatchSize: 3,
        maxWaitTime: 1000
      });

      const operations: Promise<number>[] = [];
      for (let i = 0; i < 5; i++) {
        operations.push(
          processor.submit('test-op', async (batch) => batch.length)
        );
      }

      const results = await Promise.all(operations);

      // First 3 operations should be in first batch, last 2 in second
      expect(results[0]).toBe(3);
      expect(results[4]).toBeLessThanOrEqual(2);
    });

    it('should flush batch after max wait time', async () => {
      const processor = new BatchProcessor({
        maxBatchSize: 100,
        maxWaitTime: 50
      });

      const startTime = Date.now();

      // Submit only 1 operation
      const result = await processor.submit('test-op', async (batch) => {
        return Date.now() - startTime;
      });

      // Should have waited approximately maxWaitTime
      expect(result).toBeGreaterThanOrEqual(45);
      expect(result).toBeLessThan(100);
    });

    it('should process different operation types separately', async () => {
      const op1 = batchProcessor.submit('type1', async (batch) => {
        return { type: 'type1', count: batch.length };
      });

      const op2 = batchProcessor.submit('type2', async (batch) => {
        return { type: 'type2', count: batch.length };
      });

      const [result1, result2] = await Promise.all([op1, op2]);

      expect(result1.type).toBe('type1');
      expect(result2.type).toBe('type2');
      expect(result1.count).toBe(1);
      expect(result2.count).toBe(1);
    });

    it('should track batch statistics', async () => {
      for (let i = 0; i < 10; i++) {
        await batchProcessor.submit('test-op', async () => i);
      }

      const stats = batchProcessor.getStats();
      expect(stats.totalBatches).toBeGreaterThan(0);
      expect(stats.totalOperations).toBe(10);
      expect(stats.avgBatchSize).toBeGreaterThan(0);
    });
  });
});
