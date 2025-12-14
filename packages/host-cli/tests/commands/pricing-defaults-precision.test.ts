// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Defaults Tests with PRICE_PRECISION
 *
 * Verifies that CLI register command uses new default pricing with PRICE_PRECISION=1000.
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_PRECISION,
  DEFAULT_PRICE_STABLE,
  DEFAULT_PRICE_PER_TOKEN,
  DEFAULT_PRICE_PER_TOKEN_NUMBER
} from '@fabstir/sdk-core';

describe('CLI Pricing Defaults with PRICE_PRECISION', () => {
  describe('SDK exports used by CLI', () => {
    it('should export PRICE_PRECISION as 1000n', () => {
      expect(PRICE_PRECISION).toBe(1000n);
    });

    it('should export DEFAULT_PRICE_STABLE as "5000"', () => {
      expect(DEFAULT_PRICE_STABLE).toBe('5000');
    });

    it('should export DEFAULT_PRICE_PER_TOKEN as "5000"', () => {
      expect(DEFAULT_PRICE_PER_TOKEN).toBe('5000');
    });

    it('should export DEFAULT_PRICE_PER_TOKEN_NUMBER as 5000', () => {
      expect(DEFAULT_PRICE_PER_TOKEN_NUMBER).toBe(5000);
    });
  });

  describe('Price display formatting with PRICE_PRECISION', () => {
    const PRICE_PRECISION_NUM = 1000;

    it('should format $5/million pricing correctly', () => {
      // pricePerToken = 5000 means $5/million
      const pricePerToken = 5000;
      // Formula: pricePerToken / PRICE_PRECISION / 1_000_000
      const priceInUSDC = pricePerToken / PRICE_PRECISION_NUM / 1_000_000;
      expect(priceInUSDC).toBe(0.000005);
      expect(priceInUSDC.toFixed(6)).toBe('0.000005');
    });

    it('should format $10/million pricing correctly', () => {
      const pricePerToken = 10000;
      const priceInUSDC = pricePerToken / PRICE_PRECISION_NUM / 1_000_000;
      expect(priceInUSDC).toBe(0.00001);
      expect(priceInUSDC.toFixed(6)).toBe('0.000010');
    });

    it('should format minimum price (1) correctly', () => {
      // pricePerToken = 1 means $0.001/million
      const pricePerToken = 1;
      const priceInUSDC = pricePerToken / PRICE_PRECISION_NUM / 1_000_000;
      expect(priceInUSDC).toBeCloseTo(0.000000001, 12);
    });

    it('should format per-1000 tokens correctly for $5/million', () => {
      const pricePerToken = 5000;
      const PRICE_PRECISION_NUM = 1000;
      // Cost for 1000 tokens = (1000 * pricePerToken) / PRICE_PRECISION / 1_000_000
      const costPer1K = (1000 * pricePerToken) / PRICE_PRECISION_NUM / 1_000_000;
      expect(costPer1K).toBe(0.005);
      expect(costPer1K.toFixed(4)).toBe('0.0050');
    });

    it('should format per-10000 tokens correctly for $5/million', () => {
      const pricePerToken = 5000;
      const PRICE_PRECISION_NUM = 1000;
      // Cost for 10000 tokens = (10000 * pricePerToken) / PRICE_PRECISION / 1_000_000
      const costPer10K = (10000 * pricePerToken) / PRICE_PRECISION_NUM / 1_000_000;
      expect(costPer10K).toBe(0.05);
      expect(costPer10K.toFixed(4)).toBe('0.0500');
    });
  });

  describe('Backward compatibility', () => {
    it('should have DEFAULT_PRICE_PER_TOKEN equal to DEFAULT_PRICE_STABLE', () => {
      expect(DEFAULT_PRICE_PER_TOKEN).toBe(DEFAULT_PRICE_STABLE);
    });

    it('should have DEFAULT_PRICE_PER_TOKEN_NUMBER equal to parsed DEFAULT_PRICE_STABLE', () => {
      expect(DEFAULT_PRICE_PER_TOKEN_NUMBER).toBe(parseInt(DEFAULT_PRICE_STABLE));
    });
  });
});
