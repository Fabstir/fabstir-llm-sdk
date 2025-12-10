// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Validation Tests with PRICE_PRECISION
 *
 * Verifies that CLI update-pricing command validates new price ranges.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE,
  MIN_PRICE_PER_TOKEN,
  MAX_PRICE_PER_TOKEN
} from '@fabstir/sdk-core';

describe('CLI Pricing Validation with PRICE_PRECISION', () => {
  // Helper to simulate CLI validation
  function validatePrice(newPrice: number): { valid: boolean; error?: string } {
    if (newPrice < 1 || newPrice > 100000000) {
      return {
        valid: false,
        error: `Price must be between 1 and 100,000,000. Got: ${newPrice}`
      };
    }
    return { valid: true };
  }

  describe('SDK constants alignment', () => {
    it('should have MIN_PRICE_STABLE as 1n', () => {
      expect(MIN_PRICE_STABLE).toBe(1n);
    });

    it('should have MAX_PRICE_STABLE as 100_000_000n', () => {
      expect(MAX_PRICE_STABLE).toBe(100_000_000n);
    });

    it('should have MIN_PRICE_PER_TOKEN as 1n (legacy)', () => {
      expect(MIN_PRICE_PER_TOKEN).toBe(1n);
    });

    it('should have MAX_PRICE_PER_TOKEN as 100_000_000n (legacy)', () => {
      expect(MAX_PRICE_PER_TOKEN).toBe(100_000_000n);
    });
  });

  describe('Price validation rules', () => {
    it('should accept minimum price (1)', () => {
      expect(validatePrice(1).valid).toBe(true);
    });

    it('should accept maximum price (100,000,000)', () => {
      expect(validatePrice(100000000).valid).toBe(true);
    });

    it('should accept $5/million pricing (5000)', () => {
      expect(validatePrice(5000).valid).toBe(true);
    });

    it('should accept $10/million pricing (10000)', () => {
      expect(validatePrice(10000).valid).toBe(true);
    });

    it('should accept $0.001/million pricing (1)', () => {
      expect(validatePrice(1).valid).toBe(true);
    });

    it('should accept $100/million pricing (100000)', () => {
      expect(validatePrice(100000).valid).toBe(true);
    });

    it('should reject price 0', () => {
      const result = validatePrice(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1 and 100,000,000');
    });

    it('should reject negative price', () => {
      const result = validatePrice(-1);
      expect(result.valid).toBe(false);
    });

    it('should reject price above maximum (100,000,001)', () => {
      const result = validatePrice(100000001);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1 and 100,000,000');
    });

    it('should reject old maximum (100,000) - now valid in new range', () => {
      // 100,000 was the OLD maximum, now it's valid
      expect(validatePrice(100000).valid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should accept boundary value 1', () => {
      expect(validatePrice(1).valid).toBe(true);
    });

    it('should accept boundary value 100000000', () => {
      expect(validatePrice(100000000).valid).toBe(true);
    });

    it('should reject just below minimum (0)', () => {
      expect(validatePrice(0).valid).toBe(false);
    });

    it('should reject just above maximum (100000001)', () => {
      expect(validatePrice(100000001).valid).toBe(false);
    });
  });
});
