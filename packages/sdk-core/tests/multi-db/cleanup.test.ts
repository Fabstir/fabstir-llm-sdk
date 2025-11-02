/**
 * Multi-Database Cleanup Tests
 * Tests for database deletion and cleanup operations
 * Max 200 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig } from '../../src/rag/types.js';

describe('Multi-Database Cleanup', () => {
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

  describe('Database Deletion', () => {
    it('should delete a single database', async () => {
      await vectorRAGManager.createSession('deletable-db');

      let databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(1);

      await vectorRAGManager.deleteDatabase('deletable-db');

      databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(0);
    });

    it('should remove database metadata after deletion', async () => {
      await vectorRAGManager.createSession('meta-delete-db');

      let metadata = vectorRAGManager.getDatabaseMetadata('meta-delete-db');
      expect(metadata).not.toBeNull();

      await vectorRAGManager.deleteDatabase('meta-delete-db');

      metadata = vectorRAGManager.getDatabaseMetadata('meta-delete-db');
      expect(metadata).toBeNull();
    });

    it('should destroy all sessions for deleted database', async () => {
      const sessionId = await vectorRAGManager.createSession('session-delete-db');

      await vectorRAGManager.deleteDatabase('session-delete-db');

      const session = vectorRAGManager.getSession(sessionId);
      expect(session).toBeNull();
    });

    it('should not affect other databases when deleting one', async () => {
      await vectorRAGManager.createSession('keep-db-1');
      await vectorRAGManager.createSession('delete-db');
      await vectorRAGManager.createSession('keep-db-2');

      await vectorRAGManager.deleteDatabase('delete-db');

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(2);

      const names = databases.map(db => db.databaseName).sort();
      expect(names).toEqual(['keep-db-1', 'keep-db-2']);
    });

    it('should throw error when deleting non-existent database', async () => {
      await expect(
        vectorRAGManager.deleteDatabase('non-existent')
      ).rejects.toThrow('Database not found');
    });

    it('should handle deleting already deleted database gracefully', async () => {
      await vectorRAGManager.createSession('once-deleted-db');

      await vectorRAGManager.deleteDatabase('once-deleted-db');

      await expect(
        vectorRAGManager.deleteDatabase('once-deleted-db')
      ).rejects.toThrow('Database not found');
    });

    it('should delete multiple databases sequentially', async () => {
      await vectorRAGManager.createSession('delete-1');
      await vectorRAGManager.createSession('delete-2');
      await vectorRAGManager.createSession('delete-3');

      await vectorRAGManager.deleteDatabase('delete-1');
      await vectorRAGManager.deleteDatabase('delete-2');
      await vectorRAGManager.deleteDatabase('delete-3');

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(0);
    });
  });

  describe('Orphaned Session Cleanup', () => {
    it('should not leave orphaned sessions after database deletion', async () => {
      const sessionId = await vectorRAGManager.createSession('orphan-test-db');

      // Verify session exists
      let session = vectorRAGManager.getSession(sessionId);
      expect(session).not.toBeNull();

      // Delete database
      await vectorRAGManager.deleteDatabase('orphan-test-db');

      // Session should be gone
      session = vectorRAGManager.getSession(sessionId);
      expect(session).toBeNull();
    });

    it('should clean up sessions from internal tracking', async () => {
      await vectorRAGManager.createSession('tracked-db');

      let sessions = vectorRAGManager.listSessions();
      expect(sessions.length).toBeGreaterThan(0);

      await vectorRAGManager.deleteDatabase('tracked-db');

      sessions = vectorRAGManager.listSessions();
      const trackedDbSessions = sessions.filter(s => s.databaseName === 'tracked-db');
      expect(trackedDbSessions).toHaveLength(0);
    });
  });

  describe('Metadata Cleanup', () => {
    it('should remove all metadata fields after deletion', async () => {
      await vectorRAGManager.createSession('full-meta-db');

      vectorRAGManager.updateDatabaseMetadata('full-meta-db', {
        description: 'This will be deleted',
        vectorCount: 100,
        storageSizeBytes: 5000
      });

      await vectorRAGManager.deleteDatabase('full-meta-db');

      const metadata = vectorRAGManager.getDatabaseMetadata('full-meta-db');
      expect(metadata).toBeNull();

      const databases = vectorRAGManager.listDatabases();
      const deletedDb = databases.find(db => db.databaseName === 'full-meta-db');
      expect(deletedDb).toBeUndefined();
    });

    it('should not affect metadata of other databases', async () => {
      await vectorRAGManager.createSession('preserve-meta-db');
      await vectorRAGManager.createSession('delete-meta-db');

      vectorRAGManager.updateDatabaseMetadata('preserve-meta-db', {
        description: 'Keep this'
      });

      await vectorRAGManager.deleteDatabase('delete-meta-db');

      const metadata = vectorRAGManager.getDatabaseMetadata('preserve-meta-db');
      expect(metadata!.description).toBe('Keep this');
    });
  });

  describe('Statistics After Deletion', () => {
    it('should return null for stats of deleted database', async () => {
      await vectorRAGManager.createSession('stats-delete-db');

      let stats = vectorRAGManager.getDatabaseStats('stats-delete-db');
      expect(stats).not.toBeNull();

      await vectorRAGManager.deleteDatabase('stats-delete-db');

      stats = vectorRAGManager.getDatabaseStats('stats-delete-db');
      expect(stats).toBeNull();
    });
  });

  describe('Bulk Deletion', () => {
    it('should handle deleting multiple databases concurrently', async () => {
      await vectorRAGManager.createSession('concurrent-1');
      await vectorRAGManager.createSession('concurrent-2');
      await vectorRAGManager.createSession('concurrent-3');

      await Promise.all([
        vectorRAGManager.deleteDatabase('concurrent-1'),
        vectorRAGManager.deleteDatabase('concurrent-2'),
        vectorRAGManager.deleteDatabase('concurrent-3')
      ]);

      const databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(0);
    });

    it('should delete 10+ databases successfully', async () => {
      // Create 12 databases
      for (let i = 0; i < 12; i++) {
        await vectorRAGManager.createSession(`bulk-delete-${i}`);
      }

      let databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(12);

      // Delete all
      for (let i = 0; i < 12; i++) {
        await vectorRAGManager.deleteDatabase(`bulk-delete-${i}`);
      }

      databases = vectorRAGManager.listDatabases();
      expect(databases).toHaveLength(0);
    });
  });

  describe('Re-creation After Deletion', () => {
    it('should allow creating database with same name after deletion', async () => {
      await vectorRAGManager.createSession('recreate-db');

      const metadata1 = vectorRAGManager.getDatabaseMetadata('recreate-db');
      const createdAt1 = metadata1!.createdAt;

      await vectorRAGManager.deleteDatabase('recreate-db');

      await new Promise(resolve => setTimeout(resolve, 10));

      await vectorRAGManager.createSession('recreate-db');

      const metadata2 = vectorRAGManager.getDatabaseMetadata('recreate-db');
      expect(metadata2).not.toBeNull();
      expect(metadata2!.createdAt).toBeGreaterThan(createdAt1);
    });

    it('should start with fresh metadata after re-creation', async () => {
      await vectorRAGManager.createSession('fresh-db');

      vectorRAGManager.updateDatabaseMetadata('fresh-db', {
        description: 'Old description',
        vectorCount: 100
      });

      await vectorRAGManager.deleteDatabase('fresh-db');
      await vectorRAGManager.createSession('fresh-db');

      const metadata = vectorRAGManager.getDatabaseMetadata('fresh-db');
      expect(metadata!.description).toBeUndefined();
      expect(metadata!.vectorCount).toBe(0);
    });
  });
});
