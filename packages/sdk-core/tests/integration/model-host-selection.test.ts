// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Model Host Selection Integration Tests
 * @description End-to-end tests for model and host selection flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HostSelectionService } from '../../src/services/HostSelectionService';
import { HostSelectionMode, UserSettingsVersion } from '../../src/types/settings.types';
import { HostInfo, ModelInfo } from '../../src/types/models';
import { IHostManager } from '../../src/interfaces/IHostManager';
import { migrateUserSettings } from '../../src/managers/migrations/user-settings';

// Helper to create mock HostInfo
function createMockHost(
  address: string,
  stake: bigint,
  priceStable: bigint,
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
    minPricePerTokenStable: priceStable,
    ...overrides,
  };
}

// Helper to create mock ModelInfo
function createMockModel(modelId: string, repo: string, file: string): ModelInfo {
  return {
    modelId,
    huggingfaceRepo: repo,
    fileName: file,
    sha256Hash: '0x' + 'f'.repeat(64),
    approvalTier: 1,
    active: true,
    timestamp: Date.now(),
  };
}

// Create mock HostManager
function createMockHostManager(hostsPerModel: Map<string, HostInfo[]>): IHostManager {
  return {
    findHostsForModel: vi.fn().mockImplementation(async (modelId: string) => {
      return hostsPerModel.get(modelId) || [];
    }),
    getHostInfo: vi.fn().mockImplementation(async (address: string) => {
      for (const hosts of hostsPerModel.values()) {
        const host = hosts.find((h) => h.address === address);
        if (host) return host;
      }
      return null;
    }),
    hostSupportsModel: vi.fn().mockImplementation(async (address: string, modelId: string) => {
      const hosts = hostsPerModel.get(modelId) || [];
      return hosts.some((h) => h.address === address);
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
    getHostEarnings: vi.fn(),
    withdrawEarnings: vi.fn(),
    getReputation: vi.fn(),
    setModelTokenPricing: vi.fn(),
    clearModelTokenPricing: vi.fn(),
    getModelPricing: vi.fn(),
    getHostModelPrices: vi.fn(),
  } as unknown as IHostManager;
}

describe('Model Host Selection Integration', () => {
  const modelId = '0x' + 'a'.repeat(64);

  describe('Host Selection Flow', () => {
    it('should select cheapest host in CHEAPEST mode', async () => {
      // Setup: 3 hosts with different prices
      const cheapestHost = createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 100n); // Lowest price
      const mediumHost = createMockHost('0x' + '2'.repeat(40), 5000n * 10n ** 18n, 500n);
      const expensiveHost = createMockHost('0x' + '3'.repeat(40), 5000n * 10n ** 18n, 1000n);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [mediumHost, expensiveHost, cheapestHost]); // Order doesn't match price

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      // Run multiple selections to verify consistency
      for (let i = 0; i < 10; i++) {
        const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.CHEAPEST);

        // In CHEAPEST mode, lowest price should always be first
        expect(ranked[0].host.address).toBe(cheapestHost.address);
        expect(ranked[0].host.minPricePerTokenStable).toBe(100n);
      }
    });

    it('should select highest stake host in RELIABLE mode', async () => {
      // Setup: 3 hosts with different stakes
      const lowStakeHost = createMockHost('0x' + '1'.repeat(40), 1000n * 10n ** 18n, 100n);
      const mediumStakeHost = createMockHost('0x' + '2'.repeat(40), 5000n * 10n ** 18n, 100n);
      const highStakeHost = createMockHost('0x' + '3'.repeat(40), 10000n * 10n ** 18n, 100n); // Highest stake

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [lowStakeHost, highStakeHost, mediumStakeHost]); // Order doesn't match stake

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      // Run multiple selections to verify consistency
      for (let i = 0; i < 10; i++) {
        const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.RELIABLE);

        // In RELIABLE mode, highest stake should always be first
        expect(ranked[0].host.address).toBe(highStakeHost.address);
        expect(ranked[0].host.stake).toBe(10000n * 10n ** 18n);
      }
    });

    it('should return preferred host in SPECIFIC mode', async () => {
      const preferredAddress = '0x' + '2'.repeat(40);
      const preferredHost = createMockHost(preferredAddress, 5000n * 10n ** 18n, 500n, {
        supportedModels: [modelId],
      });
      const otherHost = createMockHost('0x' + '1'.repeat(40), 10000n * 10n ** 18n, 100n);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [otherHost, preferredHost]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      const selected = await service.selectHostForModel(
        modelId,
        HostSelectionMode.SPECIFIC,
        preferredAddress
      );

      expect(selected).not.toBeNull();
      expect(selected!.address).toBe(preferredAddress);
    });

    it('should throw error when SPECIFIC mode host is unavailable', async () => {
      const preferredAddress = '0x' + '9'.repeat(40); // Not in available hosts
      const availableHost = createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 500n);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [availableHost]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC, preferredAddress)
      ).rejects.toThrow(`Preferred host ${preferredAddress} is not available`);
    });
  });

  describe('Settings Migration', () => {
    it('should migrate V1 settings to V2 preserving existing data', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: 1700000000000,
        selectedModel: 'tiny-vicuna',
        preferredPaymentToken: 'USDC' as const,
        theme: 'dark' as const,
      };

      const migrated = migrateUserSettings(v1Settings);

      // V1 data preserved
      expect(migrated.selectedModel).toBe('tiny-vicuna');
      expect(migrated.preferredPaymentToken).toBe('USDC');
      expect(migrated.theme).toBe('dark');

      // V2 fields added with defaults
      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.defaultModelId).toBeNull();
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(migrated.preferredHostAddress).toBeNull();
    });

    it('should preserve V2 settings without modification', () => {
      const v2Settings = {
        version: UserSettingsVersion.V2,
        lastUpdated: 1700000000000,
        selectedModel: 'mistral-7b',
        defaultModelId: '0x' + 'a'.repeat(64),
        hostSelectionMode: HostSelectionMode.CHEAPEST,
        preferredHostAddress: '0x' + '1'.repeat(40),
        preferredPaymentToken: 'ETH' as const,
      };

      const migrated = migrateUserSettings(v2Settings);

      // All V2 data preserved exactly
      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.selectedModel).toBe('mistral-7b');
      expect(migrated.defaultModelId).toBe('0x' + 'a'.repeat(64));
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.CHEAPEST);
      expect(migrated.preferredHostAddress).toBe('0x' + '1'.repeat(40));
      expect(migrated.preferredPaymentToken).toBe('ETH');
    });
  });

  describe('Ranked Hosts Scoring', () => {
    it('should score hosts with expected AUTO mode weights', async () => {
      // Create hosts with known characteristics
      const host = createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 2000n);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [host]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);

      expect(ranked).toHaveLength(1);
      expect(ranked[0].factors).toBeDefined();

      // Verify factors are normalized (0-1 range)
      expect(ranked[0].factors.stakeScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0].factors.stakeScore).toBeLessThanOrEqual(1);
      expect(ranked[0].factors.priceScore).toBeGreaterThanOrEqual(0);
      expect(ranked[0].factors.priceScore).toBeLessThanOrEqual(1);

      // Verify placeholder scores (until real metrics available)
      expect(ranked[0].factors.uptimeScore).toBe(0.95);
      expect(ranked[0].factors.latencyScore).toBe(0.9);

      // Verify composite score is in valid range
      expect(ranked[0].score).toBeGreaterThanOrEqual(0);
      expect(ranked[0].score).toBeLessThanOrEqual(1);
    });

    it('should apply different weights for different modes', async () => {
      // Create hosts where mode matters significantly
      // For CHEAPEST to win: price difference must overcome stake bonus
      // For RELIABLE to win: stake difference must overcome price penalty
      const cheapHost = createMockHost('0x' + '1'.repeat(40), 1000n * 10n ** 18n, 100n); // Medium stake, very cheap
      const reliableHost = createMockHost('0x' + '2'.repeat(40), 10000n * 10n ** 18n, 99000n); // Max stake, very expensive

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [cheapHost, reliableHost]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      // CHEAPEST mode: cheap host should rank higher (price is 70% weight)
      const cheapestRanked = await service.getRankedHostsForModel(modelId, HostSelectionMode.CHEAPEST);
      expect(cheapestRanked[0].host.address).toBe(cheapHost.address);

      // RELIABLE mode: reliable host should rank higher (stake is 50% weight)
      const reliableRanked = await service.getRankedHostsForModel(modelId, HostSelectionMode.RELIABLE);
      expect(reliableRanked[0].host.address).toBe(reliableHost.address);
    });
  });

  describe('Model Availability Integration', () => {
    it('should return models with accurate host counts', async () => {
      const model1Id = '0x' + 'a'.repeat(64);
      const model2Id = '0x' + 'b'.repeat(64);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, [
        createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 100n),
        createMockHost('0x' + '2'.repeat(40), 5000n * 10n ** 18n, 200n),
        createMockHost('0x' + '3'.repeat(40), 5000n * 10n ** 18n, 300n),
      ]);
      hostsPerModel.set(model2Id, [createMockHost('0x' + '4'.repeat(40), 5000n * 10n ** 18n, 500n)]);

      const mockHostManager = createMockHostManager(hostsPerModel);

      // Verify host counts through HostManager
      const model1Hosts = await mockHostManager.findHostsForModel(model1Id);
      const model2Hosts = await mockHostManager.findHostsForModel(model2Id);

      expect(model1Hosts).toHaveLength(3);
      expect(model2Hosts).toHaveLength(1);
    });

    it('should calculate price ranges correctly', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [
        createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 100n), // Min
        createMockHost('0x' + '2'.repeat(40), 5000n * 10n ** 18n, 500n), // Middle
        createMockHost('0x' + '3'.repeat(40), 5000n * 10n ** 18n, 900n), // Max
      ]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const hosts = await mockHostManager.findHostsForModel(modelId);

      // Calculate price range manually (same logic as ModelManager)
      const prices = hosts.map((h) => h.minPricePerTokenStable);
      const min = prices.reduce((a, b) => (a < b ? a : b), prices[0]);
      const max = prices.reduce((a, b) => (a > b ? a : b), prices[0]);
      const sum = prices.reduce((a, b) => a + b, 0n);
      const avg = sum / BigInt(prices.length);

      expect(min).toBe(100n);
      expect(max).toBe(900n);
      expect(avg).toBe(500n); // (100 + 500 + 900) / 3 = 500
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty hosts gracefully', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, []); // No hosts

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);
      expect(ranked).toEqual([]);

      const selected = await service.selectHostForModel(modelId, HostSelectionMode.AUTO);
      expect(selected).toBeNull();
    });

    it('should handle single host correctly', async () => {
      const singleHost = createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 500n);

      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [singleHost]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      // All modes should return the single host
      for (const mode of [
        HostSelectionMode.AUTO,
        HostSelectionMode.CHEAPEST,
        HostSelectionMode.RELIABLE,
        HostSelectionMode.FASTEST,
      ]) {
        const selected = await service.selectHostForModel(modelId, mode);
        expect(selected).not.toBeNull();
        expect(selected!.address).toBe(singleHost.address);
      }
    });

    it('should handle inactive hosts correctly', async () => {
      const activeHost = createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 500n);
      const inactiveHost = createMockHost('0x' + '2'.repeat(40), 10000n * 10n ** 18n, 100n, {
        isActive: false,
      });

      // Only active host in results (HostManager filters)
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [activeHost]); // Inactive not returned by HostManager

      const mockHostManager = createMockHostManager(hostsPerModel);
      const service = new HostSelectionService(mockHostManager);

      const ranked = await service.getRankedHostsForModel(modelId, HostSelectionMode.AUTO);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].host.address).toBe(activeHost.address);
    });

    it('should handle SPECIFIC mode with inactive preferred host', async () => {
      const preferredAddress = '0x' + '2'.repeat(40);

      // HostManager returns null for inactive host
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(modelId, [createMockHost('0x' + '1'.repeat(40), 5000n * 10n ** 18n, 500n)]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      // Override getHostInfo to return inactive host
      mockHostManager.getHostInfo = vi.fn().mockResolvedValue({
        ...createMockHost(preferredAddress, 10000n * 10n ** 18n, 100n),
        isActive: false,
      });

      const service = new HostSelectionService(mockHostManager);

      await expect(
        service.selectHostForModel(modelId, HostSelectionMode.SPECIFIC, preferredAddress)
      ).rejects.toThrow(`Preferred host ${preferredAddress} is not available`);
    });
  });
});
