/**
 * RAG Session Tests
 * Tests vector operations within sessions
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('RAG Session Operations', () => {
  let VectorRAGManager: any;
  let manager: any;
  let sessionId: string;
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

    // Create a test session
    sessionId = await manager.createSession('test-vectors');
  });

  afterEach(async () => {
    if (manager) {
      await manager.destroyAllSessions();
    }
  });

  describe('Vector Operations', () => {
    it('should add vectors to session', async () => {
      const vectors = [
        {
          id: 'vec-1',
          vector: new Array(384).fill(0.1),
          metadata: { text: 'Sample text 1' }
        },
        {
          id: 'vec-2',
          vector: new Array(384).fill(0.2),
          metadata: { text: 'Sample text 2' }
        }
      ];

      await manager.addVectors(sessionId, vectors);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(2);
    });

    it('should search vectors by similarity', async () => {
      // Add test vectors
      await manager.addVectors(sessionId, [
        {
          id: 'doc-1',
          vector: new Array(384).fill(0.5),
          metadata: { title: 'Document 1' }
        },
        {
          id: 'doc-2',
          vector: new Array(384).fill(0.6),
          metadata: { title: 'Document 2' }
        }
      ]);

      // Search with query vector
      const queryVector = new Array(384).fill(0.55);
      const results = await manager.searchVectors(sessionId, queryVector, 5);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('score');
    });

    it('should search with metadata filter', async () => {
      await manager.addVectors(sessionId, [
        {
          id: 'tech-1',
          vector: new Array(384).fill(0.3),
          metadata: { category: 'tech', title: 'AI Article' }
        },
        {
          id: 'health-1',
          vector: new Array(384).fill(0.3),
          metadata: { category: 'health', title: 'Fitness Guide' }
        }
      ]);

      const queryVector = new Array(384).fill(0.3);
      const results = await manager.searchVectors(
        sessionId,
        queryVector,
        5,
        { filter: { category: 'tech' } }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r: any) => r.metadata.category === 'tech')).toBe(true);
    });

    it('should delete vectors by ID', async () => {
      await manager.addVectors(sessionId, [
        { id: 'temp-1', vector: new Array(384).fill(0.1), metadata: {} },
        { id: 'temp-2', vector: new Array(384).fill(0.2), metadata: {} }
      ]);

      await manager.deleteVectors(sessionId, ['temp-1']);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(1);
    });

    it('should handle empty vector array', async () => {
      await manager.addVectors(sessionId, []);
      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(0);
    });

    it('should validate vector dimensions', async () => {
      const invalidVectors = [
        {
          id: 'bad-vec',
          vector: [0.1, 0.2],  // Wrong dimension
          metadata: {}
        }
      ];

      await expect(manager.addVectors(sessionId, invalidVectors))
        .rejects.toThrow('Vector dimension mismatch');
    });
  });

  describe('Persistence Operations', () => {
    it('should save session to S5', async () => {
      await manager.addVectors(sessionId, [
        { id: 'persist-1', vector: new Array(384).fill(0.7), metadata: { tag: 'important' } }
      ]);

      const cid = await manager.saveSession(sessionId);

      expect(cid).toBeDefined();
      expect(typeof cid).toBe('string');
      expect(cid.length).toBeGreaterThan(0);
    });

    it('should load session from S5', async () => {
      // Add and save
      await manager.addVectors(sessionId, [
        { id: 'load-test-1', vector: new Array(384).fill(0.8), metadata: { value: 123 } }
      ]);
      const cid = await manager.saveSession(sessionId);

      // Create new session and load
      const newSessionId = await manager.createSession('loaded-db');
      await manager.loadSession(newSessionId, cid);

      const stats = await manager.getSessionStats(newSessionId);
      expect(stats.totalVectors).toBeGreaterThan(0);
    });

    it('should handle save of empty session', async () => {
      const cid = await manager.saveSession(sessionId);
      expect(cid).toBeDefined();
    });

    it('should fail to load from invalid CID', async () => {
      await expect(manager.loadSession(sessionId, 'invalid-cid'))
        .rejects.toThrow();
    });
  });

  describe('Session Statistics', () => {
    it('should provide accurate vector count', async () => {
      const vectors = Array.from({ length: 100 }, (_, i) => ({
        id: `vec-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));

      await manager.addVectors(sessionId, vectors);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(100);
    });

    it('should track memory usage', async () => {
      const vectors = Array.from({ length: 1000 }, (_, i) => ({
        id: `vec-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));

      await manager.addVectors(sessionId, vectors);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.memoryUsageMb).toBeGreaterThan(0);
      expect(stats.memoryUsageMb).toBeLessThan(100);  // Should be efficient
    });

    it('should track chunk count', async () => {
      // Add more than one chunk worth (chunkSize = 10000)
      const vectors = Array.from({ length: 15000 }, (_, i) => ({
        id: `chunk-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));

      await manager.addVectors(sessionId, vectors);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalChunks).toBeGreaterThan(1);
    });

    it('should update lastUpdated timestamp', async () => {
      const initialStats = await manager.getSessionStats(sessionId);

      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.addVectors(sessionId, [
        { id: 'time-test', vector: new Array(384).fill(0.5), metadata: {} }
      ]);

      const updatedStats = await manager.getSessionStats(sessionId);
      expect(updatedStats.lastUpdated).toBeGreaterThan(initialStats.lastUpdated);
    });
  });

  describe('Batch Operations', () => {
    it('should handle large batch additions efficiently', async () => {
      const largeData = Array.from({ length: 5000 }, (_, i) => ({
        id: `batch-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { batch: 'large', index: i }
      }));

      const startTime = Date.now();
      await manager.addVectors(sessionId, largeData);
      const duration = Date.now() - startTime;

      console.log(`Added 5000 vectors in ${duration}ms`);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(5000);
      expect(duration).toBeLessThan(10000);  // Should complete in < 10 seconds
    });

    it('should handle batch deletions', async () => {
      const vectors = Array.from({ length: 100 }, (_, i) => ({
        id: `delete-batch-${i}`,
        vector: new Array(384).fill(Math.random()),
        metadata: { index: i }
      }));

      await manager.addVectors(sessionId, vectors);

      // Delete half
      const toDelete = Array.from({ length: 50 }, (_, i) => `delete-batch-${i}`);
      await manager.deleteVectors(sessionId, toDelete);

      const stats = await manager.getSessionStats(sessionId);
      expect(stats.totalVectors).toBe(50);
    });
  });
});
