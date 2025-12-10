// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host Registration Validation Tests with PRICE_PRECISION
 *
 * Verifies that host registration validates pricing against new PRICE_PRECISION ranges.
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_PRECISION,
  MIN_PRICE_NATIVE,
  MAX_PRICE_NATIVE,
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE,
  DEFAULT_PRICE_NATIVE,
  DEFAULT_PRICE_STABLE
} from '../../src/managers/HostManager';

describe('Host Registration Validation with PRICE_PRECISION', () => {
  // Test helper to validate price ranges (simulating HostManager validation)
  function validateNativePrice(price: bigint): { valid: boolean; error?: string } {
    if (price < MIN_PRICE_NATIVE || price > MAX_PRICE_NATIVE) {
      return {
        valid: false,
        error: `minPricePerTokenNative must be between ${MIN_PRICE_NATIVE} and ${MAX_PRICE_NATIVE} wei, got ${price}`
      };
    }
    return { valid: true };
  }

  function validateStablePrice(price: bigint): { valid: boolean; error?: string } {
    if (price < MIN_PRICE_STABLE || price > MAX_PRICE_STABLE) {
      return {
        valid: false,
        error: `minPricePerTokenStable must be between ${MIN_PRICE_STABLE} and ${MAX_PRICE_STABLE}, got ${price}`
      };
    }
    return { valid: true };
  }

  describe('Stable pricing validation (USDC)', () => {
    it('should accept minimum stable price (1)', () => {
      const result = validateStablePrice(1n);
      expect(result.valid).toBe(true);
    });

    it('should accept maximum stable price (100,000,000)', () => {
      const result = validateStablePrice(100_000_000n);
      expect(result.valid).toBe(true);
    });

    it('should accept default stable price (5000)', () => {
      const result = validateStablePrice(BigInt(DEFAULT_PRICE_STABLE));
      expect(result.valid).toBe(true);
    });

    it('should reject price below minimum (0)', () => {
      const result = validateStablePrice(0n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between 1');
    });

    it('should reject price above maximum (100,000,001)', () => {
      const result = validateStablePrice(100_000_001n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between');
    });

    it('should accept budget pricing ($0.06/million = 60)', () => {
      // $0.06/million = pricePerToken 60
      const result = validateStablePrice(60n);
      expect(result.valid).toBe(true);
    });

    it('should accept budget pricing ($0.27/million = 270)', () => {
      // $0.27/million = pricePerToken 270
      const result = validateStablePrice(270n);
      expect(result.valid).toBe(true);
    });

    it('should accept standard pricing ($5/million = 5000)', () => {
      const result = validateStablePrice(5000n);
      expect(result.valid).toBe(true);
    });

    it('should accept premium pricing ($50/million = 50000)', () => {
      const result = validateStablePrice(50000n);
      expect(result.valid).toBe(true);
    });
  });

  describe('Native pricing validation (ETH/BNB)', () => {
    it('should accept minimum native price (227,273)', () => {
      const result = validateNativePrice(227_273n);
      expect(result.valid).toBe(true);
    });

    it('should accept maximum native price', () => {
      const result = validateNativePrice(22_727_272_727_273_000n);
      expect(result.valid).toBe(true);
    });

    it('should accept default native price (3,000,000)', () => {
      const result = validateNativePrice(BigInt(DEFAULT_PRICE_NATIVE));
      expect(result.valid).toBe(true);
    });

    it('should reject price below minimum (100,000)', () => {
      const result = validateNativePrice(100_000n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between');
    });

    it('should reject price above maximum', () => {
      const result = validateNativePrice(22_727_272_727_273_001n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be between');
    });
  });

  describe('Constants consistency check', () => {
    it('should have PRICE_PRECISION = 1000n', () => {
      expect(PRICE_PRECISION).toBe(1000n);
    });

    it('should have updated MIN_PRICE_STABLE for sub-$1/million support', () => {
      // MIN_PRICE_STABLE = 1 allows $0.001/million pricing
      expect(MIN_PRICE_STABLE).toBe(1n);
    });

    it('should have updated MAX_PRICE_STABLE for wide range', () => {
      // MAX_PRICE_STABLE = 100,000,000 allows up to $100,000/million
      expect(MAX_PRICE_STABLE).toBe(100_000_000n);
    });

    it('should have updated MIN_PRICE_NATIVE', () => {
      // MIN_PRICE_NATIVE = 227,273 (~$0.001/million @ $4400 ETH)
      expect(MIN_PRICE_NATIVE).toBe(227_273n);
    });

    it('should have updated MAX_PRICE_NATIVE', () => {
      // MAX_PRICE_NATIVE for ~$100,000/million @ $4400 ETH
      expect(MAX_PRICE_NATIVE).toBe(22_727_272_727_273_000n);
    });
  });
});
