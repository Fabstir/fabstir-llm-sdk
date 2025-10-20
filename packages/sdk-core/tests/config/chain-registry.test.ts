// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainConfig, ChainId } from '../../src/types/chain.types';

describe('ChainRegistry', () => {
  describe('Base Sepolia Configuration', () => {
    it('should have correct chain ID for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.chainId).toBe(84532);
    });

    it('should have correct chain name for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.name).toBe('Base Sepolia');
    });

    it('should have ETH as native token for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.nativeToken).toBe('ETH');
    });

    it('should have correct JobMarketplace address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.jobMarketplace.toLowerCase()).toBe(
        '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f'.toLowerCase()
      );
    });

    it('should have correct NodeRegistry address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.nodeRegistry.toLowerCase()).toBe(
        '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218'.toLowerCase()
      );
    });

    it('should have correct ProofSystem address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.proofSystem.toLowerCase()).toBe(
        '0x2ACcc60893872A499700908889B38C5420CBcFD1'.toLowerCase()
      );
    });

    it('should have correct HostEarnings address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.hostEarnings.toLowerCase()).toBe(
        '0x908962e8c6CE72610021586f85ebDE09aAc97776'.toLowerCase()
      );
    });

    it('should have correct ModelRegistry address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.modelRegistry.toLowerCase()).toBe(
        '0x92b2De840bB2171203011A6dBA928d855cA8183E'.toLowerCase()
      );
    });

    it('should have correct USDC token address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.usdcToken.toLowerCase()).toBe(
        '0x036CbD53842c5426634e7929541eC2318f3dCF7e'.toLowerCase()
      );
    });

    it('should have correct FAB token address for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.contracts.fabToken?.toLowerCase()).toBe(
        '0xC78949004B4EB6dEf2D66e49Cd81231472612D62'.toLowerCase()
      );
    });

    it('should have correct min deposit for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.minDeposit).toBe('0.0002');
    });

    it('should have block explorer URL for Base Sepolia', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(config.blockExplorer).toContain('sepolia.basescan');
    });
  });

  describe('opBNB Testnet Configuration', () => {
    it('should have correct chain ID for opBNB testnet', () => {
      const config = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(config.chainId).toBe(5611);
    });

    it('should have correct chain name for opBNB testnet', () => {
      const config = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(config.name).toBe('opBNB Testnet');
    });

    it('should have BNB as native token for opBNB testnet', () => {
      const config = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(config.nativeToken).toBe('BNB');
    });

    it('should have placeholder contracts for opBNB testnet', () => {
      const config = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      // Contracts to be deployed, should have structure but may be empty
      expect(config.contracts).toBeDefined();
      expect(typeof config.contracts).toBe('object');
    });
  });

  describe('Chain Registry Methods', () => {
    it('should return correct config with getChainConfig by number', () => {
      const config = ChainRegistry.getChainConfig(84532);
      expect(config).toBeDefined();
      expect(config?.chainId).toBe(84532);
      expect(config?.name).toBe('Base Sepolia');
    });

    it('should return undefined for unsupported chain', () => {
      const config = ChainRegistry.getChainConfig(999999);
      expect(config).toBeUndefined();
    });

    it('should correctly check if chain is supported', () => {
      expect(ChainRegistry.isChainSupported(84532)).toBe(true);
      expect(ChainRegistry.isChainSupported(5611)).toBe(true);
      expect(ChainRegistry.isChainSupported(999999)).toBe(false);
    });

    it('should return all supported chains', () => {
      const chains = ChainRegistry.getSupportedChains();
      expect(chains).toContain(84532);
      expect(chains).toContain(5611);
      expect(chains.length).toBeGreaterThanOrEqual(2);
    });

    it('should return all chain configs', () => {
      const configs = ChainRegistry.getAllChainConfigs();
      expect(configs.length).toBeGreaterThanOrEqual(2);

      const baseSepolia = configs.find(c => c.chainId === 84532);
      expect(baseSepolia).toBeDefined();
      expect(baseSepolia?.name).toBe('Base Sepolia');

      const opBNB = configs.find(c => c.chainId === 5611);
      expect(opBNB).toBeDefined();
      expect(opBNB?.name).toBe('opBNB Testnet');
    });

    it('should get chain by enum value', () => {
      const baseConfig = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(baseConfig.chainId).toBe(84532);

      const opBNBConfig = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(opBNBConfig.chainId).toBe(5611);
    });

    it('should throw error for invalid chain', () => {
      expect(() => ChainRegistry.getChain(999999 as ChainId)).toThrow();
    });

    it('should have valid RPC URLs', () => {
      const baseConfig = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
      expect(baseConfig.rpcUrl).toBeTruthy();
      expect(baseConfig.rpcUrl).toMatch(/^https?:\/\//);

      const opBNBConfig = ChainRegistry.getChain(ChainId.OPBNB_TESTNET);
      expect(opBNBConfig.rpcUrl).toBeTruthy();
      expect(opBNBConfig.rpcUrl).toMatch(/^https?:\/\//);
    });
  });

  describe('Chain Config Structure', () => {
    it('should have all required fields in ChainConfig', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

      // Required fields
      expect(config).toHaveProperty('chainId');
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('nativeToken');
      expect(config).toHaveProperty('rpcUrl');
      expect(config).toHaveProperty('contracts');
      expect(config).toHaveProperty('minDeposit');
      expect(config).toHaveProperty('blockExplorer');

      // Contract fields
      expect(config.contracts).toHaveProperty('jobMarketplace');
      expect(config.contracts).toHaveProperty('nodeRegistry');
      expect(config.contracts).toHaveProperty('proofSystem');
      expect(config.contracts).toHaveProperty('hostEarnings');
      expect(config.contracts).toHaveProperty('modelRegistry');
      expect(config.contracts).toHaveProperty('usdcToken');
    });

    it('should have correct types for all fields', () => {
      const config = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

      expect(typeof config.chainId).toBe('number');
      expect(typeof config.name).toBe('string');
      expect(['ETH', 'BNB']).toContain(config.nativeToken);
      expect(typeof config.rpcUrl).toBe('string');
      expect(typeof config.contracts).toBe('object');
      expect(typeof config.minDeposit).toBe('string');
      expect(typeof config.blockExplorer).toBe('string');
    });
  });
});