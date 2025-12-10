// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Price Precision Constants Tests
 *
 * Verifies that all pricing constants are correctly updated for PRICE_PRECISION=1000
 * These constants must match the deployed contract values.
 */

import { describe, it, expect } from 'vitest';
import {
  PRICE_PRECISION,
  MIN_PRICE_NATIVE,
  MAX_PRICE_NATIVE,
  DEFAULT_PRICE_NATIVE,
  MIN_PRICE_STABLE,
  MAX_PRICE_STABLE,
  DEFAULT_PRICE_STABLE,
  MIN_PRICE_PER_TOKEN,
  MAX_PRICE_PER_TOKEN,
  DEFAULT_PRICE_PER_TOKEN,
  DEFAULT_PRICE_PER_TOKEN_NUMBER
} from '../../src/managers/HostManager';

describe('Price Precision Constants', () => {
  describe('PRICE_PRECISION', () => {
    it('should be 1000n', () => {
      expect(PRICE_PRECISION).toBe(1000n);
    });

    it('should be a bigint', () => {
      expect(typeof PRICE_PRECISION).toBe('bigint');
    });
  });

  describe('Native Token Pricing (ETH/BNB)', () => {
    it('should have correct MIN_PRICE_NATIVE', () => {
      // ~$0.001/million @ $4400 ETH
      expect(MIN_PRICE_NATIVE).toBe(227_273n);
    });

    it('should have correct MAX_PRICE_NATIVE', () => {
      // ~$100,000/million @ $4400 ETH
      expect(MAX_PRICE_NATIVE).toBe(22_727_272_727_273_000n);
    });

    it('should have correct DEFAULT_PRICE_NATIVE', () => {
      // ~$0.013/million @ $4400 ETH (reasonable default)
      expect(DEFAULT_PRICE_NATIVE).toBe('3000000');
    });

    it('should have valid range (min < max)', () => {
      expect(MIN_PRICE_NATIVE).toBeLessThan(MAX_PRICE_NATIVE);
    });

    it('should have default within range', () => {
      const defaultValue = BigInt(DEFAULT_PRICE_NATIVE);
      expect(defaultValue).toBeGreaterThanOrEqual(MIN_PRICE_NATIVE);
      expect(defaultValue).toBeLessThanOrEqual(MAX_PRICE_NATIVE);
    });
  });

  describe('Stablecoin Pricing (USDC)', () => {
    it('should have correct MIN_PRICE_STABLE', () => {
      // $0.001 per million tokens
      expect(MIN_PRICE_STABLE).toBe(1n);
    });

    it('should have correct MAX_PRICE_STABLE', () => {
      // $100,000 per million tokens
      expect(MAX_PRICE_STABLE).toBe(100_000_000n);
    });

    it('should have correct DEFAULT_PRICE_STABLE', () => {
      // $5/million tokens (5 * 1000 = 5000)
      expect(DEFAULT_PRICE_STABLE).toBe('5000');
    });

    it('should have valid range (min < max)', () => {
      expect(MIN_PRICE_STABLE).toBeLessThan(MAX_PRICE_STABLE);
    });

    it('should have default within range', () => {
      const defaultValue = BigInt(DEFAULT_PRICE_STABLE);
      expect(defaultValue).toBeGreaterThanOrEqual(MIN_PRICE_STABLE);
      expect(defaultValue).toBeLessThanOrEqual(MAX_PRICE_STABLE);
    });
  });

  describe('Legacy Constants (backward compatibility)', () => {
    it('should have MIN_PRICE_PER_TOKEN equal to MIN_PRICE_STABLE', () => {
      expect(MIN_PRICE_PER_TOKEN).toBe(MIN_PRICE_STABLE);
    });

    it('should have MAX_PRICE_PER_TOKEN equal to MAX_PRICE_STABLE', () => {
      expect(MAX_PRICE_PER_TOKEN).toBe(MAX_PRICE_STABLE);
    });

    it('should have DEFAULT_PRICE_PER_TOKEN equal to DEFAULT_PRICE_STABLE', () => {
      expect(DEFAULT_PRICE_PER_TOKEN).toBe(DEFAULT_PRICE_STABLE);
    });

    it('should have DEFAULT_PRICE_PER_TOKEN_NUMBER as number version', () => {
      expect(DEFAULT_PRICE_PER_TOKEN_NUMBER).toBe(5000);
      expect(typeof DEFAULT_PRICE_PER_TOKEN_NUMBER).toBe('number');
    });
  });

  describe('Price Conversion Formulas', () => {
    it('should correctly convert USD/million to pricePerToken', () => {
      // $5/million tokens = 5000 pricePerToken
      const usdPerMillion = 5;
      const expectedPricePerToken = usdPerMillion * Number(PRICE_PRECISION);
      expect(expectedPricePerToken).toBe(5000);
    });

    it('should correctly calculate max tokens from deposit', () => {
      // With $10 deposit and $5/million price:
      // maxTokens = (deposit * PRICE_PRECISION) / pricePerToken
      // = (10_000_000 * 1000) / 5000 = 2_000_000 tokens
      const depositUsdc = 10_000_000n; // 10 USDC in 6 decimals
      const pricePerToken = 5000n; // $5/million
      const maxTokens = (depositUsdc * PRICE_PRECISION) / pricePerToken;
      expect(maxTokens).toBe(2_000_000n);
    });

    it('should correctly calculate host payment from tokens used', () => {
      // With 1,000,000 tokens at $5/million:
      // hostPayment = (tokensUsed * pricePerToken) / PRICE_PRECISION
      // = (1_000_000 * 5000) / 1000 = 5_000_000 USDC units = $5
      const tokensUsed = 1_000_000n;
      const pricePerToken = 5000n;
      const hostPayment = (tokensUsed * pricePerToken) / PRICE_PRECISION;
      expect(hostPayment).toBe(5_000_000n);
    });

    it('should support sub-$1/million pricing', () => {
      // $0.06/million (budget model) = pricePerToken 60
      const budgetPrice = 60n;
      expect(budgetPrice).toBeGreaterThanOrEqual(MIN_PRICE_STABLE);

      // Calculate cost for 1M tokens at $0.06/million
      const tokensUsed = 1_000_000n;
      const cost = (tokensUsed * budgetPrice) / PRICE_PRECISION;
      expect(cost).toBe(60_000n); // 0.06 USDC in 6 decimals
    });
  });
});
