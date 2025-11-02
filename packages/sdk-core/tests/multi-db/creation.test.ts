/**
 * Multi-Database Creation Tests
 * Tests for creating and managing multiple vector databases
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig } from '../../src/rag/types.js';

describe('Multi-Database Creation', () => {
  let vectorRAGManager: VectorRAGManager;
  const testUserAddress = 'test-user-123';
  const testSeedPhrase = 'test seed phrase for vector rag manager';
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

  describe('Database Creation', () => {
    it('should create a single database', async () => {
      const sessionId = await vectorRAGManager.createSession('my-docs');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should create multiple databases with different names', async () => {
      const session1 = await vectorRAGManager.createSession('project-a');
      const session2 = await vectorRAGManager.createSession('project-b');
      const session3 = await vectorRAGManager.createSession('project-c');

      expect(session1).not.toBe(session2);
      expect(session2).not.toBe(session3);
      expect(session1).not.toBe(session3);
    });

    it('should create 10+ databases successfully', async () => {
      const databases: string[] = [];

      for (let i = 0; i < 12; i++) {
        const sessionId = await vectorRAGManager.createSession(`database-${i}`);
        databases.push(sessionId);
      }

      expect(databases).toHaveLength(12);
      // Verify all unique
      const uniqueDatabases = new Set(databases);
      expect(uniqueDatabases.size).toBe(12);
    });

    it('should handle special characters in database names', async () => {
      const validNames = [
        'my-project',
        'project_2024',
        'client.docs',
        'research-2024-Q1'
      ];

      for (const name of validNames) {
        const sessionId = await vectorRAGManager.createSession(name);
        expect(sessionId).toBeDefined();
      }
    });

    it('should reject empty database names', async () => {
      await expect(
        vectorRAGManager.createSession('')
      ).rejects.toThrow('Database name cannot be empty');
    });

    it('should reject whitespace-only database names', async () => {
      await expect(
        vectorRAGManager.createSession('   ')
      ).rejects.toThrow('Database name cannot be empty');
    });

    it('should allow creating database with same name after deletion', async () => {
      const dbName = 'reusable-db';

      // Create first time
      const session1 = await vectorRAGManager.createSession(dbName);
      expect(session1).toBeDefined();

      // Delete
      await vectorRAGManager.destroySessionsByDatabase(dbName);

      // Create again with same name
      const session2 = await vectorRAGManager.createSession(dbName);
      expect(session2).toBeDefined();
      expect(session2).not.toBe(session1); // Should be new session
    });
  });

  describe('Database Metadata Initialization', () => {
    it('should initialize metadata when creating database', async () => {
      const beforeCreate = Date.now();
      const sessionId = await vectorRAGManager.createSession('test-metadata');
      const afterCreate = Date.now();

      const metadata = vectorRAGManager.getDatabaseMetadata('test-metadata');

      expect(metadata).toBeDefined();
      expect(metadata!.databaseName).toBe('test-metadata');
      expect(metadata!.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(metadata!.createdAt).toBeLessThanOrEqual(afterCreate);
      expect(metadata!.lastAccessedAt).toBe(metadata!.createdAt);
      expect(metadata!.owner).toBe(testUserAddress);
    });

    it('should initialize vector count to 0', async () => {
      await vectorRAGManager.createSession('empty-db');

      const metadata = vectorRAGManager.getDatabaseMetadata('empty-db');
      expect(metadata!.vectorCount).toBe(0);
    });

    it('should initialize storage size to 0', async () => {
      await vectorRAGManager.createSession('empty-db');

      const metadata = vectorRAGManager.getDatabaseMetadata('empty-db');
      expect(metadata!.storageSizeBytes).toBe(0);
    });

    it('should allow optional description', async () => {
      await vectorRAGManager.createSession('documented-db');

      // Initially no description
      let metadata = vectorRAGManager.getDatabaseMetadata('documented-db');
      expect(metadata!.description).toBeUndefined();

      // Update with description
      vectorRAGManager.updateDatabaseMetadata('documented-db', {
        description: 'My project documentation'
      });

      metadata = vectorRAGManager.getDatabaseMetadata('documented-db');
      expect(metadata!.description).toBe('My project documentation');
    });

    it('should track metadata for multiple databases', async () => {
      await vectorRAGManager.createSession('db-1');
      await vectorRAGManager.createSession('db-2');
      await vectorRAGManager.createSession('db-3');

      const meta1 = vectorRAGManager.getDatabaseMetadata('db-1');
      const meta2 = vectorRAGManager.getDatabaseMetadata('db-2');
      const meta3 = vectorRAGManager.getDatabaseMetadata('db-3');

      expect(meta1).toBeDefined();
      expect(meta2).toBeDefined();
      expect(meta3).toBeDefined();

      expect(meta1!.databaseName).toBe('db-1');
      expect(meta2!.databaseName).toBe('db-2');
      expect(meta3!.databaseName).toBe('db-3');
    });
  });

  describe('Database Isolation', () => {
    it('should create isolated databases', async () => {
      const session1 = await vectorRAGManager.createSession('isolated-1');
      const session2 = await vectorRAGManager.createSession('isolated-2');

      // Sessions should be different
      expect(session1).not.toBe(session2);

      // Metadata should be separate
      const meta1 = vectorRAGManager.getDatabaseMetadata('isolated-1');
      const meta2 = vectorRAGManager.getDatabaseMetadata('isolated-2');

      expect(meta1!.databaseName).toBe('isolated-1');
      expect(meta2!.databaseName).toBe('isolated-2');
    });

    it('should not affect other databases when one is deleted', async () => {
      await vectorRAGManager.createSession('db-keep');
      await vectorRAGManager.createSession('db-delete');

      // Delete one database
      await vectorRAGManager.deleteDatabase('db-delete');

      // Other database should still exist
      const metaKeep = vectorRAGManager.getDatabaseMetadata('db-keep');
      const metaDelete = vectorRAGManager.getDatabaseMetadata('db-delete');

      expect(metaKeep).toBeDefined();
      expect(metaDelete).toBeNull();
    });
  });

  describe('Database Naming', () => {
    it('should handle long database names', async () => {
      const longName = 'a'.repeat(100);
      const sessionId = await vectorRAGManager.createSession(longName);

      expect(sessionId).toBeDefined();

      const metadata = vectorRAGManager.getDatabaseMetadata(longName);
      expect(metadata!.databaseName).toBe(longName);
    });

    it('should handle database names with numbers', async () => {
      const name = 'project2024v2';
      const sessionId = await vectorRAGManager.createSession(name);

      expect(sessionId).toBeDefined();
    });

    it('should handle database names with underscores and hyphens', async () => {
      const name = 'my_project-docs_v1';
      const sessionId = await vectorRAGManager.createSession(name);

      expect(sessionId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent database metadata', () => {
      const metadata = vectorRAGManager.getDatabaseMetadata('non-existent');
      expect(metadata).toBeNull();
    });

    it('should handle concurrent database creation', async () => {
      const promises = Array(5).fill(null).map((_, i) =>
        vectorRAGManager.createSession(`concurrent-${i}`)
      );

      const sessions = await Promise.all(promises);

      expect(sessions).toHaveLength(5);
      // All should be unique
      const uniqueSessions = new Set(sessions);
      expect(uniqueSessions.size).toBe(5);
    });
  });
});
