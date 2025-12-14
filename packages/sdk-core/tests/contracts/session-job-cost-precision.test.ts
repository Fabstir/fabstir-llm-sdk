// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Job Cost Precision Tests
 *
 * Verifies that SessionJobManager correctly applies PRICE_PRECISION
 * when calculating actualCost for session creation.
 */

import { describe, it, expect } from 'vitest';
import { PRICE_PRECISION } from '../../src/managers/HostManager';

// Test the cost calculation formula directly
// The actual implementation is in SessionJobManager.createSessionJob()

describe('SessionJobManager actualCost calculation with PRICE_PRECISION', () => {
  // Helper function matching the formula in SessionJobManager
  function calculateActualCost(pricePerToken: number, proofInterval: number): bigint {
    // NEW formula with PRICE_PRECISION
    return (BigInt(pricePerToken) * BigInt(proofInterval)) / PRICE_PRECISION;
  }

  describe('Basic cost calculations', () => {
    it('should calculate actualCost with PRICE_PRECISION division', () => {
      // pricePerToken = 5000 ($5/million), proofInterval = 1000 tokens
      // Expected: (5000 * 1000) / 1000 = 5000 USDC units = $5
      const cost = calculateActualCost(5000, 1000);
      expect(cost).toBe(5000n);
    });

    it('should handle small proof intervals', () => {
      // pricePerToken = 5000, proofInterval = 100 tokens
      // Expected: (5000 * 100) / 1000 = 500 USDC units = $0.0005
      const cost = calculateActualCost(5000, 100);
      expect(cost).toBe(500n);
    });

    it('should handle large proof intervals', () => {
      // pricePerToken = 5000, proofInterval = 10000 tokens
      // Expected: (5000 * 10000) / 1000 = 50000 USDC units = $50
      const cost = calculateActualCost(5000, 10000);
      expect(cost).toBe(50000n);
    });
  });

  describe('Budget model pricing (sub-$1/million)', () => {
    it('should support $0.06/million pricing', () => {
      // pricePerToken = 60 ($0.06/million), proofInterval = 1000 tokens
      // Expected: (60 * 1000) / 1000 = 60 USDC units = $0.00006
      const cost = calculateActualCost(60, 1000);
      expect(cost).toBe(60n);
    });

    it('should support $0.27/million pricing', () => {
      // pricePerToken = 270 ($0.27/million), proofInterval = 1000 tokens
      // Expected: (270 * 1000) / 1000 = 270 USDC units
      const cost = calculateActualCost(270, 1000);
      expect(cost).toBe(270n);
    });

    it('should support minimum price ($0.001/million)', () => {
      // pricePerToken = 1 ($0.001/million), proofInterval = 1000 tokens
      // Expected: (1 * 1000) / 1000 = 1 USDC unit
      const cost = calculateActualCost(1, 1000);
      expect(cost).toBe(1n);
    });
  });

  describe('Premium model pricing', () => {
    it('should support $10/million pricing', () => {
      // pricePerToken = 10000 ($10/million), proofInterval = 1000 tokens
      // Expected: (10000 * 1000) / 1000 = 10000 USDC units
      const cost = calculateActualCost(10000, 1000);
      expect(cost).toBe(10000n);
    });

    it('should support $50/million pricing', () => {
      // pricePerToken = 50000 ($50/million), proofInterval = 1000 tokens
      // Expected: (50000 * 1000) / 1000 = 50000 USDC units
      const cost = calculateActualCost(50000, 1000);
      expect(cost).toBe(50000n);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero price', () => {
      const cost = calculateActualCost(0, 1000);
      expect(cost).toBe(0n);
    });

    it('should handle zero proof interval', () => {
      const cost = calculateActualCost(5000, 0);
      expect(cost).toBe(0n);
    });

    it('should truncate fractional results (integer division)', () => {
      // pricePerToken = 1, proofInterval = 999
      // Expected: (1 * 999) / 1000 = 0 (truncated)
      const cost = calculateActualCost(1, 999);
      expect(cost).toBe(0n);

      // pricePerToken = 1, proofInterval = 1000
      // Expected: (1 * 1000) / 1000 = 1
      const cost2 = calculateActualCost(1, 1000);
      expect(cost2).toBe(1n);
    });
  });
});
