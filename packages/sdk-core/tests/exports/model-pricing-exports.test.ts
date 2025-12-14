// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Model Pricing Export Tests
 * Sub-phase 4.1: Verify exports for per-model pricing feature
 *
 * Verifies that ModelPricing type and HostManager methods are properly
 * exported from the SDK package root.
 */

import { describe, it, expect } from 'vitest';
import { HostManager } from '../../src/index';
import type { ModelPricing } from '../../src/index';

describe('Model Pricing Exports', () => {
  describe('ModelPricing Type', () => {
    it('should be importable from package root', () => {
      // Type-level verification - if this compiles, the type is exported
      const pricing: ModelPricing = {
        modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        nativePrice: 3000000n,
        stablePrice: 50000n,
        isCustom: false
      };

      expect(pricing.modelId).toBeDefined();
      expect(typeof pricing.nativePrice).toBe('bigint');
      expect(typeof pricing.stablePrice).toBe('bigint');
      expect(typeof pricing.isCustom).toBe('boolean');
    });
  });

  describe('HostManager Methods', () => {
    it('should have setModelPricing method', () => {
      expect(typeof HostManager.prototype.setModelPricing).toBe('function');
    });

    it('should have clearModelPricing method', () => {
      expect(typeof HostManager.prototype.clearModelPricing).toBe('function');
    });

    it('should have getHostModelPrices method', () => {
      expect(typeof HostManager.prototype.getHostModelPrices).toBe('function');
    });

    it('should have getModelPricing method', () => {
      expect(typeof HostManager.prototype.getModelPricing).toBe('function');
    });
  });
});
