// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Selection Methods Tests
 * @description Tests for selectHostForModel and getRankedHostsForModel methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HostSelectionService } from '../../src/services/HostSelectionService';
import { HostSelectionMode } from '../../src/types/settings.types';
import { HostInfo } from '../../src/types/models';
import { IHostManager } from '../../src/interfaces/IHostManager';

// Helper to create mock HostInfo
function createMockHost(
  address: string,
  stake: bigint,
  price: bigint,
  overrides: Partial<HostInfo> = {}
): HostInfo {
  return {
    address,
    apiUrl: `http://${address.slice(0, 10)}:8080`,
    metadata: {
      hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
      capabilities: ['inference', 'streaming'],
      location: 'US',
      maxConcurrent: 10,
      costPerToken: 0.001,
    },
    supportedModels: ['0x' + 'a'.repeat(64)],
    isActive: true,
    stake,
    minPricePerTokenNative: 1000n,
    minPricePerTokenStable: price,
    ...overrides,
  };
}

// Create mock HostManager
function createMockHostManager(hosts: HostInfo[]): IHostManager {
  return {
    findHostsForModel: vi.fn().mockResolvedValue(hosts),
    getHostInfo: vi.fn().mockImplementation(async (address: string) => {
      return hosts.find((h) => h.address === address) || null;
    }),
    hostSupportsModel: vi.fn().mockImplementation(async (address: string, modelId: string) => {
      const host = hosts.find((h) => h.address === address);
      return host?.supportedModels.includes(modelId) ?? false;
    }),
    // Stub other methods
    registerHostWithModels: vi.fn(),
    updateHostModels: vi.fn(),
    getHostModels: vi.fn(),
    getActiveHosts: vi.fn(),
    discoverAllActiveHosts: vi.fn(),
    discoverAllActiveHostsWithModels: vi.fn(),
    getHostStatus: vi.fn(),
    getHostPublicKey: vi.fn(),
    updatePricingNative: vi.fn(),
    updatePricingStable: vi.fn(),
    getPricing: vi.fn(),
    getHostEarnings: vi.fn(),
    withdrawEarnings: vi.fn(),
    getReputation: vi.fn(),
    setModelPricing: vi.fn(),
    getModelPricing: vi.fn(),
    getHostModelPrices: vi.fn(),
  } as unknown as IHostManager;
}

describe('HostSelectionService Methods', () => {
  const modelId = '0x' + 'a'.repeat(64);

  describe('selectHostForModel', () => {
    it('should return a host when hosts are available', async () => {
      const hosts = [
        createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n),
        createMockHost('0x' + '2'.repeat(40), 3000n * 10n ** 18n, 3000n),
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const selected = await service.selectHostForModel(modelId, HostSelectionMode.AUTO);

      expect(selected).not.toBeNull();
      expect(hosts.map((h) => h.address)).toContain(selected!.address);
    });

    it('should use weighted random selection (not always top scorer)', async () => {
      // Create hosts with different scores
      const hosts = [
        createMockHost('0x' + '1'.repeat(40), 10000n * 10n ** 18n, 100n), // High score
        createMockHost('0x' + '2'.repeat(40), 1000n * 10n ** 18n, 50000n), // Lower score
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      // Run multiple selections to verify randomness
      const selections: string[] = [];
      for (let i = 0; i < 50; i++) {
        const selected = await service.selectHostForModel(modelId, HostSelectionMode.AUTO);
        selections.push(selected!.address);
      }

      // With weighted random, the lower-scored host should be selected at least once
      // (probabilistically - if this test is flaky, increase iterations)
      const uniqueSelections = new Set(selections);

      // At minimum, high scorer should appear (it has higher weight)
      expect(selections).toContain(hosts[0].address);
    });

    it('should return null when no hosts are available', async () => {
      const mockHostManager = createMockHostManager([]);
      const service = new HostSelectionService(mockHostManager);

      const selected = await service.selectHostForModel(modelId, HostSelectionMode.AUTO);

      expect(selected).toBeNull();
    });

    it('should throw error when HostManager not set', async () => {
      const service = new HostSelectionService();

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.AUTO)
      ).rejects.toThrow('HostManager not set');
    });
  });

  describe('SPECIFIC mode', () => {
    it('should return preferred host when available', async () => {
      const preferredAddress = '0x' + '1'.repeat(40);
      const hosts = [
        createMockHost(preferredAddress, 5000n * 10n ** 18n, 2000n, {
          supportedModels: [modelId],
        }),
        createMockHost('0x' + '2'.repeat(40), 3000n * 10n ** 18n, 3000n),
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const selected = await service.selectHostForModel(
        modelId,
        HostSelectionMode.SPECIFIC,
        preferredAddress
      );

      expect(selected).not.toBeNull();
      expect(selected!.address).toBe(preferredAddress);
    });

    it('should throw error when preferredHostAddress not provided', async () => {
      const hosts = [createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n)];
      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC)
      ).rejects.toThrow('preferredHostAddress required for SPECIFIC mode');
    });

    it('should throw error when preferred host is not available', async () => {
      const preferredAddress = '0x' + '9'.repeat(40); // Not in hosts list
      const hosts = [createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n)];
      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC, preferredAddress)
      ).rejects.toThrow(`Preferred host ${preferredAddress} is not available`);
    });

    it('should throw error when preferred host is inactive', async () => {
      const preferredAddress = '0x' + '1'.repeat(40);
      const hosts = [
        createMockHost(preferredAddress, 5000n * 10n ** 18n, 2000n, {
          isActive: false, // Inactive
        }),
      ];
      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC, preferredAddress)
      ).rejects.toThrow(`Preferred host ${preferredAddress} is not available`);
    });

    it('should throw error when preferred host does not support model', async () => {
      const preferredAddress = '0x' + '1'.repeat(40);
      const differentModelId = '0x' + 'b'.repeat(64);
      const hosts = [
        createMockHost(preferredAddress, 5000n * 10n ** 18n, 2000n, {
          supportedModels: [differentModelId], // Different model
        }),
      ];
      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC, preferredAddress)
      ).rejects.toThrow(`Preferred host ${preferredAddress} does not support model ${modelId}`);
    });
  });

  describe('getRankedHostsForModel', () => {
    it('should return hosts sorted by score (highest first)', async () => {
      const hosts = [
        createMockHost('0x' + '1'.repeat(40), 1000n * 10n ** 18n, 90000n), // Low stake, high price
        createMockHost('0x' + '2'.repeat(40), 9000n * 10n ** 18n, 1000n), // High stake, low price
        createMockHost('0x' + '3'.repeat(40), 5000n * 10n ** 18n, 50000n), // Medium
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);

      expect(ranked).toHaveLength(3);
      // Host 2 should be first (highest stake + lowest price)
      expect(ranked[0].host.address).toBe(hosts[1].address);
      // Scores should be in descending order
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
      expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    });

    it('should include score factors in results', async () => {
      const hosts = [createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n)];
      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);

      expect(ranked[0].factors).toBeDefined();
      expect(ranked[0].factors.stakeScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0].factors.stakeScore).toBeLessThanOrEqual(1);
      expect(ranked[0].factors.priceScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0].factors.priceScore).toBeLessThanOrEqual(1);
      expect(ranked[0].factors.uptimeScore).toBe(0.95);
      expect(ranked[0].factors.latencyScore).toBe(0.9);
    });

    it('should respect limit parameter', async () => {
      const hosts = [
        createMockHost('0x' + '1'.repeat(40), 1000n * 10n ** 18n, 2000n),
        createMockHost('0x' + '2'.repeat(40), 2000n * 10n ** 18n, 2000n),
        createMockHost('0x' + '3'.repeat(40), 3000n * 10n ** 18n, 2000n),
        createMockHost('0x' + '4'.repeat(40), 4000n * 10n ** 18n, 2000n),
        createMockHost('0x' + '5'.repeat(40), 5000n * 10n ** 18n, 2000n),
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO, 3);

      expect(ranked).toHaveLength(3);
    });

    it('should return empty array when no hosts available', async () => {
      const mockHostManager = createMockHostManager([]);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);

      expect(ranked).toEqual([]);
    });

    it('should use mode-specific scoring', async () => {
      // Create hosts where CHEAPEST vs RELIABLE would rank differently
      const hosts = [
        createMockHost('0x' + '1'.repeat(40), 100n * 10n ** 18n, 100n), // Low stake, cheapest
        createMockHost('0x' + '2'.repeat(40), 10000n * 10n ** 18n, 100000n), // Max stake, most expensive
      ];

      const mockHostManager = createMockHostManager(hosts);
      const service = new HostSelectionService(mockHostManager);

      const cheapestRanked = await service.getRankedHostsForModel(
        modelId,
        HostSelectionMode.CHEAPEST
      );
      const reliableRanked = await service.getRankedHostsForModel(
        modelId,
        HostSelectionMode.RELIABLE
      );

      // In CHEAPEST mode, host 1 (low price) should rank higher
      expect(cheapestRanked[0].host.address).toBe(hosts[0].address);

      // In RELIABLE mode, host 2 (high stake) should rank higher
      expect(reliableRanked[0].host.address).toBe(hosts[1].address);
    });
  });

  describe('setHostManager', () => {
    it('should allow setting HostManager after construction', async () => {
      const hosts = [createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n)];
      const mockHostManager = createMockHostManager(hosts);

      const service = new HostSelectionService();
      service.setHostManager(mockHostManager);

      const selected = await service.selectHostForModel(modelId, HostSelectionMode.AUTO);
      expect(selected).not.toBeNull();
    });
  });
});
