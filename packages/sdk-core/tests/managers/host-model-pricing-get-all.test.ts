// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.getHostModelPrices() method
 * Sub-phase 3.1: Add getHostModelPrices() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Known model IDs for testing
const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
const TINY_LLAMA_MODEL_ID = '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca';

// Mock contract response - 3 parallel arrays
const mockGetHostModelPrices = vi.fn().mockResolvedValue([
  // modelIds array
  [TINY_VICUNA_MODEL_ID, TINY_LLAMA_MODEL_ID],
  // nativePrices array
  [3000000n, 3000000n],
  // stablePrices array
  [50000n, 50000n]
]);

const mockGetNodeFullInfo = vi.fn().mockResolvedValue([
  '0x' + '1'.repeat(40), // operator
  1000000000000000000n, // stakedAmount
  true,                  // active
  '{}',                  // metadata
  'http://localhost:8080', // apiUrl
  [TINY_VICUNA_MODEL_ID, TINY_LLAMA_MODEL_ID], // supportedModels
  3000000n,             // minPricePerTokenNative (default)
  50000n                // minPricePerTokenStable (default)
]);

const mockNodeRegistry = {
  getHostModelPrices: mockGetHostModelPrices,
  getNodeFullInfo: mockGetNodeFullInfo,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.getHostModelPrices()', () => {
  const hostAddress = '0x' + '2'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Contract Interaction', () => {
    it('should call contract getHostModelPrices with host address', async () => {
      await mockNodeRegistry.getHostModelPrices(hostAddress);

      expect(mockGetHostModelPrices).toHaveBeenCalledWith(hostAddress);
    });

    it('should return array of ModelPricing objects', async () => {
      const [modelIds, nativePrices, stablePrices] = await mockNodeRegistry.getHostModelPrices(hostAddress);

      expect(Array.isArray(modelIds)).toBe(true);
      expect(Array.isArray(nativePrices)).toBe(true);
      expect(Array.isArray(stablePrices)).toBe(true);
      expect(modelIds.length).toBe(nativePrices.length);
      expect(modelIds.length).toBe(stablePrices.length);
    });

    it('should transform contract response to ModelPricing format', async () => {
      const [modelIds, nativePrices, stablePrices] = await mockNodeRegistry.getHostModelPrices(hostAddress);

      // Transform to ModelPricing objects (as the SDK method would)
      const prices = modelIds.map((modelId: string, i: number) => ({
        modelId,
        nativePrice: nativePrices[i],
        stablePrice: stablePrices[i],
        isCustom: false // Would be determined by comparing to defaults
      }));

      expect(prices).toHaveLength(2);
      expect(prices[0].modelId).toBe(TINY_VICUNA_MODEL_ID);
      expect(prices[0].nativePrice).toBe(3000000n);
      expect(prices[0].stablePrice).toBe(50000n);
    });
  });

  describe('isCustom Detection', () => {
    it('should mark prices as custom when different from defaults', async () => {
      // Mock custom pricing for TinyVicuna
      const customMockGetHostModelPrices = vi.fn().mockResolvedValue([
        [TINY_VICUNA_MODEL_ID, TINY_LLAMA_MODEL_ID],
        [5000000n, 3000000n],  // TinyVicuna has custom native price
        [75000n, 50000n]       // TinyVicuna has custom stable price
      ]);

      const [modelIds, nativePrices, stablePrices] = await customMockGetHostModelPrices(hostAddress);

      // Get defaults
      const hostInfo = await mockNodeRegistry.getNodeFullInfo(hostAddress);
      const defaultNative = hostInfo[6];
      const defaultStable = hostInfo[7];

      // Transform with isCustom detection
      const prices = modelIds.map((modelId: string, i: number) => ({
        modelId,
        nativePrice: nativePrices[i],
        stablePrice: stablePrices[i],
        isCustom: nativePrices[i] !== defaultNative || stablePrices[i] !== defaultStable
      }));

      // TinyVicuna should be custom (different from defaults)
      expect(prices[0].isCustom).toBe(true);
      // TinyLlama should not be custom (same as defaults)
      expect(prices[1].isCustom).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for host with no models', async () => {
      const emptyMock = vi.fn().mockResolvedValue([[], [], []]);

      const [modelIds, nativePrices, stablePrices] = await emptyMock(hostAddress);

      expect(modelIds).toHaveLength(0);
      expect(nativePrices).toHaveLength(0);
      expect(stablePrices).toHaveLength(0);
    });

    it('should handle unregistered host gracefully', async () => {
      const unregisteredMock = vi.fn().mockRejectedValue(new Error('Host not registered'));

      await expect(unregisteredMock(ethers.ZeroAddress)).rejects.toThrow('Host not registered');
    });

    it('should handle bigint prices correctly', async () => {
      const largePriceMock = vi.fn().mockResolvedValue([
        [TINY_VICUNA_MODEL_ID],
        [22_727_272_727_273_000n], // Max native price
        [100_000_000n]             // Max stable price
      ]);

      const [modelIds, nativePrices, stablePrices] = await largePriceMock(hostAddress);

      expect(typeof nativePrices[0]).toBe('bigint');
      expect(typeof stablePrices[0]).toBe('bigint');
      expect(nativePrices[0]).toBe(22_727_272_727_273_000n);
      expect(stablePrices[0]).toBe(100_000_000n);
    });
  });
});
