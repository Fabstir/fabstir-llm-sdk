/**
 * @file User Settings Types Tests
 * @description Tests for UserSettings interface and related types
 */

import { describe, it, expect } from 'vitest';
import {
  UserSettings,
  UserSettingsVersion,
  PartialUserSettings,
} from '../../src/types/settings.types';

describe('UserSettings Types', () => {
  describe('UserSettingsVersion enum', () => {
    it('should have V1 value', () => {
      expect(UserSettingsVersion.V1).toBe(1);
    });
  });

  describe('UserSettings interface', () => {
    it('should accept valid settings object', () => {
      const validSettings: UserSettings = {
        version: 1 as UserSettingsVersion,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        lastUsedModels: ['model1', 'model2'],
        lastHostAddress: '0x1234567890123456789012345678901234567890',
        preferredHosts: ['0xabcd...', '0xefgh...'],
        preferredPaymentToken: 'USDC',
        autoApproveAmount: '10.0',
        advancedSettingsExpanded: true,
        theme: 'dark',
      };

      expect(validSettings.version).toBe(1);
      expect(validSettings.selectedModel).toBe('tiny-vicuna-1b.q4_k_m.gguf');
    });

    it('should require version and lastUpdated fields', () => {
      const settings: UserSettings = {
        version: 1 as UserSettingsVersion,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      expect(settings.version).toBeDefined();
      expect(settings.lastUpdated).toBeDefined();
      expect(settings.selectedModel).toBeDefined();
    });

    it('should accept optional fields', () => {
      const minimalSettings: UserSettings = {
        version: 1 as UserSettingsVersion,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        // All other fields are optional
      };

      expect(minimalSettings.lastUsedModels).toBeUndefined();
      expect(minimalSettings.preferredHosts).toBeUndefined();
    });
  });

  describe('PartialUserSettings type', () => {
    it('should allow partial updates without version/lastUpdated', () => {
      const partial: PartialUserSettings = {
        selectedModel: 'new-model',
      };

      expect(partial.selectedModel).toBe('new-model');
      // version and lastUpdated should not be allowed
      // TypeScript will catch this at compile time
    });

    it('should allow multiple optional fields', () => {
      const partial: PartialUserSettings = {
        selectedModel: 'model-1',
        preferredPaymentToken: 'ETH',
        theme: 'light',
      };

      expect(partial.selectedModel).toBe('model-1');
      expect(partial.preferredPaymentToken).toBe('ETH');
      expect(partial.theme).toBe('light');
    });

    it('should allow empty partial', () => {
      const partial: PartialUserSettings = {};
      expect(Object.keys(partial).length).toBe(0);
    });
  });
});
