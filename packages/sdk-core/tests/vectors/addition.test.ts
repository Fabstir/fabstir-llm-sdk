/**
 * Vector Addition Tests
 * Tests adding vectors with metadata to vector databases
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Vector Addition', () => {
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

    expect(testUserAddress).toBeDefined();
    expect(testSeedPhrase).toBeDefined();

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

  it('should add vectors with metadata', async () => {
    const dbName = 'test-add-vectors';
    await vectorManager.createSession(dbName);

    // Use 3 vectors minimum for IVF index training
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {
        text: `Sample text ${i}`,
        source: 'test',
        timestamp: Date.now()
      }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result).toBeDefined();
    expect(result.added).toBe(3);
    expect(result.failed).toBe(0);
  });

  it('should add multiple vectors at once', async () => {
    const dbName = 'test-add-multiple';
    await vectorManager.createSession(dbName);

    const vectors = Array.from({ length: 5 }, (_, i) => ({
      id: `vec-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {
        text: `Text ${i}`,
        index: i
      }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(5);
    expect(result.failed).toBe(0);
  });

  it('should validate vector dimensions', async () => {
    const dbName = 'test-validate-dims';
    await vectorManager.createSession(dbName);

    const invalidVector = {
      id: 'vec-invalid',
      values: [1, 2, 3], // Wrong dimensions (not 384)
      metadata: { text: 'Invalid' }
    };

    await expect(
      vectorManager.addVectors(dbName, [invalidVector])
    ).rejects.toThrow('Invalid vector dimensions');
  });

  it('should require vector ID', async () => {
    const dbName = 'test-require-id';
    await vectorManager.createSession(dbName);

    const vectorNoId = {
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { text: 'No ID' }
    };

    await expect(
      vectorManager.addVectors(dbName, [vectorNoId as any])
    ).rejects.toThrow('Vector ID is required');
  });

  it('should require vector values', async () => {
    const dbName = 'test-require-values';
    await vectorManager.createSession(dbName);

    const vectorNoValues = {
      id: 'vec-no-values',
      metadata: { text: 'No values' }
    };

    await expect(
      vectorManager.addVectors(dbName, [vectorNoValues as any])
    ).rejects.toThrow('Vector values are required');
  });

  it('should handle empty metadata', async () => {
    const dbName = 'test-empty-metadata';
    await vectorManager.createSession(dbName);

    // Use 3 vectors minimum
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-no-meta-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {}
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(3);
  });

  it('should reject invalid metadata types', async () => {
    const dbName = 'test-invalid-metadata';
    await vectorManager.createSession(dbName);

    const vector = {
      id: 'vec-bad-meta',
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: 'not an object' as any
    };

    await expect(
      vectorManager.addVectors(dbName, [vector])
    ).rejects.toThrow('Metadata must be an object');
  });

  it('should handle metadata with various types', async () => {
    const dbName = 'test-metadata-types';
    await vectorManager.createSession(dbName);

    // Use 3 vectors with different metadata types
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-mixed-meta-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {
        text: `String value ${i}`,
        count: 42 + i,
        active: i % 2 === 0,
        tags: ['tag1', 'tag2'],
        nested: { key: `value-${i}` },
        timestamp: Date.now()
      }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(3);
  });

  it('should fail with non-existent database', async () => {
    const vector = {
      id: 'vec-1',
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { text: 'Test' }
    };

    await expect(
      vectorManager.addVectors('non-existent-db', [vector])
    ).rejects.toThrow('Session not found');
  });

  it('should handle empty vector array', async () => {
    const dbName = 'test-empty-array';
    await vectorManager.createSession(dbName);

    const result = await vectorManager.addVectors(dbName, []);

    expect(result.added).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should return details of failed vectors', async () => {
    const dbName = 'test-failed-details';
    await vectorManager.createSession(dbName);

    // Use 3 valid vectors + 2 invalid vectors
    const vectors = [
      {
        id: 'vec-valid-1',
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { text: 'Valid 1' }
      },
      {
        id: 'vec-valid-2',
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { text: 'Valid 2' }
      },
      {
        id: 'vec-valid-3',
        values: new Array(384).fill(0).map(() => Math.random()),
        metadata: { text: 'Valid 3' }
      },
      {
        id: 'vec-invalid-1',
        values: [1, 2, 3], // Invalid dimensions
        metadata: { text: 'Invalid 1' }
      },
      {
        id: 'vec-invalid-2',
        values: new Array(100).fill(0), // Wrong dimensions
        metadata: { text: 'Invalid 2' }
      }
    ];

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBe(2);
    expect(result.errors[0].id).toBe('vec-invalid-1');
    expect(result.errors[0].error).toContain('dimension');
  });

  it('should persist vectors to storage', async () => {
    const dbName = 'test-persistence';
    await vectorManager.createSession(dbName);

    // Use 3 vectors minimum
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-persist-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: { text: `Persistent ${i}` }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    // Verify all vectors were added successfully
    expect(result.added).toBe(3);
    expect(result.failed).toBe(0);

    // Session should be retrievable
    const stats = await vectorManager.getSessionStats(dbName);
    expect(stats).toBeDefined();
  });

  it('should handle large metadata values', async () => {
    const dbName = 'test-large-metadata';
    await vectorManager.createSession(dbName);

    const largeText = 'A'.repeat(10000); // 10KB text
    // Use 3 vectors minimum
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-large-meta-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {
        text: largeText,
        source: `test-${i}`
      }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(3);
  });

  it('should preserve metadata exactly as provided', async () => {
    const dbName = 'test-preserve-metadata';
    await vectorManager.createSession(dbName);

    const metadata = {
      text: 'Test text',
      score: 0.95,
      tags: ['a', 'b'],
      nested: { x: 1, y: 2 }
    };

    // Use 3 vectors minimum, but check first one
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-preserve-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: i === 0 ? metadata : { text: `Other ${i}` }
    }));

    await vectorManager.addVectors(dbName, vectors);

    // Search to retrieve and verify metadata of first vector
    const results = await vectorManager.search(dbName, vectors[0].values, 1);
    expect(results[0].metadata.text).toBe(metadata.text);
    expect(results[0].metadata.score).toBe(metadata.score);
  });

  it('should handle special characters in metadata', async () => {
    const dbName = 'test-special-chars';
    await vectorManager.createSession(dbName);

    // Use 3 vectors minimum
    const vectors = Array.from({ length: 3 }, (_, i) => ({
      id: `vec-special-${i}`,
      values: new Array(384).fill(0).map(() => Math.random()),
      metadata: {
        text: `Special chars ${i}: <>&"\'\n\t`,
        emoji: '🚀✨',
        unicode: 'こんにちは'
      }
    }));

    const result = await vectorManager.addVectors(dbName, vectors);

    expect(result.added).toBe(3);
  });
});
