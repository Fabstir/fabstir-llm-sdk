// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';

describe('Backward Compatibility - Pre-MVP Defaults', () => {
  describe('Default Chain Behavior', () => {
    it('should default to Base Sepolia when no chainId provided', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      expect(sdk.getCurrentChainId()).toBe(ChainId.BASE_SEPOLIA);
      expect(sdk.getCurrentChainId()).toBe(84532);
    });

    it('should return correct default chain configuration', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      const chain = sdk.getCurrentChain();
      expect(chain.chainId).toBe(84532);
      expect(chain.name).toBe('Base Sepolia');
      expect(chain.nativeToken).toBe('ETH');
    });
  });

  describe('Minimal Configuration', () => {
    it('should work with only required parameters', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      expect(sdk).toBeDefined();
      expect(sdk.isInitialized()).toBe(false); // Not initialized until wallet connected
    });

    it('should handle optional parameters being omitted', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
          // Note: fabToken and modelRegistry are optional
        }
      });

      expect(sdk).toBeDefined();
      // Should not throw even without optional addresses
    });
  });

  describe('API Consistency', () => {
    it('should expose all expected public methods', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      // Core methods
      expect(typeof sdk.authenticate).toBe('function');
      expect(typeof sdk.initialize).toBe('function');
      expect(typeof sdk.isInitialized).toBe('function');

      // Chain methods
      expect(typeof sdk.getCurrentChainId).toBe('function');
      expect(typeof sdk.getCurrentChain).toBe('function');
      expect(typeof sdk.switchChain).toBe('function');

      // Manager getters
      expect(typeof sdk.getPaymentManager).toBe('function');
      expect(typeof sdk.getStorageManager).toBe('function');
      expect(typeof sdk.getSessionManager).toBe('function');
      expect(typeof sdk.getClientManager).toBe('function');
    });

    it('should maintain consistent method signatures', () => {
      const sdk = new FabstirSDKCore({
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0xaa38e7fcf5d7944ef7c836e8451f3bf93b98364f',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      // Check authenticate accepts both old and new patterns
      expect(sdk.authenticate.length).toBeLessThanOrEqual(2); // method and options params

      // Check chainId methods return correct types
      expect(typeof sdk.getCurrentChainId()).toBe('number');
      expect(typeof sdk.getCurrentChain()).toBe('object');
    });
  });
});