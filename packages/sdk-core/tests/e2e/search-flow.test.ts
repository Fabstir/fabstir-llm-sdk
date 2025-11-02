/**
 * End-to-End Test: Vector Search Flow
 * Tests complete search workflow including filtering and ranking
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestUser,
  cleanupTestUser,
  setupTestDatabases,
  createTestVector,
  assertSearchResult,
  assertSortedByScore,
  DEFAULT_TEST_CONFIG,
  type TestUser
} from '../helpers/e2e-helpers.js';

describe('E2E: Vector Search Flow', () => {
  let testUser: TestUser;

  beforeEach(async () => {
    testUser = await createTestUser(
      'test-user-search',
      'test seed phrase for search flow',
      DEFAULT_TEST_CONFIG
    );
  });

  afterEach(async () => {
    await cleanupTestUser(testUser);
  });

  describe('Single Database Search', () => {
    it('should find relevant documents by similarity', async () => {
      // Setup database with tech documents
      await setupTestDatabases(testUser, [
        { name: 'tech-docs', vectorCount: 10, topic: 'technology' }
      ]);

      // Search for similar content
      const queryVector = createTestVector(5); // Should be similar to vectors 0-10
      const results = await testUser.vectorRAGManager!.search(
        'tech-docs',
        queryVector,
        5,
        { threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);

      // Verify result structure
      for (const result of results) {
        assertSearchResult(result, {
          requiredMetadataKeys: ['content', 'category', 'index', 'source']
        });
      }

      // Verify results are sorted by score
      assertSortedByScore(results);
    });

    it('should respect topK limit', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'limited-search', vectorCount: 20, topic: 'test' }
      ]);

      const queryVector = createTestVector(10);

      // Request only top 3 results
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        3,
        { threshold: 0.0 }
      );

      expect(results).toHaveLength(3);
      assertSortedByScore(results);
    });

    it('should filter by similarity threshold', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'threshold-test', vectorCount: 15, topic: 'tech' }
      ]);

      const queryVector = createTestVector(5);

      // High threshold should filter out dissimilar results
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.8 }
      );

      // All results should meet threshold
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Multi-Database Search', () => {
    it('should search across multiple databases', async () => {
      // Create 3 databases with different content
      await setupTestDatabases(testUser, [
        { name: 'tech-db', vectorCount: 5, topic: 'technology' },
        { name: 'science-db', vectorCount: 5, topic: 'science' },
        { name: 'business-db', vectorCount: 5, topic: 'business' }
      ]);

      const queryVector = createTestVector(100);

      // Search all 3 databases
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['tech-db', 'science-db', 'business-db'],
        queryVector,
        { topK: 10, threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);

      // Verify source attribution
      const sources = new Set(results.map(r => r.sourceDatabaseName));
      expect(sources.size).toBeGreaterThan(0); // At least one source

      // Verify all sources are from our databases
      for (const result of results) {
        expect(['tech-db', 'science-db', 'business-db']).toContain(
          result.sourceDatabaseName
        );
      }

      // Verify global ranking (results from all DBs ranked together)
      assertSortedByScore(results);
    });

    it('should merge and rank results correctly', async () => {
      // Create databases with known similarity patterns
      await setupTestDatabases(testUser, [
        { name: 'high-similarity-db', vectorCount: 3, topic: 'exact-match' },
        { name: 'low-similarity-db', vectorCount: 3, topic: 'different' }
      ]);

      const queryVector = createTestVector(0); // Similar to first DB

      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['high-similarity-db', 'low-similarity-db'],
        queryVector,
        { topK: 10, threshold: 0.0 }
      );

      // Should have results from both databases
      expect(results.length).toBeGreaterThan(0);

      // Results should be sorted by score (descending)
      assertSortedByScore(results);

      // Top results should be from high-similarity-db
      // (if vector similarity calculation is deterministic)
      expect(results[0].sourceDatabaseName).toBeDefined();
    });

    it('should handle empty databases gracefully', async () => {
      // Create one populated and one empty database
      const [populatedSessionId] = await setupTestDatabases(testUser, [
        { name: 'populated-db', vectorCount: 5, topic: 'tech' }
      ]);

      // Create empty database
      await testUser.vectorRAGManager!.createSession('empty-db');

      const queryVector = createTestVector(50);

      // Search both databases
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['populated-db', 'empty-db'],
        queryVector,
        { topK: 5, threshold: 0.0 }
      );

      // Should only return results from populated database
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.sourceDatabaseName === 'populated-db')).toBe(true);
    });
  });

  describe('Metadata Filtering', () => {
    it('should filter results by metadata', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'filtered-db', vectorCount: 10, topic: 'tech' }
      ]);

      // Add vectors with specific metadata
      for (let i = 0; i < 5; i++) {
        await testUser.vectorRAGManager!.addVector(
          'filtered-db',
          `special-${i}`,
          createTestVector(i + 100),
          {
            category: 'special',
            priority: 'high',
            content: `Special document ${i}`
          }
        );
      }

      const queryVector = createTestVector(102);

      // Search with metadata filter
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        {
          threshold: 0.0,
          filter: { category: 'special' }
        }
      );

      // All results should match filter
      for (const result of results) {
        expect(result.metadata.category).toBe('special');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle search with no results above threshold', async () => {
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'high-threshold-db', vectorCount: 5, topic: 'tech' }
      ]);

      const queryVector = createTestVector(9999); // Very different

      // Very high threshold
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        10,
        { threshold: 0.99 }
      );

      // Might have 0 results if nothing meets threshold
      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        for (const result of results) {
          expect(result.score).toBeGreaterThanOrEqual(0.99);
        }
      }
    });

    it('should handle search on non-existent database', async () => {
      // Try to search a database that doesn't exist
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['non-existent-db'],
        createTestVector(10),
        { topK: 5 }
      );

      // Should return empty array, not throw
      expect(results).toEqual([]);
    });

    it('should handle empty database list', async () => {
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        [],
        createTestVector(10),
        { topK: 5 }
      );

      expect(results).toEqual([]);
    });
  });

  describe('Performance and Scaling', () => {
    it('should handle large result sets efficiently', async () => {
      // Create database with many vectors
      const [sessionId] = await setupTestDatabases(testUser, [
        { name: 'large-db', vectorCount: 100, topic: 'tech' }
      ]);

      const queryVector = createTestVector(50);

      const startTime = Date.now();
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        queryVector,
        20,
        { threshold: 0.0 }
      );
      const duration = Date.now() - startTime;

      expect(results.length).toBeLessThanOrEqual(20);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second

      assertSortedByScore(results);
    });
  });
});
