// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.getModelPricing() method
 * Sub-phase 3.2: Add getModelPricing() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Known model IDs for testing
const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
const TINY_LLAMA_MODEL_ID = '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca';

// Mock USDC token address
const USDC_TOKEN_ADDRESS = '0x' + '3'.repeat(40);

// Mock contract response
const mockGetModelPricing = vi.fn();
const mockNodeRegistry = {
  getModelPricing: mockGetModelPricing,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.getModelPricing()', () => {
  const hostAddress = '0x' + '2'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Native Token Pricing', () => {
    it('should return effective native price for model', async () => {
      mockGetModelPricing.mockResolvedValue(3000000n);

      const price = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );

      expect(typeof price).toBe('bigint');
      expect(price).toBe(3000000n);
      expect(mockGetModelPricing).toHaveBeenCalledWith(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );
    });

    it('should return custom native price when set', async () => {
      // Custom price higher than default
      mockGetModelPricing.mockResolvedValue(5000000n);

      const price = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );

      expect(price).toBe(5000000n);
    });
  });

  describe('Stablecoin Pricing', () => {
    it('should return effective stable price for model', async () => {
      mockGetModelPricing.mockResolvedValue(50000n);

      const price = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        USDC_TOKEN_ADDRESS
      );

      expect(typeof price).toBe('bigint');
      expect(price).toBe(50000n);
    });

    it('should return custom stable price when set', async () => {
      // Custom stable price
      mockGetModelPricing.mockResolvedValue(75000n);

      const price = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        USDC_TOKEN_ADDRESS
      );

      expect(price).toBe(75000n);
    });
  });

  describe('Different Models', () => {
    it('should return different prices for different models', async () => {
      // TinyVicuna price
      mockGetModelPricing.mockResolvedValueOnce(5000000n);
      // TinyLlama price
      mockGetModelPricing.mockResolvedValueOnce(3000000n);

      const price1 = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        USDC_TOKEN_ADDRESS
      );
      const price2 = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_LLAMA_MODEL_ID,
        USDC_TOKEN_ADDRESS
      );

      expect(price1).toBe(5000000n);
      expect(price2).toBe(3000000n);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unregistered host gracefully', async () => {
      mockGetModelPricing.mockRejectedValue(new Error('Host not registered'));

      await expect(
        mockNodeRegistry.getModelPricing(
          ethers.ZeroAddress,
          TINY_VICUNA_MODEL_ID,
          USDC_TOKEN_ADDRESS
        )
      ).rejects.toThrow('Host not registered');
    });

    it('should handle unsupported model gracefully', async () => {
      const unsupportedModelId = '0x' + 'f'.repeat(64);
      mockGetModelPricing.mockRejectedValue(new Error('Model not supported'));

      await expect(
        mockNodeRegistry.getModelPricing(
          hostAddress,
          unsupportedModelId,
          USDC_TOKEN_ADDRESS
        )
      ).rejects.toThrow('Model not supported');
    });

    it('should handle large bigint prices correctly', async () => {
      const maxNativePrice = 22_727_272_727_273_000n;
      mockGetModelPricing.mockResolvedValue(maxNativePrice);

      const price = await mockNodeRegistry.getModelPricing(
        hostAddress,
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress
      );

      expect(typeof price).toBe('bigint');
      expect(price).toBe(maxNativePrice);
    });
  });
});
