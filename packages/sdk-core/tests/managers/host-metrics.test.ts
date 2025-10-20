// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { HostManager } from '../../src/managers/HostManager';
import { ContractManager } from '../../src/contracts/ContractManager';
import { SDKError } from '../../src/types';

describe('HostManager Metrics', () => {
  let hostManager: HostManager;
  let contractManager: ContractManager;
  let mockSigner: ethers.Signer;
  let mockProvider: ethers.Provider;

  const mockConfig = {
    rpcUrl: 'https://sepolia.base.org',
    contractAddresses: {
      nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    }
  };

  beforeEach(async () => {
    mockProvider = new ethers.JsonRpcProvider(mockConfig.rpcUrl);
    mockSigner = ethers.Wallet.createRandom().connect(mockProvider);

    // ContractManager takes provider and addresses in constructor
    contractManager = new ContractManager(mockProvider, mockConfig.contractAddresses);

    hostManager = new HostManager(contractManager);
  });

  describe('submitMetrics', () => {
    it('should validate metrics data structure', async () => {
      await hostManager.initialize(mockSigner);

      const invalidMetrics = {
        jobsCompleted: -1, // Invalid: negative number
        tokensProcessed: 1000,
        averageLatency: 200,
        uptime: 0.95,
        timestamp: Date.now()
      };

      await expect(hostManager.submitMetrics(invalidMetrics as any))
        .rejects.toThrow('Invalid metrics: jobsCompleted cannot be negative');
    });

    it('should accept valid host metrics', async () => {
      await hostManager.initialize(mockSigner);

      const validMetrics = {
        jobsCompleted: 10,
        tokensProcessed: 5000,
        averageLatency: 150,
        uptime: 0.99,
        timestamp: Date.now()
      };

      const result = await hostManager.submitMetrics(validMetrics);
      expect(result).toBeDefined();
      expect(result.stored).toBe(true);
    });

    it('should store metrics locally when no service available', async () => {
      await hostManager.initialize(mockSigner);

      const metrics = {
        jobsCompleted: 5,
        tokensProcessed: 2500,
        averageLatency: 100,
        uptime: 1.0,
        timestamp: Date.now()
      };

      const result = await hostManager.submitMetrics(metrics);
      expect(result.stored).toBe(true);
      expect(result.location).toBe('local');
    });

    it('should auto-generate timestamp if not provided', async () => {
      await hostManager.initialize(mockSigner);

      const metrics = {
        jobsCompleted: 1,
        tokensProcessed: 500,
        averageLatency: 50,
        uptime: 0.95
        // No timestamp provided
      };

      const result = await hostManager.submitMetrics(metrics);
      expect(result.stored).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(Date.now() - 1000);
    });

    it('should reject metrics with invalid uptime', async () => {
      await hostManager.initialize(mockSigner);

      const metrics = {
        jobsCompleted: 10,
        tokensProcessed: 5000,
        averageLatency: 150,
        uptime: 1.5, // Invalid: > 1.0
        timestamp: Date.now()
      };

      await expect(hostManager.submitMetrics(metrics))
        .rejects.toThrow('Invalid metrics: uptime must be between 0 and 1');
    });

    it('should require initialization before submitting metrics', async () => {
      const metrics = {
        jobsCompleted: 1,
        tokensProcessed: 100,
        averageLatency: 50,
        uptime: 0.99,
        timestamp: Date.now()
      };

      await expect(hostManager.submitMetrics(metrics))
        .rejects.toThrow('HostManager not initialized');
    });
  });

  describe('getStoredMetrics', () => {
    it('should retrieve previously stored metrics', async () => {
      await hostManager.initialize(mockSigner);

      const metrics = {
        jobsCompleted: 15,
        tokensProcessed: 7500,
        averageLatency: 175,
        uptime: 0.98,
        timestamp: Date.now()
      };

      await hostManager.submitMetrics(metrics);

      const hostAddress = await mockSigner.getAddress();
      const storedMetrics = await hostManager.getStoredMetrics(hostAddress);

      expect(storedMetrics).toBeDefined();
      expect(storedMetrics.length).toBeGreaterThan(0);
      expect(storedMetrics[0].jobsCompleted).toBe(15);
    });

    it('should return empty array for host with no metrics', async () => {
      await hostManager.initialize(mockSigner);

      const randomAddress = ethers.Wallet.createRandom().address;
      const metrics = await hostManager.getStoredMetrics(randomAddress);

      expect(metrics).toBeDefined();
      expect(Array.isArray(metrics)).toBe(true);
      expect(metrics.length).toBe(0);
    });

    it('should limit returned metrics to specified count', async () => {
      await hostManager.initialize(mockSigner);
      const hostAddress = await mockSigner.getAddress();

      // Submit multiple metrics
      for (let i = 0; i < 10; i++) {
        await hostManager.submitMetrics({
          jobsCompleted: i,
          tokensProcessed: i * 100,
          averageLatency: 100 + i,
          uptime: 0.95,
          timestamp: Date.now() + i * 1000
        });
      }

      const limitedMetrics = await hostManager.getStoredMetrics(hostAddress, 5);
      expect(limitedMetrics.length).toBe(5);
    });
  });

  describe('getAggregatedMetrics', () => {
    it('should calculate aggregated metrics over time period', async () => {
      await hostManager.initialize(mockSigner);
      const hostAddress = await mockSigner.getAddress();

      // Submit metrics over time
      await hostManager.submitMetrics({
        jobsCompleted: 5,
        tokensProcessed: 1000,
        averageLatency: 100,
        uptime: 1.0,
        timestamp: Date.now() - 3600000 // 1 hour ago
      });

      await hostManager.submitMetrics({
        jobsCompleted: 10,
        tokensProcessed: 2000,
        averageLatency: 150,
        uptime: 0.9,
        timestamp: Date.now()
      });

      const aggregated = await hostManager.getAggregatedMetrics(hostAddress);

      expect(aggregated.totalJobs).toBe(15);
      expect(aggregated.totalTokens).toBe(3000);
      expect(aggregated.averageUptime).toBe(0.95);
      expect(aggregated.averageLatency).toBe(125);
    });

    it('should handle empty metrics gracefully', async () => {
      await hostManager.initialize(mockSigner);

      const randomAddress = ethers.Wallet.createRandom().address;
      const aggregated = await hostManager.getAggregatedMetrics(randomAddress);

      expect(aggregated.totalJobs).toBe(0);
      expect(aggregated.totalTokens).toBe(0);
      expect(aggregated.averageUptime).toBe(0);
      expect(aggregated.averageLatency).toBe(0);
    });
  });

  describe('clearMetrics', () => {
    it('should clear stored metrics for a host', async () => {
      await hostManager.initialize(mockSigner);
      const hostAddress = await mockSigner.getAddress();

      // Submit and verify metrics exist
      await hostManager.submitMetrics({
        jobsCompleted: 20,
        tokensProcessed: 10000,
        averageLatency: 200,
        uptime: 0.97,
        timestamp: Date.now()
      });

      let metrics = await hostManager.getStoredMetrics(hostAddress);
      expect(metrics.length).toBeGreaterThan(0);

      // Clear metrics
      await hostManager.clearMetrics(hostAddress);

      // Verify metrics are cleared
      metrics = await hostManager.getStoredMetrics(hostAddress);
      expect(metrics.length).toBe(0);
    });

    it('should only clear metrics for specified host', async () => {
      await hostManager.initialize(mockSigner);
      const hostAddress1 = await mockSigner.getAddress();
      const hostAddress2 = ethers.Wallet.createRandom().address;

      // Store metrics for both hosts
      await hostManager.submitMetrics({
        jobsCompleted: 5,
        tokensProcessed: 1000,
        averageLatency: 100,
        uptime: 0.99,
        timestamp: Date.now()
      });

      // Simulate metrics for another host (would need method to set for different host)
      // For now, we'll just test that clearing one doesn't affect others
      await hostManager.clearMetrics(hostAddress2);

      // Host 1 metrics should still exist
      const metrics1 = await hostManager.getStoredMetrics(hostAddress1);
      expect(metrics1.length).toBeGreaterThan(0);
    });
  });
});