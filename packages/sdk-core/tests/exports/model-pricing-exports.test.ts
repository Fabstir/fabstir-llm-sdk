// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Model Pricing Export Tests
 * Phase 18: Updated for per-model per-token pricing (no fallbacks)
 *
 * Verifies that ModelPricing type and HostManager methods are properly
 * exported from the SDK package root.
 */

import { describe, it, expect } from 'vitest';
import { HostManager } from '../../src/index';
import type { ModelPricing } from '../../src/index';

describe('Model Pricing Exports', () => {
  describe('ModelPricing Type', () => {
    it('should be importable from package root with per-token shape', () => {
      // Phase 18: single price per (model, token) pair
      const pricing: ModelPricing = {
        modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        price: 50000n
      };

      expect(pricing.modelId).toBeDefined();
      expect(typeof pricing.price).toBe('bigint');
    });
  });

  describe('HostManager Methods', () => {
    it('should have setModelTokenPricing method', () => {
      expect(typeof HostManager.prototype.setModelTokenPricing).toBe('function');
    });

    it('should have clearModelTokenPricing method', () => {
      expect(typeof HostManager.prototype.clearModelTokenPricing).toBe('function');
    });

    it('should have getHostModelPrices method', () => {
      expect(typeof HostManager.prototype.getHostModelPrices).toBe('function');
    });

    it('should have getModelPricing method', () => {
      expect(typeof HostManager.prototype.getModelPricing).toBe('function');
    });
  });
});
