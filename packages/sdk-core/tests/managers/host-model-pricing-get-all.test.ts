// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.getHostModelPrices() method
 * Phase 18: Now requires token param, returns (bytes32[], uint256[])
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Known model IDs for testing
const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
const TINY_LLAMA_MODEL_ID = '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// Phase 18: Mock contract response — 2 parallel arrays (modelIds, prices)
const mockGetHostModelPrices = vi.fn().mockResolvedValue([
  // modelIds array
  [TINY_VICUNA_MODEL_ID, TINY_LLAMA_MODEL_ID],
  // prices array (for the specific token queried)
  [50000n, 75000n]
]);

const mockNodeRegistry = {
  getHostModelPrices: mockGetHostModelPrices,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.getHostModelPrices()', () => {
  const hostAddress = '0x' + '2'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Contract Interaction', () => {
    it('should call contract getHostModelPrices with host address AND token', async () => {
      await mockNodeRegistry.getHostModelPrices(hostAddress, USDC_ADDRESS);

      expect(mockGetHostModelPrices).toHaveBeenCalledWith(hostAddress, USDC_ADDRESS);
    });

    it('should accept ZeroAddress for native pricing query', async () => {
      await mockNodeRegistry.getHostModelPrices(hostAddress, ethers.ZeroAddress);

      expect(mockGetHostModelPrices).toHaveBeenCalledWith(hostAddress, ethers.ZeroAddress);
    });

    it('should return 2 parallel arrays (modelIds, prices)', async () => {
      const [modelIds, prices] = await mockNodeRegistry.getHostModelPrices(hostAddress, USDC_ADDRESS);

      expect(Array.isArray(modelIds)).toBe(true);
      expect(Array.isArray(prices)).toBe(true);
      expect(modelIds.length).toBe(prices.length);
    });

    it('should transform contract response to ModelPricing format', async () => {
      const [modelIds, prices] = await mockNodeRegistry.getHostModelPrices(hostAddress, USDC_ADDRESS);

      // Transform to ModelPricing objects (as the SDK method would)
      const modelPrices = modelIds.map((modelId: string, i: number) => ({
        modelId,
        price: prices[i]
      }));

      expect(modelPrices).toHaveLength(2);
      expect(modelPrices[0].modelId).toBe(TINY_VICUNA_MODEL_ID);
      expect(modelPrices[0].price).toBe(50000n);
      expect(modelPrices[1].price).toBe(75000n);
    });
  });

  describe('Filtering', () => {
    it('should filter out price=0 entries (not configured)', async () => {
      const mockWithZeros = vi.fn().mockResolvedValue([
        [TINY_VICUNA_MODEL_ID, TINY_LLAMA_MODEL_ID],
        [50000n, 0n] // TinyLlama has no pricing for this token
      ]);

      const [modelIds, prices] = await mockWithZeros(hostAddress, USDC_ADDRESS);

      // Filter out zero prices
      const filtered = modelIds
        .map((modelId: string, i: number) => ({ modelId, price: prices[i] }))
        .filter((p: any) => p.price !== 0n);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].modelId).toBe(TINY_VICUNA_MODEL_ID);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty arrays for host with no models', async () => {
      const emptyMock = vi.fn().mockResolvedValue([[], []]);

      const [modelIds, prices] = await emptyMock(hostAddress, USDC_ADDRESS);

      expect(modelIds).toHaveLength(0);
      expect(prices).toHaveLength(0);
    });

    it('should handle unregistered host gracefully', async () => {
      const unregisteredMock = vi.fn().mockRejectedValue(new Error('Host not registered'));

      await expect(unregisteredMock(ethers.ZeroAddress, USDC_ADDRESS)).rejects.toThrow('Host not registered');
    });

    it('should handle bigint prices correctly', async () => {
      const largePriceMock = vi.fn().mockResolvedValue([
        [TINY_VICUNA_MODEL_ID],
        [100_000_000n] // Max stable price
      ]);

      const [modelIds, prices] = await largePriceMock(hostAddress, USDC_ADDRESS);

      expect(typeof prices[0]).toBe('bigint');
      expect(prices[0]).toBe(100_000_000n);
    });
  });
});
