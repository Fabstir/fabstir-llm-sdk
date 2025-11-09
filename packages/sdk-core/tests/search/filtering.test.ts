/**
 * Vector Search Filtering Tests
 * Tests MongoDB-style metadata filtering in search
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Vector Search Filtering', () => {
  let VectorRAGManager: any;
  let vectorManager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;
  let baseEmbedding: number[];

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

    // Use same embedding for all vectors so they match in searches
    baseEmbedding = new Array(384).fill(0).map(() => Math.random());
  });

  afterEach(async () => {
    if (vectorManager) {
      await vectorManager.cleanup();
    }
  });

  it('should filter by single field (shorthand)', async () => {
    const dbName = 'test-filter-single';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { category: 'tech', year: 2023 } },
      { id: 'doc-2', values: baseEmbedding, metadata: { category: 'science', year: 2023 } },
      { id: 'doc-3', values: baseEmbedding, metadata: { category: 'tech', year: 2024 } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { category: 'tech' }
    });

    expect(results.length).toBe(2);
    expect(results.every((r: any) => r.metadata.category === 'tech')).toBe(true);
  });

  it('should filter with $eq operator (shorthand)', async () => {
    const dbName = 'test-filter-eq';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { status: 'published' } },
      { id: 'doc-2', values: baseEmbedding, metadata: { status: 'draft' } },
      { id: 'doc-3', values: baseEmbedding, metadata: { status: 'published' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    // Use shorthand format (not nested $eq)
    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { status: 'published' }
    });

    expect(results.length).toBe(2);
    expect(results.every((r: any) => r.metadata.status === 'published')).toBe(true);
  });

  it('should filter with $in operator', async () => {
    const dbName = 'test-filter-in';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { tag: 'urgent' } },
      { id: 'doc-2', values: baseEmbedding, metadata: { tag: 'normal' } },
      { id: 'doc-3', values: baseEmbedding, metadata: { tag: 'low' } },
      { id: 'doc-4', values: baseEmbedding, metadata: { tag: 'urgent' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { tag: { $in: ['urgent', 'low'] } }
    });

    expect(results.length).toBe(3);
    expect(results.every((r: any) => ['urgent', 'low'].includes(r.metadata.tag))).toBe(true);
  });

  it('should filter with $gt and $lt operators', async () => {
    // Testing $gt and $lt (strictly greater/less than - EXCLUSIVE boundaries)
    const dbName = 'test-filter-range';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: baseEmbedding,
      metadata: { score: i * 10 }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Get scores greater than 40 (field-first syntax)
    const resultsGt = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { score: { $gt: 40 } }
    });

    expect(resultsGt.length).toBe(5); // 50, 60, 70, 80, 90
    expect(resultsGt.every((r: any) => r.metadata.score > 40)).toBe(true);

    // Get scores less than 30 (field-first syntax)
    const resultsLt = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { score: { $lt: 30 } }
    });

    expect(resultsLt.length).toBe(3); // 0, 10, 20
    expect(resultsLt.every((r: any) => r.metadata.score < 30)).toBe(true);
  });

  it('should filter with $gte and $lte operators', async () => {
    const dbName = 'test-filter-range-eq';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: baseEmbedding,
      metadata: { value: i * 10 }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Get values 30 to 70 inclusive
    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: {
        $and: [
          { value: { $gte: 30 } },
          { value: { $lte: 70 } }
        ]
      }
    });

    expect(results.length).toBe(5); // 30, 40, 50, 60, 70
    expect(results.every((r: any) => r.metadata.value >= 30 && r.metadata.value <= 70)).toBe(true);
  });

  it('should filter with $and combinator', async () => {
    const dbName = 'test-filter-and';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { category: 'tech', year: 2023, active: true } },
      { id: 'doc-2', values: baseEmbedding, metadata: { category: 'tech', year: 2024, active: true } },
      { id: 'doc-3', values: baseEmbedding, metadata: { category: 'science', year: 2023, active: true } },
      { id: 'doc-4', values: baseEmbedding, metadata: { category: 'tech', year: 2023, active: false } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: {
        $and: [
          { category: 'tech' },
          { year: 2023 },
          { active: true }
        ]
      }
    });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc-1');
  });

  it('should filter with $or combinator', async () => {
    const dbName = 'test-filter-or';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { priority: 'high' } },
      { id: 'doc-2', values: baseEmbedding, metadata: { priority: 'medium' } },
      { id: 'doc-3', values: baseEmbedding, metadata: { priority: 'low' } },
      { id: 'doc-4', values: baseEmbedding, metadata: { priority: 'high' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: {
        $or: [
          { priority: 'high' },
          { priority: 'low' }
        ]
      }
    });

    expect(results.length).toBe(3);
    expect(results.every((r: any) => ['high', 'low'].includes(r.metadata.priority))).toBe(true);
  });

  it('should filter with nested $and and $or using $gt', async () => {
    // Testing nested combinators with $gt operator (field-first syntax)
    const dbName = 'test-filter-nested';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 10 }, (_, i) => ({
      id: `doc-${i}`,
      values: baseEmbedding,
      metadata: {
        category: i % 2 === 0 ? 'even' : 'odd',
        value: i,
        active: i < 5
      }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Get even docs OR (odd docs with value > 7)
    // Use field-first syntax for $gt inside $and
    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: {
        $or: [
          { category: 'even' },
          {
            $and: [
              { category: 'odd' },
              { value: { $gt: 7 } }
            ]
          }
        ]
      }
    });

    // Should match: 0,2,4,6,8 (even) + 9 (odd and >7) = 6 results
    expect(results.length).toBe(6);
  });

  it('should combine filter with threshold', async () => {
    const dbName = 'test-filter-threshold';
    await vectorManager.createSession(dbName);

    const exactVector = new Array(384).fill(0).map(() => Math.random());
    const vectors = [
      { id: 'doc-1', values: exactVector, metadata: { type: 'A' } },
      { id: 'doc-2', values: exactVector.map(v => v * 0.95), metadata: { type: 'A' } },
      { id: 'doc-3', values: exactVector.map(v => v * 0.8), metadata: { type: 'A' } },
      { id: 'doc-4', values: exactVector, metadata: { type: 'B' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    // Filter for type A + high similarity
    const results = await vectorManager.search(dbName, exactVector, 10, {
      filter: { type: 'A' },
      threshold: 0.9
    });

    expect(results.length).toBeLessThanOrEqual(2); // Only high similarity type A
    expect(results.every((r: any) => r.metadata.type === 'A' && r.score >= 0.9)).toBe(true);
  });

  it('should return empty results when filter matches nothing', async () => {
    const dbName = 'test-filter-no-match';
    await vectorManager.createSession(dbName);

    // Need minimum 3 vectors for IVF
    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { category: 'tech' } },
      { id: 'doc-2', values: baseEmbedding, metadata: { category: 'science' } },
      { id: 'doc-3', values: baseEmbedding, metadata: { category: 'tech' } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { category: 'history' }
    });

    expect(results.length).toBe(0);
  });

  it('should filter on boolean fields', async () => {
    const dbName = 'test-filter-boolean';
    await vectorManager.createSession(dbName);

    const vectors = [
      { id: 'doc-1', values: baseEmbedding, metadata: { verified: true } },
      { id: 'doc-2', values: baseEmbedding, metadata: { verified: false } },
      { id: 'doc-3', values: baseEmbedding, metadata: { verified: true } }
    ];

    await vectorManager.addVectors(dbName, vectors);

    const results = await vectorManager.search(dbName, baseEmbedding, 10, {
      filter: { verified: true }
    });

    expect(results.length).toBe(2);
    expect(results.every((r: any) => r.metadata.verified === true)).toBe(true);
  });

  it('should respect topK with filters', async () => {
    const dbName = 'test-filter-topk';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 20 }, (_, i) => ({
      id: `doc-${i}`,
      values: baseEmbedding,
      metadata: { category: 'test', index: i }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // All 20 match filter, but only get top 5
    const results = await vectorManager.search(dbName, baseEmbedding, 5, {
      filter: { category: 'test' }
    });

    expect(results.length).toBe(5);
  });
});
