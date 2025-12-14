// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Cost Precision Tests
 *
 * Verifies that SessionManager.calculateCost() correctly applies
 * PRICE_PRECISION division for accurate cost calculations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PRICE_PRECISION } from '../../src/managers/HostManager';

describe('SessionManager.calculateCost() with PRICE_PRECISION', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    // Create SessionManager with minimal config (no signer needed for calculateCost)
    sessionManager = new SessionManager();
  });

  describe('Basic cost calculations', () => {
    it('should calculate cost with PRICE_PRECISION division', () => {
      // 1,000,000 tokens at $5/million (pricePerToken = 5000)
      // Expected: (1,000,000 * 5000) / 1000 = 5,000,000 USDC units = $5
      const cost = sessionManager.calculateCost(1_000_000, 5000);
      expect(cost).toBe(5_000_000n);
    });

    it('should handle small token counts', () => {
      // 100 tokens at $5/million (pricePerToken = 5000)
      // Expected: (100 * 5000) / 1000 = 500 USDC units = $0.0005
      const cost = sessionManager.calculateCost(100, 5000);
      expect(cost).toBe(500n);
    });

    it('should handle large token counts', () => {
      // 10,000,000 tokens at $5/million (pricePerToken = 5000)
      // Expected: (10,000,000 * 5000) / 1000 = 50,000,000 USDC units = $50
      const cost = sessionManager.calculateCost(10_000_000, 5000);
      expect(cost).toBe(50_000_000n);
    });
  });

  describe('Budget model pricing (sub-$1/million)', () => {
    it('should support $0.06/million pricing (Llama 3.2 3B)', () => {
      // 1,000,000 tokens at $0.06/million (pricePerToken = 60)
      // Expected: (1,000,000 * 60) / 1000 = 60,000 USDC units = $0.06
      const cost = sessionManager.calculateCost(1_000_000, 60);
      expect(cost).toBe(60_000n);
    });

    it('should support $0.27/million pricing (DeepSeek V3)', () => {
      // 1,000,000 tokens at $0.27/million (pricePerToken = 270)
      // Expected: (1,000,000 * 270) / 1000 = 270,000 USDC units = $0.27
      const cost = sessionManager.calculateCost(1_000_000, 270);
      expect(cost).toBe(270_000n);
    });

    it('should handle minimum price ($0.001/million)', () => {
      // 1,000,000 tokens at $0.001/million (pricePerToken = 1)
      // Expected: (1,000,000 * 1) / 1000 = 1,000 USDC units = $0.001
      const cost = sessionManager.calculateCost(1_000_000, 1);
      expect(cost).toBe(1_000n);
    });
  });

  describe('Premium model pricing', () => {
    it('should support $10/million pricing', () => {
      // 1,000,000 tokens at $10/million (pricePerToken = 10000)
      // Expected: (1,000,000 * 10000) / 1000 = 10,000,000 USDC units = $10
      const cost = sessionManager.calculateCost(1_000_000, 10000);
      expect(cost).toBe(10_000_000n);
    });

    it('should support $50/million pricing', () => {
      // 1,000,000 tokens at $50/million (pricePerToken = 50000)
      // Expected: (1,000,000 * 50000) / 1000 = 50,000,000 USDC units = $50
      const cost = sessionManager.calculateCost(1_000_000, 50000);
      expect(cost).toBe(50_000_000n);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero tokens', () => {
      const cost = sessionManager.calculateCost(0, 5000);
      expect(cost).toBe(0n);
    });

    it('should handle zero price', () => {
      const cost = sessionManager.calculateCost(1000, 0);
      expect(cost).toBe(0n);
    });

    it('should truncate fractional results (integer division)', () => {
      // 1 token at pricePerToken = 1
      // Expected: (1 * 1) / 1000 = 0 (truncated)
      const cost = sessionManager.calculateCost(1, 1);
      expect(cost).toBe(0n);

      // 999 tokens at pricePerToken = 1
      // Expected: (999 * 1) / 1000 = 0 (truncated)
      const cost2 = sessionManager.calculateCost(999, 1);
      expect(cost2).toBe(0n);

      // 1000 tokens at pricePerToken = 1
      // Expected: (1000 * 1) / 1000 = 1
      const cost3 = sessionManager.calculateCost(1000, 1);
      expect(cost3).toBe(1n);
    });

    it('should handle very large values without overflow', () => {
      // 100,000,000 tokens at max price (theoretical max)
      const cost = sessionManager.calculateCost(100_000_000, 100_000_000);
      // Expected: (100,000,000 * 100,000,000) / 1000 = 10,000,000,000,000
      expect(cost).toBe(10_000_000_000_000n);
    });
  });
});
