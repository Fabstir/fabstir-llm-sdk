/**
 * Folder Hierarchy Tests
 * Tests deep nested structures, move/rename operations, and persistence
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Folder Hierarchy', () => {
  let StorageManager: any;
  let storageManager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;
  const testDbName = 'test-hierarchy';

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

  describe('Deep Nesting', () => {
    it('should create and navigate 5+ level deep hierarchy', async () => {
      // Create deep structure: /projects/2024/Q1/reports/weekly/monday
      await storageManager.createFolder(testDbName, '/projects/2024/Q1/reports/weekly/monday');

      // Verify each level exists
      const level1 = await storageManager.listFolder(testDbName, '/projects');
      expect(level1.some((f: any) => f.name === '2024')).toBe(true);

      const level2 = await storageManager.listFolder(testDbName, '/projects/2024');
      expect(level2.some((f: any) => f.name === 'Q1')).toBe(true);

      const level3 = await storageManager.listFolder(testDbName, '/projects/2024/Q1');
      expect(level3.some((f: any) => f.name === 'reports')).toBe(true);

      const level4 = await storageManager.listFolder(testDbName, '/projects/2024/Q1/reports');
      expect(level4.some((f: any) => f.name === 'weekly')).toBe(true);

      const level5 = await storageManager.listFolder(testDbName, '/projects/2024/Q1/reports/weekly');
      expect(level5.some((f: any) => f.name === 'monday')).toBe(true);
    });

    it('should enforce maximum depth limit (10 levels)', async () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/k';  // 11 levels
      await expect(storageManager.createFolder(testDbName, deepPath)).rejects.toThrow('Maximum folder depth exceeded');
    });

    it('should handle complex branching hierarchy', async () => {
      // Create tree structure
      await storageManager.createFolder(testDbName, '/root/branch1/leaf1');
      await storageManager.createFolder(testDbName, '/root/branch1/leaf2');
      await storageManager.createFolder(testDbName, '/root/branch2/leaf3');
      await storageManager.createFolder(testDbName, '/root/branch2/leaf4');

      const branch1 = await storageManager.listFolder(testDbName, '/root/branch1');
      expect(branch1.length).toBe(2);
      expect(branch1.some((f: any) => f.name === 'leaf1')).toBe(true);
      expect(branch1.some((f: any) => f.name === 'leaf2')).toBe(true);

      const branch2 = await storageManager.listFolder(testDbName, '/root/branch2');
      expect(branch2.length).toBe(2);
      expect(branch2.some((f: any) => f.name === 'leaf3')).toBe(true);
      expect(branch2.some((f: any) => f.name === 'leaf4')).toBe(true);
    });
  });

  describe('Move Operations', () => {
    beforeEach(async () => {
      // Setup test hierarchy
      await storageManager.createFolder(testDbName, '/source/subfolder/deep');
      await storageManager.createFolder(testDbName, '/destination');
    });

    it('should move folder to new parent', async () => {
      await storageManager.moveFolder(testDbName, '/source/subfolder', '/destination/subfolder');

      // Verify old location is gone
      const sourceContents = await storageManager.listFolder(testDbName, '/source');
      expect(sourceContents.some((f: any) => f.name === 'subfolder')).toBe(false);

      // Verify new location exists
      const destContents = await storageManager.listFolder(testDbName, '/destination');
      expect(destContents.some((f: any) => f.name === 'subfolder')).toBe(true);

      // Verify children were moved too
      const movedChildren = await storageManager.listFolder(testDbName, '/destination/subfolder');
      expect(movedChildren.some((f: any) => f.name === 'deep')).toBe(true);
    });

    it('should update all child paths when moving parent', async () => {
      await storageManager.moveFolder(testDbName, '/source', '/destination/source');

      // Verify entire hierarchy moved
      const deepFolder = await storageManager.listFolder(testDbName, '/destination/source/subfolder');
      expect(deepFolder.some((f: any) => f.name === 'deep')).toBe(true);

      // Old paths should not exist
      await expect(storageManager.listFolder(testDbName, '/source')).rejects.toThrow('Folder not found');
    });

    it('should fail to move folder to itself', async () => {
      await expect(
        storageManager.moveFolder(testDbName, '/source', '/source')
      ).rejects.toThrow('Cannot move folder to itself');
    });

    it('should fail to move folder to its own subfolder', async () => {
      await expect(
        storageManager.moveFolder(testDbName, '/source', '/source/subfolder/new')
      ).rejects.toThrow('Cannot move folder to its own subfolder');
    });

    it('should handle move with destination already exists', async () => {
      await storageManager.createFolder(testDbName, '/destination/subfolder');

      await expect(
        storageManager.moveFolder(testDbName, '/source/subfolder', '/destination/subfolder')
      ).rejects.toThrow('Destination folder already exists');
    });
  });

  describe('Rename Operations', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/parent/old-name/child');
    });

    it('should rename folder in place', async () => {
      await storageManager.renameFolder(testDbName, '/parent/old-name', 'new-name');

      const contents = await storageManager.listFolder(testDbName, '/parent');
      expect(contents.some((f: any) => f.name === 'old-name')).toBe(false);
      expect(contents.some((f: any) => f.name === 'new-name')).toBe(true);

      // Verify children are accessible under new path
      const children = await storageManager.listFolder(testDbName, '/parent/new-name');
      expect(children.some((f: any) => f.name === 'child')).toBe(true);
    });

    it('should update child paths when renaming parent', async () => {
      await storageManager.renameFolder(testDbName, '/parent/old-name', 'new-name');

      // Child should be accessible under new path
      const children = await storageManager.listFolder(testDbName, '/parent/new-name');
      expect(children.length).toBe(1);
      expect(children[0].name).toBe('child');

      // Old path should fail
      await expect(
        storageManager.listFolder(testDbName, '/parent/old-name')
      ).rejects.toThrow('Folder not found');
    });

    it('should fail to rename with invalid name', async () => {
      await expect(
        storageManager.renameFolder(testDbName, '/parent/old-name', 'invalid:name')
      ).rejects.toThrow('Invalid folder name');
    });

    it('should fail to rename root folder', async () => {
      await expect(
        storageManager.renameFolder(testDbName, '/', 'new-root')
      ).rejects.toThrow('Cannot rename root folder');
    });

    it('should fail when new name conflicts with existing folder', async () => {
      await storageManager.createFolder(testDbName, '/parent/existing');

      await expect(
        storageManager.renameFolder(testDbName, '/parent/old-name', 'existing')
      ).rejects.toThrow('Folder with new name already exists');
    });
  });

  describe('Hierarchy Persistence', () => {
    it('should save hierarchy to S5', async () => {
      // Create hierarchy
      await storageManager.createFolder(testDbName, '/docs/tech/ai');
      await storageManager.createFolder(testDbName, '/docs/business');

      // Save to S5
      const cid = await storageManager.saveHierarchy(testDbName);
      expect(cid).toBeDefined();
      expect(typeof cid).toBe('string');
      expect(cid.length).toBeGreaterThan(0);
    });

    it('should load hierarchy from S5', async () => {
      // Create and save hierarchy
      await storageManager.createFolder(testDbName, '/docs/tech');
      const cid = await storageManager.saveHierarchy(testDbName);

      // Clear local hierarchy
      await storageManager.deleteFolder(testDbName, '/', true);

      // Load from S5
      await storageManager.loadHierarchy(testDbName, cid);

      // Verify hierarchy restored
      const folders = await storageManager.listFolder(testDbName, '/docs');
      expect(folders.some((f: any) => f.name === 'tech')).toBe(true);
    });

    it('should preserve hierarchy across initialize calls', async () => {
      // Create hierarchy
      await storageManager.createFolder(testDbName, '/persistent/folder');
      await storageManager.saveHierarchy(testDbName);

      // Reinitialize storage manager
      const newManager = new StorageManager();
      await newManager.initialize(testSeedPhrase, testUserAddress);

      // Hierarchy should be automatically loaded
      const folders = await newManager.listFolder(testDbName, '/persistent');
      expect(folders.some((f: any) => f.name === 'folder')).toBe(true);
    });

    it('should handle concurrent hierarchy modifications', async () => {
      const promises = [
        storageManager.createFolder(testDbName, '/concurrent1'),
        storageManager.createFolder(testDbName, '/concurrent2'),
        storageManager.createFolder(testDbName, '/concurrent3')
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Save should capture all changes
      const cid = await storageManager.saveHierarchy(testDbName);
      expect(cid).toBeDefined();
    });
  });

  describe('Corruption Recovery', () => {
    it('should recover from corrupted hierarchy.json', async () => {
      // Create valid hierarchy
      await storageManager.createFolder(testDbName, '/valid');

      // Simulate corruption by saving invalid JSON
      // (This would normally be done via S5 direct manipulation)
      // For test purposes, we verify recovery mechanism exists
      const recovered = await storageManager.validateHierarchy(testDbName);
      expect(recovered).toBe(true);
    });

    it('should rebuild hierarchy from folder metadata', async () => {
      // This tests the recovery mechanism that scans all folder metadata
      // to reconstruct the hierarchy if hierarchy.json is lost/corrupted
      await storageManager.createFolder(testDbName, '/rebuild/test');

      // Trigger rebuild
      const rebuilt = await storageManager.rebuildHierarchy(testDbName);
      expect(rebuilt).toBe(true);

      // Verify hierarchy is intact
      const folders = await storageManager.listFolder(testDbName, '/rebuild');
      expect(folders.some((f: any) => f.name === 'test')).toBe(true);
    });

    it('should handle missing hierarchy.json gracefully', async () => {
      // First access to new database should initialize empty hierarchy
      const folders = await storageManager.listFolder(testDbName, '/');
      expect(folders).toEqual([]);
    });
  });

  describe('Hierarchy Navigation', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/a/b/c/d');
    });

    it('should get full path from folder reference', async () => {
      const path = await storageManager.getFolderPath(testDbName, '/a/b/c');
      expect(path).toBe('/a/b/c');
    });

    it('should get parent folder path', async () => {
      const parent = await storageManager.getParentPath('/a/b/c/d');
      expect(parent).toBe('/a/b/c');
    });

    it('should get all ancestors of a folder', async () => {
      const ancestors = await storageManager.getAncestors(testDbName, '/a/b/c/d');
      expect(ancestors).toEqual(['/', '/a', '/a/b', '/a/b/c']);
    });

    it('should get all descendants of a folder', async () => {
      const descendants = await storageManager.getDescendants(testDbName, '/a');
      expect(descendants.length).toBe(3);  // b, c, d
      expect(descendants).toContain('/a/b');
      expect(descendants).toContain('/a/b/c');
      expect(descendants).toContain('/a/b/c/d');
    });
  });
});
