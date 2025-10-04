/**
 * @file UserSettings Migration Tests
 * @description Tests for UserSettings schema migration system
 */

import { describe, it, expect } from 'vitest';
import { UserSettings, UserSettingsVersion } from '../../src/types/settings.types';
import { migrateUserSettings } from '../../src/managers/migrations/user-settings';

describe('UserSettings Migration', () => {
  describe('V1 Migration', () => {
    it('should pass V1 settings through unchanged', () => {
      const v1Settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      const migrated = migrateUserSettings(v1Settings);
      expect(migrated).toEqual(v1Settings);
      expect(migrated.version).toBe(UserSettingsVersion.V1);
    });

    it('should preserve all V1 fields', () => {
      const v1Settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-1',
        lastUsedModels: ['model-a', 'model-b'],
        lastHostAddress: '0x1234...',
        preferredHosts: ['0xabcd...'],
        preferredPaymentToken: 'ETH',
        autoApproveAmount: '10.0',
        advancedSettingsExpanded: true,
        theme: 'light',
      };

      const migrated = migrateUserSettings(v1Settings);
      expect(migrated.selectedModel).toBe('model-1');
      expect(migrated.lastUsedModels).toEqual(['model-a', 'model-b']);
      expect(migrated.lastHostAddress).toBe('0x1234...');
      expect(migrated.preferredHosts).toEqual(['0xabcd...']);
      expect(migrated.preferredPaymentToken).toBe('ETH');
      expect(migrated.autoApproveAmount).toBe('10.0');
      expect(migrated.advancedSettingsExpanded).toBe(true);
      expect(migrated.theme).toBe('light');
    });
  });

  describe('Error Handling', () => {
    it('should throw on missing version field', () => {
      const invalidSettings = {
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      expect(() => migrateUserSettings(invalidSettings as any)).toThrow('missing version field');
    });

    it('should throw on unknown version', () => {
      const unknownVersion = {
        version: 999,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      expect(() => migrateUserSettings(unknownVersion as any)).toThrow('Unsupported UserSettings version');
    });

    it('should provide clear error message for unsupported version', () => {
      const futureVersion = {
        version: 99,
        lastUpdated: Date.now(),
        selectedModel: 'future-model',
      };

      try {
        migrateUserSettings(futureVersion as any);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('Unsupported UserSettings version: 99');
      }
    });
  });

  describe('Migration Integrity', () => {
    it('should not modify original object', () => {
      const original: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'original-model',
      };

      const originalCopy = { ...original };
      const migrated = migrateUserSettings(original);

      expect(original).toEqual(originalCopy);
      expect(migrated).toEqual(original);
    });

    it('should handle minimal V1 settings', () => {
      const minimalSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'minimal-model',
      };

      const migrated = migrateUserSettings(minimalSettings);
      expect(migrated.version).toBe(UserSettingsVersion.V1);
      expect(migrated.selectedModel).toBe('minimal-model');
      expect(migrated.lastUpdated).toBeDefined();
    });

    it('should throw on missing lastUpdated field', () => {
      const invalidSettings = {
        version: UserSettingsVersion.V1,
        selectedModel: 'test-model',
        // Missing lastUpdated
      };

      expect(() => migrateUserSettings(invalidSettings as any)).toThrow('missing lastUpdated field');
    });
  });

  describe('Future Migration Scenarios', () => {
    // This test is skipped until V2 is implemented
    it.skip('should migrate V1 to V2 adding new fields', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      // When V2 is implemented, this will test the migration
      // const v2Settings = migrateUserSettings(v1Settings);
      // expect(v2Settings.version).toBe(UserSettingsVersion.V2);
      // expect(v2Settings.newV2Field).toBeDefined();
    });

    // This test is skipped until V2 is implemented
    it.skip('should preserve all V1 fields when migrating to V2', () => {
      const v1Settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-1',
        lastUsedModels: ['model-a'],
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      // When V2 is implemented
      // const v2Settings = migrateUserSettings(v1Settings);
      // expect(v2Settings.selectedModel).toBe('model-1');
      // expect(v2Settings.lastUsedModels).toEqual(['model-a']);
      // expect(v2Settings.preferredPaymentToken).toBe('USDC');
      // expect(v2Settings.theme).toBe('dark');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values', () => {
      const settingsWithEmpty: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: '', // Empty string
      };

      const migrated = migrateUserSettings(settingsWithEmpty);
      expect(migrated.selectedModel).toBe('');
    });

    it('should handle zero timestamp', () => {
      const settingsWithZero: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: 0,
        selectedModel: 'test-model',
      };

      const migrated = migrateUserSettings(settingsWithZero);
      expect(migrated.lastUpdated).toBe(0);
    });

    it('should handle special characters in model name', () => {
      const settingsWithSpecial: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-v1.2.3-beta+build.123',
      };

      const migrated = migrateUserSettings(settingsWithSpecial);
      expect(migrated.selectedModel).toBe('model-v1.2.3-beta+build.123');
    });

    it('should handle empty arrays', () => {
      const settingsWithEmptyArrays: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        lastUsedModels: [],
        preferredHosts: [],
      };

      const migrated = migrateUserSettings(settingsWithEmptyArrays);
      expect(migrated.lastUsedModels).toEqual([]);
      expect(migrated.preferredHosts).toEqual([]);
    });

    it('should handle boolean false values', () => {
      const settingsWithFalse: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        advancedSettingsExpanded: false,
      };

      const migrated = migrateUserSettings(settingsWithFalse);
      expect(migrated.advancedSettingsExpanded).toBe(false);
    });
  });
});
