// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file UserSettings V1 → V2 Migration Tests
 * @description Tests for migrating UserSettings from V1 to V2 schema
 */

import { describe, it, expect } from 'vitest';
import {
  UserSettingsVersion,
  HostSelectionMode,
} from '../../src/types/settings.types';
import { migrateUserSettings } from '../../src/managers/migrations/user-settings';

describe('UserSettings V1 → V2 Migration', () => {
  describe('Basic Migration', () => {
    it('should migrate V1 settings to V2 with default values', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
      };

      const migrated = migrateUserSettings(v1Settings);

      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.defaultModelId).toBeNull();
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(migrated.preferredHostAddress).toBeNull();
    });

    it('should pass V2 settings through unchanged', () => {
      const v2Settings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: '0xabc123',
        hostSelectionMode: HostSelectionMode.CHEAPEST,
        preferredHostAddress: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
      };

      const migrated = migrateUserSettings(v2Settings);

      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.defaultModelId).toBe('0xabc123');
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.CHEAPEST);
      expect(migrated.preferredHostAddress).toBe('0x4594F755F593B517Bb3194F4DeC20C48a3f04504');
    });

    it('should preserve existing V1 fields during migration', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: 1702700000000,
        selectedModel: 'model-1',
        lastUsedModels: ['model-a', 'model-b'],
        lastHostAddress: '0x1234567890123456789012345678901234567890',
        preferredHosts: ['0xabcd...', '0xefgh...'],
        preferredPaymentToken: 'USDC' as const,
        autoApproveAmount: '10.0',
        advancedSettingsExpanded: true,
        theme: 'dark' as const,
      };

      const migrated = migrateUserSettings(v1Settings);

      // Verify V2 fields added
      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.defaultModelId).toBeNull();
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(migrated.preferredHostAddress).toBeNull();

      // Verify V1 fields preserved
      expect(migrated.selectedModel).toBe('model-1');
      expect(migrated.lastUsedModels).toEqual(['model-a', 'model-b']);
      expect(migrated.lastHostAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(migrated.preferredHosts).toEqual(['0xabcd...', '0xefgh...']);
      expect(migrated.preferredPaymentToken).toBe('USDC');
      expect(migrated.autoApproveAmount).toBe('10.0');
      expect(migrated.advancedSettingsExpanded).toBe(true);
      expect(migrated.theme).toBe('dark');
      expect(migrated.lastUpdated).toBe(1702700000000);
    });
  });

  describe('Default Values', () => {
    it('should set defaultModelId to null', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const migrated = migrateUserSettings(v1Settings);
      expect(migrated.defaultModelId).toBeNull();
    });

    it('should set hostSelectionMode to AUTO', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const migrated = migrateUserSettings(v1Settings);
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.AUTO);
    });

    it('should set preferredHostAddress to null', () => {
      const v1Settings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const migrated = migrateUserSettings(v1Settings);
      expect(migrated.preferredHostAddress).toBeNull();
    });
  });

  describe('V2 Passthrough', () => {
    it('should not modify V2 settings with SPECIFIC mode', () => {
      const v2Settings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'model-1',
        defaultModelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
      };

      const migrated = migrateUserSettings(v2Settings);

      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.SPECIFIC);
      expect(migrated.preferredHostAddress).toBe('0x4594F755F593B517Bb3194F4DeC20C48a3f04504');
      expect(migrated.defaultModelId).toBe('0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced');
    });

    it('should not modify V2 settings with RELIABLE mode', () => {
      const v2Settings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'model-1',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.RELIABLE,
        preferredHostAddress: null,
      };

      const migrated = migrateUserSettings(v2Settings);
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.RELIABLE);
    });
  });

  describe('Migration Integrity', () => {
    it('should not modify original V1 object', () => {
      const original = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'original-model',
        theme: 'light' as const,
      };

      const originalCopy = JSON.parse(JSON.stringify(original));
      migrateUserSettings(original);

      expect(original).toEqual(originalCopy);
    });

    it('should handle minimal V1 settings', () => {
      const minimalV1 = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'minimal-model',
      };

      const migrated = migrateUserSettings(minimalV1);

      expect(migrated.version).toBe(UserSettingsVersion.V2);
      expect(migrated.selectedModel).toBe('minimal-model');
      expect(migrated.defaultModelId).toBeNull();
      expect(migrated.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(migrated.preferredHostAddress).toBeNull();
    });
  });
});
