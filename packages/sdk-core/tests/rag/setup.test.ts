/**
 * RAG System Setup Tests
 * Tests basic package installation and configuration
 * Max 200 lines
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';

describe('RAG System Setup', () => {
  describe('Package Installation', () => {
    it('should be able to import @fabstir/vector-db-native package', async () => {
      // Test that the package can be imported without errors
      const vectorDbModule = await import('@fabstir/vector-db-native');
      expect(vectorDbModule).toBeDefined();
      expect(vectorDbModule.VectorDbSession).toBeDefined();
    });

    it('should have VectorDbSession class available', async () => {
      const { VectorDbSession } = await import('@fabstir/vector-db-native');
      expect(VectorDbSession).toBeDefined();
      expect(typeof VectorDbSession).toBe('function');
      expect(VectorDbSession.create).toBeDefined();
    });
  });

  describe('TypeScript Environment', () => {
    it('should load RAG types without errors', async () => {
      // Test will fail initially until we create types.ts
      const types = await import('../../src/rag/types.js');
      expect(types).toBeDefined();
    });

    it('should load RAG config without errors', async () => {
      // Test will fail initially until we create config.ts
      const config = await import('../../src/rag/config.js');
      expect(config).toBeDefined();
      expect(config.DEFAULT_RAG_CONFIG).toBeDefined();
    });

    it('should have proper type definitions for RAGConfig', async () => {
      const { RAGConfig } = await import('../../src/rag/types.js');

      // Create a sample config to verify types work
      const sampleConfig: RAGConfig = {
        chunkSize: 10000,
        cacheSizeMb: 150,
        encryptAtRest: true,
        s5Portal: 'http://localhost:5522'
      };

      expect(sampleConfig.chunkSize).toBe(10000);
      expect(sampleConfig.encryptAtRest).toBe(true);
    });
  });

  describe('Environment Variables', () => {
    it('should have S5_SEED_PHRASE in environment', () => {
      // Required for S5 operations
      expect(process.env.S5_SEED_PHRASE).toBeDefined();
      expect(typeof process.env.S5_SEED_PHRASE).toBe('string');
      expect(process.env.S5_SEED_PHRASE!.length).toBeGreaterThan(0);
    });

    it('should have test user credentials', () => {
      expect(process.env.TEST_USER_1_ADDRESS).toBeDefined();
      expect(process.env.TEST_USER_1_PRIVATE_KEY).toBeDefined();
    });
  });

  describe('S5 Portal Configuration', () => {
    it('should accept valid S5 portal URL in config', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      expect(DEFAULT_RAG_CONFIG.s5Portal).toBeDefined();
      expect(DEFAULT_RAG_CONFIG.s5Portal).toMatch(/^https?:\/\//);
    });

    it('should have default chunk size of 10000 vectors', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      expect(DEFAULT_RAG_CONFIG.chunkSize).toBe(10000);
    });

    it('should have encryption enabled by default', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      expect(DEFAULT_RAG_CONFIG.encryptAtRest).toBe(true);
    });

    it('should have reasonable cache size (150MB)', async () => {
      const { DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      expect(DEFAULT_RAG_CONFIG.cacheSizeMb).toBe(150);
    });
  });

  describe('IndexedDB Polyfill', () => {
    it('should have indexedDB available in test environment', () => {
      // S5 requires IndexedDB
      expect(globalThis.indexedDB).toBeDefined();
      expect(typeof globalThis.indexedDB.open).toBe('function');
    });

    it('should be able to open IndexedDB database', async () => {
      const dbName = 'test-rag-setup';
      const request = globalThis.indexedDB.open(dbName, 1);

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect(db).toBeDefined();
      expect(db.name).toBe(dbName);
      db.close();

      // Cleanup
      globalThis.indexedDB.deleteDatabase(dbName);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate chunk size is positive', async () => {
      const { validateRAGConfig } = await import('../../src/rag/config.js');

      expect(() => validateRAGConfig({ chunkSize: -1 })).toThrow('chunkSize must be positive');
      expect(() => validateRAGConfig({ chunkSize: 0 })).toThrow('chunkSize must be positive');
      expect(() => validateRAGConfig({ chunkSize: 10000 })).not.toThrow();
    });

    it('should validate cache size is reasonable', async () => {
      const { validateRAGConfig } = await import('../../src/rag/config.js');

      // Cache size should be between 10MB and 1000MB
      expect(() => validateRAGConfig({ cacheSizeMb: 5 })).toThrow('cacheSizeMb must be between');
      expect(() => validateRAGConfig({ cacheSizeMb: 2000 })).toThrow('cacheSizeMb must be between');
      expect(() => validateRAGConfig({ cacheSizeMb: 150 })).not.toThrow();
    });

    it('should validate S5 portal URL format', async () => {
      const { validateRAGConfig } = await import('../../src/rag/config.js');

      expect(() => validateRAGConfig({ s5Portal: 'invalid-url' })).toThrow('s5Portal must be a valid URL');
      expect(() => validateRAGConfig({ s5Portal: 'ftp://localhost' })).toThrow('s5Portal must use http or https');
      expect(() => validateRAGConfig({ s5Portal: 'http://localhost:5522' })).not.toThrow();
      expect(() => validateRAGConfig({ s5Portal: 'https://s5.example.com' })).not.toThrow();
    });

    it('should merge partial config with defaults', async () => {
      const { mergeRAGConfig, DEFAULT_RAG_CONFIG } = await import('../../src/rag/config.js');

      const partial = { chunkSize: 5000 };
      const merged = mergeRAGConfig(partial);

      expect(merged.chunkSize).toBe(5000);
      expect(merged.cacheSizeMb).toBe(DEFAULT_RAG_CONFIG.cacheSizeMb);
      expect(merged.encryptAtRest).toBe(DEFAULT_RAG_CONFIG.encryptAtRest);
      expect(merged.s5Portal).toBe(DEFAULT_RAG_CONFIG.s5Portal);
    });
  });

  describe('Type Definitions', () => {
    it('should have VectorRecord type with required fields', async () => {
      const { VectorRecord } = await import('../../src/rag/types.js');

      // Test that we can create a valid VectorRecord
      const record: VectorRecord = {
        id: 'test-123',
        vector: new Array(384).fill(0.1),
        metadata: {
          text: 'Sample text',
          source: 'test.txt',
          timestamp: Date.now()
        }
      };

      expect(record.id).toBe('test-123');
      expect(record.vector.length).toBe(384);
      expect(record.metadata.text).toBe('Sample text');
    });

    it('should have SearchOptions type with optional filters', async () => {
      const { SearchOptions } = await import('../../src/rag/types.js');

      const options: SearchOptions = {
        topK: 5,
        threshold: 0.7,
        filter: {
          source: 'test.txt'
        }
      };

      expect(options.topK).toBe(5);
      expect(options.threshold).toBe(0.7);
      expect(options.filter?.source).toBe('test.txt');
    });

    it('should have VectorDbStats type for tracking statistics', async () => {
      const { VectorDbStats } = await import('../../src/rag/types.js');

      const stats: VectorDbStats = {
        totalVectors: 10000,
        totalChunks: 1,
        memoryUsageMb: 64,
        lastUpdated: Date.now()
      };

      expect(stats.totalVectors).toBe(10000);
      expect(stats.totalChunks).toBe(1);
      expect(stats.memoryUsageMb).toBe(64);
    });
  });
});
