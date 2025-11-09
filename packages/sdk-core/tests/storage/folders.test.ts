/**
 * Folder Operations Tests
 * Tests virtual folder creation, listing, and deletion
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Folder Operations', () => {
  let StorageManager: any;
  let storageManager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;
  const testDbName = 'test-docs';

  beforeEach(async () => {
    const module = await import('../../src/managers/StorageManager.js');
    StorageManager = module.StorageManager;

    testUserAddress = process.env.TEST_USER_1_ADDRESS!;
    testSeedPhrase = process.env.S5_SEED_PHRASE!;

    // Initialize storage manager
    storageManager = new StorageManager();
    await storageManager.initialize(testSeedPhrase, testUserAddress);
  });

  afterEach(async () => {
    // Cleanup: remove test database hierarchy
    try {
      await storageManager.deleteFolder(testDbName, '/', true);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Folder Creation', () => {
    it('should create folder at root level', async () => {
      await storageManager.createFolder(testDbName, '/documents');

      const folders = await storageManager.listFolder(testDbName, '/');
      expect(folders.some((f: any) => f.name === 'documents' && f.type === 'folder')).toBe(true);
    });

    it('should create nested folders', async () => {
      await storageManager.createFolder(testDbName, '/documents/tech');

      const folders = await storageManager.listFolder(testDbName, '/documents');
      expect(folders.some((f: any) => f.name === 'tech')).toBe(true);
    });

    it('should create folder with multiple levels at once', async () => {
      await storageManager.createFolder(testDbName, '/projects/2024/Q1/reports');

      const level1 = await storageManager.listFolder(testDbName, '/projects');
      const level2 = await storageManager.listFolder(testDbName, '/projects/2024');
      const level3 = await storageManager.listFolder(testDbName, '/projects/2024/Q1');

      expect(level1.some((f: any) => f.name === '2024')).toBe(true);
      expect(level2.some((f: any) => f.name === 'Q1')).toBe(true);
      expect(level3.some((f: any) => f.name === 'reports')).toBe(true);
    });

    it('should fail to create folder with invalid name', async () => {
      await expect(storageManager.createFolder(testDbName, '/invalid/../path')).rejects.toThrow('Invalid path');
      await expect(storageManager.createFolder(testDbName, '/folder//double-slash')).rejects.toThrow('Invalid path');
      await expect(storageManager.createFolder(testDbName, '/folder*invalid')).rejects.toThrow('Invalid folder name');
    });

    it('should fail to create folder exceeding max depth', async () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/k/l/m';  // 13 levels
      await expect(storageManager.createFolder(testDbName, deepPath)).rejects.toThrow('Maximum folder depth exceeded');
    });

    it('should not create duplicate folders', async () => {
      await storageManager.createFolder(testDbName, '/documents');
      await expect(storageManager.createFolder(testDbName, '/documents')).rejects.toThrow('Folder already exists');
    });

    it('should validate folder names', async () => {
      // Valid names
      await expect(storageManager.createFolder(testDbName, '/valid-name')).resolves.not.toThrow();
      await expect(storageManager.createFolder(testDbName, '/valid_name_2')).resolves.not.toThrow();
      await expect(storageManager.createFolder(testDbName, '/valid.name')).resolves.not.toThrow();

      // Invalid names
      await expect(storageManager.createFolder(testDbName, '/<invalid>')).rejects.toThrow();
      await expect(storageManager.createFolder(testDbName, '/invalid:name')).rejects.toThrow();
    });
  });

  describe('Folder Listing', () => {
    beforeEach(async () => {
      // Setup test structure
      await storageManager.createFolder(testDbName, '/documents');
      await storageManager.createFolder(testDbName, '/images');
      await storageManager.createFolder(testDbName, '/documents/tech');
      await storageManager.createFolder(testDbName, '/documents/health');
    });

    it('should list root level folders', async () => {
      const folders = await storageManager.listFolder(testDbName, '/');

      expect(folders.length).toBeGreaterThanOrEqual(2);
      expect(folders.some((f: any) => f.name === 'documents')).toBe(true);
      expect(folders.some((f: any) => f.name === 'images')).toBe(true);
    });

    it('should list nested folders', async () => {
      const folders = await storageManager.listFolder(testDbName, '/documents');

      expect(folders.length).toBe(2);
      expect(folders.some((f: any) => f.name === 'tech')).toBe(true);
      expect(folders.some((f: any) => f.name === 'health')).toBe(true);
    });

    it('should return empty array for empty folder', async () => {
      await storageManager.createFolder(testDbName, '/empty-folder');
      const folders = await storageManager.listFolder(testDbName, '/empty-folder');

      expect(folders).toEqual([]);
    });

    it('should fail to list non-existent folder', async () => {
      await expect(storageManager.listFolder(testDbName, '/non-existent')).rejects.toThrow('Folder not found');
    });

    it('should support pagination for large folders', async () => {
      // Create 150 folders
      for (let i = 0; i < 150; i++) {
        await storageManager.createFolder(testDbName, `/many/folder-${i}`);
      }

      // List with limit
      const page1 = await storageManager.listFolder(testDbName, '/many', { limit: 50 });
      expect(page1.items.length).toBe(50);
      expect(page1.cursor).toBeDefined();

      // Get next page
      const page2 = await storageManager.listFolder(testDbName, '/many', {
        limit: 50,
        cursor: page1.cursor
      });
      expect(page2.items.length).toBe(50);
    });

    it('should include folder metadata in listing', async () => {
      const folders = await storageManager.listFolder(testDbName, '/documents');

      folders.forEach((folder: any) => {
        expect(folder).toHaveProperty('name');
        expect(folder).toHaveProperty('type');
        expect(folder).toHaveProperty('path');
        expect(folder.type).toBe('folder');
      });
    });
  });

  describe('Folder Deletion', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/temp');
      await storageManager.createFolder(testDbName, '/temp/sub1');
      await storageManager.createFolder(testDbName, '/temp/sub2');
    });

    it('should delete empty folder', async () => {
      await storageManager.createFolder(testDbName, '/to-delete');
      await storageManager.deleteFolder(testDbName, '/to-delete');

      const folders = await storageManager.listFolder(testDbName, '/');
      expect(folders.some((f: any) => f.name === 'to-delete')).toBe(false);
    });

    it('should fail to delete non-empty folder without recursive flag', async () => {
      await expect(storageManager.deleteFolder(testDbName, '/temp')).rejects.toThrow('Folder not empty');
    });

    it('should recursively delete folder with children', async () => {
      await storageManager.deleteFolder(testDbName, '/temp', true);

      const folders = await storageManager.listFolder(testDbName, '/');
      expect(folders.some((f: any) => f.name === 'temp')).toBe(false);
    });

    it('should fail to delete non-existent folder', async () => {
      await expect(storageManager.deleteFolder(testDbName, '/non-existent')).rejects.toThrow('Folder not found');
    });

    it('should not delete root folder', async () => {
      await expect(storageManager.deleteFolder(testDbName, '/')).rejects.toThrow('Cannot delete root folder');
    });

    it('should delete folder with deleteVectors option', async () => {
      // This test verifies the deleteVectors parameter works
      // Actual vector deletion tested in integration tests
      await storageManager.createFolder(testDbName, '/with-vectors');

      await expect(
        storageManager.deleteFolder(testDbName, '/with-vectors', true, { deleteVectors: true })
      ).resolves.not.toThrow();
    });
  });

  describe('Folder Path Normalization', () => {
    it('should normalize paths with trailing slashes', async () => {
      await storageManager.createFolder(testDbName, '/documents/');
      const folders = await storageManager.listFolder(testDbName, '/');

      expect(folders.some((f: any) => f.name === 'documents')).toBe(true);
    });

    it('should normalize paths with multiple leading slashes', async () => {
      await storageManager.createFolder(testDbName, '///documents');
      const folders = await storageManager.listFolder(testDbName, '/');

      expect(folders.some((f: any) => f.name === 'documents')).toBe(true);
    });

    it('should treat paths as case-sensitive', async () => {
      await storageManager.createFolder(testDbName, '/Documents');
      await storageManager.createFolder(testDbName, '/documents');

      const folders = await storageManager.listFolder(testDbName, '/');
      const names = folders.map((f: any) => f.name);

      expect(names).toContain('Documents');
      expect(names).toContain('documents');
      expect(folders.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing database name', async () => {
      await expect(storageManager.createFolder('', '/test')).rejects.toThrow('Database name is required');
    });

    it('should handle empty path', async () => {
      await expect(storageManager.createFolder(testDbName, '')).rejects.toThrow('Path is required');
    });

    it('should handle concurrent folder creation', async () => {
      const promises = [
        storageManager.createFolder(testDbName, '/concurrent1'),
        storageManager.createFolder(testDbName, '/concurrent2'),
        storageManager.createFolder(testDbName, '/concurrent3')
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      const folders = await storageManager.listFolder(testDbName, '/');
      expect(folders.length).toBeGreaterThanOrEqual(3);
    });
  });
});
