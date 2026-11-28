// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';
import { StorageManager } from '../../src/managers/StorageManager';
import { storageSealerFromSeed, isSealedBytes, type StorageSealer } from '../../src/storage/sealed/StorageSealer';
import { SEED } from '../helpers/sealed-fixtures';
import type { SessionGroup } from '../../src/types/session-groups.types';
import type { EncryptionManager } from '../../src/managers/EncryptionManager';

/**
 * SessionGroupStorage Test Suite
 *
 * Tests S5 persistence for Session Groups. Since 1.39.24 groups are sealed with the StorageManager's sealer at
 * `home/session-groups/v2/{deriveId('owner', 'storage')}/{deriveId('group', id)}`; the legacy EncryptionManager-encrypted
 * `home/session-groups/{address}/{id}.json` is read and moved (see milestone-b2-session-groups.test.ts).
 */

/** A StorageManager over `s5Client` holding the sealer for `address`. */
function storageManagerFor(s5Client: any, address: string): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, {
    initialized: true, s5Client, userAddress: address, connectionStatus: 'connected',
    sealer: storageSealerFromSeed(SEED, address),
  });
  return s;
}

describe('SessionGroupStorage', () => {
  let storage: SessionGroupStorage;
  let mockS5Client: any;
  let mockEncryptionManager: EncryptionManager;
  const testUserAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const testUserSeed = 'test-seed-phrase-for-s5-storage';
  const testHostPubKey = '0x03' + '1'.repeat(64); // Mock compressed public key
  const testSealer: StorageSealer = storageSealerFromSeed(SEED, testUserAddress);
  const opaqueOf = (id: string) => testSealer.deriveId('group', id);
  const sealedPathOf = (id: string) => `home/session-groups/v2/${testSealer.deriveId('owner', 'storage')}/${opaqueOf(id)}`;
  const legacyPathOf = (id: string) => `home/session-groups/${testUserAddress}/${id}.json`;
  const legacyEncrypted = (data: any) => ({
    payload: {
      ciphertextHex: Buffer.from(JSON.stringify(data)).toString('hex'),
      nonceHex: '000000000000000000000000',
      ephemeralPubKeyHex: '0x03' + '2'.repeat(64),
      signatureHex: '0x' + '3'.repeat(130),
    },
    storedAt: new Date().toISOString(),
    conversationId: 'session-group-storage',
  });
  let mockData: Map<string, any>;

  beforeEach(async () => {
    // Create mock S5 client with correct Enhanced s5.js API methods
    mockData = new Map<string, any>();

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
      mockEncryptionManager,
      storageManagerFor(mockS5Client, testUserAddress)
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('save()', () => {
    it('should persist session group to S5, sealed, at an opaque path', async () => {
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

      // Sealed with the identity's sealer, not the EncryptionManager (1.39.24)
      expect(mockEncryptionManager.encryptForStorage).not.toHaveBeenCalled();

      // One file per group, at a path that names neither the wallet nor the group
      expect(mockS5Client.fs.put).toHaveBeenCalled();
      const putCall = mockS5Client.fs.put.mock.calls[0];
      expect(putCall[0]).toBe(sealedPathOf('sg-123'));
      expect(putCall[0]).not.toContain(testUserAddress);
      expect(putCall[0]).not.toContain('sg-123');
      expect(isSealedBytes(putCall[1])).toBe(true);
      expect(putCall[2]).toEqual({ mediaType: 'application/octet-stream' });
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
      // save() reads the sealed copy back (network verification) — only the load after it must not
      mockS5Client.fs.get.mockClear();

      // Load should use cache, not call S5
      const loaded = await storage.load('sg-456');

      expect(loaded).toEqual(group);
      // Should not call get because it's cached (✅ correct API)
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
    });
  });

  describe('load()', () => {
    it('should retrieve a legacy session group from S5, decrypt it, and move it to the sealed layout', async () => {
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

      // A legacy (EncryptionManager-encrypted) file at the legacy path
      mockData.set(legacyPathOf('sg-789'), legacyEncrypted(group));

      const loaded = await storage.load('sg-789');

      expect(loaded.id).toBe('sg-789');
      expect(loaded.name).toBe('Loaded Group');
      expect(loaded.linkedDatabases).toEqual(['db-2', 'db-3']);

      // Verify decryption was called
      expect(mockEncryptionManager.decryptFromStorage).toHaveBeenCalled();

      // Moved: sealed at the opaque path, legacy file deleted
      expect(isSealedBytes(mockData.get(sealedPathOf('sg-789')))).toBe(true);
      expect(mockData.has(legacyPathOf('sg-789'))).toBe(false);
    });

    it('should retrieve a sealed session group from S5 and open it', async () => {
      const group: SessionGroup = {
        id: 'sg-sealed', name: 'Sealed Group', description: '', createdAt: new Date('2025-01-15T12:00:00Z'),
        updatedAt: new Date('2025-01-15T12:00:00Z'), owner: testUserAddress, linkedDatabases: ['db-9'], chatSessions: [],
        metadata: {}, deleted: false,
      };
      await storage.save(group);
      storage.clearCache();

      const loaded = await storage.load('sg-sealed');
      expect(loaded).toMatchObject({ id: 'sg-sealed', name: 'Sealed Group', linkedDatabases: ['db-9'] });
      expect(loaded.createdAt).toEqual(new Date('2025-01-15T12:00:00Z'));
      expect(mockEncryptionManager.decryptFromStorage).not.toHaveBeenCalled();
    });

    it('should throw error if group does not exist', async () => {
      // ✅ correct API: get() returns null when not found (at both paths)

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

      // Verify S5 delete was called at both layouts (✅ correct API)
      expect(mockS5Client.fs.delete).toHaveBeenCalledWith(sealedPathOf('sg-delete'));
      expect(mockS5Client.fs.delete).toHaveBeenCalledWith(legacyPathOf('sg-delete'));

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
      expect(mockS5Client.fs.getMetadata).toHaveBeenCalledWith(sealedPathOf('sg-exists'));

      // Should not load the file content
      expect(mockS5Client.fs.get).not.toHaveBeenCalled();
    });

    it('should return false if group does not exist', async () => {
      // getMetadata returns null when file doesn't exist (✅ correct API) — at both paths
      const result = await storage.exists('sg-nonexistent');

      expect(result).toBe(false);
      expect(mockS5Client.fs.getMetadata).toHaveBeenCalledWith(sealedPathOf('sg-nonexistent'));
      expect(mockS5Client.fs.getMetadata).toHaveBeenCalledWith(legacyPathOf('sg-nonexistent'));
    });

    it('should find a legacy group', async () => {
      mockData.set(legacyPathOf('sg-legacy'), legacyEncrypted({ id: 'sg-legacy' }));
      expect(await storage.exists('sg-legacy')).toBe(true);
    });
  });

  describe('Encryption', () => {
    it('should verify data is sealed at rest', async () => {
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

      // Verify a sealed envelope was written to S5 (✅ correct API)
      const putCall = mockS5Client.fs.put.mock.calls[0];
      const writtenData: Uint8Array = putCall[1]; // Second argument is the data

      expect(isSealedBytes(writtenData)).toBe(true);
      const asText = Buffer.from(writtenData).toString('latin1');
      for (const clear of ['confidential', 'Sensitive data', 'sg-encrypted', testUserAddress]) {
        expect(asText).not.toContain(clear);
      }
      // It opens only under its own context, bound to its opaque id
      const opened = testSealer.open(writtenData, `group/v1/${opaqueOf('sg-encrypted')}`);
      expect(opened).toMatchObject({ kind: 'cbor', value: { id: 'sg-encrypted', metadata: { secret: 'confidential' } } });
      expect(() => testSealer.open(writtenData, `group/v1/${opaqueOf('other')}`)).toThrow();
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
        mockEncryptionManager,
        storageManagerFor(mockS5Client, userA)
      );

      const storageB = new SessionGroupStorage(
        mockS5Client,
        'seed-b',
        userB,
        mockEncryptionManager,
        storageManagerFor(mockS5Client, userB)
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

      // Paths name no wallet; the opaque id is keyed per address, so B's id for the same group differs (✅ correct API)
      const putCallA = mockS5Client.fs.put.mock.calls[0];
      expect(putCallA[0]).not.toContain(userA);
      expect(putCallA[0]).toBe(`home/session-groups/v2/${storageSealerFromSeed(SEED, userA).deriveId('owner', 'storage')}/${storageSealerFromSeed(SEED, userA).deriveId('group', 'sg-userA')}`);
      expect(storageSealerFromSeed(SEED, userB).deriveId('group', 'sg-userA')).not.toBe(storageSealerFromSeed(SEED, userA).deriveId('group', 'sg-userA'));

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

    it('should refuse to store without a sealer (no StorageManager): STORAGE_SEALER_MISSING', async () => {
      const storageNoSealer = new SessionGroupStorage(
        mockS5Client,
        testUserSeed,
        testUserAddress,
        mockEncryptionManager // no StorageManager, so no sealer
      );

      const group: SessionGroup = {
        id: 'sg-no-sealer',
        name: 'No Sealer',
        description: 'Should fail',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: testUserAddress,
        linkedDatabases: [],
        chatSessions: [],
        metadata: {},
        deleted: false,
      };

      await expect(storageNoSealer.save(group)).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
      expect(mockS5Client.fs.put).not.toHaveBeenCalled();
    });

    it('should need the EncryptionManager to read a legacy group', async () => {
      const storageNoEncryption = new SessionGroupStorage(
        mockS5Client,
        testUserSeed,
        testUserAddress,
        undefined, // No encryption manager
        storageManagerFor(mockS5Client, testUserAddress)
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

      mockData.set(legacyPathOf('sg-no-encryption'), legacyEncrypted(group));
      await expect(storageNoEncryption.load('sg-no-encryption')).rejects.toThrow(
        'EncryptionManager required for storage operations'
      );
      // the legacy file is kept
      expect(mockData.has(legacyPathOf('sg-no-encryption'))).toBe(true);
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
