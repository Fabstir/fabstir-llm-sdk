/**
 * Folder Operations Tests
 * Tests for moving vectors and folder-based search
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';

describe('Folder Operations', () => {
  let vectorRAGManager: VectorRAGManager;
  let sessionId: string;
  const dbName = 'folder-ops-db';
  const testUserAddress = 'test-user-123';
  const testSeedPhrase = 'test seed phrase for vector rag manager';
  const defaultConfig: RAGConfig = {
    s5Portal: 'http://localhost:5522',
    encryptAtRest: true,
    chunkSize: 10000,
    cacheSizeMb: 150
  };

  beforeEach(async () => {
    vectorRAGManager = new VectorRAGManager({
      userAddress: testUserAddress,
      seedPhrase: testSeedPhrase,
      config: defaultConfig
    });

    sessionId = await vectorRAGManager.createSession(dbName);
  });

  afterEach(async () => {
    await vectorRAGManager.destroyAllSessions();
  });

  describe('Moving Vectors Between Folders', () => {
    it('should move single vector to new folder', async () => {
      // Add vectors to /documents
      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { folderPath: '/documents', content: 'Document 1' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { folderPath: '/documents', content: 'Document 2' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { folderPath: '/documents', content: 'Document 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Move to /archive
      await vectorRAGManager.moveToFolder(sessionId, ['vec-1'], '/archive');

      // Verify moved
      const archiveStats = await vectorRAGManager.getFolderStatistics(sessionId, '/archive');
      const docsStats = await vectorRAGManager.getFolderStatistics(sessionId, '/documents');

      expect(archiveStats.vectorCount).toBe(1);
      expect(docsStats.vectorCount).toBe(2);
    });

    it('should move multiple vectors to new folder', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { folderPath: '/temp', content: 'Doc 2' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { folderPath: '/temp', content: 'Doc 3' }
        },
        {
          id: 'vec-4',
          values: new Array(384).fill(0.4),
          metadata: { folderPath: '/temp', content: 'Doc 4' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Move all to /permanent
      await vectorRAGManager.moveToFolder(sessionId, ['vec-2', 'vec-3', 'vec-4'], '/permanent');

      const permStats = await vectorRAGManager.getFolderStatistics(sessionId, '/permanent');
      const tempStats = await vectorRAGManager.getFolderStatistics(sessionId, '/temp');

      expect(permStats.vectorCount).toBe(3);
      expect(tempStats.vectorCount).toBe(0);
    });

    it('should move vectors from different folders to same folder', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-5',
          values: new Array(384).fill(0.5),
          metadata: { folderPath: '/folder-a', content: 'A' }
        },
        {
          id: 'vec-6',
          values: new Array(384).fill(0.6),
          metadata: { folderPath: '/folder-b', content: 'B' }
        },
        {
          id: 'vec-7',
          values: new Array(384).fill(0.7),
          metadata: { folderPath: '/folder-a', content: 'A2' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Move both to /merged
      await vectorRAGManager.moveToFolder(sessionId, ['vec-5', 'vec-6'], '/merged');

      const mergedStats = await vectorRAGManager.getFolderStatistics(sessionId, '/merged');
      expect(mergedStats.vectorCount).toBe(2);
    });

    it('should throw error when moving non-existent vector', async () => {
      await expect(
        vectorRAGManager.moveToFolder(sessionId, ['non-existent'], '/new-folder')
      ).rejects.toThrow('Vector not found');
    });

    it('should validate target folder path', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-8',
          values: new Array(384).fill(0.7),
          metadata: { folderPath: '/documents', content: 'Doc 1' }
        },
        {
          id: 'vec-9',
          values: new Array(384).fill(0.8),
          metadata: { folderPath: '/documents', content: 'Doc 2' }
        },
        {
          id: 'vec-10',
          values: new Array(384).fill(0.9),
          metadata: { folderPath: '/documents', content: 'Doc 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      await expect(
        vectorRAGManager.moveToFolder(sessionId, ['vec-8'], 'invalid/path')
      ).rejects.toThrow('Folder path must start with /');
    });

    it('should handle moving to same folder (no-op)', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-11',
          values: new Array(384).fill(0.8),
          metadata: { folderPath: '/documents', content: 'Doc 1' }
        },
        {
          id: 'vec-12',
          values: new Array(384).fill(0.9),
          metadata: { folderPath: '/documents', content: 'Doc 2' }
        },
        {
          id: 'vec-13',
          values: new Array(384).fill(1.0),
          metadata: { folderPath: '/documents', content: 'Doc 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Move to same folder
      await vectorRAGManager.moveToFolder(sessionId, ['vec-11'], '/documents');

      const stats = await vectorRAGManager.getFolderStatistics(sessionId, '/documents');
      expect(stats.vectorCount).toBe(3);
    });
  });

  describe('Searching Within Folders', () => {
    it('should search only within specified folder', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-14',
          values: new Array(384).fill(0.9),
          metadata: { folderPath: '/documents', content: 'Document about cats' }
        },
        {
          id: 'vec-15',
          values: new Array(384).fill(1.0),
          metadata: { folderPath: '/images', content: 'Picture of cats' }
        },
        {
          id: 'vec-16',
          values: new Array(384).fill(0.85),
          metadata: { folderPath: '/documents', content: 'Another document' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Search in /documents folder only
      const results = await vectorRAGManager.searchInFolder(
        sessionId,
        '/documents',
        new Array(384).fill(0.9),
        { topK: 5 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.metadata.folderPath === '/documents')).toBe(true);
    });

    it('should return empty results when folder is empty', async () => {
      const results = await vectorRAGManager.searchInFolder(
        sessionId,
        '/empty-folder',
        new Array(384).fill(0),
        { topK: 5 }
      );

      expect(results).toHaveLength(0);
    });

    it('should respect topK limit in folder search', async () => {
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 10; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(i / 10),
          metadata: { folderPath: '/many-docs', content: `Doc ${i}` }
        });
      }

      await vectorRAGManager.addVectors(dbName, vectors);

      const results = await vectorRAGManager.searchInFolder(
        sessionId,
        '/many-docs',
        new Array(384).fill(0.5),
        { topK: 3 }
      );

      expect(results).toHaveLength(3);
    });

    it('should throw error when searching in invalid folder path', async () => {
      await expect(
        vectorRAGManager.searchInFolder(
          sessionId,
          'invalid/path',
          new Array(384).fill(0),
          { topK: 5 }
        )
      ).rejects.toThrow('Folder path must start with /');
    });
  });

  describe('Bulk Folder Operations', () => {
    it('should move all vectors from one folder to another', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-11',
          values: new Array(384).fill(1.1),
          metadata: { folderPath: '/old', content: 'Doc 1' }
        },
        {
          id: 'vec-12',
          values: new Array(384).fill(1.2),
          metadata: { folderPath: '/old', content: 'Doc 2' }
        },
        {
          id: 'vec-13',
          values: new Array(384).fill(1.3),
          metadata: { folderPath: '/old', content: 'Doc 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Move all from /old to /new
      await vectorRAGManager.moveFolderContents(sessionId, '/old', '/new');

      const oldStats = await vectorRAGManager.getFolderStatistics(sessionId, '/old');
      const newStats = await vectorRAGManager.getFolderStatistics(sessionId, '/new');

      expect(oldStats.vectorCount).toBe(0);
      expect(newStats.vectorCount).toBe(3);
    });

    it('should not affect vectors in other folders', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-17',
          values: new Array(384).fill(1.4),
          metadata: { folderPath: '/move-from', content: 'Move' }
        },
        {
          id: 'vec-18',
          values: new Array(384).fill(1.5),
          metadata: { folderPath: '/keep', content: 'Keep' }
        },
        {
          id: 'vec-19',
          values: new Array(384).fill(1.6),
          metadata: { folderPath: '/keep', content: 'Keep 2' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      await vectorRAGManager.moveFolderContents(sessionId, '/move-from', '/move-to');

      const keepStats = await vectorRAGManager.getFolderStatistics(sessionId, '/keep');
      expect(keepStats.vectorCount).toBe(2);
    });

    it('should handle empty source folder', async () => {
      await expect(
        vectorRAGManager.moveFolderContents(sessionId, '/empty', '/target')
      ).resolves.not.toThrow();

      const targetStats = await vectorRAGManager.getFolderStatistics(sessionId, '/target');
      expect(targetStats.vectorCount).toBe(0);
    });
  });
});
