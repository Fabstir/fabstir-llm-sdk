/**
 * Folder Metadata Tests
 * Tests for virtual folder organization via metadata
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';

describe('Folder Metadata', () => {
  let vectorRAGManager: VectorRAGManager;
  let sessionId: string;
  const dbName = 'folder-test-db';
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

  describe('Adding Vectors with Folder Paths', () => {
    it('should add vector with root folder path', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-1',
          values: new Array(384).fill(0.1),
          metadata: { folderPath: '/', content: 'Root document 1' }
        },
        {
          id: 'vec-2',
          values: new Array(384).fill(0.2),
          metadata: { folderPath: '/', content: 'Root document 2' }
        },
        {
          id: 'vec-3',
          values: new Array(384).fill(0.3),
          metadata: { folderPath: '/', content: 'Root document 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      // Verify by listing folders
      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toContain('/');
    });

    it('should add vector with nested folder path', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-4',
          values: new Array(384).fill(0.2),
          metadata: { folderPath: '/documents/2024', content: '2024 document 1' }
        },
        {
          id: 'vec-5',
          values: new Array(384).fill(0.3),
          metadata: { folderPath: '/documents/2024', content: '2024 document 2' }
        },
        {
          id: 'vec-6',
          values: new Array(384).fill(0.4),
          metadata: { folderPath: '/documents/2024', content: '2024 document 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toContain('/documents/2024');
    });

    it('should add multiple vectors to same folder', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-7',
          values: new Array(384).fill(0.3),
          metadata: { folderPath: '/documents', content: 'Doc 1' }
        },
        {
          id: 'vec-8',
          values: new Array(384).fill(0.4),
          metadata: { folderPath: '/documents', content: 'Doc 2' }
        },
        {
          id: 'vec-9',
          values: new Array(384).fill(0.5),
          metadata: { folderPath: '/documents', content: 'Doc 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const stats = await vectorRAGManager.getFolderStatistics(sessionId, '/documents');
      expect(stats.vectorCount).toBe(3);
    });

    it('should add vectors to different folders', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-5',
          values: new Array(384).fill(0.5),
          metadata: { folderPath: '/documents', content: 'Doc' }
        },
        {
          id: 'vec-6',
          values: new Array(384).fill(0.6),
          metadata: { folderPath: '/images', content: 'Image' }
        },
        {
          id: 'vec-7',
          values: new Array(384).fill(0.7),
          metadata: { folderPath: '/videos', content: 'Video' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toHaveLength(3);
      expect(folders).toContain('/documents');
      expect(folders).toContain('/images');
      expect(folders).toContain('/videos');
    });

    it('should handle vectors without folderPath (default to root)', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-8',
          values: new Array(384).fill(0.8),
          metadata: { content: 'No folder specified 1' }
        },
        {
          id: 'vec-9',
          values: new Array(384).fill(0.9),
          metadata: { content: 'No folder specified 2' }
        },
        {
          id: 'vec-10',
          values: new Array(384).fill(1.0),
          metadata: { content: 'No folder specified 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toContain('/'); // Default root folder
    });
  });

  describe('Folder Path Validation', () => {
    it('should accept valid folder path starting with /', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-11',
          values: new Array(384).fill(0.9),
          metadata: { folderPath: '/valid/path', content: 'Valid 1' }
        },
        {
          id: 'vec-12',
          values: new Array(384).fill(1.0),
          metadata: { folderPath: '/valid/path', content: 'Valid 2' }
        },
        {
          id: 'vec-13',
          values: new Array(384).fill(1.1),
          metadata: { folderPath: '/valid/path', content: 'Valid 3' }
        }
      ];

      await expect(
        vectorRAGManager.addVectors(dbName, vectors)
      ).resolves.not.toThrow();
    });

    it('should reject folder path not starting with /', async () => {
      const vector: VectorInput = {
        id: 'vec-10',
        values: new Array(384).fill(1.0),
        metadata: {
          folderPath: 'invalid/path',
          content: 'Invalid'
        }
      };

      await expect(
        vectorRAGManager.addVectors(dbName, [vector])
      ).rejects.toThrow('Folder path must start with /');
    });

    it('should reject folder path ending with /', async () => {
      const vector: VectorInput = {
        id: 'vec-11',
        values: new Array(384).fill(1.1),
        metadata: {
          folderPath: '/documents/',
          content: 'Trailing slash'
        }
      };

      await expect(
        vectorRAGManager.addVectors(dbName, [vector])
      ).rejects.toThrow('Folder path cannot end with /');
    });

    it('should accept root folder path', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-14',
          values: new Array(384).fill(1.2),
          metadata: { folderPath: '/', content: 'Root 1' }
        },
        {
          id: 'vec-15',
          values: new Array(384).fill(1.3),
          metadata: { folderPath: '/', content: 'Root 2' }
        },
        {
          id: 'vec-16',
          values: new Array(384).fill(1.4),
          metadata: { folderPath: '/', content: 'Root 3' }
        }
      ];

      await expect(
        vectorRAGManager.addVectors(dbName, vectors)
      ).resolves.not.toThrow();
    });

    it('should reject empty folder path', async () => {
      const vector: VectorInput = {
        id: 'vec-13',
        values: new Array(384).fill(1.3),
        metadata: {
          folderPath: '',
          content: 'Empty path'
        }
      };

      await expect(
        vectorRAGManager.addVectors(dbName, [vector])
      ).rejects.toThrow('Folder path cannot be empty');
    });

    it('should reject folder path with double slashes', async () => {
      const vector: VectorInput = {
        id: 'vec-14',
        values: new Array(384).fill(1.4),
        metadata: {
          folderPath: '/documents//2024',
          content: 'Double slash'
        }
      };

      await expect(
        vectorRAGManager.addVectors(dbName, [vector])
      ).rejects.toThrow('Folder path cannot contain double slashes');
    });

    it('should handle deep nested paths', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-17',
          values: new Array(384).fill(1.5),
          metadata: { folderPath: '/a/b/c/d/e/f', content: 'Deep nesting 1' }
        },
        {
          id: 'vec-18',
          values: new Array(384).fill(1.6),
          metadata: { folderPath: '/a/b/c/d/e/f', content: 'Deep nesting 2' }
        },
        {
          id: 'vec-19',
          values: new Array(384).fill(1.7),
          metadata: { folderPath: '/a/b/c/d/e/f', content: 'Deep nesting 3' }
        }
      ];

      await expect(
        vectorRAGManager.addVectors(dbName, vectors)
      ).resolves.not.toThrow();
    });
  });

  describe('Listing Folders', () => {
    it('should return empty array when no folders exist', async () => {
      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toHaveLength(0);
    });

    it('should list all unique folder paths', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-16',
          values: new Array(384).fill(1.6),
          metadata: { folderPath: '/documents', content: 'Doc 1' }
        },
        {
          id: 'vec-17',
          values: new Array(384).fill(1.7),
          metadata: { folderPath: '/documents', content: 'Doc 2' }
        },
        {
          id: 'vec-18',
          values: new Array(384).fill(1.8),
          metadata: { folderPath: '/images', content: 'Image 1' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toHaveLength(2);
      expect(folders).toContain('/documents');
      expect(folders).toContain('/images');
    });

    it('should list folders sorted alphabetically', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-19',
          values: new Array(384).fill(1.9),
          metadata: { folderPath: '/zebra', content: 'Z' }
        },
        {
          id: 'vec-20',
          values: new Array(384).fill(2.0),
          metadata: { folderPath: '/alpha', content: 'A' }
        },
        {
          id: 'vec-21',
          values: new Array(384).fill(2.1),
          metadata: { folderPath: '/beta', content: 'B' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toEqual(['/alpha', '/beta', '/zebra']);
    });

    it('should handle 10+ folders', async () => {
      const vectors: VectorInput[] = [];
      for (let i = 0; i < 12; i++) {
        vectors.push({
          id: `vec-${i}`,
          values: new Array(384).fill(i / 10),
          metadata: {
            folderPath: `/folder-${i}`,
            content: `Content ${i}`
          }
        });
      }

      await vectorRAGManager.addVectors(dbName, vectors);

      const folders = await vectorRAGManager.listFolders(sessionId);
      expect(folders).toHaveLength(12);
    });
  });

  describe('Folder Statistics', () => {
    it('should return statistics for a folder', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-22',
          values: new Array(384).fill(2.2),
          metadata: { folderPath: '/stats-test', content: 'Doc 1' }
        },
        {
          id: 'vec-23',
          values: new Array(384).fill(2.3),
          metadata: { folderPath: '/stats-test', content: 'Doc 2' }
        },
        {
          id: 'vec-24',
          values: new Array(384).fill(2.4),
          metadata: { folderPath: '/stats-test', content: 'Doc 3' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const stats = await vectorRAGManager.getFolderStatistics(sessionId, '/stats-test');
      expect(stats.folderPath).toBe('/stats-test');
      expect(stats.vectorCount).toBe(3);
    });

    it('should return zero count for empty folder', async () => {
      const stats = await vectorRAGManager.getFolderStatistics(sessionId, '/empty-folder');
      expect(stats.vectorCount).toBe(0);
    });

    it('should not count vectors from other folders', async () => {
      const vectors: VectorInput[] = [
        {
          id: 'vec-25',
          values: new Array(384).fill(2.5),
          metadata: { folderPath: '/folder-a', content: 'A1' }
        },
        {
          id: 'vec-26',
          values: new Array(384).fill(2.6),
          metadata: { folderPath: '/folder-a', content: 'A2' }
        },
        {
          id: 'vec-27',
          values: new Array(384).fill(2.7),
          metadata: { folderPath: '/folder-b', content: 'B1' }
        }
      ];

      await vectorRAGManager.addVectors(dbName, vectors);

      const statsA = await vectorRAGManager.getFolderStatistics(sessionId, '/folder-a');
      const statsB = await vectorRAGManager.getFolderStatistics(sessionId, '/folder-b');

      expect(statsA.vectorCount).toBe(2);
      expect(statsB.vectorCount).toBe(1);
    });
  });
});
