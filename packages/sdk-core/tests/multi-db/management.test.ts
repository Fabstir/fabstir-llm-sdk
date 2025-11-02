/**
 * Multi-Database Management Tests
 * Tests for listing and managing multiple vector databases
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig } from '../../src/rag/types.js';

describe('Multi-Database Management', () => {
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
    await vectorRAGManager.destroyAllSessions();
  });

  describe('Database Listing', () => {
    it('should return empty list when no databases exist', () => {
      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(0);
    });

    it('should list single database', async () => {
      await vectorRAGManager.createSession('my-db');

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(1);
      expect(databases[0].databaseName).toBe('my-db');
    });

    it('should list multiple databases', async () => {
      await vectorRAGManager.createSession('db-1');
      await vectorRAGManager.createSession('db-2');
      await vectorRAGManager.createSession('db-3');

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(3);

      const names = databases.map(db => db.databaseName).sort();
      expect(names).toEqual(['db-1', 'db-2', 'db-3']);
    });

    it('should list 10+ databases', async () => {
      for (let i = 0; i < 12; i++) {
        await vectorRAGManager.createSession(`db-${i}`);
      }

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(12);
    });

    it('should include metadata for each database', async () => {
      await vectorRAGManager.createSession('test-db');

      const databases = vectorRAGManager.listDatabases();
      const db = databases[0];

      expect(db).toHaveProperty('databaseName');
      expect(db).toHaveProperty('createdAt');
      expect(db).toHaveProperty('lastAccessedAt');
      expect(db).toHaveProperty('vectorCount');
      expect(db).toHaveProperty('storageSizeBytes');
      expect(db).toHaveProperty('owner');
    });

    it('should return databases sorted by creation time (newest first)', async () => {
      await vectorRAGManager.createSession('db-old');
      await new Promise(resolve => setTimeout(resolve, 10));
      await vectorRAGManager.createSession('db-mid');
      await new Promise(resolve => setTimeout(resolve, 10));
      await vectorRAGManager.createSession('db-new');

      const databases = vectorRAGManager.listDatabases();
      expect(databases[0].databaseName).toBe('db-new');
      expect(databases[1].databaseName).toBe('db-mid');
      expect(databases[2].databaseName).toBe('db-old');
    });
  });

  describe('Database Metadata Retrieval', () => {
    it('should get metadata for specific database', async () => {
      const beforeCreate = Date.now();
      await vectorRAGManager.createSession('target-db');
      const afterCreate = Date.now();

      const metadata = vectorRAGManager.getDatabaseMetadata('target-db');

      expect(metadata).toBeDefined();
      expect(metadata!.databaseName).toBe('target-db');
      expect(metadata!.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(metadata!.createdAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should return null for non-existent database', () => {
      const metadata = vectorRAGManager.getDatabaseMetadata('non-existent');
      expect(metadata).toBeNull();
    });

    it('should update lastAccessedAt on metadata retrieval', async () => {
      await vectorRAGManager.createSession('accessed-db');

      const metadata1 = vectorRAGManager.getDatabaseMetadata('accessed-db');
      const firstAccess = metadata1!.lastAccessedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      const metadata2 = vectorRAGManager.getDatabaseMetadata('accessed-db');
      const secondAccess = metadata2!.lastAccessedAt;

      expect(secondAccess).toBeGreaterThan(firstAccess);
    });
  });

  describe('Database Metadata Updates', () => {
    it('should update database description', async () => {
      await vectorRAGManager.createSession('updatable-db');

      vectorRAGManager.updateDatabaseMetadata('updatable-db', {
        description: 'Project documentation'
      });

      const metadata = vectorRAGManager.getDatabaseMetadata('updatable-db');
      expect(metadata!.description).toBe('Project documentation');
    });

    it('should update multiple metadata fields', async () => {
      await vectorRAGManager.createSession('multi-update-db');

      vectorRAGManager.updateDatabaseMetadata('multi-update-db', {
        description: 'Updated description',
        vectorCount: 100,
        storageSizeBytes: 50000
      });

      const metadata = vectorRAGManager.getDatabaseMetadata('multi-update-db');
      expect(metadata!.description).toBe('Updated description');
      expect(metadata!.vectorCount).toBe(100);
      expect(metadata!.storageSizeBytes).toBe(50000);
    });

    it('should preserve unchanged fields during update', async () => {
      await vectorRAGManager.createSession('preserve-db');

      const originalMetadata = vectorRAGManager.getDatabaseMetadata('preserve-db');
      const originalCreatedAt = originalMetadata!.createdAt;

      vectorRAGManager.updateDatabaseMetadata('preserve-db', {
        description: 'New description'
      });

      const updatedMetadata = vectorRAGManager.getDatabaseMetadata('preserve-db');
      expect(updatedMetadata!.createdAt).toBe(originalCreatedAt);
      expect(updatedMetadata!.databaseName).toBe('preserve-db');
    });

    it('should throw error when updating non-existent database', () => {
      expect(() => {
        vectorRAGManager.updateDatabaseMetadata('non-existent', {
          description: 'Should fail'
        });
      }).toThrow('Database not found');
    });

    it('should update lastAccessedAt on metadata update', async () => {
      await vectorRAGManager.createSession('update-time-db');

      const metadata1 = vectorRAGManager.getDatabaseMetadata('update-time-db');
      const firstAccess = metadata1!.lastAccessedAt;

      await new Promise(resolve => setTimeout(resolve, 10));

      vectorRAGManager.updateDatabaseMetadata('update-time-db', {
        description: 'Updated'
      });

      const metadata2 = vectorRAGManager.getDatabaseMetadata('update-time-db');
      expect(metadata2!.lastAccessedAt).toBeGreaterThan(firstAccess);
    });
  });

  describe('Database Statistics', () => {
    it('should get statistics for a database', async () => {
      await vectorRAGManager.createSession('stats-db');

      const stats = vectorRAGManager.getDatabaseStats('stats-db');

      expect(stats).toBeDefined();
      expect(stats.databaseName).toBe('stats-db');
      expect(stats.vectorCount).toBe(0);
      expect(stats.storageSizeBytes).toBe(0);
      expect(stats).toHaveProperty('sessionCount');
    });

    it('should return null for non-existent database stats', () => {
      const stats = vectorRAGManager.getDatabaseStats('non-existent');
      expect(stats).toBeNull();
    });

    it('should track session count per database', async () => {
      await vectorRAGManager.createSession('multi-session-db');

      const stats = vectorRAGManager.getDatabaseStats('multi-session-db');
      expect(stats!.sessionCount).toBe(1);
    });
  });

  describe('Database Switching', () => {
    it('should switch between databases seamlessly', async () => {
      const session1 = await vectorRAGManager.createSession('db-a');
      const session2 = await vectorRAGManager.createSession('db-b');

      // Access first database
      const meta1 = vectorRAGManager.getDatabaseMetadata('db-a');
      expect(meta1!.databaseName).toBe('db-a');

      // Switch to second database
      const meta2 = vectorRAGManager.getDatabaseMetadata('db-b');
      expect(meta2!.databaseName).toBe('db-b');

      // Both should still be accessible
      expect(vectorRAGManager.getSession(session1)).not.toBeNull();
      expect(vectorRAGManager.getSession(session2)).not.toBeNull();
    });

    it('should maintain separate contexts for different databases', async () => {
      await vectorRAGManager.createSession('context-a');
      await vectorRAGManager.createSession('context-b');

      vectorRAGManager.updateDatabaseMetadata('context-a', {
        description: 'Database A'
      });

      vectorRAGManager.updateDatabaseMetadata('context-b', {
        description: 'Database B'
      });

      const metaA = vectorRAGManager.getDatabaseMetadata('context-a');
      const metaB = vectorRAGManager.getDatabaseMetadata('context-b');

      expect(metaA!.description).toBe('Database A');
      expect(metaB!.description).toBe('Database B');
    });
  });

  describe('Database Filtering', () => {
    it('should filter databases by owner', async () => {
      await vectorRAGManager.createSession('owned-db-1');
      await vectorRAGManager.createSession('owned-db-2');

      const databases = vectorRAGManager.listDatabases();
      const ownedDatabases = databases.filter(db => db.owner === testUserAddress);

      expect(ownedDatabases).toHaveLength(2);
    });

    it('should filter databases by creation time', async () => {
      const cutoffTime = Date.now();

      await new Promise(resolve => setTimeout(resolve, 10));

      await vectorRAGManager.createSession('new-db-1');
      await vectorRAGManager.createSession('new-db-2');

      const databases = vectorRAGManager.listDatabases();
      const recentDatabases = databases.filter(db => db.createdAt > cutoffTime);

      expect(recentDatabases).toHaveLength(2);
    });
  });
});
