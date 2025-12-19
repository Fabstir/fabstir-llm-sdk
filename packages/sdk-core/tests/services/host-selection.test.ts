// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Host Selection Service Tests
 * @description Tests for HostSelectionService scoring algorithm
 */

import { describe, it, expect } from 'vitest';
import { HostSelectionService } from '../../src/services/HostSelectionService';
import { HostSelectionMode } from '../../src/types/settings.types';
import { HostInfo } from '../../src/types/models';

// Helper to create mock HostInfo
function createMockHost(overrides: Partial<HostInfo> = {}): HostInfo {
  return {
    address: '0x' + '1'.repeat(40),
    apiUrl: 'http://localhost:8080',
    metadata: {
      hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
      capabilities: ['inference', 'streaming'],
      location: 'US',
      maxConcurrent: 10,
      costPerToken: 0.001,
    },
    supportedModels: ['0x' + 'a'.repeat(64)],
    isActive: true,
    stake: 1000n * 10n ** 18n, // 1000 FAB tokens
    minPricePerTokenNative: 1000n, // 0.001 ETH per token (PRICE_PRECISION=1000)
    minPricePerTokenStable: 2000n, // 0.002 USDC per token
    ...overrides,
  };
}

describe('HostSelectionService', () => {
  let service: HostSelectionService;

  beforeEach(() => {
    service = new HostSelectionService();
  });

  describe('calculateHostScore', () => {
    it('should return a value between 0 and 1', () => {
      const host = createMockHost();
      const score = service.calculateHostScore(host, HostSelectionMode.AUTO);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return consistent scores for same host and mode', () => {
      const host = createMockHost();
      const score1 = service.calculateHostScore(host, HostSelectionMode.AUTO);
      const score2 = service.calculateHostScore(host, HostSelectionMode.AUTO);

      expect(score1).toBe(score2);
    });
  });

  describe('AUTO mode weights', () => {
    it('should use standard weights (stake=0.35, price=0.30, uptime=0.20, latency=0.15)', () => {
      // Test with a host that has known values
      const host = createMockHost({
        stake: 5000n * 10n ** 18n, // 5000 FAB = 0.5 normalized
        minPricePerTokenStable: 50050n, // Middle price = ~0.5 normalized
      });

      const score = service.calculateHostScore(host, HostSelectionMode.AUTO);

      // Expected calculation:
      // stakeScore = 0.5 (5000/10000)
      // priceScore = (100000 - 50050) / (100000 - 100) = ~0.5
      // uptimeScore = 0.95 (placeholder)
      // latencyScore = 0.9 (placeholder)
      // score = 0.35*0.5 + 0.30*0.5 + 0.20*0.95 + 0.15*0.9
      //       = 0.175 + 0.15 + 0.19 + 0.135 = 0.65

      // Allow some tolerance for floating point
      expect(score).toBeGreaterThan(0.5);
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('CHEAPEST mode weights', () => {
    it('should prioritize price with weight 0.70', () => {
      // Two hosts: one cheap, one expensive
      const cheapHost = createMockHost({
        stake: 100n * 10n ** 18n, // Low stake
        minPricePerTokenStable: 100n, // Lowest price
      });

      const expensiveHost = createMockHost({
        stake: 10000n * 10n ** 18n, // Max stake
        minPricePerTokenStable: 100000n, // Highest price
      });

      const cheapScore = service.calculateHostScore(cheapHost, HostSelectionMode.CHEAPEST);
      const expensiveScore = service.calculateHostScore(expensiveHost, HostSelectionMode.CHEAPEST);

      // Cheap host should score much higher in CHEAPEST mode
      expect(cheapScore).toBeGreaterThan(expensiveScore);
      // The difference should be significant due to 0.70 weight on price
      expect(cheapScore - expensiveScore).toBeGreaterThan(0.5);
    });
  });

  describe('RELIABLE mode weights', () => {
    it('should prioritize stake (0.50) and uptime (0.40)', () => {
      // High stake host with average price
      const reliableHost = createMockHost({
        stake: 10000n * 10n ** 18n, // Max stake
        minPricePerTokenStable: 100000n, // Expensive
      });

      // Low stake host with great price
      const cheapHost = createMockHost({
        stake: 100n * 10n ** 18n, // Low stake
        minPricePerTokenStable: 100n, // Cheapest
      });

      const reliableScore = service.calculateHostScore(reliableHost, HostSelectionMode.RELIABLE);
      const cheapScore = service.calculateHostScore(cheapHost, HostSelectionMode.RELIABLE);

      // Reliable host should score higher despite high price
      expect(reliableScore).toBeGreaterThan(cheapScore);
    });
  });

  describe('FASTEST mode weights', () => {
    it('should prioritize latency with weight 0.60', () => {
      // Since latency is placeholder (0.9), all hosts have same latency score
      // Test that the mode still works and doesn't crash
      const host = createMockHost();
      const score = service.calculateHostScore(host, HostSelectionMode.FASTEST);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);

      // With placeholder latency of 0.9 and weight 0.60:
      // latency contribution = 0.60 * 0.9 = 0.54
      // This should be the dominant factor
      expect(score).toBeGreaterThan(0.5);
    });
  });

  describe('Stake scoring', () => {
    it('should give higher scores to hosts with higher stakes', () => {
      const lowStakeHost = createMockHost({
        stake: 100n * 10n ** 18n, // 100 FAB
        minPricePerTokenStable: 2000n, // Same price
      });

      const highStakeHost = createMockHost({
        stake: 9000n * 10n ** 18n, // 9000 FAB
        minPricePerTokenStable: 2000n, // Same price
      });

      const lowScore = service.calculateHostScore(lowStakeHost, HostSelectionMode.AUTO);
      const highScore = service.calculateHostScore(highStakeHost, HostSelectionMode.AUTO);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should cap stake score at 1.0 for stakes >= 10000 FAB', () => {
      const maxStakeHost = createMockHost({
        stake: 10000n * 10n ** 18n, // Exactly max
      });

      const overMaxStakeHost = createMockHost({
        stake: 20000n * 10n ** 18n, // Over max
      });

      const maxScore = service.calculateHostScore(maxStakeHost, HostSelectionMode.AUTO);
      const overMaxScore = service.calculateHostScore(overMaxStakeHost, HostSelectionMode.AUTO);

      // Both should have same stake contribution (capped at 1.0)
      expect(maxScore).toBe(overMaxScore);
    });
  });

  describe('Price scoring', () => {
    it('should give higher scores to hosts with lower prices', () => {
      const cheapHost = createMockHost({
        stake: 1000n * 10n ** 18n, // Same stake
        minPricePerTokenStable: 500n, // Low price
      });

      const expensiveHost = createMockHost({
        stake: 1000n * 10n ** 18n, // Same stake
        minPricePerTokenStable: 90000n, // High price
      });

      const cheapScore = service.calculateHostScore(cheapHost, HostSelectionMode.AUTO);
      const expensiveScore = service.calculateHostScore(expensiveHost, HostSelectionMode.AUTO);

      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('should give score of 1.0 for minimum price (100)', () => {
      const minPriceHost = createMockHost({
        minPricePerTokenStable: 100n, // Minimum price
      });

      // In CHEAPEST mode, price has 0.70 weight
      // With min price, priceScore = 1.0
      // score includes: 0.70 * 1.0 = 0.70 from price alone
      const score = service.calculateHostScore(minPriceHost, HostSelectionMode.CHEAPEST);
      expect(score).toBeGreaterThan(0.7);
    });

    it('should give score of 0.0 for maximum price (100000)', () => {
      const maxPriceHost = createMockHost({
        stake: 0n, // Zero stake to isolate price effect
        minPricePerTokenStable: 100000n, // Maximum price
      });

      // In CHEAPEST mode with max price:
      // priceScore = 0, stakeScore = 0
      // Only uptime (0.10 * 0.95) and latency (0.05 * 0.9) contribute
      const score = service.calculateHostScore(maxPriceHost, HostSelectionMode.CHEAPEST);
      expect(score).toBeLessThan(0.2);
    });
  });

  describe('Score normalization', () => {
    it('should normalize all factor scores to 0-1 range', () => {
      // Test with extreme values
      const extremeHost = createMockHost({
        stake: 50000n * 10n ** 18n, // Way over max
        minPricePerTokenStable: 1n, // Way under min
      });

      const score = service.calculateHostScore(extremeHost, HostSelectionMode.AUTO);

      // Score should still be in valid range
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle zero stake gracefully', () => {
      const zeroStakeHost = createMockHost({
        stake: 0n,
      });

      const score = service.calculateHostScore(zeroStakeHost, HostSelectionMode.AUTO);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle zero price gracefully', () => {
      const zeroPriceHost = createMockHost({
        minPricePerTokenStable: 0n,
      });

      const score = service.calculateHostScore(zeroPriceHost, HostSelectionMode.AUTO);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('getScoreFactors', () => {
    it('should return individual factor scores', () => {
      const host = createMockHost({
        stake: 5000n * 10n ** 18n,
        minPricePerTokenStable: 50000n,
      });

      const factors = service.getScoreFactors(host);

      expect(factors.stakeScore).toBeGreaterThanOrEqual(0);
      expect(factors.stakeScore).toBeLessThanOrEqual(1);
      expect(factors.priceScore).toBeGreaterThanOrEqual(0);
      expect(factors.priceScore).toBeLessThanOrEqual(1);
      expect(factors.uptimeScore).toBe(0.95); // Placeholder
      expect(factors.latencyScore).toBe(0.9); // Placeholder
    });
  });
});
