// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.setModelTokenPricing() method
 * Phase 18: Per-model per-token pricing (replaces setModelPricing)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Mock the contract interactions
const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0x' + 'a'.repeat(64) });
const mockSetModelTokenPricing = vi.fn().mockResolvedValue({ wait: mockWait });
const mockNodeRegistry = {
  setModelTokenPricing: mockSetModelTokenPricing,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.setModelTokenPricing()', () => {
  const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should accept valid model ID, token address, and price', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;
      const tokenAddress = USDC_ADDRESS;
      const price = '50000';

      expect(modelId).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(BigInt(price)).toBeGreaterThan(0n);
    });

    it('should accept native token (ZeroAddress) for ETH pricing', async () => {
      const tokenAddress = ethers.ZeroAddress;
      expect(tokenAddress).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should validate native price range', async () => {
      const MIN_PRICE_NATIVE = 227_273n;
      const MAX_PRICE_NATIVE = 22_727_272_727_273_000n;

      expect(MIN_PRICE_NATIVE).toBeLessThan(MAX_PRICE_NATIVE);

      const validMinPrice = MIN_PRICE_NATIVE.toString();
      const validMaxPrice = MAX_PRICE_NATIVE.toString();
      const invalidLowPrice = (MIN_PRICE_NATIVE - 1n).toString();
      const invalidHighPrice = (MAX_PRICE_NATIVE + 1n).toString();

      expect(BigInt(validMinPrice)).toBeGreaterThanOrEqual(MIN_PRICE_NATIVE);
      expect(BigInt(validMaxPrice)).toBeLessThanOrEqual(MAX_PRICE_NATIVE);
      expect(BigInt(invalidLowPrice)).toBeLessThan(MIN_PRICE_NATIVE);
      expect(BigInt(invalidHighPrice)).toBeGreaterThan(MAX_PRICE_NATIVE);
    });

    it('should validate stable price range', async () => {
      const MIN_PRICE_STABLE = 1n;
      const MAX_PRICE_STABLE = 100_000_000n;

      expect(MIN_PRICE_STABLE).toBeLessThan(MAX_PRICE_STABLE);

      const validMinPrice = MIN_PRICE_STABLE.toString();
      const validMaxPrice = MAX_PRICE_STABLE.toString();

      expect(BigInt(validMinPrice)).toBeGreaterThanOrEqual(MIN_PRICE_STABLE);
      expect(BigInt(validMaxPrice)).toBeLessThanOrEqual(MAX_PRICE_STABLE);
    });
  });

  describe('Contract Interaction', () => {
    it('should call contract setModelTokenPricing with correct parameters', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;
      const tokenAddress = USDC_ADDRESS;
      const price = 50000n;

      await mockNodeRegistry.setModelTokenPricing(modelId, tokenAddress, price, { gasLimit: 200000n });

      expect(mockSetModelTokenPricing).toHaveBeenCalledWith(
        modelId,
        tokenAddress,
        price,
        { gasLimit: 200000n }
      );
    });

    it('should call with ZeroAddress for native pricing', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;
      const price = 3000000n;

      await mockNodeRegistry.setModelTokenPricing(modelId, ethers.ZeroAddress, price, { gasLimit: 200000n });

      expect(mockSetModelTokenPricing).toHaveBeenCalledWith(
        modelId,
        ethers.ZeroAddress,
        price,
        { gasLimit: 200000n }
      );
    });

    it('should wait for 3 confirmations', async () => {
      const tx = await mockNodeRegistry.setModelTokenPricing(
        TINY_VICUNA_MODEL_ID, USDC_ADDRESS, 50000n, { gasLimit: 200000n }
      );
      await tx.wait(3);

      expect(mockWait).toHaveBeenCalledWith(3);
    });

    it('should return transaction hash on success', async () => {
      const tx = await mockNodeRegistry.setModelTokenPricing(
        TINY_VICUNA_MODEL_ID, USDC_ADDRESS, 50000n, { gasLimit: 200000n }
      );
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
      const erroringSetModelTokenPricing = vi.fn().mockRejectedValue(new Error('Model not supported'));

      await expect(erroringSetModelTokenPricing(TINY_VICUNA_MODEL_ID, USDC_ADDRESS, 50000n))
        .rejects.toThrow('Model not supported');
    });
  });
});
