// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Manager Pricing Tests
 * @description Phase 18: Tests for per-model per-token pricing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostManager, HostRegistrationWithModels } from '../../src/managers/HostManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { PricingValidationError } from '../../src/errors/pricing-errors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Mock ethers to provide both v5 and v6 compatibility
vi.mock('ethers', async () => {
  const actual: any = await vi.importActual('ethers');
  const zeroAddr = '0x0000000000000000000000000000000000000000';

  // Create custom Contract class that returns appropriate mocks
  class MockContract {
    constructor(public address: string, public abi: any, public signerOrProvider: any) {
      // Return mock FAB token for FAB token address
      if (address === '0xC78949004B4EB6dEf2D66e49Cd81231472612D62') {
        return {
          balanceOf: vi.fn().mockResolvedValue(1000n * (10n ** 18n)),
          approve: vi.fn().mockResolvedValue({
            wait: vi.fn().mockResolvedValue({ status: 1 })
          }),
          allowance: vi.fn().mockResolvedValue(1000n * (10n ** 18n))
        } as any;
      }
    }
  }

  return {
    ...actual,
    Contract: MockContract,
    isAddress: (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address),
    ZeroAddress: zeroAddr, // v6
    constants: { // v5
      ...actual.constants,
      AddressZero: zeroAddr
    }
  };
});

describe('HostManager Pricing Methods', () => {
  let hostManager: HostManager;
  let mockProvider: ethers.JsonRpcProvider;
  let mockWallet: ethers.Wallet;
  let mockModelManager: ModelManager;
  let mockNodeRegistry: any;

  const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

  beforeEach(async () => {
    // Fix ethers v5/v6 compatibility
    if (!ethers.ZeroAddress) {
      (ethers as any).ZeroAddress = '0x0000000000000000000000000000000000000000';
    }

    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      call: vi.fn().mockResolvedValue('0x' + '0'.repeat(64)),
      estimateGas: vi.fn().mockResolvedValue(100000n)
    } as any;

    mockWallet = {
      address: '0x' + '1'.repeat(40),
      provider: mockProvider,
      _isSigner: true,
      getAddress: vi.fn().mockResolvedValue('0x' + '1'.repeat(40)),
      signMessage: vi.fn().mockResolvedValue('0xmocksignature')
    } as any;

    mockModelManager = {
      isModelApproved: vi.fn().mockResolvedValue(true),
      getModelId: vi.fn().mockResolvedValue(TINY_VICUNA_MODEL_ID),
      isValidModelId: vi.fn().mockResolvedValue(true),
      initialize: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Mock NodeRegistry contract — Phase 18: per-model per-token pricing
    mockNodeRegistry = {
      registerNode: vi.fn().mockResolvedValue({
        hash: '0x' + '3'.repeat(64),
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0x' + '3'.repeat(64)
        })
      }),
      setModelTokenPricing: vi.fn().mockResolvedValue({
        hash: '0x' + '5'.repeat(64),
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0x' + '5'.repeat(64)
        })
      }),
      getModelPricing: vi.fn().mockResolvedValue(2000n),
      getNodeFullInfo: vi.fn().mockResolvedValue([
        mockWallet.address, // operator
        1000n * (10n ** 18n), // stakedAmount
        true, // active
        '{"hardware":{"gpu":"RTX 4090","vram":24,"ram":32}}', // metadata
        'http://localhost:8083', // apiUrl
        [TINY_VICUNA_MODEL_ID], // supportedModels
        2000n, // minPricePerTokenNative
        2000n  // minPricePerTokenStable
      ]),
      nodes: vi.fn().mockResolvedValue([
        '0x0000000000000000000000000000000000000000',
        0n,
        false
      ]),
      address: process.env.CONTRACT_NODE_REGISTRY
    };

    hostManager = new HostManager(
      mockWallet,
      '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
      mockModelManager,
      '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      null
    );

    (hostManager as any).nodeRegistry = mockNodeRegistry;
    (hostManager as any).initialized = true;
  });

  describe('setModelTokenPricing is available', () => {
    it('should have setModelTokenPricing method on HostManager', () => {
      expect(typeof hostManager.setModelTokenPricing).toBe('function');
    });

    it('should have clearModelTokenPricing method on HostManager', () => {
      expect(typeof hostManager.clearModelTokenPricing).toBe('function');
    });

    it('should NOT have old pricing methods', () => {
      expect((hostManager as any).updatePricingNative).toBeUndefined();
      expect((hostManager as any).updatePricingStable).toBeUndefined();
      expect((hostManager as any).updatePricing).toBeUndefined();
      expect((hostManager as any).getPricing).toBeUndefined();
      expect((hostManager as any).setModelPricing).toBeUndefined();
      expect((hostManager as any).clearModelPricing).toBeUndefined();
      expect((hostManager as any).setTokenPricing).toBeUndefined();
    });
  });

  describe('setModelTokenPricing', () => {
    it('should set pricing for a specific model and token', async () => {
      const txHash = await hostManager.setModelTokenPricing(
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress,
        '3000000'
      );

      expect(txHash).toBeDefined();
      expect(mockNodeRegistry.setModelTokenPricing).toHaveBeenCalledWith(
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress,
        3000000n,
        expect.any(Object)
      );
    });

    it('should reject invalid model ID format', async () => {
      await expect(
        hostManager.setModelTokenPricing('invalid-model-id', ethers.ZeroAddress, '3000000')
      ).rejects.toThrow('Invalid modelId format');
    });
  });

  describe('getModelPricing', () => {
    it('should return price for a specific model + token', async () => {
      const price = await hostManager.getModelPricing(
        mockWallet.address,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );

      expect(price).toBe(2000n);
      expect(mockNodeRegistry.getModelPricing).toHaveBeenCalledWith(
        mockWallet.address,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );
    });
  });
});
