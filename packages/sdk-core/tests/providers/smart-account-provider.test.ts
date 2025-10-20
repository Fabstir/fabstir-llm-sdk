// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmartAccountProvider } from '../../src/providers/SmartAccountProvider';
import { IWalletProvider } from '../../src/interfaces/IWalletProvider';
import { ethers } from 'ethers';

// Mock Base Account SDK
const mockBaseAccountSDK = {
  getProvider: vi.fn(),
  getAddress: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: false
};

// Mock bundler client for UserOperations
const mockBundlerClient = {
  sendUserOperation: vi.fn().mockResolvedValue('0x' + 'deed'.repeat(16)),
  getUserOperationReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
  estimateUserOperationGas: vi.fn().mockResolvedValue({
    preVerificationGas: '100000',
    verificationGasLimit: '200000',
    callGasLimit: '300000'
  }),
  getSupportedEntryPoints: vi.fn().mockResolvedValue(['0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'])
};

// Mock provider for Base Account Kit
const mockProvider = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
};

// Mock the @base-org/account module
vi.mock('@base-org/account', () => ({
  createBaseAccountSDK: vi.fn(() => mockBaseAccountSDK),
  base: {
    constants: {
      CHAIN_IDS: {
        baseSepolia: 84532
      }
    }
  }
}));

describe('SmartAccountProvider', () => {
  let provider: SmartAccountProvider;
  const eoaAddress = '0x742d35cc6634c0532925a3b844bc9e7595f0beeb';
  const smartAccountAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Reset bundler client mocks with default behavior
    mockBundlerClient.sendUserOperation.mockResolvedValue('0x' + 'deed'.repeat(16));
    mockBundlerClient.getUserOperationReceipt.mockResolvedValue({ status: 'success' });
    mockBundlerClient.estimateUserOperationGas.mockResolvedValue({
      preVerificationGas: '100000',
      verificationGasLimit: '200000',
      callGasLimit: '300000'
    });

    // Setup default mock behaviors
    mockBaseAccountSDK.getProvider.mockReturnValue(mockProvider);
    mockBaseAccountSDK.getAddress.mockResolvedValue(smartAccountAddress);
    mockBaseAccountSDK.isConnected = false;

    mockProvider.request.mockImplementation(async ({ method, params }: any) => {
      switch (method) {
        case 'eth_requestAccounts':
          return [eoaAddress];
        case 'eth_chainId':
          return '0x14a34'; // Base Sepolia
        case 'eth_getBalance':
          return '0x' + (1000000000000000000n).toString(16); // 1 ETH
        case 'eth_call':
          // Mock ERC20 balanceOf
          return '0x' + (500000000n).toString(16).padStart(64, '0'); // 500 USDC
        default:
          return null;
      }
    });

    // Create provider with mocked bundler
    provider = new SmartAccountProvider();
    // Inject the mock bundler client
    (provider as any).bundlerClient = mockBundlerClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should connect and initialize Base Account SDK', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
      expect(mockBaseAccountSDK.getProvider).toHaveBeenCalled();
    });

    it('should connect to Base Sepolia by default', async () => {
      await provider.connect();
      const chainId = await provider.getCurrentChainId();
      expect(chainId).toBe(84532);
    });

    it('should throw error if trying to connect to unsupported chain', async () => {
      await expect(provider.connect(1)).rejects.toThrow('Smart Account Provider only supports Base Sepolia (84532)');
    });

    it('should accept Base Sepolia chain ID', async () => {
      await provider.connect(84532);
      expect(provider.isConnected()).toBe(true);
    });

    it('should disconnect properly', async () => {
      await provider.connect();
      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('Account Management', () => {
    it('should return smart account address', async () => {
      await provider.connect();
      const address = await provider.getAddress();
      expect(address).toBe(smartAccountAddress);
      expect(address).not.toBe(eoaAddress); // Smart account is different from EOA
    });

    it('should return smart account as deposit account', async () => {
      await provider.connect();
      const depositAccount = await provider.getDepositAccount();
      const address = await provider.getAddress();
      expect(depositAccount).toBe(address);
      expect(depositAccount).toBe(smartAccountAddress);
    });

    it('should throw error when getting address while disconnected', async () => {
      await expect(provider.getAddress()).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Chain Management', () => {
    it('should return Base Sepolia as current chain', async () => {
      await provider.connect();
      const chainId = await provider.getCurrentChainId();
      expect(chainId).toBe(84532);
    });

    it('should only support Base Sepolia', () => {
      const chains = provider.getSupportedChains();
      expect(chains).toEqual([84532]);
      expect(chains.length).toBe(1);
    });

    it('should throw error when switching chains', async () => {
      await provider.connect();
      await expect(provider.switchChain(5611)).rejects.toThrow('Smart Account Provider does not support chain switching');
    });
  });

  describe('Gasless Transactions', () => {
    it('should send gasless transaction via bundler', async () => {
      await provider.connect();

      const userOpHash = '0x' + 'abcd'.repeat(16);
      mockBundlerClient.sendUserOperation.mockResolvedValue(userOpHash);

      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: ethers.parseEther('0.1').toString(),
        data: '0x'
      };

      const response = await provider.sendTransaction(tx);
      expect(response.hash).toBe(userOpHash);
      expect(response.from).toBe(smartAccountAddress);
    });

    it('should handle UserOperation with paymaster', async () => {
      await provider.connect();

      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: 0n,
        data: '0xabcd'
      };

      const userOpHash = '0x' + 'deed'.repeat(16);
      mockBundlerClient.sendUserOperation.mockResolvedValue(userOpHash);

      const response = await provider.sendTransaction(tx);
      expect(response.hash).toBe(userOpHash);
      // Should not require gas from user (paymaster sponsored)
    });

    it('should throw error when sending transaction while disconnected', async () => {
      const tx = { to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb', value: 0n, data: '0x' };
      await expect(provider.sendTransaction(tx)).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Message Signing', () => {
    it('should sign message with smart account', async () => {
      await provider.connect();

      const message = 'Hello, Fabstir!';
      const signature = '0x' + 'cafe'.repeat(32);
      mockProvider.request.mockResolvedValueOnce(signature);

      const result = await provider.signMessage(message);
      expect(result).toBe(signature);
      expect(mockProvider.request).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: expect.any(Array)
      });
    });

    it('should throw error when signing while disconnected', async () => {
      await expect(provider.signMessage('test')).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Balance Queries', () => {
    it('should get native token balance for smart account', async () => {
      await provider.connect();
      const balance = await provider.getBalance();
      expect(balance).toBe('1000000000000000000'); // 1 ETH in wei
    });

    it('should get ERC20 token balance for smart account', async () => {
      await provider.connect();
      const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      const balance = await provider.getBalance(usdcAddress);
      expect(balance).toBe('500000000'); // 500 USDC
    });

    it('should throw error when getting balance while disconnected', async () => {
      await expect(provider.getBalance()).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Provider Capabilities', () => {
    it('should return correct capabilities for smart account', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportsGaslessTransactions).toBe(true);
      expect(capabilities.supportsChainSwitching).toBe(false);
      expect(capabilities.supportsSmartAccounts).toBe(true);
      expect(capabilities.requiresDepositAccount).toBe(true);
    });
  });

  describe('Bundler Integration', () => {
    it('should initialize bundler client on connect', async () => {
      await provider.connect();
      // Bundler should be initialized internally
      expect(provider.isConnected()).toBe(true);
    });

    it('should estimate gas for UserOperation', async () => {
      await provider.connect();

      mockBundlerClient.estimateUserOperationGas.mockResolvedValue({
        preVerificationGas: '100000',
        verificationGasLimit: '200000',
        callGasLimit: '300000'
      });

      // This would be called internally when sending transaction
      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: 0n,
        data: '0x'
      };

      await provider.sendTransaction(tx);
      // Gas estimation should happen internally
    });
  });

  describe('Error Handling', () => {
    it('should handle bundler errors gracefully', async () => {
      await provider.connect();

      mockBundlerClient.sendUserOperation.mockRejectedValue(new Error('Bundler error'));

      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: 0n,
        data: '0x'
      };

      await expect(provider.sendTransaction(tx)).rejects.toThrow('Bundler error');
    });

    it('should handle paymaster rejection', async () => {
      await provider.connect();

      mockBundlerClient.sendUserOperation.mockRejectedValue(new Error('Paymaster rejected'));

      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: 0n,
        data: '0x'
      };

      await expect(provider.sendTransaction(tx)).rejects.toThrow('Paymaster rejected');
    });
  });

  describe('Provider Information', () => {
    it('should identify as Base Account Kit provider', () => {
      const name = provider.getProviderName();
      expect(name).toBe('Base Account Kit');
    });

    it('should detect if Base Account SDK is available', () => {
      const isAvailable = SmartAccountProvider.isAvailable();
      expect(isAvailable).toBe(true); // Because we mocked it
    });
  });
});