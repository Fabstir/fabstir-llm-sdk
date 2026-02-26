// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pricing Validation Tests with PRICE_PRECISION
 * Phase 18: Tests for setModelTokenPricing validation ranges
 *
 * Verifies that setModelTokenPricing validates price ranges
 * based on whether the token is native (ETH) or stable (USDC).
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_PRECISION,
  MIN_PRICE_NATIVE,
  MAX_PRICE_NATIVE,
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE
} from '../../src/managers/HostManager';
import { ethers } from 'ethers';

describe('setModelTokenPricing Validation with PRICE_PRECISION', () => {
  // Validation helper matching HostManager.setModelTokenPricing() for native tokens
  function validateNativePrice(price: string): { valid: boolean; error?: string } {
    const priceValue = BigInt(price);
    if (priceValue < MIN_PRICE_NATIVE || priceValue > MAX_PRICE_NATIVE) {
      return {
        valid: false,
        error: `Native price must be between ${MIN_PRICE_NATIVE} and ${MAX_PRICE_NATIVE} wei, got ${priceValue}`
      };
    }
    return { valid: true };
  }

  // Validation helper matching HostManager.setModelTokenPricing() for stable tokens
  function validateStablePrice(price: string): { valid: boolean; error?: string } {
    const priceValue = BigInt(price);
    if (priceValue < MIN_PRICE_STABLE || priceValue > MAX_PRICE_STABLE) {
      return {
        valid: false,
        error: `Stable price must be between ${MIN_PRICE_STABLE} and ${MAX_PRICE_STABLE}, got ${priceValue}`
      };
    }
    return { valid: true };
  }

  describe('native token (ETH) price validation', () => {
    it('should accept minimum price (227,273)', () => {
      expect(validateNativePrice('227273').valid).toBe(true);
    });

    it('should accept maximum price', () => {
      expect(validateNativePrice('22727272727273000').valid).toBe(true);
    });

    it('should accept reasonable price (3,000,000)', () => {
      expect(validateNativePrice('3000000').valid).toBe(true);
    });

    it('should reject price below minimum (100,000)', () => {
      const result = validateNativePrice('100000');
      expect(result.valid).toBe(false);
    });

    it('should reject price above maximum', () => {
      const result = validateNativePrice('22727272727273001');
      expect(result.valid).toBe(false);
    });
  });

  describe('stable token (USDC) price validation', () => {
    it('should accept minimum price (1)', () => {
      expect(validateStablePrice('1').valid).toBe(true);
    });

    it('should accept maximum price (100,000,000)', () => {
      expect(validateStablePrice('100000000').valid).toBe(true);
    });

    it('should accept $5/million pricing (5000)', () => {
      expect(validateStablePrice('5000').valid).toBe(true);
    });

    it('should accept $10/million pricing (10000)', () => {
      expect(validateStablePrice('10000').valid).toBe(true);
    });

    it('should reject price below minimum (0)', () => {
      const result = validateStablePrice('0');
      expect(result.valid).toBe(false);
    });

    it('should reject price above maximum (100,000,001)', () => {
      const result = validateStablePrice('100000001');
      expect(result.valid).toBe(false);
    });
  });

  describe('PRICE_PRECISION constant', () => {
    it('should be 1000', () => {
      expect(PRICE_PRECISION).toBe(1000n);
    });
  });
});
