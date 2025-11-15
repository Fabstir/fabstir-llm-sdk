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
    // Mock S5 client with correct Enhanced s5.js API methods
    const mockData = new Map<string, any>();

    mockS5Client = {
      fs: {
        // ✅ CORRECT: Enhanced s5.js API methods
        put: vi.fn(async (path: string, data: any) => {
          mockData.set(path, data);
          return true;
        }),
        get: vi.fn(async (path: string) => {
          return mockData.get(path) || null;
        }),
        list: vi.fn(async function* (path: string) {
          // Async iterator - yield entries that match the path
          for (const [key, value] of mockData.entries()) {
            if (key.startsWith(path) && key !== path) {
              const name = key.split('/').pop();
              if (name) {
                yield {
                  type: 'file',
                  name: name
                };
              }
            }
          }
        }),
        delete: vi.fn(async (path: string) => {
          mockData.delete(path);
          return true;
        }),
        getMetadata: vi.fn(async (path: string) => {
          return mockData.has(path) ? { cid: 'mock-cid' } : null;
        })
      },
    };

    // Mock EncryptionManager
    const testHostPubKey = '0x03' + '1'.repeat(64); // Mock compressed public key

    mockEncryptionManager = {
      getPublicKey: vi.fn().mockReturnValue(testHostPubKey),
      encryptForStorage: vi.fn().mockImplementation(async (pubKey, data) => ({
        payload: {
          ciphertextHex: Buffer.from(JSON.stringify(data)).toString('hex'),
          nonceHex: '000000000000000000000000',
          ephemeralPubKeyHex: '0x03' + '2'.repeat(64),
          signatureHex: '0x' + '3'.repeat(130),
        },
        storedAt: new Date().toISOString(),
        conversationId: 'permission-storage',
      })),
      decryptFromStorage: vi.fn().mockImplementation(async (encrypted) => ({
        data: JSON.parse(
          Buffer.from(encrypted.payload.ciphertextHex, 'hex').toString()
        ),
        senderAddress: testUserAddress,
      })),
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
      expect(mockS5Client.fs.put).toHaveBeenCalled();

      const writeCall = mockS5Client.fs.put.mock.calls[0];
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

      // Save first to populate mock S5 storage
      await storage.save(permission);

      // Clear cache to force reload from S5
      storage.clearCache();

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(permission.id);
    });

    it('should return null if permission not found', async () => {
      // Empty mock storage - get() will return null
      const loaded = await storage.load(testResourceId, 'nonexistent-address');

      expect(loaded).toBeNull();
    });

    it('should load from cache if available', async () => {
      const permission = createMockPermission();
      await storage.save(permission);

      // Reset mock to verify it's not called again
      mockS5Client.fs.get.mockClear();

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
    });

    it('should convert date strings to Date objects', async () => {
      const permission = createMockPermission();

      // Save permission
      await storage.save(permission);

      // Clear cache and reload
      storage.clearCache();

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded?.grantedAt).toBeInstanceOf(Date);
    });
  });

  describe('loadAll()', () => {
    it('should load all permissions for a resource', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      const perm1 = createMockPermission({ grantedTo: grantee1 });
      const perm2 = createMockPermission({ grantedTo: grantee2 });

      // Save permissions first (populates mock S5 storage)
      await storage.save(perm1);
      await storage.save(perm2);

      // Clear cache to force reload from mock S5
      storage.clearCache();

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions.length).toBe(2);
      expect(permissions.some(p => p.grantedTo === grantee1)).toBe(true);
      expect(permissions.some(p => p.grantedTo === grantee2)).toBe(true);
    });

    it('should return empty array if resource has no permissions', async () => {
      // Empty mock storage - list() will yield nothing
      const permissions = await storage.loadAll(testResourceId);

      expect(permissions).toEqual([]);
    });

    it('should exclude deleted permissions', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      const perm1 = createMockPermission({ grantedTo: grantee1, deleted: true });
      const perm2 = createMockPermission({ grantedTo: grantee2, deleted: false });

      // Save permissions first
      await storage.save(perm1);
      await storage.save(perm2);

      // Clear cache to force reload
      storage.clearCache();

      const permissions = await storage.loadAll(testResourceId);

      expect(permissions.length).toBe(1);
      expect(permissions[0].grantedTo).toBe(grantee2);
    });

    it('should skip corrupted permission files', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';
      const grantee2 = '0x2222222222222222222222222222222222222222';

      const perm1 = createMockPermission({ grantedTo: grantee1 });
      const perm2 = createMockPermission({ grantedTo: grantee2 });

      // Save perm1
      await storage.save(perm1);

      // Make get() throw error for perm1, but work for perm2
      mockS5Client.fs.get
        .mockImplementationOnce(async () => { throw new Error('corrupt data'); })
        .mockImplementationOnce(async (path) => {
          // For perm2, return encrypted data
          return await mockEncryptionManager.encryptForStorage('key', perm2);
        });

      // Save perm2
      await storage.save(perm2);

      // Clear cache to force reload
      storage.clearCache();

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

      expect(mockS5Client.fs.delete).toHaveBeenCalled();
      const deleteCall = mockS5Client.fs.delete.mock.calls[0];
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
      mockS5Client.fs.delete.mockRejectedValue(new Error('not found'));

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

      // Save permissions first (populates mock S5 storage)
      await storage.save(createMockPermission({ grantedTo: grantee1 }));
      await storage.save(createMockPermission({ grantedTo: grantee2 }));

      // deleteByResource will use list() async iterator
      await storage.deleteByResource(testResourceId);

      expect(mockS5Client.fs.delete).toHaveBeenCalledTimes(2);
    });

    it('should clear cache for resource', async () => {
      const grantee1 = '0x1111111111111111111111111111111111111111';

      // Save permission first
      await storage.save(createMockPermission({ grantedTo: grantee1 }));

      // Delete all permissions for resource
      await storage.deleteByResource(testResourceId);

      // Verify cache is cleared
      const cached = await storage.loadAll(testResourceId);
      expect(cached.length).toBe(0);
    });

    it('should not throw if resource has no permissions', async () => {
      // Empty mock storage - list() will yield nothing
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

      mockS5Client.fs.get.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(encryptedData))
      );

      await storage.load(testResourceId, testGranteeAddress);

      expect(mockEncryptionManager.decryptFromStorage).toHaveBeenCalled();
    });
  });

  describe('Caching', () => {
    it('should cache permissions after loading', async () => {
      const permission = createMockPermission();

      // Save permission first
      await storage.save(permission);

      // Load once (will populate cache from S5)
      storage.clearCache(); // Clear save cache
      await storage.load(testResourceId, testGranteeAddress);

      // Load again - should use cache
      mockS5Client.fs.get.mockClear();
      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeDefined();
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
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
      mockS5Client.fs.put.mockRejectedValue(new Error('Network error'));

      await expect(
        storage.save(createMockPermission())
      ).rejects.toThrow('Network error');
    });

    it('should handle S5 read errors gracefully', async () => {
      mockS5Client.fs.get.mockRejectedValue(new Error('Network error'));

      const loaded = await storage.load(testResourceId, testGranteeAddress);

      expect(loaded).toBeNull();
    });

    it('should handle corrupt data gracefully', async () => {
      mockS5Client.fs.get.mockResolvedValue(
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

      // Save 50 permissions first (populates mock S5 storage)
      for (const grantee of grantees) {
        const perm = createMockPermission({ grantedTo: grantee });
        await storage.save(perm);
      }

      // Clear cache to force reload from mock S5
      storage.clearCache();

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
