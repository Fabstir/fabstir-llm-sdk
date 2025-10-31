/**
 * Basic Vector Search Tests
 * Tests core search functionality with similarity scoring
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Basic Vector Search', () => {
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

  it('should search and return top-k results', async () => {
    const dbName = 'test-search-topk';
    await vectorManager.createSession(dbName);

    // Add 10 vectors with known embeddings
    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i, text: `Document ${i}` }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Search with query
    const query = vectors[0].values; // Should match doc-0 best
    const results = await vectorManager.search(dbName, query, 5);

    expect(results.length).toBeLessThanOrEqual(5);
    expect(results[0].id).toBe('doc-0'); // Best match
    expect(results[0].score).toBeGreaterThan(0.9); // High similarity
  });

  it('should respect topK parameter', async () => {
    const dbName = 'test-topk-limit';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 20 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Test different topK values
    const query = vectors[0].values;

    const results3 = await vectorManager.search(dbName, query, 3);
    expect(results3.length).toBe(3);

    const results10 = await vectorManager.search(dbName, query, 10);
    expect(results10.length).toBe(10);

    const results100 = await vectorManager.search(dbName, query, 100);
    expect(results100.length).toBe(20); // Can't exceed total vectors
  });

  it('should apply similarity threshold', async () => {
    const dbName = 'test-threshold';
    await vectorManager.createSession(dbName);

    // Create vectors with varying similarity to query
    const baseVector = new Array(384).fill(0).map(() => Math.random());
    const vectors = [
      { id: 'exact', values: baseVector, metadata: { type: 'exact' } },
      { id: 'similar', values: baseVector.map(v => v * 0.95), metadata: { type: 'similar' } },
      { id: 'different', values: new Array(384).fill(0).map(() => Math.random()), metadata: { type: 'different' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    // Search with high threshold (0.9) - should only get exact and similar
    const resultsHigh = await vectorManager.search(dbName, baseVector, 10, {
      threshold: 0.9
    });

    expect(resultsHigh.length).toBeLessThanOrEqual(2);
    expect(resultsHigh.every((r: any) => r.score >= 0.9)).toBe(true);

    // Search with low threshold (0.5) - should get all
    const resultsLow = await vectorManager.search(dbName, baseVector, 10, {
      threshold: 0.5
    });

    expect(resultsLow.length).toBe(3);
  });

  it('should include vectors in results when requested', async () => {
    const dbName = 'test-include-vectors';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 5 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Search without vectors
    const resultsWithout = await vectorManager.search(dbName, vectors[0].values, 3, {
      includeVectors: false
    });

    expect(resultsWithout[0].vector).toBeUndefined();

    // Search with vectors
    const resultsWith = await vectorManager.search(dbName, vectors[0].values, 3, {
      includeVectors: true
    });

    expect(resultsWith[0].vector).toBeDefined();
    expect(resultsWith[0].vector.length).toBe(384);
  });

  it('should return results sorted by similarity score', async () => {
    const dbName = 'test-sorting';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, vectors[0].values, 10);

    // Verify descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should handle empty database', async () => {
    const dbName = 'test-empty';
    await vectorManager.createSession(dbName);

    const query = new Array(384).fill(0).map(() => Math.random());
    const results = await vectorManager.search(dbName, query, 10);

    expect(results.length).toBe(0);
  });

  it('should handle query dimension mismatch', async () => {
    const dbName = 'test-dimension-mismatch';
    await vectorManager.createSession(dbName);

    // Need minimum 3 vectors for IVF
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Query with wrong dimensions
    const wrongQuery = new Array(512).fill(0).map(() => Math.random());

    await expect(
      vectorManager.search(dbName, wrongQuery, 10)
    ).rejects.toThrow();
  });

  it('should return all metadata fields', async () => {
    const dbName = 'test-metadata-return';
    await vectorManager.createSession(dbName);

    // Need minimum 3 vectors for IVF
    const baseMetadata = {
      title: 'Test Document',
      author: 'Test Author',
      date: '2025-01-31',
      tags: ['test', 'demo'],
      score: 0.95,
      nested: { foo: 'bar' }
    };

    const vectors = [
      { id: 'doc-1', values: new Array(384).fill(0).map(() => Math.random()), metadata: baseMetadata },
      { id: 'doc-2', values: new Array(384).fill(0).map(() => Math.random()), metadata: { ...baseMetadata, title: 'Doc 2' } },
      { id: 'doc-3', values: new Array(384).fill(0).map(() => Math.random()), metadata: { ...baseMetadata, title: 'Doc 3' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, vectors[0].values, 1);

    expect(results[0].metadata.title).toBe('Test Document');
    expect(results[0].metadata.author).toBe('Test Author');
    expect(results[0].metadata.tags).toEqual(['test', 'demo']);
    expect(results[0].metadata.nested).toEqual({ foo: 'bar' });
  });

  it('should handle soft-deleted vectors', async () => {
    const dbName = 'test-soft-delete-search';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 5 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i, status: i < 2 ? 'delete' : 'keep' }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Delete some vectors
    await vectorManager.deleteByMetadata(dbName, { status: 'delete' });

    // Search should not return deleted vectors
    const results = await vectorManager.search(dbName, vectors[0].values, 10);

    expect(results.length).toBe(3);
    expect(results.every((r: any) => r.metadata.status === 'keep')).toBe(true);
  });

  it('should handle large result sets efficiently', async () => {
    const dbName = 'test-large-results';
    await vectorManager.createSession(dbName);

    // Add 1000 vectors
    const vectors = Array.from({ length: 1000 }, (_, i) => ({
      id: `doc-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Search for top 100
    const start = Date.now();
    const results = await vectorManager.search(dbName, vectors[0].values, 100);
    const duration = Date.now() - start;

    expect(results.length).toBe(100);
    expect(duration).toBeLessThan(500); // Should complete in < 500ms
  });

  it('should support pagination via topK offset pattern', async () => {
    const dbName = 'test-pagination';
    await vectorManager.createSession(dbName);

    const baseVector = new Array(384).fill(0).map(() => Math.random());
    const vectors = Array.from({ length: 50 }, (_, i) => ({
      id: `doc-${i}`,
      values: baseVector.map(v => v + (i * 0.001)), // Slight variations
      metadata: { index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Get page 1 (top 10)
    const page1 = await vectorManager.search(dbName, baseVector, 10);
    expect(page1.length).toBe(10);

    // Get page 2 (next 10) - Note: true pagination would need offset support
    // For now, just verify we can get different sized result sets
    const page2 = await vectorManager.search(dbName, baseVector, 20);
    expect(page2.length).toBe(20);
  });
});
