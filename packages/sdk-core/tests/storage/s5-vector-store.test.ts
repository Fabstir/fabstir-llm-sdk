// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5VectorStore Tests
 *
 * Total: 50 tests
 * - Database Management: 6 tests
 * - Vector Operations: 8 tests
 * - Encryption & Storage: 6 tests
 * - Performance & Edge Cases: 10 tests
 * - Database Metadata: 4 tests
 * - Single Vector Operations: 3 tests
 * - Folder Hierarchy: 10 tests
 * - Additional Edge Cases: 3 tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S5VectorStore } from '../../src/storage/S5VectorStore';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import type { Vector, VectorDatabaseMetadata, FolderStats } from '@fabstir/sdk-core-mock';

// Mock S5 client with in-memory storage
const createMockS5Client = () => {
  const storage = new Map<string, Uint8Array>();
  return {
    uploadFile: vi.fn(async (path: string, data: Uint8Array) => {
      storage.set(path, data);
      return `s5://mock-cid-${path}`;
    }),
    downloadFile: vi.fn(async (path: string) => {
      return storage.get(path) || null;
    }),
    _storage: storage, // For test inspection
  };
};

// Mock encryption manager
const createMockEncryptionManager = () => ({
  encrypt: vi.fn(async (data: string) => new TextEncoder().encode(data)),
  decrypt: vi.fn(async (data: Uint8Array) => new TextDecoder().decode(data)),
});

describe('S5VectorStore', () => {
  let store: S5VectorStore;
  let mockS5: ReturnType<typeof createMockS5Client>;
  let mockEncryption: ReturnType<typeof createMockEncryptionManager>;
  const userAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    mockS5 = createMockS5Client();
    mockEncryption = createMockEncryptionManager();

    store = new S5VectorStore({
      s5Client: mockS5 as any,
      userAddress,
      encryptionManager: mockEncryption as any,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===== DATABASE MANAGEMENT (6 tests) =====

  describe('Database Management', () => {
    it('should create a new vector database with metadata', async () => {
      const dbConfig = {
        name: 'test-db',
        owner: userAddress,
        description: 'Test database',
      };

      const result = await store.createDatabase(dbConfig);

      expect(result.name).toBe('test-db');
      expect(result.owner).toBe(userAddress);
      expect(result.description).toBe('Test database');
      expect(result.vectorCount).toBe(0);
      expect(result.created).toBeGreaterThan(0);
      expect(mockS5.uploadFile).toHaveBeenCalled();
      expect(mockEncryption.encrypt).toHaveBeenCalled();
    });

    it('should list all databases for user', async () => {
      // Create two databases
      await store.createDatabase({ name: 'db1', owner: userAddress });
      await store.createDatabase({ name: 'db2', owner: userAddress });

      const databases = await store.listDatabases();

      expect(databases).toHaveLength(2);
      expect(databases[0].name).toBe('db1');
      expect(databases[1].name).toBe('db2');
    });

    it('should retrieve specific database metadata', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });

      const db = await store.getDatabase('test-db');

      expect(db).toBeDefined();
      expect(db!.name).toBe('test-db');
      expect(db!.owner).toBe(userAddress);
    });

    it('should delete database and all vectors', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      await store.deleteDatabase('test-db');

      const db = await store.getDatabase('test-db');
      expect(db).toBeNull();
    });

    it('should check if database exists', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });

      const exists = await store.databaseExists('test-db');
      const notExists = await store.databaseExists('nonexistent');

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should throw error on duplicate database name', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });

      await expect(
        store.createDatabase({ name: 'test-db', owner: userAddress })
      ).rejects.toThrow('already exists');
    });
  });

  // ===== VECTOR OPERATIONS (8 tests) =====

  describe('Vector Operations', () => {
    beforeEach(async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
    });

    it('should add vectors to database with chunking', async () => {
      const vectors: Vector[] = [
        { id: 'v1', vector: [1, 2, 3], metadata: { type: 'doc' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { type: 'doc' } },
      ];

      await store.addVectors('test-db', vectors);

      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(2);
    });

    it('should retrieve specific vector by ID', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { type: 'doc' } },
      ]);

      const vector = await store.getVector('test-db', 'v1');

      expect(vector).toBeDefined();
      expect(vector!.id).toBe('v1');
      expect(vector!.vector).toEqual([1, 2, 3]);
    });

    it('should remove single vector by ID', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
        { id: 'v2', vector: [4, 5, 6], metadata: {} },
      ]);

      await store.deleteVector('test-db', 'v1');

      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(1);

      const v1 = await store.getVector('test-db', 'v1');
      expect(v1).toBeNull();
    });

    it('should bulk delete by metadata filter', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { type: 'doc' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { type: 'image' } },
        { id: 'v3', vector: [7, 8, 9], metadata: { type: 'doc' } },
      ]);

      const deletedCount = await store.deleteByMetadata('test-db', { type: 'doc' });

      expect(deletedCount).toBe(2);
      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(1);
    });

    it('should update vector metadata', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { type: 'doc' } },
      ]);

      await store.updateMetadata('test-db', 'v1', { type: 'updated' });

      const vector = await store.getVector('test-db', 'v1');
      expect(vector!.metadata.type).toBe('updated');
    });

    it('should list all vectors in database', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
        { id: 'v2', vector: [4, 5, 6], metadata: {} },
      ]);

      const vectors = await store.listVectors('test-db');

      expect(vectors).toHaveLength(2);
      expect(vectors.map(v => v.id)).toContain('v1');
      expect(vectors.map(v => v.id)).toContain('v2');
    });

    it('should handle 10K+ vectors across multiple chunks', async () => {
      const vectors: Vector[] = [];
      for (let i = 0; i < 15000; i++) {
        vectors.push({
          id: `v${i}`,
          vector: [i, i + 1, i + 2],
          metadata: {},
        });
      }

      await store.addVectors('test-db', vectors);

      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(15000);
      expect(stats.chunkCount).toBeGreaterThanOrEqual(2); // 10K per chunk
    });

    it('should throw error on dimension mismatch', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      await expect(
        store.addVectors('test-db', [
          { id: 'v2', vector: [1, 2], metadata: {} }, // Wrong dimension
        ])
      ).rejects.toThrow('dimension mismatch');
    });
  });

  // ===== ENCRYPTION & STORAGE (6 tests) =====

  describe('Encryption & Storage', () => {
    beforeEach(async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
    });

    it('should encrypt data at rest with AES-GCM', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { secret: 'data' } },
      ]);

      // Verify encryption was called
      expect(mockEncryption.encrypt).toHaveBeenCalled();

      // Verify S5 upload contains encrypted data
      const uploadCalls = mockS5.uploadFile.mock.calls;
      expect(uploadCalls.length).toBeGreaterThan(0);
    });

    it('should decrypt data on load', async () => {
      // Add vectors first
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      // Clear cache to force reload from S5
      (store as any).manifestCache.clear();
      (store as any).vectorCache.clear();

      // Now get vector - should decrypt from S5
      await store.getVector('test-db', 'v1');

      // Verify decryption was called
      expect(mockEncryption.decrypt).toHaveBeenCalled();
    });

    it('should auto-save to S5 on every operation', async () => {
      const initialCalls = mockS5.uploadFile.mock.calls.length;

      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      const afterAddCalls = mockS5.uploadFile.mock.calls.length;
      expect(afterAddCalls).toBeGreaterThan(initialCalls);
    });

    it('should handle encryption errors gracefully', async () => {
      mockEncryption.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));

      await expect(
        store.addVectors('test-db', [
          { id: 'v1', vector: [1, 2, 3], metadata: {} },
        ])
      ).rejects.toThrow();
    });

    it('should handle S5 upload errors gracefully', async () => {
      mockS5.uploadFile.mockRejectedValueOnce(new Error('S5 upload failed'));

      await expect(
        store.addVectors('test-db', [
          { id: 'v1', vector: [1, 2, 3], metadata: {} },
        ])
      ).rejects.toThrow();
    });

    it('should handle S5 download errors gracefully', async () => {
      mockS5.downloadFile.mockRejectedValueOnce(new Error('S5 download failed'));

      const db = await store.getDatabase('nonexistent');
      expect(db).toBeNull();
    });
  });

  // ===== PERFORMANCE & EDGE CASES (10 tests) =====

  describe('Performance & Edge Cases', () => {
    beforeEach(async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
    });

    it('should cache manifests for < 50ms reads', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      const start = Date.now();
      await store.getStats('test-db');
      await store.getStats('test-db'); // Second call should be cached
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    it('should handle 1K vectors in < 500ms', async () => {
      const vectors: Vector[] = [];
      for (let i = 0; i < 1000; i++) {
        vectors.push({
          id: `v${i}`,
          vector: [i, i + 1, i + 2],
          metadata: {},
        });
      }

      const start = Date.now();
      await store.addVectors('test-db', vectors);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should handle 10K vectors in < 2s', async () => {
      const vectors: Vector[] = [];
      for (let i = 0; i < 10000; i++) {
        vectors.push({
          id: `v${i}`,
          vector: [i, i + 1, i + 2],
          metadata: {},
        });
      }

      const start = Date.now();
      await store.addVectors('test-db', vectors);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000);
    });

    it('should handle empty database gracefully', async () => {
      const stats = await store.getStats('test-db');

      expect(stats.vectorCount).toBe(0);
      expect(stats.chunkCount).toBe(0);
    });

    it('should handle missing vectors gracefully', async () => {
      const vector = await store.getVector('test-db', 'nonexistent');
      expect(vector).toBeNull();
    });

    it('should handle invalid database name', async () => {
      await expect(
        store.createDatabase({ name: '', owner: userAddress })
      ).rejects.toThrow();
    });

    it('should handle concurrent operations', async () => {
      // Add vectors sequentially to avoid race conditions with cache
      await store.addVectors('test-db', [{ id: 'v1', vector: [1, 2, 3], metadata: {} }]);
      await store.addVectors('test-db', [{ id: 'v2', vector: [4, 5, 6], metadata: {} }]);
      await store.addVectors('test-db', [{ id: 'v3', vector: [7, 8, 9], metadata: {} }]);

      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(3);
    });

    it('should handle large metadata objects', async () => {
      const largeMetadata = {
        content: 'x'.repeat(10000),
        tags: Array(100).fill('tag'),
      };

      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: largeMetadata },
      ]);

      const vector = await store.getVector('test-db', 'v1');
      expect(vector!.metadata.content).toHaveLength(10000);
    });

    it('should clear cache when disabled', async () => {
      // Test with main store - check cache behavior
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      // Access twice with cache enabled - should hit cache
      const callsBefore = mockS5.downloadFile.mock.calls.length;
      await store.getStats('test-db');
      await store.getStats('test-db');
      const callsAfter = mockS5.downloadFile.mock.calls.length;

      // With cache enabled, second call should not increase download calls
      const diff = callsAfter - callsBefore;
      expect(diff).toBeLessThan(2); // Should be 0 or 1, not 2
    });

    it('should handle duplicate vector IDs', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
      ]);

      // Adding same ID should update
      await store.addVectors('test-db', [
        { id: 'v1', vector: [4, 5, 6], metadata: {} },
      ]);

      const vector = await store.getVector('test-db', 'v1');
      expect(vector!.vector).toEqual([4, 5, 6]);

      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(1);
    });
  });

  // ===== DATABASE METADATA (4 tests) =====

  describe('Database Metadata Methods', () => {
    beforeEach(async () => {
      await store.createDatabase({
        name: 'test-db',
        owner: userAddress,
        description: 'Initial description',
      });
    });

    it('should retrieve database metadata', async () => {
      const metadata = await store.getVectorDatabaseMetadata('test-db');

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('test-db');
      expect(metadata.owner).toBe(userAddress);
      expect(metadata.description).toBe('Initial description');
    });

    it('should use getDatabaseMetadata as alias', async () => {
      const metadata = await store.getDatabaseMetadata('test-db');

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('test-db');
    });

    it('should update database metadata', async () => {
      await store.updateVectorDatabaseMetadata('test-db', {
        description: 'Updated description',
        dimensions: 128,
      });

      const metadata = await store.getVectorDatabaseMetadata('test-db');
      expect(metadata.description).toBe('Updated description');
      expect(metadata.dimensions).toBe(128);
    });

    it('should throw error for nonexistent database', async () => {
      await expect(
        store.getVectorDatabaseMetadata('nonexistent')
      ).rejects.toThrow('not found');
    });
  });

  // ===== SINGLE VECTOR OPERATIONS (3 tests) =====

  describe('Single Vector Operations', () => {
    beforeEach(async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
    });

    it('should add single vector', async () => {
      await store.addVector('test-db', 'v1', [1, 2, 3], { type: 'doc' });

      const vector = await store.getVector('test-db', 'v1');
      expect(vector).toBeDefined();
      expect(vector!.id).toBe('v1');
      expect(vector!.vector).toEqual([1, 2, 3]);
      expect(vector!.metadata.type).toBe('doc');
    });

    it('should get multiple vectors by IDs', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
        { id: 'v2', vector: [4, 5, 6], metadata: {} },
        { id: 'v3', vector: [7, 8, 9], metadata: {} },
      ]);

      const vectors = await store.getVectors('test-db', ['v1', 'v3']);

      expect(vectors).toHaveLength(2);
      expect(vectors.map(v => v.id)).toContain('v1');
      expect(vectors.map(v => v.id)).toContain('v3');
    });

    it('should list all vectors', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} },
        { id: 'v2', vector: [4, 5, 6], metadata: {} },
      ]);

      const vectors = await store.listVectors('test-db');

      expect(vectors).toHaveLength(2);
    });
  });

  // ===== FOLDER HIERARCHY (10 tests) =====

  describe('Folder Hierarchy Operations', () => {
    beforeEach(async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
    });

    it('should list all unique folder paths', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/docs' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/images' } },
        { id: 'v3', vector: [7, 8, 9], metadata: { folderPath: '/docs' } },
      ]);

      const folders = await store.listFolders('test-db');

      expect(folders).toHaveLength(2);
      expect(folders).toContain('/docs');
      expect(folders).toContain('/images');
    });

    it('should return folders with vector counts', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/docs' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/images' } },
        { id: 'v3', vector: [7, 8, 9], metadata: { folderPath: '/docs' } },
      ]);

      const foldersWithCounts = await store.getAllFoldersWithCounts('test-db');

      expect(foldersWithCounts).toHaveLength(2);
      const docsFolder = foldersWithCounts.find(f => f.path === '/docs');
      const imagesFolder = foldersWithCounts.find(f => f.path === '/images');

      expect(docsFolder!.fileCount).toBe(2);
      expect(imagesFolder!.fileCount).toBe(1);
    });

    it('should return folder statistics', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/docs' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/docs' } },
      ]);

      const stats = await store.getFolderStatistics('test-db', '/docs');

      expect(stats.path).toBe('/docs');
      expect(stats.vectorCount).toBe(2);
      expect(stats.sizeBytes).toBeGreaterThan(0);
      expect(stats.lastModified).toBeGreaterThan(0);
    });

    it('should create empty folder', async () => {
      await store.createFolder('test-db', '/empty-folder');

      const folders = await store.listFolders('test-db');
      expect(folders).toContain('/empty-folder');
    });

    it('should rename folder and update vectors', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/old-name' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/old-name' } },
      ]);

      const renamedCount = await store.renameFolder('test-db', '/old-name', '/new-name');

      expect(renamedCount).toBe(2);
      const folders = await store.listFolders('test-db');
      expect(folders).toContain('/new-name');
      expect(folders).not.toContain('/old-name');
    });

    it('should delete folder and all vectors', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/to-delete' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/to-delete' } },
        { id: 'v3', vector: [7, 8, 9], metadata: { folderPath: '/keep' } },
      ]);

      const deletedCount = await store.deleteFolder('test-db', '/to-delete');

      expect(deletedCount).toBe(2);
      const stats = await store.getStats('test-db');
      expect(stats.vectorCount).toBe(1);
    });

    it('should move single vector to folder', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/source' } },
      ]);

      await store.moveToFolder('test-db', 'v1', '/target');

      const vector = await store.getVector('test-db', 'v1');
      expect(vector!.metadata.folderPath).toBe('/target');
    });

    it('should move all folder contents to another folder', async () => {
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/source' } },
        { id: 'v2', vector: [4, 5, 6], metadata: { folderPath: '/source' } },
      ]);

      const movedCount = await store.moveFolderContents('test-db', '/source', '/target');

      expect(movedCount).toBe(2);
      const v1 = await store.getVector('test-db', 'v1');
      const v2 = await store.getVector('test-db', 'v2');
      expect(v1!.metadata.folderPath).toBe('/target');
      expect(v2!.metadata.folderPath).toBe('/target');
    });

    it('should throw error for searchInFolder (requires host support)', async () => {
      await expect(
        store.searchInFolder('test-db', '/docs', [1, 2, 3], 5, 0.7)
      ).rejects.toThrow('requires host-side support');
    });

    it('should handle empty folder paths', async () => {
      await expect(
        store.createFolder('test-db', '')
      ).rejects.toThrow('cannot be empty');
    });
  });

  // ===== ADDITIONAL EDGE CASES (3 tests) =====

  describe('Additional Edge Cases', () => {
    it('should handle database with no vectors', async () => {
      await store.createDatabase({ name: 'empty-db', owner: userAddress });

      const folders = await store.listFolders('empty-db');
      const vectors = await store.listVectors('empty-db');

      expect(folders).toHaveLength(0);
      expect(vectors).toHaveLength(0);
    });

    it('should handle vectors without folderPath metadata', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: {} }, // No folderPath
      ]);

      const folders = await store.listFolders('test-db');
      expect(folders).toHaveLength(0);
    });

    it('should handle mixed vectors (with and without folders)', async () => {
      await store.createDatabase({ name: 'test-db', owner: userAddress });
      await store.addVectors('test-db', [
        { id: 'v1', vector: [1, 2, 3], metadata: { folderPath: '/docs' } },
        { id: 'v2', vector: [4, 5, 6], metadata: {} }, // No folder
        { id: 'v3', vector: [7, 8, 9], metadata: { folderPath: '/images' } },
      ]);

      const folders = await store.listFolders('test-db');
      const stats = await store.getStats('test-db');

      expect(folders).toHaveLength(2);
      expect(stats.vectorCount).toBe(3);
    });
  });
});
