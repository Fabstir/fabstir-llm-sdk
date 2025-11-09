/**
 * RAG System Regression Test Suite
 * Validates that existing functionality still works after RAG integration
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestUser,
  cleanupTestUser,
  createTestVector,
  DEFAULT_TEST_CONFIG,
  type TestUser
} from '../helpers/e2e-helpers.js';

describe('Regression: RAG System', () => {
  let testUser: TestUser;

  beforeEach(async () => {
    testUser = await createTestUser(
      'regression-test-user',
      'regression test seed phrase',
      DEFAULT_TEST_CONFIG
    );
  });

  afterEach(async () => {
    await cleanupTestUser(testUser);
  });

  describe('Session Management', () => {
    it('should create sessions without errors', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession('regression-session-1');
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });

    it('should create multiple sessions', async () => {
      const session1 = await testUser.vectorRAGManager!.createSession('reg-multi-session-1');
      const session2 = await testUser.vectorRAGManager!.createSession('reg-multi-session-2');

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1).not.toBe(session2);
    });

    it('should list all sessions', async () => {
      await testUser.vectorRAGManager!.createSession('reg-list-1');
      await testUser.vectorRAGManager!.createSession('reg-list-2');

      const sessions1 = testUser.vectorRAGManager!.listSessions('reg-list-1');
      const sessions2 = testUser.vectorRAGManager!.listSessions('reg-list-2');

      expect(sessions1.length).toBeGreaterThan(0);
      expect(sessions2.length).toBeGreaterThan(0);
    });

    it('should destroy sessions', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession('reg-destroy');

      await testUser.vectorRAGManager!.destroySession(sessionId);

      // Verify session no longer exists
      const session = testUser.vectorRAGManager!.getSession(sessionId);
      expect(session).toBeNull();
    });
  });

  describe('Vector Operations', () => {
    it('should add single vector', async () => {
      await testUser.vectorRAGManager!.createSession('reg-add-single');

      await testUser.vectorRAGManager!.addVector(
        'reg-add-single',
        'test-vec',
        createTestVector(1),
        { test: 'regression' }
      );

      const stats = testUser.vectorRAGManager!.getDatabaseStats('reg-add-single');
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(1);
    });

    it('should add multiple vectors', async () => {
      await testUser.vectorRAGManager!.createSession('reg-add-multiple');

      for (let i = 0; i < 10; i++) {
        await testUser.vectorRAGManager!.addVector(
          'reg-add-multiple',
          `vec-${i}`,
          createTestVector(i),
          { index: i }
        );
      }

      const stats = testUser.vectorRAGManager!.getDatabaseStats('reg-add-multiple');
      expect(stats!.vectorCount).toBe(10);
    });

    it('should reject vectors with wrong dimensions', async () => {
      await testUser.vectorRAGManager!.createSession('reg-wrong-dim');

      // Try to add vector with wrong dimensions (not 384)
      await expect(
        testUser.vectorRAGManager!.addVector(
          'reg-wrong-dim',
          'wrong-dim-vec',
          [1, 2, 3], // Only 3 dimensions instead of 384
          {}
        )
      ).rejects.toThrow();
    });
  });

  describe('Search Operations', () => {
    it('should search with default parameters', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession('reg-search-default');

      // Add vectors
      for (let i = 0; i < 5; i++) {
        await testUser.vectorRAGManager!.addVector(
          'reg-search-default',
          `search-vec-${i}`,
          createTestVector(i + 10),
          { index: i }
        );
      }

      // Search
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        createTestVector(12),
        5,
        { threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should respect topK parameter', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession('reg-topk');

      // Add 10 vectors
      for (let i = 0; i < 10; i++) {
        await testUser.vectorRAGManager!.addVector(
          'reg-topk',
          `topk-vec-${i}`,
          createTestVector(i + 20),
          { index: i }
        );
      }

      // Request top 3
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        createTestVector(22),
        3,
        { threshold: 0.0 }
      );

      expect(results).toHaveLength(3);
    });

    it('should filter by threshold', async () => {
      const sessionId = await testUser.vectorRAGManager!.createSession('reg-threshold');

      // Add vectors
      await testUser.vectorRAGManager!.addVector(
        'reg-threshold',
        'similar-vec',
        createTestVector(30),
        { type: 'similar' }
      );

      await testUser.vectorRAGManager!.addVector(
        'reg-threshold',
        'different-vec',
        createTestVector(100),
        { type: 'different' }
      );

      // Search with high threshold
      const results = await testUser.vectorRAGManager!.searchVectors(
        sessionId,
        createTestVector(30.1),
        10,
        { threshold: 0.8 }
      );

      // All results should meet threshold
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      }
    });
  });

  describe('Multi-Database Operations', () => {
    it('should search across multiple databases', async () => {
      // Create 2 databases
      await testUser.vectorRAGManager!.createSession('reg-multi-db-1');
      await testUser.vectorRAGManager!.createSession('reg-multi-db-2');

      // Add vectors to each
      await testUser.vectorRAGManager!.addVector(
        'reg-multi-db-1',
        'db1-vec',
        createTestVector(40),
        { db: '1' }
      );

      await testUser.vectorRAGManager!.addVector(
        'reg-multi-db-2',
        'db2-vec',
        createTestVector(41),
        { db: '2' }
      );

      // Search both
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['reg-multi-db-1', 'reg-multi-db-2'],
        createTestVector(40.5),
        { topK: 10, threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);

      // Verify source attribution
      for (const result of results) {
        expect(result.sourceDatabaseName).toBeDefined();
      }
    });

    it('should merge results correctly', async () => {
      // Create databases
      await testUser.vectorRAGManager!.createSession('reg-merge-1');
      await testUser.vectorRAGManager!.createSession('reg-merge-2');

      // Add vectors
      for (let i = 0; i < 3; i++) {
        await testUser.vectorRAGManager!.addVector(
          'reg-merge-1',
          `merge1-vec-${i}`,
          createTestVector(50 + i),
          { db: '1', index: i }
        );

        await testUser.vectorRAGManager!.addVector(
          'reg-merge-2',
          `merge2-vec-${i}`,
          createTestVector(60 + i),
          { db: '2', index: i }
        );
      }

      // Search with topK=4 (should get 2 from each if evenly distributed)
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['reg-merge-1', 'reg-merge-2'],
        createTestVector(55),
        { topK: 4, threshold: 0.0 }
      );

      expect(results.length).toBeLessThanOrEqual(4);

      // Verify results are sorted by score
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty database name', async () => {
      await expect(
        testUser.vectorRAGManager!.createSession('')
      ).rejects.toThrow('Database name cannot be empty');
    });

    it('should handle invalid vector dimensions', async () => {
      await testUser.vectorRAGManager!.createSession('reg-invalid-dim');

      await expect(
        testUser.vectorRAGManager!.addVector(
          'reg-invalid-dim',
          'invalid-vec',
          [1, 2], // Wrong dimensions
          {}
        )
      ).rejects.toThrow();
    });

    it('should handle search on non-existent database', async () => {
      const results = await testUser.vectorRAGManager!.searchMultipleDatabases(
        ['non-existent-db'],
        createTestVector(100),
        { topK: 5 }
      );

      expect(results).toEqual([]);
    });
  });

  describe('Database Statistics', () => {
    it('should return accurate statistics', async () => {
      await testUser.vectorRAGManager!.createSession('reg-stats-db');

      // Add 5 vectors
      for (let i = 0; i < 5; i++) {
        await testUser.vectorRAGManager!.addVector(
          'reg-stats-db',
          `stats-vec-${i}`,
          createTestVector(70 + i),
          { index: i }
        );
      }

      const stats = testUser.vectorRAGManager!.getDatabaseStats('reg-stats-db');
      expect(stats).not.toBeNull();
      expect(stats!.databaseName).toBe('reg-stats-db');
      expect(stats!.vectorCount).toBe(5);
    });

    it('should return null for non-existent database', async () => {
      const stats = testUser.vectorRAGManager!.getDatabaseStats('does-not-exist');
      expect(stats).toBeNull();
    });
  });
});
