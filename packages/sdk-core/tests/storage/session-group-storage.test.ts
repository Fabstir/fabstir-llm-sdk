// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';
import type { SessionGroup } from '../../src/types/session-groups.types';
import type { EncryptionManager } from '../../src/managers/EncryptionManager';

/**
 * SessionGroupStorage Test Suite
 *
 * Tests S5 persistence with encryption for Session Groups.
 * Following TDD bounded autonomy: Write ALL tests first, then implement.
 */

describe('SessionGroupStorage', () => {
  let storage: SessionGroupStorage;
  let mockS5Client: any;
  let mockEncryptionManager: EncryptionManager;
  const testUserAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const testUserSeed = 'test-seed-phrase-for-s5-storage';
  const testHostPubKey = '0x03' + '1'.repeat(64); // Mock compressed public key

  beforeEach(async () => {
    // Create mock S5 client with correct Enhanced s5.js API methods
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

    // Create mock encryption manager
    mockEncryptionManager = {
      encryptForStorage: vi.fn().mockImplementation(async (hostPubKey, data) => ({
        payload: {
          ciphertextHex: Buffer.from(JSON.stringify(data)).toString('hex'),
          nonceHex: '000000000000000000000000',
          ephemeralPubKeyHex: '0x03' + '2'.repeat(64),
          signatureHex: '0x' + '3'.repeat(130),
        },
        storedAt: new Date().toISOString(),
        conversationId: 'session-group-storage',
      })),
      decryptFromStorage: vi.fn().mockImplementation(async (encrypted) => ({
        data: JSON.parse(
          Buffer.from(encrypted.payload.ciphertextHex, 'hex').toString()
        ),
        senderAddress: testUserAddress,
      })),
      getPublicKey: vi.fn().mockReturnValue(testHostPubKey),
    } as any;

    storage = new SessionGroupStorage(
      mockS5Client,
      testUserSeed,
      testUserAddress,
      mockEncryptionManager
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should persist session group to S5 with encryption', async () => {
      const group: SessionGroup = {
        id: 'sg-123',
        name: 'Test Group',
        description: 'Test Description',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: ['db-1'],
        chatSessions: ['session-1'],
        metadata: { color: 'blue' },
        deleted: false,
      };

      await storage.save(group);

      // Verify encryption was called
      expect(mockEncryptionManager.encryptForStorage).toHaveBeenCalledWith(
        testHostPubKey,
        group
      );

      // Verify S5 put was called with correct path (✅ correct API)
      expect(mockS5Client.fs.put).toHaveBeenCalled();
      const putCall = mockS5Client.fs.put.mock.calls[0];
      expect(putCall[0]).toContain(
        `home/session-groups/${testUserAddress}/sg-123.json`
      );
    });

    it('should cache saved groups in memory for performance', async () => {
      const group: SessionGroup = {
        id: 'sg-456',
        name: 'Cached Group',
        description: 'Should be cached',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      await storage.save(group);

      // Load should use cache, not call S5
      const loaded = await storage.load('sg-456');

      expect(loaded).toEqual(group);
      // Should not call get because it's cached (✅ correct API)
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
    });
  });

  describe('load()', () => {
    it('should retrieve session group from S5 and decrypt', async () => {
      const group: SessionGroup = {
        id: 'sg-789',
        name: 'Loaded Group',
        description: 'From S5',
        createdAt: new Date('2025-01-15T12:00:00Z'),
        updatedAt: new Date('2025-01-15T12:00:00Z'),
        owner: testUserAddress,
        linkedDatabases: ['db-2', 'db-3'],
        chatSessions: [],
        metadata: { priority: 'high' },
        deleted: false,
      };

      // Setup mock to return encrypted data (✅ correct API)
      mockS5Client.fs.get.mockResolvedValueOnce({
        payload: {
          ciphertextHex: Buffer.from(JSON.stringify(group)).toString('hex'),
          nonceHex: '000000000000000000000000',
          ephemeralPubKeyHex: '0x03' + '2'.repeat(64),
          signatureHex: '0x' + '3'.repeat(130),
        },
        storedAt: new Date().toISOString(),
        conversationId: 'session-group-storage',
      });

      const loaded = await storage.load('sg-789');

      expect(loaded.id).toBe('sg-789');
      expect(loaded.name).toBe('Loaded Group');
      expect(loaded.linkedDatabases).toEqual(['db-2', 'db-3']);

      // Verify decryption was called
      expect(mockEncryptionManager.decryptFromStorage).toHaveBeenCalled();
    });

    it('should throw error if group does not exist', async () => {
      // ✅ correct API: get() returns null when not found
      mockS5Client.fs.get.mockResolvedValueOnce(null);

      await expect(storage.load('nonexistent-id')).rejects.toThrow(
        'Session group not found: nonexistent-id'
      );
    });
  });

  describe('loadAll()', () => {
    it('should return all groups for owner', async () => {
      const group1: SessionGroup = {
        id: 'sg-001',
        name: 'Group 1',
        description: 'First',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      const group2: SessionGroup = {
        id: 'sg-002',
        name: 'Group 2',
        description: 'Second',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      // Save groups first (will populate mock data via put)
      await storage.save(group1);
      await storage.save(group2);

      // Clear cache so loadAll() actually loads from mock S5
      storage.clearCache();

      // loadAll() will use list() iterator and load() for each file
      const groups = await storage.loadAll();

      expect(groups).toHaveLength(2);
      expect(groups[0].id).toBe('sg-001');
      expect(groups[1].id).toBe('sg-002');
    });

    it('should return empty array if no groups exist', async () => {
      // Empty mock data - list() will yield nothing
      const groups = await storage.loadAll();

      expect(groups).toEqual([]);
    });
  });

  describe('delete()', () => {
    it('should remove group from S5 and cache (hard delete)', async () => {
      const group: SessionGroup = {
        id: 'sg-delete',
        name: 'To Delete',
        description: 'Will be removed',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      // Save first so it's in cache
      await storage.save(group);

      // Now delete
      await storage.delete('sg-delete');

      // Verify S5 delete was called (✅ correct API)
      expect(mockS5Client.fs.delete).toHaveBeenCalledWith(
        `home/session-groups/${testUserAddress}/sg-delete.json`
      );

      // Verify removed from cache and S5
      // get() will return null because delete() removed it from mock data
      await expect(storage.load('sg-delete')).rejects.toThrow(
        'Session group not found'
      );
    });
  });

  describe('exists()', () => {
    it('should check if group ID exists without loading', async () => {
      // Setup mock getMetadata to return metadata (✅ correct API)
      mockS5Client.fs.getMetadata.mockResolvedValueOnce({ cid: 'mock-cid' });

      const result = await storage.exists('sg-exists');

      expect(result).toBe(true);
      expect(mockS5Client.fs.getMetadata).toHaveBeenCalledWith(
        `home/session-groups/${testUserAddress}/sg-exists.json`
      );

      // Should not load the file content
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
    });

    it('should return false if group does not exist', async () => {
      // getMetadata returns null when file doesn't exist (✅ correct API)
      mockS5Client.fs.getMetadata.mockResolvedValueOnce(null);

      const result = await storage.exists('sg-nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('Encryption', () => {
    it('should verify data is encrypted at rest', async () => {
      const group: SessionGroup = {
        id: 'sg-encrypted',
        name: 'Encrypted Group',
        description: 'Sensitive data',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: { secret: 'confidential' },
        deleted: false,
      };

      await storage.save(group);

      // Verify encryption was called with host public key
      expect(mockEncryptionManager.encryptForStorage).toHaveBeenCalledWith(
        testHostPubKey,
        group
      );

      // Verify encrypted payload was written to S5 (✅ correct API)
      const putCall = mockS5Client.fs.put.mock.calls[0];
      const writtenData = putCall[1]; // Second argument is the data object

      // Should have encrypted storage structure
      expect(writtenData).toHaveProperty('payload');
      expect(writtenData.payload).toHaveProperty('ciphertextHex');
      expect(writtenData.payload).toHaveProperty('signatureHex');
    });
  });

  describe('User isolation', () => {
    it('should isolate User A groups from User B', async () => {
      const userA = '0x1111111111111111111111111111111111111111';
      const userB = '0x2222222222222222222222222222222222222222';

      const storageA = new SessionGroupStorage(
        mockS5Client,
        'seed-a',
        userA,
        mockEncryptionManager
      );

      const storageB = new SessionGroupStorage(
        mockS5Client,
        'seed-b',
        userB,
        mockEncryptionManager
      );

      const groupA: SessionGroup = {
        id: 'sg-userA',
        name: 'User A Group',
        description: 'Private to A',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: userA,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      await storageA.save(groupA);

      // Verify paths are different (✅ correct API)
      const putCallA = mockS5Client.fs.put.mock.calls[0];
      expect(putCallA[0]).toContain(`home/session-groups/${userA}/`);

      // User B cannot access User A's groups (different path)
      // get() will return null because User B's path is different
      await expect(storageB.load('sg-userA')).rejects.toThrow(
        'Session group not found'
      );
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Make put() throw network error (✅ correct API)
      mockS5Client.fs.put.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const group: SessionGroup = {
        id: 'sg-network-error',
        name: 'Network Error',
        description: 'Should handle error',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      await expect(storage.save(group)).rejects.toThrow('Network timeout');
    });

    it('should handle corrupt data during load', async () => {
      // Return invalid data structure (✅ correct API)
      mockS5Client.fs.get.mockResolvedValueOnce('invalid-data-structure');

      await expect(storage.load('sg-corrupt')).rejects.toThrow();
    });

    it('should handle missing encryption keys', async () => {
      const storageNoEncryption = new SessionGroupStorage(
        mockS5Client,
        testUserSeed,
        testUserAddress,
        undefined // No encryption manager
      );

      const group: SessionGroup = {
        id: 'sg-no-encryption',
        name: 'No Encryption',
        description: 'Should fail',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      await expect(storageNoEncryption.save(group)).rejects.toThrow(
        'EncryptionManager required for storage operations'
      );
    });
  });

  describe('Performance - Large groups', () => {
    it('should handle groups with 100+ linked databases', async () => {
      const largeDatabases = Array.from({ length: 150 }, (_, i) => `db-${i}`);
      const largeSessions = Array.from(
        { length: 100 },
        (_, i) => `session-${i}`
      );

      const largeGroup: SessionGroup = {
        id: 'sg-large',
        name: 'Large Group',
        description: 'With many databases',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: largeDatabases,
        chatSessions: largeSessions,
        metadata: { size: 'large' },
        deleted: false,
      };

      const startTime = Date.now();
      await storage.save(largeGroup);
      const saveTime = Date.now() - startTime;

      expect(saveTime).toBeLessThan(1000); // Should save in < 1 second

      // Load it back from cache
      const loadStart = Date.now();
      const loaded = await storage.load('sg-large');
      const loadTime = Date.now() - loadStart;

      expect(loadTime).toBeLessThan(500); // Should load from cache instantly
      expect(loaded.linkedDatabases).toHaveLength(150);
      expect(loaded.chatSessions).toHaveLength(100);
    });

    it('should meet loadAll() performance target for 50 groups', async () => {
      // Create 50 groups
      const groups = Array.from({ length: 50 }, (_, i) => ({
        id: `sg-${i}`,
        name: `Group ${i}`,
        description: `Group number ${i}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [`db-${i}`],
        chatSessions: [`session-${i}`],
        metadata: { index: i },
        deleted: false,
      }));

      // Save all groups to populate mock S5 storage (✅ correct API)
      for (const group of groups) {
        await storage.save(group);
      }

      // Clear cache to force reload from mock S5
      storage.clearCache();

      const startTime = Date.now();
      const loaded = await storage.loadAll();
      const loadTime = Date.now() - startTime;

      expect(loaded).toHaveLength(50);
      expect(loadTime).toBeLessThan(500); // Target: < 500ms for 50 groups
    });
  });
});
