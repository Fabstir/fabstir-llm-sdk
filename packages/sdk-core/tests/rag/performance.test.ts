/**
 * Vector DB Performance Tests
 * Verifies performance specifications and memory efficiency
 * Max 200 lines
 */

import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

describe('Vector DB Performance', () => {
  let VectorDbSession: any;
  let testSeedPhrase: string;

  beforeAll(async () => {
    const vectorDbModule = await import('@fabstir/vector-db-native');
    VectorDbSession = vectorDbModule.VectorDbSession;
    testSeedPhrase = process.env.S5_SEED_PHRASE || 'test seed phrase for development only';
  });

  describe('Memory Efficiency', () => {
    it('should use ~64MB for 100K vectors (10x improvement)', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-memory-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000,
        cacheSizeMb: 150
      });

      // Generate 100K vectors (384 dimensions each)
      const batchSize = 1000;
      const totalVectors = 100000;

      console.log(`\nAdding ${totalVectors} vectors in batches of ${batchSize}...`);

      for (let batch = 0; batch < totalVectors / batchSize; batch++) {
        const vectors = [];
        for (let i = 0; i < batchSize; i++) {
          const idx = batch * batchSize + i;
          vectors.push({
            id: `vec-${idx}`,
            vector: new Array(384).fill(0).map(() => Math.random()),
            metadata: {
              index: idx,
              batch: batch,
              timestamp: Date.now()
            }
          });
        }
        await session.addVectors(vectors);

        if (batch % 10 === 0) {
          console.log(`  Progress: ${((batch + 1) * batchSize).toLocaleString()} / ${totalVectors.toLocaleString()} vectors`);
        }
      }

      // Get memory stats
      const stats = await session.getStats();
      console.log(`\nMemory Statistics:`);
      console.log(`  Total vectors: ${stats.totalVectors.toLocaleString()}`);
      console.log(`  Total chunks: ${stats.totalChunks}`);
      console.log(`  Memory usage: ${stats.memoryUsageMb.toFixed(2)} MB`);
      console.log(`  Target: ~64 MB (10x improvement over traditional)`);

      expect(stats.totalVectors).toBe(totalVectors);
      expect(stats.totalChunks).toBeGreaterThan(0);

      // Memory should be significantly less than traditional approach (~640MB)
      // Allow some overhead, but should be under 200MB
      expect(stats.memoryUsageMb).toBeLessThan(200);

      // Ideally should be close to 64MB
      console.log(`  Efficiency: ${(stats.memoryUsageMb <= 100 ? '✅ PASS' : '⚠️  CHECK')}`);

      await session.close();
    }, 120000); // 2 minute timeout for large dataset

    it('should handle chunked loading efficiently', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-chunk-load-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      // Add 25K vectors (3 chunks at 10K/chunk)
      const vectors = [];
      for (let i = 0; i < 25000; i++) {
        vectors.push({
          id: `vec-${i}`,
          vector: new Array(384).fill(0).map(() => Math.random()),
          metadata: { index: i }
        });
      }

      await session.addVectors(vectors);

      const stats = await session.getStats();
      expect(stats.totalVectors).toBe(25000);
      expect(stats.totalChunks).toBeGreaterThanOrEqual(3);

      await session.close();
    }, 60000);
  });

  describe('Search Latency', () => {
    it('should search in < 100ms with warm cache (target: 58ms)', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-latency-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000,
        cacheSizeMb: 150
      });

      // Add 10K vectors for testing
      const vectors = [];
      for (let i = 0; i < 10000; i++) {
        vectors.push({
          id: `vec-${i}`,
          vector: new Array(384).fill(0).map(() => Math.random()),
          metadata: { index: i }
        });
      }

      await session.addVectors(vectors);

      // Query vector
      const queryVector = new Array(384).fill(0).map(() => Math.random());

      // First search (cold cache)
      const coldStart = performance.now();
      const coldResults = await session.search(queryVector, 5);
      const coldTime = performance.now() - coldStart;

      console.log(`\nSearch Latency:`);
      console.log(`  Cold cache: ${coldTime.toFixed(2)}ms`);

      expect(coldResults.length).toBeGreaterThan(0);

      // Second search (warm cache)
      const warmStart = performance.now();
      const warmResults = await session.search(queryVector, 5);
      const warmTime = performance.now() - warmStart;

      console.log(`  Warm cache: ${warmTime.toFixed(2)}ms`);
      console.log(`  Target: < 58ms`);
      console.log(`  Result: ${warmTime < 100 ? '✅ PASS' : '⚠️  CHECK'}`);

      expect(warmResults.length).toBeGreaterThan(0);

      // Warm cache should be fast (< 100ms, ideally < 58ms)
      expect(warmTime).toBeLessThan(100);

      await session.close();
    }, 60000);

    it('should handle multiple concurrent searches efficiently', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-concurrent-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      // Add vectors
      const vectors = [];
      for (let i = 0; i < 5000; i++) {
        vectors.push({
          id: `vec-${i}`,
          vector: new Array(384).fill(0).map(() => Math.random()),
          metadata: { index: i }
        });
      }

      await session.addVectors(vectors);

      // Perform 10 concurrent searches
      const searches = [];
      for (let i = 0; i < 10; i++) {
        const queryVector = new Array(384).fill(0).map(() => Math.random());
        searches.push(session.search(queryVector, 5));
      }

      const start = performance.now();
      const results = await Promise.all(searches);
      const duration = performance.now() - start;

      console.log(`\nConcurrent Search Performance:`);
      console.log(`  10 searches: ${duration.toFixed(2)}ms total`);
      console.log(`  Average: ${(duration / 10).toFixed(2)}ms per search`);

      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result.length).toBeGreaterThan(0);
      });

      await session.close();
    }, 60000);
  });

  describe('Scalability', () => {
    it('should maintain performance with growing dataset', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-scale-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      const queryVector = new Array(384).fill(0).map(() => Math.random());
      const measurements = [];

      // Test at different scales: 1K, 5K, 10K, 20K
      const scales = [1000, 5000, 10000, 20000];

      for (const targetSize of scales) {
        // Add vectors to reach target size
        const currentSize = (await session.getStats()).totalVectors || 0;
        const toAdd = targetSize - currentSize;

        if (toAdd > 0) {
          const vectors = [];
          for (let i = 0; i < toAdd; i++) {
            vectors.push({
              id: `vec-${currentSize + i}`,
              vector: new Array(384).fill(0).map(() => Math.random()),
              metadata: { index: currentSize + i }
            });
          }
          await session.addVectors(vectors);
        }

        // Measure search time
        const start = performance.now();
        await session.search(queryVector, 5);
        const duration = performance.now() - start;

        measurements.push({ size: targetSize, duration });
        console.log(`  ${targetSize.toLocaleString()} vectors: ${duration.toFixed(2)}ms`);
      }

      // Performance should not degrade significantly with scale
      const firstDuration = measurements[0].duration;
      const lastDuration = measurements[measurements.length - 1].duration;

      // Last search should be < 2x the first search time
      expect(lastDuration).toBeLessThan(firstDuration * 2);

      await session.close();
    }, 120000);
  });
});
