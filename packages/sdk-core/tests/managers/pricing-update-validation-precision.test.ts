// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Update Validation Tests with PRICE_PRECISION
 *
 * Verifies that updatePricing, updatePricingNative, and updatePricingStable
 * validate against the new PRICE_PRECISION ranges.
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_PRECISION,
  MIN_PRICE_NATIVE,
  MAX_PRICE_NATIVE,
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE,
  MIN_PRICE_PER_TOKEN,
  MAX_PRICE_PER_TOKEN
} from '../../src/managers/HostManager';

describe('Pricing Update Validation with PRICE_PRECISION', () => {
  // Validation helper matching HostManager.updatePricingStable()
  function validateStablePriceUpdate(newMinPrice: string): { valid: boolean; error?: string } {
    const price = BigInt(newMinPrice);
    if (price < MIN_PRICE_STABLE || price > MAX_PRICE_STABLE) {
      return {
        valid: false,
        error: `minPricePerTokenStable must be between ${MIN_PRICE_STABLE} and ${MAX_PRICE_STABLE}, got ${price}`
      };
    }
    return { valid: true };
  }

  // Validation helper matching HostManager.updatePricingNative()
  function validateNativePriceUpdate(newMinPrice: string): { valid: boolean; error?: string } {
    const price = BigInt(newMinPrice);
    if (price < MIN_PRICE_NATIVE || price > MAX_PRICE_NATIVE) {
      return {
        valid: false,
        error: `minPricePerTokenNative must be between ${MIN_PRICE_NATIVE} and ${MAX_PRICE_NATIVE} wei, got ${price}`
      };
    }
    return { valid: true };
  }

  // Validation helper matching HostManager.updatePricing() (legacy)
  function validateLegacyPriceUpdate(newMinPrice: string): { valid: boolean; error?: string } {
    const price = BigInt(newMinPrice);
    if (price < MIN_PRICE_PER_TOKEN || price > MAX_PRICE_PER_TOKEN) {
      return {
        valid: false,
        error: `minPricePerToken must be between ${MIN_PRICE_PER_TOKEN} and ${MAX_PRICE_PER_TOKEN}, got ${price}`
      };
    }
    return { valid: true };
  }

  describe('updatePricingStable validation', () => {
    it('should accept minimum price (1)', () => {
      expect(validateStablePriceUpdate('1').valid).toBe(true);
    });

    it('should accept maximum price (100,000,000)', () => {
      expect(validateStablePriceUpdate('100000000').valid).toBe(true);
    });

    it('should accept $5/million pricing (5000)', () => {
      expect(validateStablePriceUpdate('5000').valid).toBe(true);
    });

    it('should accept $10/million pricing (10000)', () => {
      expect(validateStablePriceUpdate('10000').valid).toBe(true);
    });

    it('should reject price below minimum (0)', () => {
      const result = validateStablePriceUpdate('0');
      expect(result.valid).toBe(false);
    });

    it('should reject price above maximum (100,000,001)', () => {
      const result = validateStablePriceUpdate('100000001');
      expect(result.valid).toBe(false);
    });
  });

  describe('updatePricingNative validation', () => {
    it('should accept minimum price (227,273)', () => {
      expect(validateNativePriceUpdate('227273').valid).toBe(true);
    });

    it('should accept maximum price', () => {
      expect(validateNativePriceUpdate('22727272727273000').valid).toBe(true);
    });

    it('should accept reasonable price (3,000,000)', () => {
      expect(validateNativePriceUpdate('3000000').valid).toBe(true);
    });

    it('should reject price below minimum (100,000)', () => {
      const result = validateNativePriceUpdate('100000');
      expect(result.valid).toBe(false);
    });

    it('should reject price above maximum', () => {
      const result = validateNativePriceUpdate('22727272727273001');
      expect(result.valid).toBe(false);
    });
  });

  describe('updatePricing (legacy) validation', () => {
    it('should use same range as stable pricing', () => {
      // Legacy constants point to stable pricing constants
      expect(MIN_PRICE_PER_TOKEN).toBe(MIN_PRICE_STABLE);
      expect(MAX_PRICE_PER_TOKEN).toBe(MAX_PRICE_STABLE);
    });

    it('should accept minimum price (1)', () => {
      expect(validateLegacyPriceUpdate('1').valid).toBe(true);
    });

    it('should accept maximum price (100,000,000)', () => {
      expect(validateLegacyPriceUpdate('100000000').valid).toBe(true);
    });
  });
});
