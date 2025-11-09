/**
 * Permission Integration Tests
 * Tests VectorRAGManager integration with PermissionManager
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';

describe('Permission Integration with VectorRAGManager', () => {
  let vectorRAGManager: VectorRAGManager;
  let permissionManager: PermissionManager;
  let metadataService: DatabaseMetadataService;
  let auditLogger: AuditLogger;

  const owner = 'owner-0x123';
  const user1 = 'user1-0x456';
  const user2 = 'user2-0x789';
  const testSeedPhrase = 'test seed phrase for permission integration';

  const defaultConfig: RAGConfig = {
    s5Portal: 'http://localhost:5522',
    encryptAtRest: true,
    chunkSize: 10000,
    cacheSizeMb: 150
  };

  beforeEach(() => {
    const permissionService = new PermissionService();
    auditLogger = new AuditLogger();
    permissionManager = new PermissionManager(permissionService, auditLogger);
    metadataService = new DatabaseMetadataService();

    vectorRAGManager = new VectorRAGManager({
      userAddress: owner,
      seedPhrase: testSeedPhrase,
      config: defaultConfig,
      metadataService,
      permissionManager
    });
  });

  afterEach(async () => {
    await vectorRAGManager.destroyAllSessions();
  });

  describe('Create Session with Permissions', () => {
    it('should allow owner to create session on their database', async () => {
      const dbName = 'owner-db';

      const sessionId = await vectorRAGManager.createSession(dbName);

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });

    it('should deny non-owner creating session on private database', async () => {
      const dbName = 'owner-db';

      // Create database as owner
      await vectorRAGManager.createSession(dbName);

      // Try to create session as different user
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      await expect(
        user1Manager.createSession(dbName)
      ).rejects.toThrow('Permission denied');
    });

    it('should allow user with write permission to create session', async () => {
      const dbName = 'shared-db';

      // Create database as owner
      await vectorRAGManager.createSession(dbName);

      // Grant write permission to user1
      permissionManager.grant(dbName, user1, 'writer');

      // User1 should be able to create session
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await user1Manager.createSession(dbName);
      expect(sessionId).toBeDefined();
    });

    it('should allow anyone to create session on public database for read', async () => {
      const dbName = 'public-db';

      // Create database as owner and make it public
      await vectorRAGManager.createSession(dbName);
      const metadata = metadataService.get(dbName);
      metadataService.update(dbName, { isPublic: true });

      // User1 should be able to create read session
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await user1Manager.createSession(dbName);
      expect(sessionId).toBeDefined();
    });
  });

  describe('Add Vectors with Permissions', () => {
    it('should allow owner to add vectors', async () => {
      const dbName = 'owner-db';
      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { content: 'Test vector 1' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { content: 'Test vector 2' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { content: 'Test vector 3' }
        }
      ];

      const result = await vectorRAGManager.addVectors(dbName, vectors);

      expect(result.added).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should deny non-owner adding vectors to private database', async () => {
      const dbName = 'owner-db';

      // Create database as owner
      await vectorRAGManager.createSession(dbName);

      // Try to add vectors as user1
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { content: 'Test' }
        }
      ];

      await expect(
        user1Manager.addVectors(dbName, vectors)
      ).rejects.toThrow('Permission denied');
    });

    it('should allow writer to add vectors', async () => {
      const dbName = 'shared-db';

      // Create database as owner
      await vectorRAGManager.createSession(dbName);

      // Grant write permission to user1
      permissionManager.grant(dbName, user1, 'writer');

      // User1 should be able to add vectors
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { content: 'Test' }
        }
      ];

      const result = await user1Manager.addVectors(dbName, vectors);
      expect(result.added).toBe(3);
    });

    it('should deny reader adding vectors', async () => {
      const dbName = 'shared-db';

      // Create database as owner
      await vectorRAGManager.createSession(dbName);

      // Grant read permission to user1
      permissionManager.grant(dbName, user1, 'reader');

      // User1 should NOT be able to add vectors
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { content: 'Test' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { content: 'Test' }
        }
      ];

      await expect(
        user1Manager.addVectors(dbName, vectors)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('Search with Permissions', () => {
    beforeEach(async () => {
      // Setup test data
      const dbName = 'search-db';
      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.5),
          metadata: { content: 'Searchable content 1' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.6),
          metadata: { content: 'Searchable content 2' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.7),
          metadata: { content: 'Searchable content 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);
    });

    it('should allow reader to search', async () => {
      const dbName = 'search-db';

      // Grant read permission to user1
      permissionManager.grant(dbName, user1, 'reader');

      // User1 should be able to search
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await user1Manager.createSession(dbName);

      // Should be able to search (verifies read permission granted)
      // Note: Results may be empty since vector data is in-memory per manager instance
      const results = await user1Manager.search(dbName, new Array(384).fill(0.5), 3);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should allow public database search by anyone', async () => {
      const dbName = 'search-db';

      // Make database public
      metadataService.update(dbName, { isPublic: true });

      // User1 (no permission) should be able to search public database
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await user1Manager.createSession(dbName);

      // Should be able to search public database (verifies public read access)
      // Note: Results may be empty since vector data is in-memory per manager instance
      const results = await user1Manager.search(dbName, new Array(384).fill(0.5), 3);
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should deny search on private database without permission', async () => {
      const dbName = 'search-db';

      // User1 (no permission) should NOT be able to search private database
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      await expect(
        user1Manager.createSession(dbName)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('Audit Logging', () => {
    it('should log permission grants', async () => {
      const dbName = 'audit-db';

      permissionManager.grant(dbName, user1, 'writer');

      const logs = auditLogger.getDatabaseLogs(dbName);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('grant');
      expect(logs[0].userAddress).toBe(user1);
    });

    it('should log access attempts', async () => {
      const dbName = 'audit-db';
      await vectorRAGManager.createSession(dbName);

      // User1 tries to access without permission (should fail and log)
      const user1Manager = new VectorRAGManager({
        userAddress: user1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      try {
        await user1Manager.createSession(dbName);
      } catch (error) {
        // Expected to fail
      }

      const logs = auditLogger.getUserLogs(user1);
      const accessLogs = logs.filter(l => l.action === 'access');
      expect(accessLogs.length).toBeGreaterThan(0);
    });
  });
});
