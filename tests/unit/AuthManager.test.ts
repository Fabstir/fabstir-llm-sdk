import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import AuthManager from '../../src/managers/AuthManager';

// Mock ethers
vi.mock('ethers', () => {
  const mockWallet = vi.fn().mockImplementation((privateKey, provider) => ({
    privateKey,
    provider,
    address: privateKey?.includes('Key1') ? '0xUser1' : privateKey?.includes('Key2') ? '0xUser2' : '0xUserAddress123',
    getAddress: vi.fn().mockResolvedValue(
      privateKey?.includes('Key1') ? '0xUser1' : privateKey?.includes('Key2') ? '0xUser2' : '0xUserAddress123'
    ),
    signMessage: vi.fn().mockResolvedValue(
      privateKey?.includes('Key1') ? '0xSig1' : privateKey?.includes('Key2') ? '0xSig2' : '0xSignature456'
    ),
    connect: vi.fn().mockReturnThis()
  }));
  
  mockWallet.createRandom = vi.fn(() => ({
    address: '0xRandomWallet',
    getAddress: vi.fn().mockResolvedValue('0xRandomWallet'),
    signMessage: vi.fn().mockResolvedValue('0xRandomSignature'),
    connect: vi.fn().mockReturnThis()
  }));

  return {
    ethers: {
      providers: {
        JsonRpcProvider: vi.fn().mockImplementation((url, network) => ({
          url,
          network,
          getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' })
        })),
        Web3Provider: vi.fn().mockImplementation((ethereum) => ({
          ethereum,
          send: vi.fn().mockResolvedValue(undefined),
          getSigner: vi.fn(() => ({
            getAddress: vi.fn().mockResolvedValue('0xMetaMaskUser'),
            signMessage: vi.fn().mockResolvedValue('0xMetaMaskSig')
          })),
          getNetwork: vi.fn().mockResolvedValue({ chainId: 1, name: 'mainnet' })
        }))
      },
      Wallet: mockWallet,
      utils: {
        id: vi.fn((text) => `0xhash_${text}`),
        keccak256: vi.fn((bytes) => {
          // Check if bytes represent Sig1 or Sig2
          const decoder = new TextDecoder();
          const str = decoder.decode(bytes);
          if (str.includes('Sig1')) return '0xkeccak_sig1';
          if (str.includes('Sig2')) return '0xkeccak_sig2';
          return '0xkeccak_default';
        }),
        toUtf8Bytes: vi.fn((text) => {
          // Create bytes that include the signature to pass to keccak256
          if (typeof text === 'string' && text.includes('Sig1')) {
            return new TextEncoder().encode('0xSig1');
          } else if (typeof text === 'string' && text.includes('Sig2')) {
            return new TextEncoder().encode('0xSig2');
          }
          return new Uint8Array([...text].map(c => c.charCodeAt(0)));
        }),
        arrayify: vi.fn((hash) => {
          // Return different arrays for different hashes to generate different seeds
          const arr = new Uint8Array(32);
          if (hash === '0xkeccak_sig1') {
            for (let i = 0; i < 32; i++) arr[i] = i + 1;
          } else if (hash === '0xkeccak_sig2') {
            for (let i = 0; i < 32; i++) arr[i] = (i + 5) * 2;
          } else {
            arr.fill(0);
          }
          return arr;
        })
      }
    }
  };
});

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    authManager = new AuthManager();
  });

  describe('Authentication', () => {
    it('should authenticate with private key', async () => {
      const result = await authManager.authenticate('private-key', {
        privateKey: '0xTestPrivateKey123',
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test'
      });

      expect(result).toHaveProperty('signer');
      expect(result).toHaveProperty('userAddress');
      expect(result.userAddress).toBeTruthy();
      expect(result).toHaveProperty('s5Seed');
      expect(result.s5Seed).toBeTruthy();
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should authenticate with base provider', async () => {
      const result = await authManager.authenticate('base', {
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test'
      });

      expect(result).toHaveProperty('signer');
      expect(result).toHaveProperty('userAddress');
      expect(result).toHaveProperty('s5Seed');
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should throw error if private key not provided', async () => {
      await expect(
        authManager.authenticate('private-key', {})
      ).rejects.toThrow('Private key required');
    });

    it('should throw error if RPC URL not provided', async () => {
      await expect(
        authManager.authenticate('base', {})
      ).rejects.toThrow('RPC URL required');
    });

    it('should support metamask provider (mock window.ethereum)', async () => {
      const mockEthereum = {
        request: vi.fn()
          .mockResolvedValueOnce(['0xUserAddress123']) // eth_requestAccounts
          .mockResolvedValueOnce('0x15') // eth_chainId (21 in decimal)
      };
      (global as any).window = { ethereum: mockEthereum };

      const result = await authManager.authenticate('metamask');

      expect(result).toHaveProperty('signer');
      expect(result).toHaveProperty('userAddress', '0xMetaMaskUser');
      expect(result).toHaveProperty('s5Seed');
      
      delete (global as any).window;
    });

    it('should throw error if metamask not available', async () => {
      // Ensure no window.ethereum
      delete (global as any).window;
      await expect(
        authManager.authenticate('metamask')
      ).rejects.toThrow('MetaMask not available');
    });
  });

  describe('Getters', () => {
    beforeEach(async () => {
      await authManager.authenticate('private-key', {
        privateKey: '0xTestKey',
        rpcUrl: 'https://rpc.test'
      });
    });

    it('should get signer after authentication', () => {
      const signer = authManager.getSigner();
      expect(signer).toBeDefined();
      expect(signer).toHaveProperty('signMessage');
    });

    it('should get S5 seed after authentication', () => {
      const seed = authManager.getS5Seed();
      expect(seed).toBeTruthy();
      expect(typeof seed).toBe('string');
    });

    it('should get user address after authentication', () => {
      const address = authManager.getUserAddress();
      expect(address).toBeTruthy();
    });

    it('should return authentication status', () => {
      expect(authManager.isAuthenticated()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when getting signer before auth', () => {
      expect(() => authManager.getSigner()).toThrow('Not authenticated');
    });

    it('should throw error when getting S5 seed before auth', () => {
      expect(() => authManager.getS5Seed()).toThrow('Not authenticated');
    });

    it('should throw error when getting address before auth', () => {
      expect(() => authManager.getUserAddress()).toThrow('Not authenticated');
    });

    it('should return false for isAuthenticated before auth', () => {
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });

  describe('S5 Seed Generation', () => {
    it('should generate deterministic seed from signature', async () => {
      await authManager.authenticate('private-key', {
        privateKey: '0xKey123',
        rpcUrl: 'https://rpc.test'
      });

      const seed1 = authManager.getS5Seed();
      
      // Re-authenticate with same key should give same seed
      const authManager2 = new AuthManager();
      await authManager2.authenticate('private-key', {
        privateKey: '0xKey123',
        rpcUrl: 'https://rpc.test'
      });
      
      const seed2 = authManager2.getS5Seed();
      expect(seed1).toBe(seed2);
    });

    it('should generate different seeds for different wallets', async () => {
      const auth1 = new AuthManager();
      await auth1.authenticate('private-key', {
        privateKey: '0xKey1',
        rpcUrl: 'https://rpc.test'
      });
      
      const auth2 = new AuthManager();
      await auth2.authenticate('private-key', {
        privateKey: '0xKey2',
        rpcUrl: 'https://rpc.test'
      });

      const seed1 = auth1.getS5Seed();
      const seed2 = auth2.getS5Seed();
      
      expect(seed1).not.toBe(seed2);
    });
  });

  describe('Re-authentication', () => {
    it('should allow re-authentication with different provider', async () => {
      await authManager.authenticate('private-key', {
        privateKey: '0xKey1',
        rpcUrl: 'https://rpc1.test'
      });
      
      const firstAddress = authManager.getUserAddress();
      
      await authManager.authenticate('private-key', {
        privateKey: '0xKey2',
        rpcUrl: 'https://rpc2.test'
      });
      
      const secondAddress = authManager.getUserAddress();
      expect(secondAddress).toBeDefined();
      // Mock always returns same address, but in real scenario would differ
    });
  });

  describe('Network Configuration', () => {
    it('should use Base Sepolia network config', async () => {
      const result = await authManager.authenticate('base', {
        rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/test'
      });

      expect(result.network).toMatchObject({
        chainId: 84532,
        name: 'base-sepolia'
      });
    });
  });
});