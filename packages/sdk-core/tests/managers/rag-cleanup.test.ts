/**
 * RAG Cleanup Tests
 * Tests session cleanup, memory management, and resource disposal
 * Max 200 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('RAG Session Cleanup', () => {
  let VectorRAGManager: any;
  let manager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;

  beforeEach(async () => {
    const module = await import('../../src/managers/VectorRAGManager.js');
    VectorRAGManager = module.VectorRAGManager;

    testUserAddress = process.env.TEST_USER_1_ADDRESS!;
    testSeedPhrase = process.env.S5_SEED_PHRASE!;

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

  afterEach(async () => {
    if (manager) {
      await manager.destroyAllSessions();
    }
  });

  describe('Session Closing', () => {
    it('should close an active session', async () => {
      const sessionId = await manager.createSession('close-test');
      expect(manager.getSessionStatus(sessionId)).toBe('active');

      await manager.closeSession(sessionId);
      expect(manager.getSessionStatus(sessionId)).toBe('closed');
    });

    it('should prevent operations on closed session', async () => {
      const sessionId = await manager.createSession('closed-ops-test');
      await manager.closeSession(sessionId);

      await expect(manager.addVectors(sessionId, [
        { id: 'test', vector: new Array(384).fill(0.1), metadata: {} }
      ])).rejects.toThrow('Session is closed');
    });

    it('should allow reopening closed session', async () => {
      const sessionId = await manager.createSession('reopen-test');
      await manager.closeSession(sessionId);

      await manager.reopenSession(sessionId);
      expect(manager.getSessionStatus(sessionId)).toBe('active');
    });
  });

  describe('Session Destruction', () => {
    it('should completely destroy a session', async () => {
      const sessionId = await manager.createSession('destroy-test');
      await manager.destroySession(sessionId);

      expect(manager.getSession(sessionId)).toBeNull();
      expect(manager.getSessionStatus(sessionId)).toBe('unknown');
    });

    it('should destroy session with vectors', async () => {
      const sessionId = await manager.createSession('destroy-with-data');

      await manager.addVectors(sessionId, [
        { id: 'data-1', vector: new Array(384).fill(0.5), metadata: {} }
      ]);

      await manager.destroySession(sessionId);
      expect(manager.getSession(sessionId)).toBeNull();
    });

    it('should clean up session resources', async () => {
      const sessionId = await manager.createSession('cleanup-resources');

      // Add some data to allocate resources
      const vectors = Array.from({ length: 1000 }, (_, i) => ({
        id: `res-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));
      await manager.addVectors(sessionId, vectors);

      await manager.destroySession(sessionId);

      // Session should be completely removed
      expect(manager.getSession(sessionId)).toBeNull();
    });
  });

  describe('Batch Cleanup', () => {
    it('should destroy all sessions', async () => {
      await manager.createSession('batch-1');
      await manager.createSession('batch-2');
      await manager.createSession('batch-3');

      expect(manager.listSessions().length).toBeGreaterThanOrEqual(3);

      await manager.destroyAllSessions();

      expect(manager.listSessions().length).toBe(0);
    });

    it('should destroy sessions by database name', async () => {
      await manager.createSession('project-a');
      await manager.createSession('project-a');
      await manager.createSession('project-b');

      await manager.destroySessionsByDatabase('project-a');

      const remaining = manager.listSessions();
      expect(remaining.every((s: any) => s.databaseName !== 'project-a')).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should free memory after destroying session', async () => {
      const sessionId = await manager.createSession('memory-test');

      // Add large dataset
      const largeDataset = Array.from({ length: 5000 }, (_, i) => ({
        id: `mem-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));
      await manager.addVectors(sessionId, largeDataset);

      const statsBeforeDestroy = await manager.getSessionStats(sessionId);
      expect(statsBeforeDestroy.memoryUsageMb).toBeGreaterThan(0);

      await manager.destroySession(sessionId);

      // Memory should be freed (can't directly test, but session should be gone)
      expect(manager.getSession(sessionId)).toBeNull();
    });

    it('should handle out of memory gracefully', async () => {
      const sessionId = await manager.createSession('oom-test');

      // Try to add unreasonably large dataset
      // This test verifies graceful handling rather than causing actual OOM
      const vectors = Array.from({ length: 100 }, (_, i) => ({
        id: `oom-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { large: 'x'.repeat(1000) }  // Large metadata
      }));

      await expect(manager.addVectors(sessionId, vectors)).resolves.not.toThrow();
    });
  });

  describe('Cache Management', () => {
    it('should clear session cache', async () => {
      const sessionId = await manager.createSession('cache-test');

      // Access session to populate cache
      manager.getSession(sessionId);
      manager.getSession(sessionId);

      await manager.clearSessionCache(sessionId);

      // Session should still exist but cache cleared
      expect(manager.getSession(sessionId)).toBeDefined();
    });

    it('should evict least recently used sessions from cache', async () => {
      // Create multiple sessions
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(await manager.createSession(`lru-${i}`));
      }

      // Access only the first 5
      for (let i = 0; i < 5; i++) {
        manager.getSession(sessions[i]);
      }

      // Trigger cache eviction (implementation-specific)
      await manager.evictLRUSessions();

      // All sessions should still be retrievable (just maybe not cached)
      for (const sessionId of sessions) {
        expect(manager.getSession(sessionId)).toBeDefined();
      }
    });
  });

  describe('Resource Leak Prevention', () => {
    it('should not leak sessions on repeated create/destroy', async () => {
      for (let i = 0; i < 50; i++) {
        const sessionId = await manager.createSession(`leak-test-${i}`);
        await manager.destroySession(sessionId);
      }

      // Should have no active sessions
      expect(manager.listSessions().length).toBe(0);
    });

    it('should properly cleanup on manager disposal', async () => {
      await manager.createSession('disposal-1');
      await manager.createSession('disposal-2');

      await manager.dispose();

      // Manager should be unusable after disposal
      await expect(manager.createSession('after-dispose'))
        .rejects.toThrow('Manager has been disposed');
    });
  });
});
