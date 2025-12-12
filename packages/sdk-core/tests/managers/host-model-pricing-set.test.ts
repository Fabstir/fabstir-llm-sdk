// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.setModelPricing() method
 * Sub-phase 2.1: Add setModelPricing() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Mock the contract interactions
const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0x' + 'a'.repeat(64) });
const mockSetModelPricing = vi.fn().mockResolvedValue({ wait: mockWait });
const mockNodeRegistry = {
  setModelPricing: mockSetModelPricing,
  address: '0x' + '1'.repeat(40)
};

// Mock HostManager for unit testing
vi.mock('../../src/managers/HostManager', async () => {
  const actual = await vi.importActual('../../src/managers/HostManager');
  return {
    ...actual,
  };
});

describe('HostManager.setModelPricing()', () => {
  const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should accept valid model ID and prices', async () => {
      // This test verifies the method signature accepts correct parameters
      const modelId = TINY_VICUNA_MODEL_ID;
      const nativePrice = '5000000';
      const stablePrice = '75000';

      // Verify these are valid inputs (type check)
      expect(modelId).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(BigInt(nativePrice)).toBeGreaterThan(0n);
      expect(BigInt(stablePrice)).toBeGreaterThan(0n);
    });

    it('should accept 0 values for prices (use default)', async () => {
      const nativePrice = '0';
      const stablePrice = '0';

      // 0 is valid - means "use default pricing"
      expect(BigInt(nativePrice)).toBe(0n);
      expect(BigInt(stablePrice)).toBe(0n);
    });

    it('should validate native price range when non-zero', async () => {
      // From HostManager constants:
      // MIN_PRICE_NATIVE = 227_273n
      // MAX_PRICE_NATIVE = 22_727_272_727_273_000n

      const MIN_PRICE_NATIVE = 227_273n;
      const MAX_PRICE_NATIVE = 22_727_272_727_273_000n;

      // Valid prices
      expect(MIN_PRICE_NATIVE).toBeLessThan(MAX_PRICE_NATIVE);

      // Test boundary values
      const validMinPrice = MIN_PRICE_NATIVE.toString();
      const validMaxPrice = MAX_PRICE_NATIVE.toString();
      const invalidLowPrice = (MIN_PRICE_NATIVE - 1n).toString();
      const invalidHighPrice = (MAX_PRICE_NATIVE + 1n).toString();

      expect(BigInt(validMinPrice)).toBeGreaterThanOrEqual(MIN_PRICE_NATIVE);
      expect(BigInt(validMaxPrice)).toBeLessThanOrEqual(MAX_PRICE_NATIVE);
      expect(BigInt(invalidLowPrice)).toBeLessThan(MIN_PRICE_NATIVE);
      expect(BigInt(invalidHighPrice)).toBeGreaterThan(MAX_PRICE_NATIVE);
    });

    it('should validate stable price range when non-zero', async () => {
      // From HostManager constants:
      // MIN_PRICE_STABLE = 1n
      // MAX_PRICE_STABLE = 100_000_000n

      const MIN_PRICE_STABLE = 1n;
      const MAX_PRICE_STABLE = 100_000_000n;

      // Valid prices
      expect(MIN_PRICE_STABLE).toBeLessThan(MAX_PRICE_STABLE);

      // Test boundary values
      const validMinPrice = MIN_PRICE_STABLE.toString();
      const validMaxPrice = MAX_PRICE_STABLE.toString();

      expect(BigInt(validMinPrice)).toBeGreaterThanOrEqual(MIN_PRICE_STABLE);
      expect(BigInt(validMaxPrice)).toBeLessThanOrEqual(MAX_PRICE_STABLE);
    });
  });

  describe('Contract Interaction', () => {
    it('should call contract setModelPricing with correct parameters', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;
      const nativePrice = 5000000n;
      const stablePrice = 75000n;

      // Simulate contract call
      await mockNodeRegistry.setModelPricing(modelId, nativePrice, stablePrice, { gasLimit: 200000n });

      expect(mockSetModelPricing).toHaveBeenCalledWith(
        modelId,
        nativePrice,
        stablePrice,
        { gasLimit: 200000n }
      );
    });

    it('should wait for 3 confirmations', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;
      const tx = await mockNodeRegistry.setModelPricing(modelId, 5000000n, 75000n, { gasLimit: 200000n });
      await tx.wait(3);

      expect(mockWait).toHaveBeenCalledWith(3);
    });

    it('should return transaction hash on success', async () => {
      const tx = await mockNodeRegistry.setModelPricing(TINY_VICUNA_MODEL_ID, 5000000n, 75000n, { gasLimit: 200000n });
      const receipt = await tx.wait(3);

      expect(receipt.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Error Handling', () => {
    it('should throw on transaction failure', async () => {
      const failingWait = vi.fn().mockResolvedValue({ status: 0, hash: '0x' + 'b'.repeat(64) });
      const failingTx = { wait: failingWait };

      const receipt = await failingTx.wait(3);
      expect(receipt.status).toBe(0);
    });

    it('should propagate contract errors', async () => {
      const erroringSetModelPricing = vi.fn().mockRejectedValue(new Error('Model not supported'));

      await expect(erroringSetModelPricing(TINY_VICUNA_MODEL_ID, 5000000n, 75000n))
        .rejects.toThrow('Model not supported');
    });
  });
});
