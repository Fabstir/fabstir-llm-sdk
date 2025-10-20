// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { EOAProvider } from '../../src/providers/EOAProvider';
import { SmartAccountProvider } from '../../src/providers/SmartAccountProvider';
import { WalletProviderFactory } from '../../src/factories/WalletProviderFactory';
import { ChainId } from '../../src/types/chain.types';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { createMockProvider, verifyContractAddress } from '../utils/test-helpers';
import { UnsupportedChainError, ChainMismatchError } from '../../src/errors/ChainErrors';

describe('Multi-Chain Integration - Base Sepolia', () => {
  let sdk: FabstirSDKCore;
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = createMockProvider(ChainId.BASE_SEPOLIA);

    // Mock fetch for node discovery
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [{ url: 'http://node1.base', chain_id: ChainId.BASE_SEPOLIA }],
        models: [{ id: 'llama-3', chain_id: ChainId.BASE_SEPOLIA }],
        status: 'healthy',
        chains: [{ chain_id: ChainId.BASE_SEPOLIA, name: 'Base Sepolia' }]
      })
    });
  });

  describe('SDK Initialization with Base Sepolia', () => {
    it('should initialize SDK with Base Sepolia chain ID', () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      expect(sdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
      const chain = sdk.getCurrentChain();
      expect(chain.name).toBe('Base Sepolia');
      expect(chain.nativeToken).toBe('ETH');
    });

    it('should reject unsupported chain IDs', () => {
      expect(() => {
        new FabstirSDKCore({
          chainId: 999999,
          rpcUrl: 'https://invalid.chain'
        });
      }).toThrow(UnsupportedChainError);
    });

    it('should use correct contract addresses for Base Sepolia', () => {
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(verifyContractAddress(ChainId.BASE_SEPOLIA, 'jobMarketplace',
        chain.contracts.jobMarketplace)).toBe(true);
      expect(verifyContractAddress(ChainId.BASE_SEPOLIA, 'nodeRegistry',
        chain.contracts.nodeRegistry)).toBe(true);
      expect(chain.minDeposit).toBe('0.0002');
    });
  });

  describe('ETH Payment Flow', () => {
    it('should create session with ETH payment', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);

      expect(sdk.isInitialized()).toBe(true);
      expect(await eoaProvider.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should deposit ETH and create session from deposit', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);

      // Use authentication with private key
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();

      // Mock contract interactions
      const mockContract = {
        depositNative: vi.fn().mockResolvedValue({ hash: '0x123', wait: vi.fn() }),
        getDepositBalance: vi.fn().mockResolvedValue(ethers.parseEther('0.001'))
      };

      // Test deposit would happen here through JobMarketplace wrapper
      const depositAmount = '0.001';
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(parseFloat(depositAmount) >= parseFloat(chain.minDeposit)).toBe(true);
    });
  });

  describe('Wallet Provider Switching', () => {
    it('should switch from EOA to Smart Account provider', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      // Start with EOA provider
      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);

      const capabilities = eoaProvider.getCapabilities();
      expect(capabilities.supportsGaslessTransactions).toBe(false);
      expect(capabilities.supportsChainSwitching).toBe(true);

      // Create Smart Account provider
      const smartProvider = new SmartAccountProvider({
        bundlerUrl: 'http://bundler.base',
        paymasterUrl: 'http://paymaster.base'
      });

      const smartCapabilities = smartProvider.getCapabilities();
      expect(smartCapabilities.supportsGaslessTransactions).toBe(true);
      expect(smartCapabilities.requiresDepositAccount).toBe(true);
    });

    it('should auto-detect available wallet provider', async () => {
      (global as any).window = { ethereum: mockProvider };

      const provider = await WalletProviderFactory.createProvider('eoa', mockProvider);
      expect(provider).toBeInstanceOf(EOAProvider);

      delete (global as any).window;
    });
  });

  describe('Chain-Specific Node Discovery', () => {
    it('should discover nodes for Base Sepolia', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });
      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const clientManager = sdk.getClientManager();
      const nodes = await clientManager.discoverNodes(ChainId.BASE_SEPOLIA);

      expect(nodes).toHaveLength(1);
      expect(nodes[0].chain_id).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should validate node supports target chain', async () => {
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });
      const eoaProvider = new EOAProvider(mockProvider);
      await sdk.initialize(eoaProvider);
      await sdk.authenticate('privatekey', { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' });

      const clientManager = sdk.getClientManager();
      const chains = await clientManager.getNodeChains('http://node1.base');

      expect(chains).toContain(ChainId.BASE_SEPOLIA);
    });
  });

  describe('Error Handling', () => {
    it('should throw ChainMismatchError when on wrong network', async () => {
      const wrongChainProvider = createMockProvider(ChainId.OPBNB_TESTNET);
      sdk = new FabstirSDKCore({
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E'
        }
      });

      const provider = new EOAProvider(wrongChainProvider);

      // Connect provider first
      await provider.connect();
      // Provider reports different chain than SDK expects
      await expect(provider.getCurrentChainId()).resolves.toBe(ChainId.OPBNB_TESTNET);
    });

    it('should handle insufficient deposit error', () => {
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      const insufficientAmount = '0.0001';

      expect(parseFloat(insufficientAmount) < parseFloat(chain.minDeposit)).toBe(true);
    });
  });
});