/**
 * Multi-Database Search Tests
 * Tests for searching across multiple vector databases and merging results
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig, SearchOptions } from '../../src/rag/types.js';

/**
 * Helper function to create 384-dimensional test vector
 * @param seed - Seed value to generate unique but deterministic vectors
 */
function createTestVector(seed: number): number[] {
  const vector: number[] = [];
  for (let i = 0; i < 384; i++) {
    vector.push(Math.sin(seed + i * 0.1) * 0.5 + 0.5);
  }
  return vector;
}

describe('Sub-phase 9.1.1: Multi-Database Search', () => {
  let vectorRAGManager: VectorRAGManager;
  const testUserAddress = 'test-user-multi-search';
  const testSeedPhrase = 'test seed phrase for multi database search';
  const defaultConfig: RAGConfig = {
    s5Portal: 'http://localhost:5522',
    encryptAtRest: true,
    chunkSize: 10000,
    cacheSizeMb: 150
  };

  beforeEach(() => {
    vectorRAGManager = new VectorRAGManager({
      userAddress: testUserAddress,
      seedPhrase: testSeedPhrase,
      config: defaultConfig
    });
  });

  afterEach(async () => {
    // Clean up all sessions
    if (vectorRAGManager) {
      await vectorRAGManager.destroyAllSessions();
    }
  });

  describe('Single Database Search (Baseline)', () => {
    it('should search a single database and return results', async () => {
      // Create database and add vectors
      const dbName = 'baseline-db';
      const sessionId = await vectorRAGManager.createSession(dbName);

      // Add test vectors (use 'values' property as per VectorInput format)
      const testVectors = [
        { id: 'vec1', values: createTestVector(1), metadata: { content: 'Document about AI', category: 'tech' } },
        { id: 'vec2', values: createTestVector(2), metadata: { content: 'Document about ML', category: 'tech' } },
        { id: 'vec3', values: createTestVector(3), metadata: { content: 'Document about cooking', category: 'food' } }
      ];

      for (const vec of testVectors) {
        await vectorRAGManager.addVector(dbName, vec.id, vec.values, vec.metadata);
      }

      // Search with similar vector
      const queryVector = createTestVector(1.5);
      const results = await vectorRAGManager.searchVectors(
        sessionId,
        queryVector,
        2,
        { threshold: 0.0 }
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
      expect(results[0]).toHaveProperty('metadata');
    });
  });

  describe('Multi-Database Search', () => {
    it('should search across multiple databases and return merged results', async () => {
      // Create 3 databases with different content
      const db1 = await vectorRAGManager.createSession('tech-docs');
      const db2 = await vectorRAGManager.createSession('science-docs');
      const db3 = await vectorRAGManager.createSession('business-docs');

      // Add vectors to db1 (tech)
      await vectorRAGManager.addVector('tech-docs', 'tech1', createTestVector(10),
        { content: 'AI algorithms', category: 'tech', score: 0.9 });
      await vectorRAGManager.addVector('tech-docs', 'tech2', createTestVector(11),
        { content: 'Machine learning', category: 'tech', score: 0.85 });
      await vectorRAGManager.addVector('tech-docs', 'tech3', createTestVector(11.5),
        { content: 'Deep learning', category: 'tech', score: 0.88 });

      // Add vectors to db2 (science)
      await vectorRAGManager.addVector('science-docs', 'sci1', createTestVector(12),
        { content: 'Quantum physics', category: 'science', score: 0.95 });
      await vectorRAGManager.addVector('science-docs', 'sci2', createTestVector(13),
        { content: 'Molecular biology', category: 'science', score: 0.88 });
      await vectorRAGManager.addVector('science-docs', 'sci3', createTestVector(13.5),
        { content: 'Chemistry research', category: 'science', score: 0.90 });

      // Add vectors to db3 (business)
      await vectorRAGManager.addVector('business-docs', 'biz1', createTestVector(14),
        { content: 'Market analysis', category: 'business', score: 0.82 });
      await vectorRAGManager.addVector('business-docs', 'biz2', createTestVector(15),
        { content: 'Financial reports', category: 'business', score: 0.78 });
      await vectorRAGManager.addVector('business-docs', 'biz3', createTestVector(15.5),
        { content: 'Business strategy', category: 'business', score: 0.80 });

      // Query all 3 databases
      const queryVector = createTestVector(12);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['tech-docs', 'science-docs', 'business-docs'],
        queryVector,
        { topK: 4, threshold: 0.0 }
      );

      // Verify results
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(4); // topK = 4
    });

    it('should include source database attribution for each result', async () => {
      // Create 2 databases
      const db1 = await vectorRAGManager.createSession('db-alpha');
      const db2 = await vectorRAGManager.createSession('db-beta');

      // Add vectors - need at least 3 for IVF index
      await vectorRAGManager.addVector('db-alpha', 'alpha1', createTestVector(10),
        { content: 'Alpha content' });
      await vectorRAGManager.addVector('db-alpha', 'alpha2', createTestVector(10.3),
        { content: 'Alpha content 2' });
      await vectorRAGManager.addVector('db-alpha', 'alpha3', createTestVector(10.6),
        { content: 'Alpha content 3' });
      await vectorRAGManager.addVector('db-beta', 'beta1', createTestVector(12),
        { content: 'Beta content' });
      await vectorRAGManager.addVector('db-beta', 'beta2', createTestVector(12.3),
        { content: 'Beta content 2' });
      await vectorRAGManager.addVector('db-beta', 'beta3', createTestVector(12.6),
        { content: 'Beta content 3' });

      // Search
      const queryVector = createTestVector(11);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['db-alpha', 'db-beta'],
        queryVector,
        { topK: 5, threshold: 0.0 }
      );

      // Verify source attribution
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result).toHaveProperty('sourceDatabaseName');
        expect(['db-alpha', 'db-beta']).toContain(result.sourceDatabaseName);
      }
    });

    it('should merge and rank results by similarity score (descending)', async () => {
      // Create databases
      const db1 = await vectorRAGManager.createSession('ranked-db1');
      const db2 = await vectorRAGManager.createSession('ranked-db2');

      // Add vectors with known similarity patterns - need at least 3 for IVF index
      // db1: vectors that will be very similar to query
      await vectorRAGManager.addVector('ranked-db1', 'high1', createTestVector(20),
        { label: 'high-score-1' });
      await vectorRAGManager.addVector('ranked-db1', 'high2', createTestVector(20.2),
        { label: 'high-score-2' });
      await vectorRAGManager.addVector('ranked-db1', 'high3', createTestVector(20.4),
        { label: 'high-score-3' });

      // db2: vectors that will be less similar to query
      await vectorRAGManager.addVector('ranked-db2', 'low1', createTestVector(21),
        { label: 'low-score-1' });
      await vectorRAGManager.addVector('ranked-db2', 'low2', createTestVector(21.2),
        { label: 'low-score-2' });
      await vectorRAGManager.addVector('ranked-db2', 'low3', createTestVector(21.4),
        { label: 'low-score-3' });

      // Query vector similar to [1, 0, 0, 0]
      const queryVector = createTestVector(23);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['ranked-db1', 'ranked-db2'],
        queryVector,
        { topK: 10, threshold: 0.0 }
      );

      // Verify results are sorted by score (descending)
      expect(results.length).toBeGreaterThan(0);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it('should respect topK limit after merging all results', async () => {
      // Create 3 databases with 2 vectors each = 6 total vectors
      const db1 = await vectorRAGManager.createSession('limit-db1');
      const db2 = await vectorRAGManager.createSession('limit-db2');
      const db3 = await vectorRAGManager.createSession('limit-db3');

      // Add 2 vectors to each database
      for (let i = 1; i <= 2; i++) {
        await vectorRAGManager.addVector('limit-db1', `db1-vec${i}`, createTestVector(30 + i),
          { db: '1', index: i });
        await vectorRAGManager.addVector('limit-db2', `db2-vec${i}`, createTestVector(40 + i),
          { db: '2', index: i });
        await vectorRAGManager.addVector('limit-db3', `db3-vec${i}`, createTestVector(50 + i),
          { db: '3', index: i });
      }

      // Search with topK = 3 (should return 3 results from 6 total)
      const queryVector = createTestVector(12);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['limit-db1', 'limit-db2', 'limit-db3'],
        queryVector,
        { topK: 3, threshold: 0.0 }
      );

      // Verify topK limit is respected
      expect(results).toHaveLength(3);
    });

    it('should handle empty results from some databases gracefully', async () => {
      // Create 3 databases
      const db1 = await vectorRAGManager.createSession('empty-db1');
      const db2 = await vectorRAGManager.createSession('empty-db2');
      const db3 = await vectorRAGManager.createSession('populated-db');

      // Only populate db3, leave db1 and db2 empty - need at least 3 for IVF index
      await vectorRAGManager.addVector('populated-db', 'vec1', createTestVector(10),
        { content: 'Only result' });
      await vectorRAGManager.addVector('populated-db', 'vec2', createTestVector(10.3),
        { content: 'Second result' });
      await vectorRAGManager.addVector('populated-db', 'vec3', createTestVector(10.6),
        { content: 'Third result' });

      // Search all 3 (2 are empty)
      const queryVector = createTestVector(11);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['empty-db1', 'empty-db2', 'populated-db'],
        queryVector,
        { topK: 5, threshold: 0.0 }
      );

      // Should only return results from populated database
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.sourceDatabaseName === 'populated-db')).toBe(true);
    });

    it('should handle threshold filtering across multiple databases', async () => {
      // Create databases
      const db1 = await vectorRAGManager.createSession('threshold-db1');
      const db2 = await vectorRAGManager.createSession('threshold-db2');

      // Add vectors - need at least 3 for IVF index
      await vectorRAGManager.addVector('threshold-db1', 'similar1', createTestVector(23),
        { label: 'very-similar' });
      await vectorRAGManager.addVector('threshold-db1', 'similar2', createTestVector(23.2),
        { label: 'very-similar-2' });
      await vectorRAGManager.addVector('threshold-db1', 'similar3', createTestVector(23.4),
        { label: 'very-similar-3' });
      await vectorRAGManager.addVector('threshold-db2', 'different1', createTestVector(22),
        { label: 'very-different' });
      await vectorRAGManager.addVector('threshold-db2', 'different2', createTestVector(22.2),
        { label: 'very-different-2' });
      await vectorRAGManager.addVector('threshold-db2', 'different3', createTestVector(22.4),
        { label: 'very-different-3' });

      // Query with high threshold (should filter out dissimilar results)
      const queryVector = createTestVector(20);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['threshold-db1', 'threshold-db2'],
        queryVector,
        { topK: 10, threshold: 0.8 }
      );

      // All results should have score >= 0.8
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should return empty results when all databases are non-existent', async () => {
      const queryVector = createTestVector(10);

      // searchMultipleDatabases returns empty array for non-existent databases
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['db1', 'db2'],
        queryVector,
        { topK: 5 }
      );

      expect(results).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database names array', async () => {
      const queryVector = createTestVector(10);

      const results = await vectorRAGManager.searchMultipleDatabases(
        [],
        queryVector,
        { topK: 5 }
      );

      expect(results).toHaveLength(0);
    });

    it('should handle single database in multi-database search', async () => {
      // Create and populate single database - need at least 3 for IVF index
      const db = await vectorRAGManager.createSession('single-in-multi');
      await vectorRAGManager.addVector('single-in-multi', 'vec1', createTestVector(10),
        { content: 'Test' });
      await vectorRAGManager.addVector('single-in-multi', 'vec2', createTestVector(10.3),
        { content: 'Test 2' });
      await vectorRAGManager.addVector('single-in-multi', 'vec3', createTestVector(10.6),
        { content: 'Test 3' });

      // Search with single database in array
      const queryVector = createTestVector(10);
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['single-in-multi'],
        queryVector,
        { topK: 5, threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourceDatabaseName).toBe('single-in-multi');
    });

    it('should handle non-existent database names gracefully', async () => {
      const queryVector = createTestVector(10);

      // Try to search databases that don't exist
      // Returns empty array (search errors are caught)
      const results = await vectorRAGManager.searchMultipleDatabases(
        ['non-existent-1', 'non-existent-2'],
        queryVector,
        { topK: 5 }
      );

      expect(results).toEqual([]);
    });
  });
});
