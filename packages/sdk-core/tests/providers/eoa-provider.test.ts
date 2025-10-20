// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EOAProvider } from '../../src/providers/EOAProvider';
import { IWalletProvider } from '../../src/interfaces/IWalletProvider';
import { ethers } from 'ethers';

// Mock window.ethereum provider
const createMockEthereumProvider = () => {
  const accounts = ['0x742d35cc6634c0532925a3b844bc9e7595f0beeb'];
  let currentChainId = '0x14a34'; // Base Sepolia (84532 in hex)

  return {
    isMetaMask: true,
    request: vi.fn(async ({ method, params }: any) => {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return accounts;
        case 'eth_chainId':
          return currentChainId;
        case 'wallet_switchEthereumChain':
          const chainId = params[0].chainId;
          currentChainId = chainId;
          return null;
        case 'wallet_addEthereumChain':
          return null;
        case 'eth_sendTransaction':
          return '0x' + '1234'.repeat(16);
        case 'personal_sign':
          return '0x' + 'abcd'.repeat(32);
        case 'eth_getBalance':
          return '0x' + (1000000000000000000n).toString(16); // 1 ETH
        case 'eth_call':
          // Mock ERC20 balanceOf call
          return '0x' + (500000000n).toString(16).padStart(64, '0'); // 500 USDC
        default:
          throw new Error(`Unhandled method: ${method}`);
      }
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
};

describe('EOAProvider', () => {
  let provider: EOAProvider;
  let mockEthereumProvider: any;

  beforeEach(() => {
    mockEthereumProvider = createMockEthereumProvider();
    (global as any).window = { ethereum: mockEthereumProvider };
    provider = new EOAProvider(mockEthereumProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (global as any).window;
  });

  describe('Connection Management', () => {
    it('should connect without chain ID', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
      expect(mockEthereumProvider.request).toHaveBeenCalledWith({
        method: 'eth_requestAccounts'
      });
    });

    it('should connect with specific chain ID', async () => {
      await provider.connect(5611); // opBNB testnet
      expect(provider.isConnected()).toBe(true);
      expect(mockEthereumProvider.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x15eb' }] // 5611 in hex
      });
    });

    it('should handle chain not added error and add chain', async () => {
      // First call for eth_requestAccounts
      mockEthereumProvider.request.mockImplementationOnce(async ({ method }: any) => {
        if (method === 'eth_requestAccounts') {
          return ['0x742d35cc6634c0532925a3b844bc9e7595f0beeb'];
        }
      });
      // Second call for wallet_switchEthereumChain should fail
      mockEthereumProvider.request.mockImplementationOnce(async ({ method }: any) => {
        if (method === 'wallet_switchEthereumChain') {
          const error = new Error('Chain not added') as any;
          error.code = 4902;
          throw error;
        }
      });
      // Third call should be wallet_addEthereumChain
      mockEthereumProvider.request.mockImplementationOnce(async () => {
        return null;
      });

      await provider.connect(5611);
      // Check that wallet_addEthereumChain was called as the third call
      const calls = mockEthereumProvider.request.mock.calls;
      expect(calls[2][0].method).toBe('wallet_addEthereumChain');
      expect(calls[2][0].params[0].chainId).toBe('0x15eb');
    });

    it('should disconnect properly', async () => {
      await provider.connect();
      await provider.disconnect();
      expect(provider.isConnected()).toBe(false);
    });

    it('should throw error when connecting without ethereum provider', async () => {
      // Create a provider explicitly with null to bypass the window.ethereum fallback
      const originalWindow = (global as any).window;
      delete (global as any).window; // Remove window temporarily

      const providerWithoutEth = new EOAProvider(null);
      const connectPromise = providerWithoutEth.connect();

      // Restore window
      (global as any).window = originalWindow;

      await expect(connectPromise).rejects.toThrow('No Ethereum provider available');
    });
  });

  describe('Account Management', () => {
    it('should get current address', async () => {
      await provider.connect();
      const address = await provider.getAddress();
      expect(address).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0beeb');
    });

    it('should return same address for deposit account (EOA)', async () => {
      await provider.connect();
      const address = await provider.getAddress();
      const depositAccount = await provider.getDepositAccount();
      expect(depositAccount).toBe(address);
    });

    it('should throw error when getting address while disconnected', async () => {
      await expect(provider.getAddress()).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Chain Management', () => {
    it('should get current chain ID', async () => {
      await provider.connect();
      const chainId = await provider.getCurrentChainId();
      expect(chainId).toBe(84532); // Base Sepolia
    });

    it('should switch chains successfully', async () => {
      await provider.connect();
      await provider.switchChain(5611);
      expect(mockEthereumProvider.request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x15eb' }]
      });
    });

    it('should return supported chains', () => {
      const chains = provider.getSupportedChains();
      expect(chains).toContain(84532); // Base Sepolia
      expect(chains).toContain(5611); // opBNB testnet
    });

    it('should throw error for unsupported chain', async () => {
      await provider.connect();
      await expect(provider.switchChain(1)).rejects.toThrow('Unsupported chain: 1');
    });
  });

  describe('Transaction Handling', () => {
    it('should send transaction successfully', async () => {
      await provider.connect();
      const tx = {
        to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb',
        value: ethers.parseEther('0.1').toString(),
        data: '0x'
      };

      const response = await provider.sendTransaction(tx);
      expect(response.hash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(response.from).toBe('0x742d35cc6634c0532925a3b844bc9e7595f0beeb');
      expect(response.to).toBe(tx.to);
    });

    it('should sign message successfully', async () => {
      await provider.connect();
      const message = 'Hello, Fabstir!';
      const signature = await provider.signMessage(message);
      expect(signature).toMatch(/^0x[a-f0-9]{128}$/); // 64 bytes = 128 hex chars
    });

    it('should throw error when sending transaction while disconnected', async () => {
      const tx = { to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb', value: '0', data: '0x' };
      await expect(provider.sendTransaction(tx)).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Balance Queries', () => {
    it('should get native token balance', async () => {
      await provider.connect();
      const balance = await provider.getBalance();
      expect(balance).toBe('1000000000000000000'); // 1 ETH in wei
    });

    it('should get ERC20 token balance', async () => {
      await provider.connect();
      const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
      const balance = await provider.getBalance(usdcAddress);
      expect(balance).toBe('500000000'); // 500 USDC (6 decimals)
    });

    it('should throw error when getting balance while disconnected', async () => {
      await expect(provider.getBalance()).rejects.toThrow('Wallet not connected');
    });
  });

  describe('Provider Capabilities', () => {
    it('should return correct capabilities for EOA provider', () => {
      const capabilities = provider.getCapabilities();
      expect(capabilities.supportsGaslessTransactions).toBe(false);
      expect(capabilities.supportsChainSwitching).toBe(true);
      expect(capabilities.supportsSmartAccounts).toBe(false);
      expect(capabilities.requiresDepositAccount).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle user rejection', async () => {
      mockEthereumProvider.request.mockRejectedValueOnce(new Error('User rejected request'));
      await expect(provider.connect()).rejects.toThrow('User rejected request');
    });

    it('should handle network errors gracefully', async () => {
      await provider.connect();
      mockEthereumProvider.request.mockRejectedValueOnce(new Error('Network error'));
      const tx = { to: '0x742d35cc6634c0532925a3b844bc9e7595f0beeb', value: '0', data: '0x' };
      await expect(provider.sendTransaction(tx)).rejects.toThrow('Network error');
    });
  });

  describe('Provider Detection', () => {
    it('should detect MetaMask provider', () => {
      expect(EOAProvider.isAvailable()).toBe(true);
    });

    it('should return false when no provider available', () => {
      delete (global as any).window;
      expect(EOAProvider.isAvailable()).toBe(false);
    });

    it('should get provider name', () => {
      const name = provider.getProviderName();
      expect(name).toBe('MetaMask');
    });
  });
});