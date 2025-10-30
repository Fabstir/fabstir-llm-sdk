/**
 * Vector DB Native Bindings Tests
 * Tests @fabstir/vector-db-native integration
 * Max 250 lines
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Vector DB Native Integration', () => {
  let VectorDbSession: any;
  let testSeedPhrase: string;
  let sessionId: string;

  beforeAll(async () => {
    // Import the vector DB module
    const vectorDbModule = await import('@fabstir/vector-db-native');
    VectorDbSession = vectorDbModule.VectorDbSession;

    // Get test seed phrase
    testSeedPhrase = process.env.S5_SEED_PHRASE || 'test seed phrase for development only';
    sessionId = `test-session-${Date.now()}`;
  });

  describe('VectorDbSession Creation', () => {
    it('should create a VectorDbSession with default config', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      const session = await VectorDbSession.create({
        s5Portal: DEFAULT_RAG_CONFIG.s5Portal,
        userSeedPhrase: testSeedPhrase,
        sessionId: sessionId + '-default',
        encryptAtRest: true,
        chunkSize: 10000,
        cacheSizeMb: 150
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId + '-default');

      // Cleanup
      await session.close();
    });

    it('should create a VectorDbSession with custom chunk size', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: sessionId + '-custom',
        encryptAtRest: true,
        chunkSize: 5000,
        cacheSizeMb: 100
      });

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId + '-custom');

      // Cleanup
      await session.close();
    });

    it('should fail with invalid seed phrase', async () => {
      await expect(
        VectorDbSession.create({
          s5Portal: 'http://localhost:5522',
          userSeedPhrase: '',
          sessionId: sessionId + '-invalid',
          encryptAtRest: true,
          chunkSize: 10000
        })
      ).rejects.toThrow();
    });

    it('should fail with invalid S5 portal URL', async () => {
      await expect(
        VectorDbSession.create({
          s5Portal: 'invalid-url',
          userSeedPhrase: testSeedPhrase,
          sessionId: sessionId + '-invalid-url',
          encryptAtRest: true,
          chunkSize: 10000
        })
      ).rejects.toThrow();
    });
  });

  describe('S5 Portal Connectivity', () => {
    let session: any;

    beforeEach(async () => {
      session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-connectivity-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });
    });

    afterAll(async () => {
      if (session) {
        await session.close();
      }
    });

    it('should connect to S5 portal', async () => {
      // Session creation already tests connectivity
      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
    });

    it('should save empty vector DB to S5', async () => {
      // Test that we can persist even with no vectors
      const cid = await session.saveUserVectors();
      expect(cid).toBeDefined();
      expect(typeof cid).toBe('string');
      expect(cid.length).toBeGreaterThan(0);
    });

    it('should load vector DB from S5 CID', async () => {
      // Save first
      const cid = await session.saveUserVectors();

      // Create new session and load
      const newSession = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-load-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      await newSession.loadUserVectors(cid);
      expect(newSession).toBeDefined();

      // Cleanup
      await newSession.close();
    });
  });

  describe('Chunked Storage Configuration', () => {
    it('should create session with 10K vectors per chunk', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-chunked-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      expect(session).toBeDefined();

      // Get stats should show chunk configuration
      const stats = await session.getStats();
      expect(stats).toBeDefined();

      await session.close();
    });

    it('should handle multiple chunks when exceeding chunk size', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-multichunk-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 100  // Small chunk for testing
      });

      // Add 150 vectors (should create 2 chunks)
      const vectors = [];
      for (let i = 0; i < 150; i++) {
        vectors.push({
          id: `vec-${i}`,
          vector: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }

      await session.addVectors(vectors);

      const stats = await session.getStats();
      expect(stats.totalVectors).toBe(150);
      expect(stats.totalChunks).toBeGreaterThan(1);

      await session.close();
    });
  });

  describe('Encryption-at-Rest', () => {
    it('should enable encryption by default', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      expect(DEFAULT_RAG_CONFIG.encryptAtRest).toBe(true);
    });

    it('should create encrypted session', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-encrypted-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      expect(session).toBeDefined();

      // Add a vector and save (should be encrypted on S5)
      await session.addVectors([{
        id: 'test-1',
        vector: new Array(384).fill(0.5),
        metadata: { text: 'sensitive data' }
      }]);

      const cid = await session.saveUserVectors();
      expect(cid).toBeDefined();

      await session.close();
    });

    it('should support unencrypted session (for debugging only)', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-unencrypted-${Date.now()}`,
        encryptAtRest: false,  // WARNING: Only for debugging
        chunkSize: 10000
      });

      expect(session).toBeDefined();
      await session.close();
    });
  });

  describe('Native Metadata Support', () => {
    it('should accept JavaScript objects as metadata (no JSON.stringify)', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-metadata-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      // Native JS object - no stringification needed
      const metadata = {
        text: 'Sample content',
        source: 'test.txt',
        timestamp: Date.now(),
        nested: {
          field1: 'value1',
          field2: 123
        },
        array: [1, 2, 3]
      };

      await session.addVectors([{
        id: 'test-metadata-1',
        vector: new Array(384).fill(0.3),
        metadata: metadata
      }]);

      // Search and verify metadata preserved
      const results = await session.search(new Array(384).fill(0.3), 1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.text).toBe('Sample content');
      expect(results[0].metadata.nested.field1).toBe('value1');
      expect(results[0].metadata.array).toEqual([1, 2, 3]);

      await session.close();
    });

    it('should support metadata filtering in search', async () => {
      const session = await VectorDbSession.create({
        s5Portal: 'http://localhost:5522',
        userSeedPhrase: testSeedPhrase,
        sessionId: `test-filter-${Date.now()}`,
        encryptAtRest: true,
        chunkSize: 10000
      });

      // Add vectors with different sources
      await session.addVectors([
        {
          id: 'doc1',
          vector: new Array(384).fill(0.1),
          metadata: { source: 'document1.txt', category: 'tech' }
        },
        {
          id: 'doc2',
          vector: new Array(384).fill(0.2),
          metadata: { source: 'document2.txt', category: 'health' }
        }
      ]);

      // Search with filter
      const results = await session.search(
        new Array(384).fill(0.1),
        5,
        {
          threshold: 0.0,
          filter: { category: 'tech' }
        }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.metadata.category === 'tech')).toBe(true);

      await session.close();
    });
  });
});
