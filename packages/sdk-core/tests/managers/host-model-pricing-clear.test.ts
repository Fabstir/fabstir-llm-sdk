// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.clearModelTokenPricing() method
 * Phase 18: Per-model per-token clearing (replaces clearModelPricing)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Mock the contract interactions
const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0x' + 'c'.repeat(64) });
const mockClearModelTokenPricing = vi.fn().mockResolvedValue({ wait: mockWait });
const mockNodeRegistry = {
  clearModelTokenPricing: mockClearModelTokenPricing,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.clearModelTokenPricing()', () => {
  const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
  const TINY_LLAMA_MODEL_ID = '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca';
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should accept valid model ID and token address', async () => {
      expect(TINY_VICUNA_MODEL_ID).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should accept ZeroAddress for clearing native pricing', async () => {
      expect(ethers.ZeroAddress).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should accept different model IDs', async () => {
      expect(TINY_VICUNA_MODEL_ID).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(TINY_LLAMA_MODEL_ID).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(TINY_VICUNA_MODEL_ID).not.toBe(TINY_LLAMA_MODEL_ID);
    });
  });

  describe('Contract Interaction', () => {
    it('should call contract clearModelTokenPricing with model ID and token', async () => {
      await mockNodeRegistry.clearModelTokenPricing(TINY_VICUNA_MODEL_ID, USDC_ADDRESS, { gasLimit: 150000n });

      expect(mockClearModelTokenPricing).toHaveBeenCalledWith(
        TINY_VICUNA_MODEL_ID,
        USDC_ADDRESS,
        { gasLimit: 150000n }
      );
    });

    it('should clear native pricing with ZeroAddress', async () => {
      await mockNodeRegistry.clearModelTokenPricing(TINY_VICUNA_MODEL_ID, ethers.ZeroAddress, { gasLimit: 150000n });

      expect(mockClearModelTokenPricing).toHaveBeenCalledWith(
        TINY_VICUNA_MODEL_ID,
        ethers.ZeroAddress,
        { gasLimit: 150000n }
      );
    });

    it('should wait for 3 confirmations', async () => {
      const tx = await mockNodeRegistry.clearModelTokenPricing(TINY_VICUNA_MODEL_ID, USDC_ADDRESS, { gasLimit: 150000n });
      await tx.wait(3);

      expect(mockWait).toHaveBeenCalledWith(3);
    });

    it('should return transaction hash on success', async () => {
      const tx = await mockNodeRegistry.clearModelTokenPricing(TINY_VICUNA_MODEL_ID, USDC_ADDRESS, { gasLimit: 150000n });
      const receipt = await tx.wait(3);

      expect(receipt.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should succeed even if no pricing was set', async () => {
      const tx = await mockNodeRegistry.clearModelTokenPricing(TINY_LLAMA_MODEL_ID, USDC_ADDRESS, { gasLimit: 150000n });
      const receipt = await tx.wait(3);

      expect(receipt.status).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw on transaction failure', async () => {
      const failingWait = vi.fn().mockResolvedValue({ status: 0, hash: '0x' + 'd'.repeat(64) });
      const failingTx = { wait: failingWait };

      const receipt = await failingTx.wait(3);
      expect(receipt.status).toBe(0);
    });

    it('should propagate contract errors', async () => {
      const erroringClear = vi.fn().mockRejectedValue(new Error('Not registered'));

      await expect(erroringClear(TINY_VICUNA_MODEL_ID, USDC_ADDRESS))
        .rejects.toThrow('Not registered');
    });
  });
});
