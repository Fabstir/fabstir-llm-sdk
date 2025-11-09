// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionStorage } from '../../src/storage/PermissionStorage';
import type { Permission, PermissionLevel } from '../../src/types/permissions.types';
import { EncryptionManager } from '../../src/encryption/EncryptionManager';

// Polyfill for IndexedDB (required by S5)
import 'fake-indexeddb/auto';

describe('PermissionStorage', () => {
  let storage: PermissionStorage;
  let mockS5Client: any;
  let mockEncryptionManager: EncryptionManager;
  const testUserSeed = 'test-seed-phrase-for-permission-storage';
  const testUserAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const testResourceId = 'sg-12345';
  const testGranteeAddress = '0x1234567890123456789012345678901234567890';

  const createMockPermission = (overrides?: Partial<Permission>): Permission => ({
    id: 'pm-123',
    resourceId: testResourceId,
    resourceType: 'session_group',
    grantedTo: testGranteeAddress,
    level: 'reader' as PermissionLevel,
    grantedBy: testUserAddress,
    grantedAt: new Date(),
    deleted: false,
    ...overrides,
  });

  beforeEach(() => {
    // Mock S5 client
    mockS5Client = {
      fs: {
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(new Uint8Array()),
        readdir: vi.fn().mockResolvedValue([]),
        deleteFile: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Mock EncryptionManager
    mockEncryptionManager = {
      getPublicKey: vi.fn().mockReturnValue('mock-public-key'),
      encryptForStorage: vi.fn().mockImplementation(async (pubKey, data) => ({
        encrypted: JSON.stringify(data),
        nonce: 'mock-nonce',
      })),
      decryptFromStorage: vi.fn().mockImplementation(async (encrypted) => {
        return JSON.parse(encrypted.encrypted);
      }),
    } as any;

    storage = new PermissionStorage(
      mockS5Client,
      testUserSeed,
      testUserAddress,
      mockEncryptionManager
    );
  });

  describe('save()', () => {
    it('should save permission to S5 with encryption', async () => {
      const permission = createMockPermission();

      await storage.save(permission);

      expect(mockEncryptionManager.encryptForStorage).toHaveBeenCalled();
      expect(mockS5Client.fs.writeFile).toHaveBeenCalled();

      const writeCall = mockS5Client.fs.writeFile.mock.calls[0];
      const path = writeCall[0];
      expect(path).toContain('home/permissions');
      expect(path).toContain(testUserAddress);
      expect(path).toContain(testResourceId);
      expect(path).toContain(testGranteeAddress);
    });

    it('should update cache after saving', async () => {
      const permission = createMockPermission();

      await storage.save(permission);

      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(1);
      expect(cached[0].id).toBe(permission.id);
    });

    it('should update existing permission in cache', async () => {
      const permission1 = createMockPermission({ level: 'reader' as PermissionLevel });
      const permission2 = createMockPermission({ level: 'writer' as PermissionLevel });

      await storage.save(permission1);
      await storage.save(permission2);

      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(1);
      expect(cached[0].level).toBe('writer');
    });

    it('should throw error if encryptionManager is missing', async () => {
      const storageNoEncryption = new PermissionStorage(
        mockS5Client,
        testUserSeed,
        testUserAddress
      );

      await expect(
        storageNoEncryption.save(createMockPermission())
      ).rejects.toThrow('EncryptionManager required');
    });
  });

  describe('load()', () => {
    it('should load permission from S5', async () => {
      const permission = createMockPermission();
      const encryptedData = await mockEncryptionManager.encryptForStorage('key', permission);

      mockS5Client.fs.readFile.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(encryptedData))
      );

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(permission.id);
      expect(mockS5Client.fs.readFile).toHaveBeenCalled();
    });

    it('should return null if permission not found', async () => {
      mockS5Client.fs.readFile.mockRejectedValue(new Error('not found'));

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeNull();
    });

    it('should load from cache if available', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      // Reset mock to verify it's not called again
      mockS5Client.fs.readFile.mockClear();

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(mockS5Client.fs.readFile).not.toHaveBeenCalled();
    });

    it('should convert date strings to Date objects', async () => {
      const permission = createMockPermission();
      const encryptedData = await mockEncryptionManager.encryptForStorage('key', {
        ...permission,
        grantedAt: permission.grantedAt.toISOString(), // Simulate JSON string
      });

      mockS5Client.fs.readFile.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(encryptedData))
      );

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded?.grantedAt).toBeInstanceOf(Date);
    });
  });

  describe('loadAll()', () => {
    it('should load all permissions for a resource', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      mockS5Client.fs.readdir.mockResolvedValue([
        { name: `${grantee1}.json`, type: 1 },
        { name: `${grantee2}.json`, type: 1 },
      ]);

      const perm1 = createMockPermission({ grantedTo: grantee1 });
      const perm2 = createMockPermission({ grantedTo: grantee2 });

      mockS5Client.fs.readFile
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(
            await mockEncryptionManager.encryptForStorage('key', perm1)
          ))
        )
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(
            await mockEncryptionManager.encryptForStorage('key', perm2)
          ))
        );

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions.length).toBe(2);
      expect(permissions.some(p => p.grantedTo === grantee1)).toBe(true);
      expect(permissions.some(p => p.grantedTo === grantee2)).toBe(true);
    });

    it('should return empty array if resource has no permissions', async () => {
      mockS5Client.fs.readdir.mockRejectedValue(new Error('not found'));

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions).toEqual([]);
    });

    it('should exclude deleted permissions', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      mockS5Client.fs.readdir.mockResolvedValue([
        { name: `${grantee1}.json`, type: 1 },
        { name: `${grantee2}.json`, type: 1 },
      ]);

      const perm1 = createMockPermission({ grantedTo: grantee1, deleted: true });
      const perm2 = createMockPermission({ grantedTo: grantee2, deleted: false });

      mockS5Client.fs.readFile
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(
            await mockEncryptionManager.encryptForStorage('key', perm1)
          ))
        )
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(
            await mockEncryptionManager.encryptForStorage('key', perm2)
          ))
        );

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions.length).toBe(1);
      expect(permissions[0].grantedTo).toBe(grantee2);
    });

    it('should skip corrupted permission files', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      mockS5Client.fs.readdir.mockResolvedValue([
        { name: `${grantee1}.json`, type: 1 },
        { name: `${grantee2}.json`, type: 1 },
      ]);

      const perm2 = createMockPermission({ grantedTo: grantee2 });

      mockS5Client.fs.readFile
        .mockRejectedValueOnce(new Error('corrupt data'))
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(
            await mockEncryptionManager.encryptForStorage('key', perm2)
          ))
        );

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions.length).toBe(1);
      expect(permissions[0].grantedTo).toBe(grantee2);
    });
  });

  describe('delete()', () => {
    it('should delete permission from S5', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      await storage.delete(testResourceId, testGranteeAddress);

      expect(mockS5Client.fs.deleteFile).toHaveBeenCalled();
      const deleteCall = mockS5Client.fs.deleteFile.mock.calls[0];
      expect(deleteCall[0]).toContain(testResourceId);
      expect(deleteCall[0]).toContain(testGranteeAddress);
    });

    it('should remove permission from cache', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      await storage.delete(testResourceId, testGranteeAddress);

      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(0);
    });

    it('should not throw if permission does not exist', async () => {
      mockS5Client.fs.deleteFile.mockRejectedValue(new Error('not found'));

      await expect(
        storage.delete(testResourceId, testGranteeAddress)
      ).resolves.not.toThrow();
    });
  });

  describe('exists()', () => {
    it('should return true if permission exists', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      const exists = await storage.exists(testResourceId, testGranteeAddress);

      expect(exists).toBe(true);
    });

    it('should return false if permission does not exist', async () => {
      const exists = await storage.exists(testResourceId, testGranteeAddress);

      expect(exists).toBe(false);
    });
  });

  describe('deleteByResource()', () => {
    it('should delete all permissions for a resource', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      await storage.save(createMockPermission({ grantedTo: grantee1 }));
      await storage.save(createMockPermission({ grantedTo: grantee2 }));

      mockS5Client.fs.readdir.mockResolvedValue([
        { name: `${grantee1}.json`, type: 1 },
        { name: `${grantee2}.json`, type: 1 },
      ]);

      await storage.deleteByResource(testResourceId);

      expect(mockS5Client.fs.deleteFile).toHaveBeenCalledTimes(2);
    });

    it('should clear cache for resource', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      await storage.save(createMockPermission({ grantedTo: grantee1 }));

      mockS5Client.fs.readdir.mockResolvedValue([
        { name: `${grantee1}.json`, type: 1 },
      ]);

      await storage.deleteByResource(testResourceId);

      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(0);
    });

    it('should not throw if resource has no permissions', async () => {
      mockS5Client.fs.readdir.mockRejectedValue(new Error('not found'));

      await expect(
        storage.deleteByResource(testResourceId)
      ).resolves.not.toThrow();
    });
  });

  describe('Encryption', () => {
    it('should encrypt permission data before saving to S5', async () => {
      const permission = createMockPermission();

      await storage.save(permission);

      expect(mockEncryptionManager.encryptForStorage).toHaveBeenCalled();
      const encryptCall = mockEncryptionManager.encryptForStorage.mock.calls[0];
      expect(encryptCall[1]).toEqual(permission);
    });

    it('should decrypt permission data when loading from S5', async () => {
      const permission = createMockPermission();
      const encryptedData = await mockEncryptionManager.encryptForStorage('key', permission);

      mockS5Client.fs.readFile.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(encryptedData))
      );

      await storage.load(testResourceId, testGranteeAddress);

      expect(mockEncryptionManager.decryptFromStorage).toHaveBeenCalled();
    });
  });

  describe('Caching', () => {
    it('should cache permissions after loading', async () => {
      const permission = createMockPermission();
      const encryptedData = await mockEncryptionManager.encryptForStorage('key', permission);

      mockS5Client.fs.readFile.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(encryptedData))
      );

      await storage.load(testResourceId, testGranteeAddress);

      // Load again - should use cache
      mockS5Client.fs.readFile.mockClear();
      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(mockS5Client.fs.readFile).not.toHaveBeenCalled();
    });

    it('should clear cache when requested', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      storage.clearCache();

      expect(storage.getCacheSize()).toBe(0);
    });

    it('should report correct cache size', async () => {
      await storage.save(createMockPermission({
        grantedTo: '0x1111111111111111111111111111111111111111'
      }));
      await storage.save(createMockPermission({
        grantedTo: '0x2222222222222222222222222222222222222222'
      }));

      expect(storage.getCacheSize()).toBe(1); // 1 resource with 2 permissions
    });
  });

  describe('Error handling', () => {
    it('should handle S5 write errors gracefully', async () => {
      mockS5Client.fs.writeFile.mockRejectedValue(new Error('Network error'));

      await expect(
        storage.save(createMockPermission())
      ).rejects.toThrow('Network error');
    });

    it('should handle S5 read errors gracefully', async () => {
      mockS5Client.fs.readFile.mockRejectedValue(new Error('Network error'));

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeNull();
    });

    it('should handle corrupt data gracefully', async () => {
      mockS5Client.fs.readFile.mockResolvedValue(
        new TextEncoder().encode('invalid json data')
      );

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle concurrent save operations', async () => {
      const perm1 = createMockPermission({
        grantedTo: '0x1111111111111111111111111111111111111111'
      });
      const perm2 = createMockPermission({
        grantedTo: '0x2222222222222222222222222222222222222222'
      });

      await Promise.all([
        storage.save(perm1),
        storage.save(perm2),
      ]);

      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(2);
    });

    it('should handle permissions for multiple resources', async () => {
      const resource1 = 'sg-111';
      const resource2 = 'sg-222';

      await storage.save(createMockPermission({ resourceId: resource1 }));
      await storage.save(createMockPermission({ resourceId: resource2 }));

      const perms1 = await storage.loadAll(resource1);
      const perms2 = await storage.loadAll(resource2);

      expect(perms1.length).toBe(1);
      expect(perms2.length).toBe(1);
      expect(perms1[0].resourceId).toBe(resource1);
      expect(perms2[0].resourceId).toBe(resource2);
    });
  });

  describe('Performance', () => {
    it('should load 50 permissions in under 500ms', async () => {
      const grantees = Array.from({ length: 50 }, (_, i) =>
        `0x${i.toString().padStart(40, '0')}`
      );

      mockS5Client.fs.readdir.mockResolvedValue(
        grantees.map(addr => ({ name: `${addr}.json`, type: 1 }))
      );

      for (const grantee of grantees) {
        const perm = createMockPermission({ grantedTo: grantee });
        const encrypted = await mockEncryptionManager.encryptForStorage('key', perm);
        mockS5Client.fs.readFile.mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(encrypted))
        );
      }

      const start = Date.now();
      const permissions = await storage.loadAll(testResourceId);
      const duration = Date.now() - start;

      expect(permissions.length).toBe(50);
      expect(duration).toBeLessThan(500);
    });

    it('should cache hit in under 50ms', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      const start = Date.now();
      await storage.load(testResourceId, testGranteeAddress);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });
});
