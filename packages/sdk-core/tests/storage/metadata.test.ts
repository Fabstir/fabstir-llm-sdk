/**
 * Folder Metadata Tests
 * Tests metadata tracking, updates, and propagation
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Folder Metadata', () => {
  let StorageManager: any;
  let storageManager: any;
  let testUserAddress: string;
  let testSeedPhrase: string;
  const testDbName = 'test-metadata';

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

  describe('Basic Metadata', () => {
    it('should track folder creation timestamp', async () => {
      const beforeCreate = Date.now();
      await storageManager.createFolder(testDbName, '/timestamped');
      const afterCreate = Date.now();

      const metadata = await storageManager.getFolderMetadata(testDbName, '/timestamped');
      expect(metadata.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(metadata.createdAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should track folder last modified timestamp', async () => {
      await storageManager.createFolder(testDbName, '/modified');

      // Wait a moment and modify
      await new Promise(resolve => setTimeout(resolve, 10));
      await storageManager.createFolder(testDbName, '/modified/child');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/modified');
      expect(metadata.lastModified).toBeGreaterThan(metadata.createdAt);
    });

    it('should initialize file and folder counts to zero', async () => {
      await storageManager.createFolder(testDbName, '/empty');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/empty');
      expect(metadata.fileCount).toBe(0);
      expect(metadata.folderCount).toBe(0);
    });

    it('should track folder size (initially zero)', async () => {
      await storageManager.createFolder(testDbName, '/sized');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/sized');
      expect(metadata.totalSize).toBe(0);
    });
  });

  describe('File Count Tracking', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/files');
    });

    it('should increment file count when file is added', async () => {
      // Add a file (simulated via metadata update)
      await storageManager.addFileToFolder(testDbName, '/files', {
        name: 'doc.txt',
        size: 1024
      });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/files');
      expect(metadata.fileCount).toBe(1);
    });

    it('should decrement file count when file is removed', async () => {
      await storageManager.addFileToFolder(testDbName, '/files', { name: 'doc1.txt', size: 512 });
      await storageManager.addFileToFolder(testDbName, '/files', { name: 'doc2.txt', size: 512 });

      await storageManager.removeFileFromFolder(testDbName, '/files', 'doc1.txt');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/files');
      expect(metadata.fileCount).toBe(1);
    });

    it('should track file count recursively', async () => {
      await storageManager.createFolder(testDbName, '/files/subfolder');
      await storageManager.addFileToFolder(testDbName, '/files', { name: 'root.txt', size: 100 });
      await storageManager.addFileToFolder(testDbName, '/files/subfolder', { name: 'sub.txt', size: 100 });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/files', { recursive: true });
      expect(metadata.fileCount).toBe(2);  // root.txt + sub.txt
    });

    it('should not count files recursively by default', async () => {
      await storageManager.createFolder(testDbName, '/files/subfolder');
      await storageManager.addFileToFolder(testDbName, '/files', { name: 'root.txt', size: 100 });
      await storageManager.addFileToFolder(testDbName, '/files/subfolder', { name: 'sub.txt', size: 100 });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/files');
      expect(metadata.fileCount).toBe(1);  // Only root.txt
    });
  });

  describe('Folder Count Tracking', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/parent');
    });

    it('should increment folder count when subfolder is created', async () => {
      await storageManager.createFolder(testDbName, '/parent/child1');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/parent');
      expect(metadata.folderCount).toBe(1);
    });

    it('should decrement folder count when subfolder is deleted', async () => {
      await storageManager.createFolder(testDbName, '/parent/child1');
      await storageManager.createFolder(testDbName, '/parent/child2');

      await storageManager.deleteFolder(testDbName, '/parent/child1');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/parent');
      expect(metadata.folderCount).toBe(1);
    });

    it('should track folder count recursively', async () => {
      await storageManager.createFolder(testDbName, '/parent/child1/grandchild1');
      await storageManager.createFolder(testDbName, '/parent/child2');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/parent', { recursive: true });
      expect(metadata.folderCount).toBe(3);  // child1, child2, grandchild1
    });
  });

  describe('Size Tracking', () => {
    beforeEach(async () => {
      await storageManager.createFolder(testDbName, '/sized');
    });

    it('should update total size when file is added', async () => {
      await storageManager.addFileToFolder(testDbName, '/sized', { name: 'file.txt', size: 2048 });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/sized');
      expect(metadata.totalSize).toBe(2048);
    });

    it('should update total size when file is removed', async () => {
      await storageManager.addFileToFolder(testDbName, '/sized', { name: 'file1.txt', size: 1024 });
      await storageManager.addFileToFolder(testDbName, '/sized', { name: 'file2.txt', size: 2048 });

      await storageManager.removeFileFromFolder(testDbName, '/sized', 'file1.txt');

      const metadata = await storageManager.getFolderMetadata(testDbName, '/sized');
      expect(metadata.totalSize).toBe(2048);
    });

    it('should calculate recursive size including subfolders', async () => {
      await storageManager.createFolder(testDbName, '/sized/subfolder');
      await storageManager.addFileToFolder(testDbName, '/sized', { name: 'root.txt', size: 1000 });
      await storageManager.addFileToFolder(testDbName, '/sized/subfolder', { name: 'sub.txt', size: 2000 });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/sized', { recursive: true });
      expect(metadata.totalSize).toBe(3000);
    });

    it('should format size in human-readable units', async () => {
      await storageManager.addFileToFolder(testDbName, '/sized', { name: 'large.bin', size: 1024 * 1024 * 5 });

      const metadata = await storageManager.getFolderMetadata(testDbName, '/sized', { formatSize: true });
      expect(metadata.totalSizeFormatted).toBe('5.00 MB');
    });
  });

  describe('Timestamp Propagation', () => {
    it('should update parent lastModified when child is created', async () => {
      await storageManager.createFolder(testDbName, '/parent');
      const parentBefore = await storageManager.getFolderMetadata(testDbName, '/parent');

      await new Promise(resolve => setTimeout(resolve, 10));
      await storageManager.createFolder(testDbName, '/parent/child');

      const parentAfter = await storageManager.getFolderMetadata(testDbName, '/parent');
      expect(parentAfter.lastModified).toBeGreaterThan(parentBefore.lastModified);
    });

    it('should update parent lastModified when file is added', async () => {
      await storageManager.createFolder(testDbName, '/parent');
      const parentBefore = await storageManager.getFolderMetadata(testDbName, '/parent');

      await new Promise(resolve => setTimeout(resolve, 10));
      await storageManager.addFileToFolder(testDbName, '/parent', { name: 'new.txt', size: 100 });

      const parentAfter = await storageManager.getFolderMetadata(testDbName, '/parent');
      expect(parentAfter.lastModified).toBeGreaterThan(parentBefore.lastModified);
    });

    it('should propagate timestamp to all ancestors', async () => {
      await storageManager.createFolder(testDbName, '/a/b/c');
      const aBefore = await storageManager.getFolderMetadata(testDbName, '/a');
      const bBefore = await storageManager.getFolderMetadata(testDbName, '/a/b');

      await new Promise(resolve => setTimeout(resolve, 10));
      await storageManager.addFileToFolder(testDbName, '/a/b/c', { name: 'deep.txt', size: 50 });

      const aAfter = await storageManager.getFolderMetadata(testDbName, '/a');
      const bAfter = await storageManager.getFolderMetadata(testDbName, '/a/b');

      expect(aAfter.lastModified).toBeGreaterThan(aBefore.lastModified);
      expect(bAfter.lastModified).toBeGreaterThan(bBefore.lastModified);
    });
  });

  describe('Metadata on Move/Rename', () => {
    it('should preserve createdAt when folder is moved', async () => {
      await storageManager.createFolder(testDbName, '/source/folder');
      const metaBefore = await storageManager.getFolderMetadata(testDbName, '/source/folder');

      await storageManager.createFolder(testDbName, '/dest');
      await storageManager.moveFolder(testDbName, '/source/folder', '/dest/folder');

      const metaAfter = await storageManager.getFolderMetadata(testDbName, '/dest/folder');
      expect(metaAfter.createdAt).toBe(metaBefore.createdAt);
    });

    it('should update lastModified when folder is moved', async () => {
      await storageManager.createFolder(testDbName, '/source/folder');
      const metaBefore = await storageManager.getFolderMetadata(testDbName, '/source/folder');

      await new Promise(resolve => setTimeout(resolve, 10));
      await storageManager.createFolder(testDbName, '/dest');
      await storageManager.moveFolder(testDbName, '/source/folder', '/dest/folder');

      const metaAfter = await storageManager.getFolderMetadata(testDbName, '/dest/folder');
      expect(metaAfter.lastModified).toBeGreaterThan(metaBefore.lastModified);
    });

    it('should preserve createdAt when folder is renamed', async () => {
      await storageManager.createFolder(testDbName, '/parent/old-name');
      const metaBefore = await storageManager.getFolderMetadata(testDbName, '/parent/old-name');

      await storageManager.renameFolder(testDbName, '/parent/old-name', 'new-name');

      const metaAfter = await storageManager.getFolderMetadata(testDbName, '/parent/new-name');
      expect(metaAfter.createdAt).toBe(metaBefore.createdAt);
    });
  });

  describe('Metadata Persistence', () => {
    it('should save metadata with hierarchy', async () => {
      await storageManager.createFolder(testDbName, '/persistent');
      await storageManager.addFileToFolder(testDbName, '/persistent', { name: 'file.txt', size: 512 });

      const cid = await storageManager.saveHierarchy(testDbName);
      expect(cid).toBeDefined();

      // Clear and reload
      await storageManager.deleteFolder(testDbName, '/', true);
      await storageManager.loadHierarchy(testDbName, cid);

      const metadata = await storageManager.getFolderMetadata(testDbName, '/persistent');
      expect(metadata.fileCount).toBe(1);
      expect(metadata.totalSize).toBe(512);
    });

    it('should maintain metadata accuracy after multiple saves/loads', async () => {
      await storageManager.createFolder(testDbName, '/test');
      await storageManager.addFileToFolder(testDbName, '/test', { name: 'a.txt', size: 100 });

      const cid1 = await storageManager.saveHierarchy(testDbName);

      await storageManager.addFileToFolder(testDbName, '/test', { name: 'b.txt', size: 200 });
      const cid2 = await storageManager.saveHierarchy(testDbName);

      // Load second version
      await storageManager.loadHierarchy(testDbName, cid2);
      const metadata = await storageManager.getFolderMetadata(testDbName, '/test');
      expect(metadata.fileCount).toBe(2);
      expect(metadata.totalSize).toBe(300);
    });
  });
});
