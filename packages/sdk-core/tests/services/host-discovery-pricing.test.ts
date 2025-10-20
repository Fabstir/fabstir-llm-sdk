// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Discovery Pricing Tests
 * @description Tests for price filtering and sorting in host discovery (Sub-phase 2.3)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostDiscoveryService, HostDiscoveryOptions } from '../../src/services/HostDiscoveryService';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Mock ethers for compatibility
vi.mock('ethers', async () => {
  const actual: any = await vi.importActual('ethers');
  const zeroAddr = '0x0000000000000000000000000000000000000000';

  class MockContract {
    constructor(public address: string, public abi: any, public provider: any) {}
  }

  return {
    ...actual,
    Contract: MockContract,
    isAddress: (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address),
    ZeroAddress: zeroAddr,
  };
});

describe('HostDiscoveryService Pricing', () => {
  let service: HostDiscoveryService;
  let mockProvider: any;
  let mockContract: any;

  // Sample host data with different pricing
  const mockHosts = [
    {
      address: '0x' + '1'.repeat(40),
      nodeAddress: '0x' + '1'.repeat(40),
      apiUrl: 'http://host1:8080',
      endpoint: 'http://host1:8080',
      isActive: true,
      isRegistered: true,
      operator: '0x' + '1'.repeat(40),
      stakedAmount: 1000n * (10n ** 18n),
      metadata: '{"region":"us-east","reputation":95}',
      supportedModels: ['model1'],
      models: ['model1'],
      region: 'us-east',
      reputation: 95,
      minPricePerToken: 1500n, // Lowest price
      pricePerToken: 1500
    },
    {
      address: '0x' + '2'.repeat(40),
      nodeAddress: '0x' + '2'.repeat(40),
      apiUrl: 'http://host2:8080',
      endpoint: 'http://host2:8080',
      isActive: true,
      isRegistered: true,
      operator: '0x' + '2'.repeat(40),
      stakedAmount: 2000n * (10n ** 18n),
      metadata: '{"region":"us-west","reputation":98}',
      supportedModels: ['model1', 'model2'],
      models: ['model1', 'model2'],
      region: 'us-west',
      reputation: 98, // Highest reputation
      minPricePerToken: 2500n, // Medium price
      pricePerToken: 2500
    },
    {
      address: '0x' + '3'.repeat(40),
      nodeAddress: '0x' + '3'.repeat(40),
      apiUrl: 'http://host3:8080',
      endpoint: 'http://host3:8080',
      isActive: true,
      isRegistered: true,
      operator: '0x' + '3'.repeat(40),
      stakedAmount: 1500n * (10n ** 18n),
      metadata: '{"region":"eu-west","reputation":92}',
      supportedModels: ['model2'],
      models: ['model2'],
      region: 'eu-west',
      reputation: 92,
      minPricePerToken: 3500n, // Highest price
      pricePerToken: 3500
    },
    {
      address: '0x' + '4'.repeat(40),
      nodeAddress: '0x' + '4'.repeat(40),
      apiUrl: 'http://host4:8080',
      endpoint: 'http://host4:8080',
      isActive: true,
      isRegistered: true,
      operator: '0x' + '4'.repeat(40),
      stakedAmount: 1200n * (10n ** 18n),
      metadata: '{"region":"ap-south","reputation":90}',
      supportedModels: ['model1'],
      models: ['model1'],
      region: 'ap-south',
      reputation: 90,
      minPricePerToken: undefined, // Missing pricing (should handle gracefully)
      pricePerToken: undefined
    }
  ];

  beforeEach(() => {
    // Fix ethers compatibility
    if (!ethers.ZeroAddress) {
      (ethers as any).ZeroAddress = '0x0000000000000000000000000000000000000000';
    }

    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      call: vi.fn(),
      estimateGas: vi.fn(),
      _isSigner: false,
      _isProvider: true
    };

    // Mock contract methods
    mockContract = {
      getAllActiveNodes: vi.fn().mockResolvedValue(mockHosts.map(h => h.address)),
      getNodeFullInfo: vi.fn().mockImplementation((address: string) => {
        const host = mockHosts.find(h => h.address === address);
        if (!host) throw new Error('Node not found');

        // Return 7-field array: [operator, stakedAmount, active, metadata, apiUrl, supportedModels, minPricePerToken]
        return Promise.resolve([
          host.operator,
          host.stakedAmount,
          host.isActive,
          host.metadata,
          host.apiUrl,
          host.supportedModels,
          host.minPricePerToken || 0n
        ]);
      })
    };

    service = new HostDiscoveryService(
      '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
      mockProvider
    );

    // Replace contract with mock
    (service as any).contract = mockContract;
  });

  describe('findHosts with price filtering', () => {
    it('should filter hosts by maxPricePerToken', async () => {
      const options: HostDiscoveryOptions = {
        maxPricePerToken: 2500n
      };

      const hosts = await service.findHosts(options);

      // Should include hosts with price <= 2500 (host1: 1500, host2: 2500)
      expect(hosts.length).toBe(2);
      expect(hosts.some(h => h.minPricePerToken === 1500n)).toBe(true);
      expect(hosts.some(h => h.minPricePerToken === 2500n)).toBe(true);
      // Should exclude host3 with price 3500
      expect(hosts.some(h => h.minPricePerToken === 3500n)).toBe(false);
    });

    it('should handle missing pricing gracefully when filtering', async () => {
      const options: HostDiscoveryOptions = {
        maxPricePerToken: 2000n
      };

      const hosts = await service.findHosts(options);

      // Host4 has no pricing (undefined), should be excluded from price filter
      // Only host1 (1500) should match
      expect(hosts.length).toBe(1);
      expect(hosts[0].minPricePerToken).toBe(1500n);
    });
  });

  describe('findHosts with sorting', () => {
    it('should sort hosts by price ascending', async () => {
      const options: HostDiscoveryOptions = {
        sortBy: 'price'
      };

      const hosts = await service.findHosts(options);

      // Should be sorted: 1500, 2500, 3500, undefined
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0].minPricePerToken).toBe(1500n);
      expect(hosts[1].minPricePerToken).toBe(2500n);
      expect(hosts[2].minPricePerToken).toBe(3500n);
    });

    it('should sort hosts by reputation descending', async () => {
      const options: HostDiscoveryOptions = {
        sortBy: 'reputation'
      };

      const hosts = await service.findHosts(options);

      // Should be sorted by reputation: 98, 95, 92, 90
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts[0].reputation).toBe(98);
      expect(hosts[1].reputation).toBe(95);
      expect(hosts[2].reputation).toBe(92);
      expect(hosts[3].reputation).toBe(90);
    });

    it('should shuffle hosts when sortBy is random', async () => {
      const options: HostDiscoveryOptions = {
        sortBy: 'random'
      };

      // Run multiple times to verify randomness (not deterministic)
      const results = [];
      for (let i = 0; i < 5; i++) {
        const hosts = await service.findHosts(options);
        results.push(hosts.map(h => h.address));
      }

      // Should have 4 hosts each time
      results.forEach(r => expect(r.length).toBe(4));

      // At least one result should differ (very high probability with random shuffle)
      const allSame = results.every(r =>
        r.every((addr, idx) => addr === results[0][idx])
      );
      expect(allSame).toBe(false);
    });
  });

  describe('getAllActiveNodes with pricing', () => {
    it('should include minPricePerToken from contract', async () => {
      const hosts = await service.getAllActiveNodes();

      expect(hosts.length).toBe(4);

      // Check each host has correct pricing from contract (7th field)
      const host1 = hosts.find(h => h.address === mockHosts[0].address);
      const host2 = hosts.find(h => h.address === mockHosts[1].address);
      const host3 = hosts.find(h => h.address === mockHosts[2].address);
      const host4 = hosts.find(h => h.address === mockHosts[3].address);

      expect(host1?.minPricePerToken).toBe(1500n);
      expect(host2?.minPricePerToken).toBe(2500n);
      expect(host3?.minPricePerToken).toBe(3500n);
      expect(host4?.minPricePerToken).toBe(0n); // Missing pricing defaults to 0n
    });
  });
});
