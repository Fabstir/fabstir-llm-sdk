import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import { SDKConfig } from './types';
import { ethers } from 'ethers';

// Mock ethers
vi.mock('ethers', () => {
  const mockSigner = {
    getAddress: vi.fn().mockResolvedValue('0x123'),
    signMessage: vi.fn().mockResolvedValue('0xmocksignature'),
    provider: {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' })
    }
  };

  const mockProvider = {
    getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
    getSigner: vi.fn().mockReturnValue(mockSigner)
  };

  return {
    ethers: {
      providers: {
        JsonRpcProvider: vi.fn().mockImplementation(() => mockProvider)
      },
      Wallet: vi.fn().mockImplementation(() => mockSigner)
    }
  };
});

describe('FabstirSDK', () => {
  let sdk: FabstirSDK;
  let config: SDKConfig;

  beforeEach(() => {
    config = {
      rpcUrl: 'http://localhost:8545',
      s5PortalUrl: 'https://s5.ninja',
      contractAddresses: {
        jobMarketplace: '0x123',
        nodeRegistry: '0x456'
      }
    };
  });

  describe('Initialization', () => {
    it('should initialize with config', () => {
      sdk = new FabstirSDK(config);
      expect(sdk).toBeDefined();
      expect(sdk.config.rpcUrl).toEqual(config.rpcUrl);
      expect(sdk.config.s5PortalUrl).toEqual(config.s5PortalUrl);
      expect(sdk.config.contractAddresses?.jobMarketplace).toEqual(config.contractAddresses?.jobMarketplace);
    });

    it('should use default values when config is partial', () => {
      sdk = new FabstirSDK({});
      expect(sdk.config.rpcUrl).toBeDefined();
      expect(sdk.config.s5PortalUrl).toBeDefined();
    });

    it('should use environment variables as defaults', () => {
      process.env.RPC_URL_BASE_SEPOLIA = 'https://test.rpc';
      process.env.S5_PORTAL_URL = 'https://test.s5';
      
      sdk = new FabstirSDK({});
      expect(sdk.config.rpcUrl).toBe('https://test.rpc');
      expect(sdk.config.s5PortalUrl).toBe('https://test.s5');
    });
  });

  describe('Authentication', () => {
    beforeEach(() => {
      sdk = new FabstirSDK(config);
    });

    it('should authenticate with private key', async () => {
      const privateKey = '0x1234567890abcdef';
      const result = await sdk.authenticate(privateKey);
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.address).toBe('0x123');
      expect(result.signer).toBeDefined();
      expect(result.s5Seed).toBeDefined();
    });

    it('should generate S5 seed from wallet signature', async () => {
      const privateKey = '0x1234567890abcdef';
      const result = await sdk.authenticate(privateKey);
      
      // Should generate deterministic seed from signature
      expect(result.s5Seed).toContain(' ');
      expect(result.s5Seed.split(' ').length).toBeGreaterThanOrEqual(12);
    });

    it('should handle authentication errors', async () => {
      await expect(sdk.authenticate('')).rejects.toThrow();
    });
  });

  describe('Provider Setup', () => {
    beforeEach(() => {
      sdk = new FabstirSDK(config);
    });

    it('should setup provider and signer', async () => {
      const privateKey = '0x1234567890abcdef';
      await sdk.authenticate(privateKey);
      
      expect(sdk.provider).toBeDefined();
      expect(sdk.signer).toBeDefined();
    });

    it('should connect to the correct network', async () => {
      const privateKey = '0x1234567890abcdef';
      await sdk.authenticate(privateKey);
      
      const network = await sdk.provider?.getNetwork();
      expect(network?.chainId).toBe(84532);
    });
  });

  describe('Manager Instances', () => {
    beforeEach(async () => {
      sdk = new FabstirSDK(config);
      await sdk.authenticate('0x1234567890abcdef');
    });

    it('should provide session manager (stub)', () => {
      const sessionManager = sdk.getSessionManager();
      expect(sessionManager).toBeDefined();
      // For now, just a stub
      expect(sessionManager).toEqual({});
    });

    it('should provide payment manager (stub)', () => {
      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();
      // For now, just a stub
      expect(paymentManager).toEqual({});
    });

    it('should provide storage manager (stub)', () => {
      const storageManager = sdk.getStorageManager();
      expect(storageManager).toBeDefined();
      // For now, just a stub
      expect(storageManager).toEqual({});
    });
  });

  describe('Error Handling', () => {
    it('should throw SDKError with proper code', async () => {
      sdk = new FabstirSDK(config);
      
      try {
        await sdk.authenticate('');
      } catch (error: any) {
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });
  });
});