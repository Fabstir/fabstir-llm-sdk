// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file User Settings V2 Types Tests
 * @description Tests for UserSettings V2 schema with model and host selection preferences
 */

import { describe, it, expect } from 'vitest';
import {
  UserSettings,
  UserSettingsVersion,
  HostSelectionMode,
  PartialUserSettings,
} from '../../src/types/settings.types';

describe('UserSettings V2 Types', () => {
  describe('HostSelectionMode enum', () => {
    it('should have AUTO value', () => {
      expect(HostSelectionMode.AUTO).toBe('auto');
    });

    it('should have CHEAPEST value', () => {
      expect(HostSelectionMode.CHEAPEST).toBe('cheapest');
    });

    it('should have RELIABLE value', () => {
      expect(HostSelectionMode.RELIABLE).toBe('reliable');
    });

    it('should have FASTEST value', () => {
      expect(HostSelectionMode.FASTEST).toBe('fastest');
    });

    it('should have SPECIFIC value', () => {
      expect(HostSelectionMode.SPECIFIC).toBe('specific');
    });

    it('should have exactly 5 modes', () => {
      const modes = Object.values(HostSelectionMode);
      expect(modes).toHaveLength(5);
      expect(modes).toContain('auto');
      expect(modes).toContain('cheapest');
      expect(modes).toContain('reliable');
      expect(modes).toContain('fastest');
      expect(modes).toContain('specific');
    });
  });

  describe('UserSettingsVersion enum', () => {
    it('should have V1 value of 1', () => {
      expect(UserSettingsVersion.V1).toBe(1);
    });

    it('should have V2 value of 2', () => {
      expect(UserSettingsVersion.V2).toBe(2);
    });
  });

  describe('UserSettings V2 interface', () => {
    it('should include defaultModelId field', () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      expect(settings.defaultModelId).toBe(
        '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced'
      );
    });

    it('should include hostSelectionMode field', () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.CHEAPEST,
        preferredHostAddress: null,
      };

      expect(settings.hostSelectionMode).toBe(HostSelectionMode.CHEAPEST);
    });

    it('should include preferredHostAddress field', () => {
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: hostAddress,
      };

      expect(settings.preferredHostAddress).toBe(hostAddress);
    });

    it('should accept null for defaultModelId when no default set', () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      expect(settings.defaultModelId).toBeNull();
    });

    it('should accept null for preferredHostAddress when not in SPECIFIC mode', () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      expect(settings.preferredHostAddress).toBeNull();
    });

    it('should preserve all existing V1 fields', () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
        // V1 fields
        lastUsedModels: ['model1', 'model2'],
        lastHostAddress: '0x1234567890123456789012345678901234567890',
        preferredHosts: ['0xabcd...'],
        preferredPaymentToken: 'USDC',
        autoApproveAmount: '10.0',
        advancedSettingsExpanded: true,
        theme: 'dark',
      };

      expect(settings.lastUsedModels).toEqual(['model1', 'model2']);
      expect(settings.preferredPaymentToken).toBe('USDC');
      expect(settings.theme).toBe('dark');
    });
  });

  describe('PartialUserSettings with V2 fields', () => {
    it('should allow updating defaultModelId', () => {
      const partial: PartialUserSettings = {
        defaultModelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
      };

      expect(partial.defaultModelId).toBe(
        '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced'
      );
    });

    it('should allow updating hostSelectionMode', () => {
      const partial: PartialUserSettings = {
        hostSelectionMode: HostSelectionMode.RELIABLE,
      };

      expect(partial.hostSelectionMode).toBe(HostSelectionMode.RELIABLE);
    });

    it('should allow updating preferredHostAddress', () => {
      const partial: PartialUserSettings = {
        preferredHostAddress: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
      };

      expect(partial.preferredHostAddress).toBe('0x4594F755F593B517Bb3194F4DeC20C48a3f04504');
    });

    it('should allow updating multiple V2 fields together', () => {
      const partial: PartialUserSettings = {
        defaultModelId: '0xabc123',
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: '0x4594F755F593B517Bb3194F4DeC20C48a3f04504',
      };

      expect(partial.defaultModelId).toBe('0xabc123');
      expect(partial.hostSelectionMode).toBe(HostSelectionMode.SPECIFIC);
      expect(partial.preferredHostAddress).toBe('0x4594F755F593B517Bb3194F4DeC20C48a3f04504');
    });
  });
});
