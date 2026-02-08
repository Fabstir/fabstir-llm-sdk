// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for HostManager.getHostSupportedModels()
 *
 * February 2026: Get all models a host supports
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HostManager } from '../../src/managers/HostManager';

// Mock NodeRegistryABI import
vi.mock('../../src/contracts/abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json', () => ({
  default: [
    { type: 'function', name: 'getNodeModels', inputs: [], outputs: [{ type: 'bytes32[]' }] }
  ]
}));

// Mock contract method
const mockGetNodeModels = vi.fn();

// Mock Contract class
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => ({
      getNodeModels: mockGetNodeModels
    }))
  };
});

describe('HostManager.getHostSupportedModels() (Feb 2026)', () => {
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

  it('should return array of model IDs', async () => {
    const modelIds = [
      '0x' + 'aa'.repeat(32),
      '0x' + 'bb'.repeat(32)
    ];
    mockGetNodeModels.mockResolvedValue(modelIds);

    const result = await hostManager.getHostSupportedModels('0xHostAddress');

    expect(result).toEqual(modelIds);
  });

  it('should return empty array when host has no models', async () => {
    mockGetNodeModels.mockResolvedValue([]);

    const result = await hostManager.getHostSupportedModels('0xHostAddress');

    expect(result).toEqual([]);
  });

  it('should call contract with correct host address', async () => {
    mockGetNodeModels.mockResolvedValue([]);

    const hostAddress = '0xTestHostAddress';
    await hostManager.getHostSupportedModels(hostAddress);

    expect(mockGetNodeModels).toHaveBeenCalledWith(hostAddress);
  });
});
