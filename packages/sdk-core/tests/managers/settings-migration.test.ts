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
  });
});
