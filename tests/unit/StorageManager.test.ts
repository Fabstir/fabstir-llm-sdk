import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';

// Mock S5 module with factory function
vi.mock('@s5-dev/s5js', () => {
  const mockS5Client = {
    generateSeedPhrase: vi.fn().mockReturnValue('test seed phrase for user'),
    recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
    registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
    fs: {
      ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      getMetadata: vi.fn(),
      list: vi.fn()
    }
  };
  
  return {
    S5: {
      create: vi.fn().mockResolvedValue(mockS5Client)
    }
  };
});

import StorageManager from '../../src/managers/StorageManager';
import { S5 } from '@s5-dev/s5js';
import AuthManager from '../../src/managers/AuthManager';

describe('StorageManager', () => {
  let storageManager: StorageManager;
  let mockAuthManager: AuthManager;
  let mockS5Client: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock AuthManager
    mockAuthManager = {
      getS5Seed: vi.fn().mockReturnValue('test seed phrase for user'),
      getUserAddress: vi.fn().mockReturnValue('0xUserAddress123'),
      getSigner: vi.fn().mockReturnValue({
        signMessage: vi.fn().mockResolvedValue('0xSignature456')
      }),
      isAuthenticated: vi.fn().mockReturnValue(true)
    } as any;

    // Get the mock S5 client that will be returned
    const s5CreateMock = S5.create as any;
    mockS5Client = await s5CreateMock();
    
    // Reset mock functions
    mockS5Client.recoverIdentityFromSeedPhrase.mockClear();
    mockS5Client.registerOnNewPortal.mockClear();
    mockS5Client.fs.ensureIdentityInitialized.mockClear();
    mockS5Client.fs.put.mockClear();
    mockS5Client.fs.get.mockClear();
    mockS5Client.fs.getMetadata.mockClear();
    mockS5Client.fs.list.mockClear();

    storageManager = new StorageManager('wss://test-portal.s5.ninja/s5/p2p');
  });

  describe('Initialization', () => {
    it('should initialize S5 client with seed from AuthManager', async () => {
      await storageManager.initialize(mockAuthManager);

      expect(mockAuthManager.getS5Seed).toHaveBeenCalled();
      expect(mockAuthManager.getUserAddress).toHaveBeenCalled();
      
      const isInitialized = storageManager.isInitialized();
      expect(isInitialized).toBe(true);
    });

    it('should throw error if initialization fails', async () => {
      mockAuthManager.getS5Seed = vi.fn().mockImplementation(() => {
        throw new Error('Not authenticated');
      });

      await expect(
        storageManager.initialize(mockAuthManager)
      ).rejects.toThrow('Failed to initialize StorageManager');
    });
  });

  describe('Data Storage', () => {
    beforeEach(async () => {
      await storageManager.initialize(mockAuthManager);
    });

    it('should store encrypted data with key', async () => {
      const key = 'conversation-123';
      const data = {
        sessionId: 'session-123',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ]
      };
      const metadata = { model: 'llama2', timestamp: Date.now() };

      // Mock getMetadata to return a CID
      mockS5Client.fs.getMetadata.mockResolvedValue({
        type: 'file',
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      });
      
      const cid = await storageManager.storeData(key, data, metadata);

      expect(cid).toBeTruthy();
      expect(typeof cid).toBe('string');
      expect(mockS5Client.fs.put).toHaveBeenCalledWith(
        'home/conversations/0xUserAddress123/conversation-123.json',
        expect.objectContaining({
          data: expect.any(Object),
          metadata: expect.objectContaining({ model: 'llama2' })
        })
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockS5Client.fs.put.mockRejectedValue(new Error('Network error'));

      await expect(
        storageManager.storeData('key', { test: 'data' })
      ).rejects.toThrow('Failed to store data: Network error');
    });
  });

  describe('Data Retrieval', () => {
    beforeEach(async () => {
      await storageManager.initialize(mockAuthManager);
    });

    it('should retrieve and decrypt stored data', async () => {
      const storedData = {
        data: { 
          sessionId: 'session-123',
          messages: [{ role: 'user', content: 'Test' }]
        },
        metadata: { timestamp: Date.now() }
      };

      mockS5Client.fs.get.mockResolvedValue(storedData);

      const result = await storageManager.retrieveData('conversation-123');

      expect(result).toEqual(storedData.data);
      expect(mockS5Client.fs.get).toHaveBeenCalledWith(
        'home/conversations/0xUserAddress123/conversation-123.json'
      );
    });

    it('should return null if data not found', async () => {
      mockS5Client.fs.get.mockResolvedValue(undefined);

      const result = await storageManager.retrieveData('non-existent');

      expect(result).toBeNull();
    });

    it('should handle retrieval errors', async () => {
      mockS5Client.fs.get.mockRejectedValue(new Error('Read error'));

      await expect(
        storageManager.retrieveData('key')
      ).rejects.toThrow('Failed to retrieve data: Read error');
    });
  });

  describe('List User Data', () => {
    beforeEach(async () => {
      await storageManager.initialize(mockAuthManager);
    });

    it('should list all user stored items', async () => {
      const mockFiles = [
        { 
          path: 'home/conversations/session-1.json',
          metadata: { type: 'file', size: 1024 }
        },
        { 
          path: 'home/conversations/session-2.json',
          metadata: { type: 'file', size: 2048 }
        }
      ];

      mockS5Client.fs.list = vi.fn().mockResolvedValue(mockFiles);
      mockS5Client.fs.getMetadata = vi.fn()
        .mockResolvedValueOnce({ type: 'file', cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', timestamp: 1000 })
        .mockResolvedValueOnce({ type: 'file', cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku', timestamp: 2000 });

      const items = await storageManager.listUserData();

      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        key: 'session-1',
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        timestamp: 1000
      });
      expect(items[1]).toEqual({
        key: 'session-2',
        cid: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
        timestamp: 2000
      });
    });

    it('should return empty array if no data', async () => {
      mockS5Client.fs.list = vi.fn().mockResolvedValue([]);

      const items = await storageManager.listUserData();

      expect(items).toEqual([]);
    });

    it('should handle list errors', async () => {
      mockS5Client.fs.list = vi.fn().mockRejectedValue(new Error('Permission denied'));

      await expect(
        storageManager.listUserData()
      ).rejects.toThrow('Failed to list user data: Permission denied');
    });
  });

  describe('User Isolation', () => {
    it('should use wallet address in storage paths', async () => {
      await storageManager.initialize(mockAuthManager);
      
      // Ensure fs.put is properly mocked to not throw errors
      mockS5Client.fs.put.mockResolvedValue(undefined);
      mockS5Client.fs.getMetadata.mockResolvedValue({
        type: 'file',
        cid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
      });
      
      await storageManager.storeData('test-key', { data: 'test' });

      // Verify path includes user address for isolation
      expect(mockS5Client.fs.put).toHaveBeenCalledWith(
        'home/conversations/0xUserAddress123/test-key.json',
        expect.any(Object)
      );
    });

    it('should use different seeds for different users', async () => {
      const auth1 = {
        getS5Seed: vi.fn().mockReturnValue('seed phrase for user 1'),
        getUserAddress: vi.fn().mockReturnValue('0xUser1'),
        getSigner: vi.fn(),
        isAuthenticated: vi.fn().mockReturnValue(true)
      } as any;
      
      const auth2 = {
        getS5Seed: vi.fn().mockReturnValue('seed phrase for user 2'),
        getUserAddress: vi.fn().mockReturnValue('0xUser2'),
        getSigner: vi.fn(),
        isAuthenticated: vi.fn().mockReturnValue(true)
      } as any;

      const sm1 = new StorageManager('wss://portal.s5.ninja');
      const sm2 = new StorageManager('wss://portal.s5.ninja');

      await sm1.initialize(auth1);
      await sm2.initialize(auth2);

      const seed1 = (sm1 as any).userSeed;
      const seed2 = (sm2 as any).userSeed;

      expect(seed1).not.toBe(seed2);
    });
  });

  describe('Constants and Configuration', () => {
    it('should have correct default portal URL', () => {
      expect(StorageManager.DEFAULT_S5_PORTAL).toBe(
        'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
      );
    });

    it('should use correct seed message', () => {
      expect(StorageManager.SEED_MESSAGE).toBe('Generate S5 seed for Fabstir LLM');
    });

    it('should use correct registry prefix', () => {
      expect(StorageManager.REGISTRY_PREFIX).toBe('fabstir-llm');
    });

    it('should use custom portal URL if provided', async () => {
      const customPortal = 'wss://custom.portal/s5';
      const sm = new StorageManager(customPortal);
      
      expect((sm as any).s5PortalUrl).toBe(customPortal);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await storageManager.initialize(mockAuthManager);
    });

    it('should continue even if portal registration fails', async () => {
      const sm = new StorageManager('wss://portal.s5.ninja');
      const mockRetryAuth = {
        getS5Seed: vi.fn().mockReturnValue('retry seed'),
        getUserAddress: vi.fn().mockReturnValue('0xUser'),
        getSigner: vi.fn(),
        isAuthenticated: vi.fn().mockReturnValue(true)
      } as any;

      // Portal registration fails
      mockS5Client.registerOnNewPortal.mockRejectedValue(
        new Error('Portal unavailable')
      );

      await sm.initialize(mockRetryAuth);
      
      // Should not throw and should be initialized
      expect(sm.isInitialized()).toBe(true);
    });
  });
});