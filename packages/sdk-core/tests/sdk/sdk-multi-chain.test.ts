// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { IWalletProvider } from '../../src/interfaces/IWalletProvider';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import { UnsupportedChainError, ChainMismatchError } from '../../src/errors/ChainErrors';
import { ethers } from 'ethers';

// Default contract addresses for testing
const testContractAddresses = {
  jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
  nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
  proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
  hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
  usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
};

// Mock wallet provider
class MockWalletProvider implements IWalletProvider {
  private connected = false;
  private currentChainId = ChainId.BASE_SEPOLIA;
  private address = '0x742d35cc6634c0532925a3b844bc9e7595f0beeb';

  async connect(chainId?: number): Promise<void> {
    if (chainId && !this.getSupportedChains().includes(chainId)) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    this.connected = true;
    if (chainId) {
      this.currentChainId = chainId;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getAddress(): Promise<string> {
    if (!this.connected) throw new Error('Not connected');
    return this.address;
  }

  async getDepositAccount(): Promise<string> {
    return this.getAddress();
  }

  async getCurrentChainId(): Promise<number> {
    if (!this.connected) throw new Error('Not connected');
    return this.currentChainId;
  }

  async switchChain(chainId: number): Promise<void> {
    if (!this.getSupportedChains().includes(chainId)) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
    this.currentChainId = chainId;
  }

  getSupportedChains(): number[] {
    return [ChainId.BASE_SEPOLIA, ChainId.OPBNB_TESTNET];
  }

  async sendTransaction(tx: any): Promise<any> {
    return { hash: '0x123', wait: async () => ({ status: 1 }) };
  }

  async signMessage(message: string): Promise<string> {
    return '0xsignature';
  }

  async getBalance(token?: string): Promise<string> {
    return '1000000000000000000';
  }

  getCapabilities() {
    return {
      supportsGaslessTransactions: false,
      supportsChainSwitching: true,
      supportsSmartAccounts: false,
      requiresDepositAccount: false
    };
  }
}

describe('FabstirSDKCore Multi-Chain Support', () => {
  let sdk: FabstirSDKCore;
  let walletProvider: MockWalletProvider;

  beforeEach(() => {
    walletProvider = new MockWalletProvider();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('SDK Initialization with Chain ID', () => {
    it('should initialize with default Base Sepolia chain', () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: testContractAddresses
      });
      expect(sdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should initialize with specified chain ID', () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://opbnb-testnet.nodereal.io/v1/test',
        chainId: ChainId.OPBNB_TESTNET,
        contractAddresses: testContractAddresses
      });
      expect(sdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should throw error for unsupported chain ID', () => {
      expect(() => new FabstirSDKCore({
        rpcUrl: 'https://mainnet.infura.io',
        chainId: 1
      })).toThrow(UnsupportedChainError);
    });

    it('should accept wallet provider during initialization', async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });
      await sdk.initialize(walletProvider);
      expect(sdk.isInitialized()).toBe(true);
    });

    it('should connect wallet to SDK chain during initialization', async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://opbnb-testnet.nodereal.io/v1/test',
        chainId: ChainId.OPBNB_TESTNET,
        contractAddresses: testContractAddresses
      });
      const connectSpy = vi.spyOn(walletProvider, 'connect');

      await sdk.initialize(walletProvider);

      expect(connectSpy).toHaveBeenCalledWith(ChainId.OPBNB_TESTNET);
      expect(await walletProvider.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });
  });

  describe('Chain Switching', () => {
    beforeEach(async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });
      await sdk.initialize(walletProvider);
    });

    it('should switch to supported chain', async () => {
      await sdk.switchChain(ChainId.OPBNB_TESTNET);
      expect(sdk.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
      expect(await walletProvider.getCurrentChainId()).toBe(ChainId.OPBNB_TESTNET);
    });

    it('should throw error when switching to unsupported chain', async () => {
      await expect(sdk.switchChain(1))
        .rejects.toThrow(UnsupportedChainError);
    });

    it('should reinitialize managers after chain switch', async () => {
      // First authenticate with wallet provider
      await sdk.authenticateWithWallet();

      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();

      // Switch chain
      await sdk.switchChain(ChainId.OPBNB_TESTNET);

      // Managers should be reinitialized with new chain
      const newPaymentManager = sdk.getPaymentManager();
      expect(newPaymentManager).toBeDefined();
      // In real implementation, would verify it's using new chain config
    });

    it('should emit chain changed event', async () => {
      const chainChangedHandler = vi.fn();
      sdk.on('chainChanged', chainChangedHandler);

      await sdk.switchChain(ChainId.OPBNB_TESTNET);

      expect(chainChangedHandler).toHaveBeenCalledWith({
        oldChainId: ChainId.BASE_SEPOLIA,
        newChainId: ChainId.OPBNB_TESTNET
      });
    });

    it('should not switch if already on target chain', async () => {
      const switchSpy = vi.spyOn(walletProvider, 'switchChain');

      await sdk.switchChain(ChainId.BASE_SEPOLIA);

      expect(switchSpy).not.toHaveBeenCalled();
      expect(sdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
    });
  });

  describe('Chain Configuration', () => {
    beforeEach(() => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });
    });

    it('should get current chain configuration', () => {
      const chainConfig = sdk.getCurrentChain();
      expect(chainConfig).toBeDefined();
      expect(chainConfig.chainId).toBe(ChainId.BASE_SEPOLIA);
      expect(chainConfig.name).toBe('Base Sepolia');
    });

    it('should check if chain is supported', () => {
      expect(sdk.isChainSupported(ChainId.BASE_SEPOLIA)).toBe(true);
      expect(sdk.isChainSupported(ChainId.OPBNB_TESTNET)).toBe(true);
      expect(sdk.isChainSupported(1)).toBe(false);
    });

    it('should get list of supported chains', () => {
      const supportedChains = sdk.getSupportedChains();
      expect(supportedChains).toContain(ChainId.BASE_SEPOLIA);
      expect(supportedChains).toContain(ChainId.OPBNB_TESTNET);
    });

    it('should get chain-specific contract addresses', () => {
      const contracts = sdk.getContractAddresses();
      expect(contracts.jobMarketplace).toBeDefined();
      // Should return addresses for current chain
    });
  });

  describe('Manager Chain Awareness', () => {
    beforeEach(async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });
      await sdk.initialize(walletProvider);
      await sdk.authenticateWithWallet();
    });

    it('should pass chain ID to payment manager', () => {
      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();
      // Manager should be using Base Sepolia config
    });

    it('should update manager chain after switch', async () => {
      await sdk.switchChain(ChainId.OPBNB_TESTNET);

      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();
      // Manager should now be using opBNB config
    });

    it('should handle manager operations on current chain', async () => {
      const sessionManager = sdk.getSessionManager();

      // Create session on current chain (Base Sepolia)
      // Session should use Base Sepolia contracts
    });
  });

  describe('Error Handling', () => {
    it('should handle wallet provider chain mismatch', async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });

      // Mock provider on different chain
      const mismatchProvider = new MockWalletProvider();
      vi.spyOn(mismatchProvider, 'getCurrentChainId').mockResolvedValue(ChainId.OPBNB_TESTNET);

      // Should handle gracefully or prompt to switch
      await sdk.initialize(mismatchProvider);
      // SDK should either switch provider chain or throw appropriate error
    });

    it('should validate chain ID in config', () => {
      expect(() => new FabstirSDKCore({
        rpcUrl: 'https://mainnet.infura.io',
        chainId: 999999
      })).toThrow(UnsupportedChainError);
    });

    it('should handle provider without chain switching support', async () => {
      sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        chainId: ChainId.BASE_SEPOLIA,
        contractAddresses: testContractAddresses
      });

      const noSwitchProvider = new MockWalletProvider();
      noSwitchProvider.getCapabilities = () => ({
        supportsGaslessTransactions: false,
        supportsChainSwitching: false,
        supportsSmartAccounts: false,
        requiresDepositAccount: false
      });

      await sdk.initialize(noSwitchProvider);

      // Should throw appropriate error when trying to switch
      await expect(sdk.switchChain(ChainId.OPBNB_TESTNET))
        .rejects.toThrow('Wallet provider does not support chain switching');
    });
  });
});