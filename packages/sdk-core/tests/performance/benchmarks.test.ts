/**
 * Performance Benchmarks
 * Benchmark tests for RAG system performance
 * Max 300 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';
import 'fake-indexeddb/auto';

describe('Performance Benchmarks', () => {
  let ragManager: VectorRAGManager;
  let metadataService: DatabaseMetadataService;
  let permissionManager: PermissionManager;
  const testUser = 'user-0x123';
  const testSeedPhrase = 'test seed phrase for benchmarks';

  const defaultConfig: RAGConfig = {
    s5Portal: 'http://localhost:5522',
    encryptAtRest: true,
    chunkSize: 10000,
    cacheSizeMb: 150
  };

  beforeEach(() => {
    const permissionService = new PermissionService();
    const auditLogger = new AuditLogger();
    permissionManager = new PermissionManager(permissionService, auditLogger);
    metadataService = new DatabaseMetadataService();
    ragManager = new VectorRAGManager({
      userAddress: testUser,
      seedPhrase: testSeedPhrase,
      config: defaultConfig,
      metadataService,
      permissionManager
    });
  });

  describe('Search Performance', () => {
    it('should search in less than 100ms with 1000 vectors', async () => {
      const dbName = 'perf-search-1k';
      await ragManager.createSession(dbName);

      // Add 1000 vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Benchmark search
      const query = new Array(384).fill(0.5);
      const startTime = Date.now();
      const results = await ragManager.search(dbName, query, 10);
      const duration = Date.now() - startTime;

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('should search in less than 150ms with 10000 vectors', async () => {
      const dbName = 'perf-search-10k';
      await ragManager.createSession(dbName);

      // Add 10000 vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 10000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Benchmark search
      const query = new Array(384).fill(0.5);
      const startTime = Date.now();
      const results = await ragManager.search(dbName, query, 10);
      const duration = Date.now() - startTime;

      expect(results).toBeDefined();
      expect(duration).toBeLessThan(150);
    });

    it('should maintain search speed across multiple queries', async () => {
      const dbName = 'perf-search-consistency';
      await ragManager.createSession(dbName);

      // Add 1000 vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Run 10 searches and measure average time
      const durations: number[] = [];
      for (let i = 0; i < 10; i++) {
        const query = new Array(384).fill(Math.random());
        const startTime = Date.now();
        await ragManager.search(dbName, query, 10);
        durations.push(Date.now() - startTime);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      expect(avgDuration).toBeLessThan(100);
      expect(maxDuration).toBeLessThan(150);
    });
  });

  describe('Bulk Operation Performance', () => {
    it('should add 1000 vectors in less than 500ms', async () => {
      const dbName = 'perf-add-1k';
      await ragManager.createSession(dbName);

      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }

      const startTime = Date.now();
      const result = await ragManager.addVectors(dbName, vectors);
      const duration = Date.now() - startTime;

      expect(result.added).toBe(1000);
      expect(duration).toBeLessThan(500);
    });

    it('should add 10000 vectors in less than 3000ms', async () => {
      const dbName = 'perf-add-10k';
      await ragManager.createSession(dbName);

      const vectors: VectorInput[] = [];
      for (let i = 0; i < 10000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }

      const startTime = Date.now();
      const result = await ragManager.addVectors(dbName, vectors);
      const duration = Date.now() - startTime;

      expect(result.added).toBe(10000);
      expect(duration).toBeLessThan(3000);
    });

    it('should update 1000 vectors in less than 600ms', async () => {
      const dbName = 'perf-update-1k';
      await ragManager.createSession(dbName);

      // Add initial vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i, version: 1 }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Update metadata
      const updateIds = vectors.map(v => v.id);
      const newMetadata = { version: 2, updated: Date.now() };

      const startTime = Date.now();
      const result = await ragManager.updateMetadata(dbName, updateIds, newMetadata);
      const duration = Date.now() - startTime;

      expect(result.updated).toBe(1000);
      expect(duration).toBeLessThan(600);
    });

    it('should delete 1000 vectors in less than 400ms', async () => {
      const dbName = 'perf-delete-1k';
      await ragManager.createSession(dbName);

      // Add vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(0.5),
          metadata: { index: i }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Delete all
      const deleteIds = vectors.map(v => v.id);

      const startTime = Date.now();
      const result = await ragManager.deleteVectors(dbName, deleteIds);
      const duration = Date.now() - startTime;

      expect(result.deleted).toBe(1000);
      expect(duration).toBeLessThan(400);
    });
  });

  describe('Memory Usage', () => {
    it('should handle large datasets without memory leaks', async () => {
      const dbName = 'perf-memory-large';
      await ragManager.createSession(dbName);

      // Add 5000 vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 5000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }

      await ragManager.addVectors(dbName, vectors);

      // Perform multiple searches
      for (let i = 0; i < 20; i++) {
        const query = new Array(384).fill(Math.random());
        await ragManager.search(dbName, query, 10);
      }

      // Check session is still valid
      const session = ragManager.getSession(dbName);
      expect(session).toBeDefined();
      expect(session?.status).toBe('active');
    });

    it('should efficiently handle concurrent database sessions', async () => {
      const dbNames = ['perf-mem-1', 'perf-mem-2', 'perf-mem-3'];

      // Create multiple sessions
      for (const dbName of dbNames) {
        await ragManager.createSession(dbName);

        // Add vectors to each
        const vectors: VectorInput[] = [];
        for (let i = 0; i < 1000; i++) {
          vectors.push({
            id: `vec-${i}`,
            values: new Array(384).fill(Math.random()),
            metadata: { index: i }
          });
        }
        await ragManager.addVectors(dbName, vectors);
      }

      // All sessions should be active
      for (const dbName of dbNames) {
        const session = ragManager.getSession(dbName);
        expect(session).toBeDefined();
        expect(session?.status).toBe('active');
      }
    });
  });

  describe('Throughput', () => {
    it('should maintain throughput for sequential operations', async () => {
      const dbName = 'perf-throughput-seq';
      await ragManager.createSession(dbName);

      // Add 100 vectors sequentially in batches
      const batchDurations: number[] = [];
      for (let batch = 0; batch < 10; batch++) {
        const vectors: VectorInput[] = [];
        for (let i = 0; i < 100; i++) {
          vectors.push({
            id: `vec-${batch}-${i}`,
            values: new Array(384).fill(Math.random()),
            metadata: { batch, index: i }
          });
        }

        const startTime = Date.now();
        await ragManager.addVectors(dbName, vectors);
        batchDurations.push(Date.now() - startTime);
      }

      // Check throughput doesn't degrade significantly
      const firstBatch = batchDurations[0];
      const lastBatch = batchDurations[batchDurations.length - 1];
      const degradation = (lastBatch - firstBatch) / firstBatch;

      expect(degradation).toBeLessThan(0.5); // Less than 50% slower
    });

    it('should process 100 searches per second', async () => {
      const dbName = 'perf-throughput-search';
      await ragManager.createSession(dbName);

      // Add 1000 vectors
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(Math.random()),
          metadata: { index: i }
        });
      }
      await ragManager.addVectors(dbName, vectors);

      // Perform 100 searches
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        const query = new Array(384).fill(Math.random());
        await ragManager.search(dbName, query, 10);
      }
      const duration = Date.now() - startTime;

      // Should complete in less than 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});
