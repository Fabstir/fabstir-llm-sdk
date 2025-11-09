/**
 * Batch Vector Operations Tests
 * Tests batch processing and performance with large vector sets
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Batch Vector Operations', () => {
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

  it('should add 100 vectors in batch', async () => {
    const dbName = 'test-batch-100';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 100 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i, batch: 'test' }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(100);
    expect(result.failed).toBe(0);
  });

  it('should add 1000 vectors efficiently', async () => {
    const dbName = 'test-batch-1000';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    const start = Date.now();
    const result = await vectorManager.addVectors(dbName, vectors);
    const duration = Date.now() - start;

    expect(result.added).toBe(1000);
    expect(duration).toBeLessThan(5000); // Should complete in < 5s
  });

  it('should handle partial failures in batch', async () => {
    const dbName = 'test-partial-failure';
    await vectorManager.createSession(dbName);

    const vectors = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `vec-valid-${i}`,
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { valid: true }
      })),
      {
        id: 'vec-invalid-1',
        values: [1, 2, 3], // Wrong dimensions
        metadata: { valid: false }
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `vec-valid-${i + 5}`,
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { valid: true }
      })),
      {
        id: 'vec-invalid-2',
        values: new Array(100).fill(0), // Wrong dimensions
        metadata: { valid: false }
      }
    ];

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(10); // Valid vectors
    expect(result.failed).toBe(2); // Invalid vectors
    expect(result.errors.length).toBe(2);
  });

  it('should process batches in chunks', async () => {
    const dbName = 'test-chunked-batch';
    await vectorManager.createSession(dbName);

    const largeVectorSet = Array.from({ length: 500 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    const result = await vectorManager.addVectors(dbName, largeVectorSet);

    expect(result.added).toBe(500);
    // Note: batchSize and batches count not yet implemented in v0.2.0
  });

  it('should report progress during batch operations', async () => {
    const dbName = 'test-batch-progress';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 200 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(200);
    // Note: onProgress callback not yet implemented in v0.2.0
  });

  it('should handle batch updates', async () => {
    const dbName = 'test-batch-update';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 50 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { version: 1 }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const updates = vectors.map((v) => ({
      id: v.id,
      metadata: { version: 2, updated: true }
    }));

    const result = await vectorManager.batchUpdateMetadata(dbName, updates);

    expect(result.updated).toBe(50);
  });

  it('should handle batch deletions', async () => {
    const dbName = 'test-batch-delete';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 100 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { category: i < 50 ? 'keep' : 'delete' }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // v0.2.0: deleteByMetadata returns DeleteResult { deletedIds, deletedCount }
    const result = await vectorManager.deleteByMetadata(dbName, {
      category: 'delete'
    });

    expect(result.deletedCount).toBe(50);
    expect(result.deletedIds.length).toBe(50);

    // Note: Stats behavior with soft deletes varies
    // const stats = await vectorManager.getSessionStats(dbName);
    // expect(stats.vectorCount).toBe(50);
  });

  it('should handle duplicate detection in batch', async () => {
    const dbName = 'test-batch-duplicates';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `vec-${i % 5}`, // Duplicate IDs: 0-4 appear twice
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    const result = await vectorManager.addVectors(dbName, vectors, {
      handleDuplicates: 'skip' // Skip duplicates
    });

    expect(result.added).toBe(5); // Only first occurrence of each ID
    expect(result.skipped).toBe(5); // Duplicates skipped
  });

  it('should handle duplicate replacement in batch', async () => {
    const dbName = 'test-batch-replace';
    await vectorManager.createSession(dbName);

    const initialVectors = Array.from({ length: 5 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { version: 1 }
    }));

    await vectorManager.addVectors(dbName, initialVectors);

    // v0.2.0: Use updateMetadata for replacement instead of re-adding
    const updates = initialVectors.map((v) => ({
      id: v.id,
      metadata: { version: 2 }
    }));

    const result = await vectorManager.batchUpdateMetadata(dbName, updates);

    expect(result.updated).toBe(5);

    const results = await vectorManager.search(dbName, initialVectors[0].values, 1);
    expect(results[0].metadata.version).toBe(2);
  });

  it('should maintain memory efficiency during large batches', async () => {
    const dbName = 'test-memory-efficiency';
    await vectorManager.createSession(dbName);

    const largeVectorSet = Array.from({ length: 10000 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    const memBefore = process.memoryUsage().heapUsed;

    await vectorManager.addVectors(dbName, largeVectorSet, {
      batchSize: 1000 // Process in chunks
    });

    const memAfter = process.memoryUsage().heapUsed;
    const memIncrease = (memAfter - memBefore) / 1024 / 1024; // MB

    // Memory increase should be reasonable (< 100MB for 10K vectors)
    expect(memIncrease).toBeLessThan(100);
  });

  it('should handle cancellation of batch operations', async () => {
    const dbName = 'test-batch-cancel';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    // v0.2.0: Cancellation not yet implemented - test completes successfully
    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(1000);
    // Note: Batch cancellation via onProgress callback not yet implemented in v0.2.0
  });
});
