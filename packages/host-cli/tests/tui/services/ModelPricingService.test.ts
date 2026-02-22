// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ModelPricingService tests
 * Tests for per-model pricing via NodeRegistry contract
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock ethers before importing the module
const mockContract = {
  getHostModelPrices: vi.fn(),
  setModelPricing: vi.fn(),
  clearModelPricing: vi.fn(),
};

const mockWait = vi.fn().mockResolvedValue({ status: 1, hash: '0xmocktxhash' });
mockContract.setModelPricing.mockResolvedValue({ hash: '0xmocktxhash', wait: mockWait });
mockContract.clearModelPricing.mockResolvedValue({ hash: '0xmocktxhash', wait: mockWait });

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn(),
    Wallet: vi.fn(),
    Contract: vi.fn(() => mockContract),
  },
}));

import {
  fetchHostModelPrices,
  updateModelStablePricing,
  updateModelNativePricing,
  clearModelPricingOnChain,
} from '../../../src/tui/services/ModelPricingService';

describe('ModelPricingService', () => {
  const testAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const testRpcUrl = 'https://sepolia.base.org';
  const testPrivateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
  const testModelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock return values
    mockContract.setModelPricing.mockResolvedValue({ hash: '0xmocktxhash', wait: mockWait });
    mockContract.clearModelPricing.mockResolvedValue({ hash: '0xmocktxhash', wait: mockWait });
    mockWait.mockResolvedValue({ status: 1, hash: '0xmocktxhash' });
    // Set required env var
    process.env.CONTRACT_NODE_REGISTRY = '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22';
  });

  it('fetchHostModelPrices returns model pricing array', async () => {
    const modelIds = [testModelId];
    const nativePrices = [0n];
    const stablePrices = [10000n];
    mockContract.getHostModelPrices.mockResolvedValue([modelIds, nativePrices, stablePrices]);

    const result = await fetchHostModelPrices(testAddress, testRpcUrl);

    expect(result).toHaveLength(1);
    expect(result[0].modelId).toBe(testModelId);
    expect(result[0].nativePrice).toBe(0n);
    expect(result[0].stablePrice).toBe(10000n);
  });

  it('fetchHostModelPrices returns empty array when host has no models', async () => {
    mockContract.getHostModelPrices.mockResolvedValue([[], [], []]);

    const result = await fetchHostModelPrices(testAddress, testRpcUrl);

    expect(result).toEqual([]);
  });

  it('updateModelStablePricing calls setModelPricing with correct args', async () => {
    const result = await updateModelStablePricing(testPrivateKey, testRpcUrl, testModelId, 10);

    expect(result.success).toBe(true);
    expect(result.txHash).toBe('0xmocktxhash');
    expect(mockContract.setModelPricing).toHaveBeenCalledWith(
      testModelId,
      0n,
      10000n, // 10 * PRICE_PRECISION (1000)
    );
  });

  it('updateModelStablePricing converts USD price to contract format', async () => {
    await updateModelStablePricing(testPrivateKey, testRpcUrl, testModelId, 5.5);

    expect(mockContract.setModelPricing).toHaveBeenCalledWith(
      testModelId,
      0n,
      5500n, // 5.5 * 1000 = 5500
    );
  });

  it('updateModelNativePricing calls setModelPricing with correct args', async () => {
    const result = await updateModelNativePricing(testPrivateKey, testRpcUrl, testModelId, 500000);

    expect(result.success).toBe(true);
    // 500000 Gwei = 500000 * 1e9 wei
    expect(mockContract.setModelPricing).toHaveBeenCalledWith(
      testModelId,
      500000000000000n, // 500000 * 1e9
      0n,
    );
  });

  it('clearModelPricingOnChain calls clearModelPricing with modelId', async () => {
    const result = await clearModelPricingOnChain(testPrivateKey, testRpcUrl, testModelId);

    expect(result.success).toBe(true);
    expect(mockContract.clearModelPricing).toHaveBeenCalledWith(testModelId);
  });
});
