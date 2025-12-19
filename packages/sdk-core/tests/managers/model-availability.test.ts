// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Model Availability Tests
 * @description Tests for getAvailableModelsWithHosts and getModelPriceRange methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelManager } from '../../src/managers/ModelManager';
import { HostInfo, ModelInfo } from '../../src/types/models';
import { IHostManager } from '../../src/interfaces/IHostManager';

// Mock ModelRegistry contract
const mockModelRegistry = {
  getAllModels: vi.fn(),
  models: vi.fn(),
  isModelApproved: vi.fn(),
  APPROVAL_THRESHOLD: vi.fn().mockResolvedValue(3),
  runner: {
    provider: {
      getCode: vi.fn().mockResolvedValue('0x1234'),
    },
  },
  getAddress: vi.fn().mockResolvedValue('0x' + '1'.repeat(40)),
};

// Mock ethers Contract
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(() => mockModelRegistry),
  };
});

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

// Helper to create mock HostInfo
function createMockHost(address: string, price: bigint): HostInfo {
  return {
    address,
    apiUrl: `http://${address.slice(0, 10)}:8080`,
    metadata: {
      hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
      capabilities: ['inference'],
      location: 'US',
      maxConcurrent: 10,
      costPerToken: 0.001,
    },
    supportedModels: [],
    isActive: true,
    stake: 1000n * 10n ** 18n,
    minPricePerTokenNative: 1000n,
    minPricePerTokenStable: price,
  };
}

// Create mock HostManager
function createMockHostManager(hostsPerModel: Map<string, HostInfo[]>): IHostManager {
  return {
    findHostsForModel: vi.fn().mockImplementation(async (modelId: string) => {
      return hostsPerModel.get(modelId) || [];
    }),
    getHostInfo: vi.fn(),
    hostSupportsModel: vi.fn(),
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

describe('ModelManager Availability Methods', () => {
  let modelManager: ModelManager;
  const model1Id = '0x' + 'a'.repeat(64);
  const model2Id = '0x' + 'b'.repeat(64);
  const model3Id = '0x' + 'c'.repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock contract responses
    mockModelRegistry.getAllModels.mockResolvedValue([model1Id, model2Id, model3Id]);
    mockModelRegistry.isModelApproved.mockResolvedValue(true);
    mockModelRegistry.models.mockImplementation(async (modelId: string) => {
      if (modelId === model1Id) {
        return {
          huggingfaceRepo: 'repo1/model1',
          fileName: 'model1.gguf',
          sha256Hash: '0x' + 'f'.repeat(64),
          approvalTier: 1,
          active: true,
          timestamp: BigInt(Date.now()),
        };
      }
      if (modelId === model2Id) {
        return {
          huggingfaceRepo: 'repo2/model2',
          fileName: 'model2.gguf',
          sha256Hash: '0x' + 'e'.repeat(64),
          approvalTier: 2,
          active: true,
          timestamp: BigInt(Date.now()),
        };
      }
      return {
        huggingfaceRepo: 'repo3/model3',
        fileName: 'model3.gguf',
        sha256Hash: '0x' + 'd'.repeat(64),
        approvalTier: 1,
        active: true,
        timestamp: BigInt(Date.now()),
      };
    });

    // Create ModelManager with mock provider
    modelManager = new ModelManager(
      {} as any, // provider (not used due to mocking)
      '0x' + '1'.repeat(40)
    );
  });

  describe('getAvailableModelsWithHosts', () => {
    it('should return models with host counts', async () => {
      // Setup hosts for models
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, [
        createMockHost('0x' + '1'.repeat(40), 2000n),
        createMockHost('0x' + '2'.repeat(40), 3000n),
      ]);
      hostsPerModel.set(model2Id, [createMockHost('0x' + '3'.repeat(40), 1500n)]);
      hostsPerModel.set(model3Id, []); // No hosts

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const results = await modelManager.getAvailableModelsWithHosts();

      expect(results).toHaveLength(3);

      // Model 1 should have 2 hosts
      const model1Result = results.find((r) => r.model.modelId === model1Id);
      expect(model1Result?.hostCount).toBe(2);
      expect(model1Result?.isAvailable).toBe(true);

      // Model 2 should have 1 host
      const model2Result = results.find((r) => r.model.modelId === model2Id);
      expect(model2Result?.hostCount).toBe(1);
      expect(model2Result?.isAvailable).toBe(true);

      // Model 3 should have 0 hosts
      const model3Result = results.find((r) => r.model.modelId === model3Id);
      expect(model3Result?.hostCount).toBe(0);
      expect(model3Result?.isAvailable).toBe(false);
    });

    it('should include price ranges for models with hosts', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, [
        createMockHost('0x' + '1'.repeat(40), 1000n), // Min price
        createMockHost('0x' + '2'.repeat(40), 5000n), // Max price
        createMockHost('0x' + '3'.repeat(40), 3000n), // Middle
      ]);
      hostsPerModel.set(model2Id, []);
      hostsPerModel.set(model3Id, []);

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const results = await modelManager.getAvailableModelsWithHosts();

      const model1Result = results.find((r) => r.model.modelId === model1Id);
      expect(model1Result?.priceRange.min).toBe(1000n);
      expect(model1Result?.priceRange.max).toBe(5000n);
      expect(model1Result?.priceRange.avg).toBe(3000n); // (1000+5000+3000)/3 = 3000
    });

    it('should mark models with no hosts as unavailable', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, []); // No hosts
      hostsPerModel.set(model2Id, []);
      hostsPerModel.set(model3Id, []);

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const results = await modelManager.getAvailableModelsWithHosts();

      results.forEach((result) => {
        expect(result.hostCount).toBe(0);
        expect(result.isAvailable).toBe(false);
        expect(result.priceRange.min).toBe(0n);
        expect(result.priceRange.max).toBe(0n);
        expect(result.priceRange.avg).toBe(0n);
      });
    });

    it('should throw error if HostManager not set', async () => {
      await modelManager.initialize();

      await expect(modelManager.getAvailableModelsWithHosts()).rejects.toThrow(
        'HostManager not set'
      );
    });
  });

  describe('getModelPriceRange', () => {
    it('should return min/max/avg for model with hosts', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, [
        createMockHost('0x' + '1'.repeat(40), 2000n),
        createMockHost('0x' + '2'.repeat(40), 8000n),
        createMockHost('0x' + '3'.repeat(40), 5000n),
      ]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const result = await modelManager.getModelPriceRange(model1Id);

      expect(result.min).toBe(2000n);
      expect(result.max).toBe(8000n);
      expect(result.avg).toBe(5000n); // (2000+8000+5000)/3 = 5000
      expect(result.hostCount).toBe(3);
    });

    it('should return zeros for model with no hosts', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, []); // No hosts

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const result = await modelManager.getModelPriceRange(model1Id);

      expect(result.min).toBe(0n);
      expect(result.max).toBe(0n);
      expect(result.avg).toBe(0n);
      expect(result.hostCount).toBe(0);
    });

    it('should handle single host correctly', async () => {
      const hostsPerModel = new Map<string, HostInfo[]>();
      hostsPerModel.set(model1Id, [createMockHost('0x' + '1'.repeat(40), 3500n)]);

      const mockHostManager = createMockHostManager(hostsPerModel);
      modelManager.setHostManager(mockHostManager);

      await modelManager.initialize();
      const result = await modelManager.getModelPriceRange(model1Id);

      expect(result.min).toBe(3500n);
      expect(result.max).toBe(3500n);
      expect(result.avg).toBe(3500n);
      expect(result.hostCount).toBe(1);
    });

    it('should throw error if HostManager not set', async () => {
      await modelManager.initialize();

      await expect(modelManager.getModelPriceRange(model1Id)).rejects.toThrow(
        'HostManager not set'
      );
    });
  });
});
