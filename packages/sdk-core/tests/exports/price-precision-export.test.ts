// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Price Precision Export Tests
 *
 * Verifies that PRICE_PRECISION and all pricing constants are properly
 * exported from the SDK package root.
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
} from '../../src/index';

describe('Price Precision Exports', () => {
  it('should export PRICE_PRECISION from package root', () => {
    expect(PRICE_PRECISION).toBe(1000n);
  });

  it('should export native pricing constants', () => {
    expect(MIN_PRICE_NATIVE).toBe(227_273n);
    expect(MAX_PRICE_NATIVE).toBe(22_727_272_727_273_000n);
    expect(DEFAULT_PRICE_NATIVE).toBe('3000000');
  });

  it('should export stable pricing constants', () => {
    expect(MIN_PRICE_STABLE).toBe(1n);
    expect(MAX_PRICE_STABLE).toBe(100_000_000n);
    expect(DEFAULT_PRICE_STABLE).toBe('5000');
  });

  it('should export legacy constants', () => {
    expect(MIN_PRICE_PER_TOKEN).toBe(MIN_PRICE_STABLE);
    expect(MAX_PRICE_PER_TOKEN).toBe(MAX_PRICE_STABLE);
    expect(DEFAULT_PRICE_PER_TOKEN).toBe(DEFAULT_PRICE_STABLE);
    expect(DEFAULT_PRICE_PER_TOKEN_NUMBER).toBe(5000);
  });
});
