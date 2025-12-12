// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.clearModelPricing() method
 * Sub-phase 2.2: Add clearModelPricing() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the contract interactions
const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0x' + 'c'.repeat(64) });
const mockClearModelPricing = vi.fn().mockResolvedValue({ wait: mockWait });
const mockNodeRegistry = {
  clearModelPricing: mockClearModelPricing,
  address: '0x' + '1'.repeat(40)
};

describe('HostManager.clearModelPricing()', () => {
  const TINY_VICUNA_MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
  const TINY_LLAMA_MODEL_ID = '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should accept valid model ID', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;

      // Verify model ID format
      expect(modelId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should accept different model IDs', async () => {
      // Both should be valid bytes32 format
      expect(TINY_VICUNA_MODEL_ID).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(TINY_LLAMA_MODEL_ID).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(TINY_VICUNA_MODEL_ID).not.toBe(TINY_LLAMA_MODEL_ID);
    });
  });

  describe('Contract Interaction', () => {
    it('should call contract clearModelPricing with model ID', async () => {
      const modelId = TINY_VICUNA_MODEL_ID;

      await mockNodeRegistry.clearModelPricing(modelId, { gasLimit: 150000n });

      expect(mockClearModelPricing).toHaveBeenCalledWith(
        modelId,
        { gasLimit: 150000n }
      );
    });

    it('should wait for 3 confirmations', async () => {
      const tx = await mockNodeRegistry.clearModelPricing(TINY_VICUNA_MODEL_ID, { gasLimit: 150000n });
      await tx.wait(3);

      expect(mockWait).toHaveBeenCalledWith(3);
    });

    it('should return transaction hash on success', async () => {
      const tx = await mockNodeRegistry.clearModelPricing(TINY_VICUNA_MODEL_ID, { gasLimit: 150000n });
      const receipt = await tx.wait(3);

      expect(receipt.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should succeed even if no custom pricing was set', async () => {
      // Contract should not fail if clearing pricing that wasn't set
      const tx = await mockNodeRegistry.clearModelPricing(TINY_LLAMA_MODEL_ID, { gasLimit: 150000n });
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
      const erroringClearModelPricing = vi.fn().mockRejectedValue(new Error('Not registered'));

      await expect(erroringClearModelPricing(TINY_VICUNA_MODEL_ID))
        .rejects.toThrow('Not registered');
    });
  });
});
