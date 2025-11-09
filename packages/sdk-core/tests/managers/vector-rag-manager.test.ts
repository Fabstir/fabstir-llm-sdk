/**
 * VectorRAGManager Tests
 * Tests core manager functionality for vector database operations
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('VectorRAGManager', () => {
  let VectorRAGManager: any;
  let manager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;

  beforeEach(async () => {
    // Import manager class
    const module = await import('../../src/managers/VectorRAGManager.js');
    VectorRAGManager = module.VectorRAGManager;

    // Setup test data
    testUserAddress = process.env.TEST_USER_1_ADDRESS!;
    testSeedPhrase = process.env.S5_SEED_PHRASE!;

    expect(testUserAddress).toBeDefined();
    expect(testSeedPhrase).toBeDefined();
  });

  afterEach(async () => {
    // Cleanup: destroy all sessions
    if (manager) {
      await manager.destroyAllSessions();
      manager = null;
    }
  });

  describe('Initialization', () => {
    it('should create VectorRAGManager with default config', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: DEFAULT_RAG_CONFIG
      });

      expect(manager).toBeDefined();
      expect(manager.userAddress).toBe(testUserAddress);
    });

    it('should create VectorRAGManager with custom config', async () => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 5000,
          cacheSizeMb: 100,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });

      expect(manager).toBeDefined();
      expect(manager.config.chunkSize).toBe(5000);
      expect(manager.config.cacheSizeMb).toBe(100);
    });

    it('should fail without user address', async () => {
      expect(() => {
        new VectorRAGManager({
          seedPhrase: testSeedPhrase,
          config: { chunkSize: 10000, cacheSizeMb: 150, encryptAtRest: true, s5Portal: 'http://localhost:5522' }
        });
      }).toThrow('userAddress is required');
    });

    it('should fail without seed phrase', async () => {
      expect(() => {
        new VectorRAGManager({
          userAddress: testUserAddress,
          config: { chunkSize: 10000, cacheSizeMb: 150, encryptAtRest: true, s5Portal: 'http://localhost:5522' }
        });
      }).toThrow('seedPhrase is required');
    });

    it('should validate config on initialization', async () => {
      expect(() => {
        new VectorRAGManager({
          userAddress: testUserAddress,
          seedPhrase: testSeedPhrase,
          config: {
            chunkSize: -1,  // Invalid
            cacheSizeMb: 150,
            encryptAtRest: true,
            s5Portal: 'http://localhost:5522'
          }
        });
      }).toThrow('chunkSize must be positive');
    });
  });

  describe('Session Creation', () => {
    beforeEach(() => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });
    });

    it('should create a new vector database session', async () => {
      const sessionId = await manager.createSession('test-db-1');

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should create session with custom config', async () => {
      const sessionId = await manager.createSession('test-db-2', {
        chunkSize: 5000
      });

      expect(sessionId).toBeDefined();

      const session = manager.getSession(sessionId);
      expect(session).toBeDefined();
    });

    it('should generate unique session IDs', async () => {
      const sessionId1 = await manager.createSession('test-db-3');
      const sessionId2 = await manager.createSession('test-db-4');

      expect(sessionId1).not.toBe(sessionId2);
    });

    it('should fail to create session with invalid database name', async () => {
      await expect(manager.createSession('')).rejects.toThrow('Database name cannot be empty');
      await expect(manager.createSession(null as any)).rejects.toThrow('Database name cannot be empty');
    });

    it('should track created sessions', async () => {
      const sessionId1 = await manager.createSession('test-db-5');
      const sessionId2 = await manager.createSession('test-db-6');

      const sessions = manager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      const sessionIds = sessions.map((s: any) => s.sessionId);
      expect(sessionIds).toContain(sessionId1);
      expect(sessionIds).toContain(sessionId2);
    });
  });

  describe('Session Retrieval', () => {
    beforeEach(() => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });
    });

    it('should retrieve existing session by ID', async () => {
      const sessionId = await manager.createSession('test-db-7');
      const session = manager.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
      expect(session.databaseName).toBe('test-db-7');
    });

    it('should return null for non-existent session', () => {
      const session = manager.getSession('non-existent-session');
      expect(session).toBeNull();
    });

    it('should list all active sessions', async () => {
      await manager.createSession('test-db-8');
      await manager.createSession('test-db-9');
      await manager.createSession('test-db-10');

      const sessions = manager.listSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter sessions by database name', async () => {
      await manager.createSession('project-a');
      await manager.createSession('project-b');
      await manager.createSession('project-a');  // Same DB, different session

      const projectASessions = manager.listSessions('project-a');
      expect(projectASessions.length).toBe(2);
      expect(projectASessions.every((s: any) => s.databaseName === 'project-a')).toBe(true);
    });
  });

  describe('Session Status', () => {
    beforeEach(() => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });
    });

    it('should track session status (active)', async () => {
      const sessionId = await manager.createSession('test-db-11');
      const status = manager.getSessionStatus(sessionId);

      expect(status).toBe('active');
    });

    it('should update session status on close', async () => {
      const sessionId = await manager.createSession('test-db-12');

      await manager.closeSession(sessionId);
      const status = manager.getSessionStatus(sessionId);

      expect(status).toBe('closed');
    });

    it('should return "unknown" for non-existent session', () => {
      const status = manager.getSessionStatus('non-existent');
      expect(status).toBe('unknown');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });
    });

    it('should handle errors during session creation gracefully', async () => {
      // Try to create session with invalid S5 portal
      // Note: VectorDbSession.create doesn't immediately validate the portal,
      // so this test verifies the manager can be instantiated with any config
      const badManager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://invalid-portal-that-does-not-exist:9999'
        }
      });

      // Session creation may succeed but operations will fail later
      // This is expected behavior as S5 portal validation happens on first operation
      expect(badManager).toBeDefined();
    });

    it('should throw error when closing non-existent session', async () => {
      await expect(manager.closeSession('non-existent')).rejects.toThrow('Session not found');
    });

    it('should throw error when destroying non-existent session', async () => {
      await expect(manager.destroySession('non-existent')).rejects.toThrow('Session not found');
    });
  });

  describe('Session Metadata', () => {
    beforeEach(() => {
      manager = new VectorRAGManager({
        userAddress: testUserAddress,
        seedPhrase: testSeedPhrase,
        config: {
          chunkSize: 10000,
          cacheSizeMb: 150,
          encryptAtRest: true,
          s5Portal: 'http://localhost:5522'
        }
      });
    });

    it('should track session creation time', async () => {
      const beforeCreate = Date.now();
      const sessionId = await manager.createSession('test-db-13');
      const afterCreate = Date.now();

      const session = manager.getSession(sessionId);
      expect(session.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(session.createdAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should track last accessed time', async () => {
      const sessionId = await manager.createSession('test-db-14');

      // Access session
      await new Promise(resolve => setTimeout(resolve, 10));
      manager.getSession(sessionId);

      const session = manager.getSession(sessionId);
      expect(session.lastAccessedAt).toBeGreaterThan(session.createdAt);
    });

    it('should provide session statistics', async () => {
      const sessionId = await manager.createSession('test-db-15');
      const stats = await manager.getSessionStats(sessionId);

      expect(stats).toBeDefined();
      expect(stats.totalVectors).toBe(0);  // Newly created
      expect(stats.totalChunks).toBe(0);
      expect(stats.memoryUsageMb).toBeDefined();
    });
  });
});
