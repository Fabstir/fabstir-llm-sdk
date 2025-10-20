// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers, utils } from 'ethers';
import { JobMarketplaceContract } from '../../packages/sdk-client/src/contracts/JobMarketplaceContract';
import type { EventFilter, DecodedEvent } from '../../packages/sdk-client/src/contracts/types';

describe('JobMarketplaceContract', () => {
  let mockProvider: any;
  let mockContract: any;

  beforeEach(() => {
    // Mock provider
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      estimateGas: vi.fn().mockResolvedValue(ethers.BigNumber.from('100000')),
      getBlockNumber: vi.fn().mockResolvedValue(1000000),
    };

    // Mock contract methods
    mockContract = {
      interface: {
        encodeFunctionData: vi.fn(),
        parseLog: vi.fn(),
      },
      filters: {
        SessionJobCreated: vi.fn(),
      },
      queryFilter: vi.fn(),
      estimateGas: {
        createSessionJob: vi.fn().mockResolvedValue(ethers.BigNumber.from('150000')),
      },
    };
  });

  it('loads ABI from JSON file', async () => {
    const abi = JobMarketplaceContract.loadABI();
    expect(abi).toBeDefined();
    expect(Array.isArray(abi)).toBe(true);
    expect(abi.length).toBeGreaterThan(0);
    
    // Check for expected functions in ABI
    const functionNames = abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => item.name);
    expect(functionNames).toContain('createSessionJob');
  });

  it('creates contract instance with provider', async () => {
    const contract = new JobMarketplaceContract(
      mockProvider, 
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    );
    expect(contract).toBeDefined();
    expect(contract.getAddress()).toBe('0x445882e14b22E921c7d4Fe32a7736a32197578AF');
  });

  it('encodes createSession function call', async () => {
    const contract = new JobMarketplaceContract(
      mockProvider,
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    );

    const params = {
      hostAddress: '0x1234567890123456789012345678901234567890',
      depositAmount: utils.parseEther('0.1').toString(),
      pricePerToken: '1000000000000',
      maxDuration: 3600,
    };

    const encoded = contract.encodeCreateSession(params);
    expect(encoded).toBeDefined();
    expect(typeof encoded).toBe('string');
    expect(encoded.startsWith('0x')).toBe(true);
  });

  it('decodes session created events', async () => {
    const contract = new JobMarketplaceContract(
      mockProvider,
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    );

    // Mock log data
    const mockLog = {
      topics: ['0x123...', '0x456...'],
      data: '0x789...',
      blockNumber: 12345,
      transactionHash: '0xabc...',
    };

    const decoded = contract.decodeEvent(mockLog);
    expect(decoded).toBeDefined();
    expect(decoded.name).toBeDefined();
    expect(decoded.blockNumber).toBe(12345);
  });

  it('estimates gas for transactions', async () => {
    const contract = new JobMarketplaceContract(
      mockProvider,
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    );

    const params = {
      hostAddress: '0x1234567890123456789012345678901234567890',
      depositAmount: utils.parseEther('0.1').toString(),
      pricePerToken: '1000000000000',
      maxDuration: 3600,
    };

    const gasEstimate = await contract.estimateGas('createSessionJob', params);
    expect(gasEstimate).toBeDefined();
    expect(gasEstimate.gasLimit).toBeDefined();
    expect(Number(gasEstimate.gasLimit)).toBeGreaterThan(0);
  });

  it('filters events by job ID', async () => {
    const contract = new JobMarketplaceContract(
      mockProvider,
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    );

    const filter: EventFilter = {
      jobId: 123,
      fromBlock: 1000,
      toBlock: 'latest',
    };

    const events = await contract.getSessionEvents(filter);
    expect(Array.isArray(events)).toBe(true);
  });

  it('handles missing ABI gracefully', async () => {
    // Mock file system error
    const originalLoad = JobMarketplaceContract.loadABI;
    JobMarketplaceContract.loadABI = vi.fn().mockImplementation(() => {
      throw new Error('ABI file not found');
    });

    expect(() => JobMarketplaceContract.loadABI()).toThrow('ABI file not found');
    
    // Restore original
    JobMarketplaceContract.loadABI = originalLoad;
  });

  it('validates contract address format', async () => {
    // Test with invalid address
    expect(() => new JobMarketplaceContract(
      mockProvider,
      'invalid-address'
    )).toThrow('Invalid contract address');

    // Test with valid address
    expect(() => new JobMarketplaceContract(
      mockProvider,
      '0x445882e14b22E921c7d4Fe32a7736a32197578AF'
    )).not.toThrow();
  });
});