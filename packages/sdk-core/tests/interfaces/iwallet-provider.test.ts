// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IWalletProvider, WalletCapabilities, TransactionRequest, TransactionResponse } from '../../src/interfaces/IWalletProvider';
import { ethers } from 'ethers';

// Mock implementation for testing interface structure
class MockWalletProvider implements IWalletProvider {
  private connected = false;
  private chainId = 84532; // Base Sepolia by default

  async connect(chainId?: number): Promise<void> {
    this.connected = true;
    if (chainId) {
      this.chainId = chainId;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAddress(): Promise<string> {
    return '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8';
  }

  async getDepositAccount(): Promise<string> {
    // For EOA, same as getAddress
    return this.getAddress();
  }

  async getCurrentChainId(): Promise<number> {
    return this.chainId;
  }

  async switchChain(chainId: number): Promise<void> {
    this.chainId = chainId;
  }

  getSupportedChains(): number[] {
    return [84532, 5611]; // Base Sepolia, opBNB testnet
  }

  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    return {
      hash: '0x' + '1234'.repeat(16),
      from: await this.getAddress(),
      to: tx.to || undefined,
      value: tx.value || ethers.toBigInt(0),
      nonce: 1,
      gasLimit: ethers.toBigInt(21000),
      gasPrice: ethers.toBigInt(1000000000),
      data: tx.data || '0x',
      chainId: ethers.toBigInt(this.chainId),
      wait: async (confirmations?: number) => ({
        blockNumber: 12345,
        blockHash: '0x' + 'abcd'.repeat(16),
        index: 0,
        logsBloom: '0x',
        gasUsed: ethers.toBigInt(21000),
        gasPrice: ethers.toBigInt(1000000000),
        cumulativeGasUsed: ethers.toBigInt(21000),
        from: await this.getAddress(),
        to: tx.to || null,
        contractAddress: null,
        logs: [],
        status: 1,
        root: undefined,
        hash: '0x' + '1234'.repeat(16),
        type: 2,
        nonce: 1,
        confirmations: confirmations || 1,
        byzantium: true
      })
    } as TransactionResponse;
  }

  async signMessage(message: string): Promise<string> {
    // Return a valid hex signature
    return '0x' + 'abcdef1234567890'.repeat(8);
  }

  async getBalance(token?: string): Promise<string> {
    if (token) {
      return '1000000000'; // 1000 USDC (6 decimals)
    }
    return ethers.formatEther(ethers.toBigInt('1000000000000000000')); // 1 ETH
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGaslessTransactions: false,
      supportsChainSwitching: true,
      supportsSmartAccounts: false,
      requiresDepositAccount: false
    };
  }
}

describe('IWalletProvider Interface', () => {
  let provider: IWalletProvider;

  beforeEach(() => {
    provider = new MockWalletProvider();
  });

  describe('Core Wallet Functions', () => {
    it('should have connect method that accepts optional chainId', async () => {
      expect(provider.connect).toBeDefined();
      expect(typeof provider.connect).toBe('function');

      // Should work without chainId
      await expect(provider.connect()).resolves.toBeUndefined();

      // Should work with chainId
      await expect(provider.connect(84532)).resolves.toBeUndefined();
    });

    it('should have disconnect method', async () => {
      expect(provider.disconnect).toBeDefined();
      expect(typeof provider.disconnect).toBe('function');
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });

    it('should have isConnected method returning boolean', () => {
      expect(provider.isConnected).toBeDefined();
      expect(typeof provider.isConnected).toBe('function');
      expect(typeof provider.isConnected()).toBe('boolean');
    });
  });

  describe('Account Management', () => {
    it('should have getAddress method returning address string', async () => {
      expect(provider.getAddress).toBeDefined();
      const address = await provider.getAddress();
      expect(typeof address).toBe('string');
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should have getDepositAccount method for gasless operations', async () => {
      expect(provider.getDepositAccount).toBeDefined();
      const depositAccount = await provider.getDepositAccount();
      expect(typeof depositAccount).toBe('string');
      expect(depositAccount).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe('Chain Management', () => {
    it('should have getCurrentChainId method', async () => {
      expect(provider.getCurrentChainId).toBeDefined();
      const chainId = await provider.getCurrentChainId();
      expect(typeof chainId).toBe('number');
      expect(chainId).toBeGreaterThan(0);
    });

    it('should have switchChain method', async () => {
      expect(provider.switchChain).toBeDefined();
      await expect(provider.switchChain(5611)).resolves.toBeUndefined();
    });

    it('should have getSupportedChains method', () => {
      expect(provider.getSupportedChains).toBeDefined();
      const chains = provider.getSupportedChains();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);
      chains.forEach(chain => {
        expect(typeof chain).toBe('number');
      });
    });
  });

  describe('Transaction Handling', () => {
    it('should have sendTransaction method with proper signature', async () => {
      expect(provider.sendTransaction).toBeDefined();

      const tx: TransactionRequest = {
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
        value: ethers.parseEther('0.1'),
        data: '0x'
      };

      const response = await provider.sendTransaction(tx);
      expect(response).toBeDefined();
      expect(response.hash).toBeDefined();
      expect(typeof response.hash).toBe('string');
    });

    it('should have signMessage method', async () => {
      expect(provider.signMessage).toBeDefined();
      const signature = await provider.signMessage('Hello World');
      expect(typeof signature).toBe('string');
      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });
  });

  describe('Balance Queries', () => {
    it('should have getBalance method for native token', async () => {
      expect(provider.getBalance).toBeDefined();
      const balance = await provider.getBalance();
      expect(typeof balance).toBe('string');
    });

    it('should have getBalance method for specific token', async () => {
      const tokenAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'; // USDC
      const balance = await provider.getBalance(tokenAddress);
      expect(typeof balance).toBe('string');
    });
  });

  describe('Provider Capabilities', () => {
    it('should have getCapabilities method returning WalletCapabilities', () => {
      expect(provider.getCapabilities).toBeDefined();
      const capabilities = provider.getCapabilities();

      expect(capabilities).toBeDefined();
      expect(typeof capabilities.supportsGaslessTransactions).toBe('boolean');
      expect(typeof capabilities.supportsChainSwitching).toBe('boolean');
      expect(typeof capabilities.supportsSmartAccounts).toBe('boolean');
      expect(typeof capabilities.requiresDepositAccount).toBe('boolean');
    });

    it('should indicate gasless support correctly', () => {
      const capabilities = provider.getCapabilities();

      // EOA provider should not support gasless
      if (!capabilities.supportsSmartAccounts) {
        expect(capabilities.supportsGaslessTransactions).toBe(false);
      }

      // Smart account provider should support gasless
      if (capabilities.supportsSmartAccounts) {
        expect(capabilities.supportsGaslessTransactions).toBe(true);
      }
    });
  });

  describe('Interface Completeness', () => {
    it('should have all required methods', () => {
      const requiredMethods = [
        'connect',
        'disconnect',
        'isConnected',
        'getAddress',
        'getDepositAccount',
        'getCurrentChainId',
        'switchChain',
        'getSupportedChains',
        'sendTransaction',
        'signMessage',
        'getBalance',
        'getCapabilities'
      ];

      requiredMethods.forEach(method => {
        expect(provider[method as keyof IWalletProvider]).toBeDefined();
        expect(typeof provider[method as keyof IWalletProvider]).toBe('function');
      });
    });
  });
});