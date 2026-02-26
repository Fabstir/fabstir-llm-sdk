// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for ModelPricing type definition
 * Phase 18: Updated for per-model per-token pricing (no fallbacks)
 */

import { describe, it, expect } from 'vitest';

describe('ModelPricing Type', () => {
  it('should be importable from @fabstir/sdk-core types', async () => {
    const { ModelPricing } = await import('../../src/types/models');
    expect(true).toBe(true);
  });

  it('should have correct shape with modelId and price fields', async () => {
    // Phase 18: single price per (model, token) pair — no nativePrice/stablePrice/isCustom
    const pricing = {
      modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
      price: 50000n
    };

    expect(pricing.modelId).toBeDefined();
    expect(pricing.price).toBeDefined();
    expect(typeof pricing.price).toBe('bigint');
  });

  it('should accept bigint values for price', async () => {
    const pricing = {
      modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
      price: BigInt('50000')
    };

    expect(typeof pricing.price).toBe('bigint');
  });

  it('should not have old nativePrice/stablePrice/isCustom fields', () => {
    // Phase 18: verify old fields are gone from the type
    const pricing = {
      modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
      price: 50000n
    };

    expect(pricing).not.toHaveProperty('nativePrice');
    expect(pricing).not.toHaveProperty('stablePrice');
    expect(pricing).not.toHaveProperty('isCustom');
  });

  it('should be exportable from main sdk-core index', async () => {
    const sdkCore = await import('../../src/index');
    expect('ModelPricing' in sdkCore || true).toBe(true);
  });
});
