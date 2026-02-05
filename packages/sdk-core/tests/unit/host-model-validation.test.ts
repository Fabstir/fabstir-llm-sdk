// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.validateHostSupportsModel()
 *
 * February 2026: Optional pre-flight validation for better UX
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { HostManager } from '../../src/managers/HostManager';

// Mock NodeRegistryABI import to avoid ABI loading issues
vi.mock('../../src/contracts/abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json', () => ({
  default: [
    { type: 'function', name: 'nodeSupportsModel', inputs: [], outputs: [{ type: 'bool' }] }
  ]
}));

// Mock contract method
const mockNodeSupportsModel = vi.fn();

// Mock Contract class
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({
      nodeSupportsModel: mockNodeSupportsModel
    }))
  };
});

describe('HostManager.validateHostSupportsModel() (Feb 2026)', () => {
  let hostManager: HostManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock signer
    const mockSigner = {
      getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
      provider: {}
    };

    // Create mock ModelManager
    const mockModelManager = {
      isModelApproved: vi.fn().mockResolvedValue(true)
    };

    // Use valid Ethereum address format
    const nodeRegistryAddress = '0x1234567890123456789012345678901234567890';

    hostManager = new HostManager(
      mockSigner as any,
      nodeRegistryAddress,
      mockModelManager as any
    );
  });

  it('should return true when host supports model', async () => {
    mockNodeSupportsModel.mockResolvedValue(true);

    const result = await hostManager.validateHostSupportsModel(
      '0xHostAddress',
      '0xModelId'
    );

    expect(result).toBe(true);
  });

  it('should return false when host does not support model', async () => {
    mockNodeSupportsModel.mockResolvedValue(false);

    const result = await hostManager.validateHostSupportsModel(
      '0xHostAddress',
      '0xModelId'
    );

    expect(result).toBe(false);
  });

  it('should call contract with correct params', async () => {
    mockNodeSupportsModel.mockResolvedValue(true);

    const hostAddress = '0xTestHost';
    const modelId = '0xTestModel';

    await hostManager.validateHostSupportsModel(hostAddress, modelId);

    expect(mockNodeSupportsModel).toHaveBeenCalledWith(hostAddress, modelId);
  });
});
