/**
 * @file Storage Manager User Settings Tests
 * @description Tests for user settings storage methods in StorageManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageManager } from '../../src/managers/StorageManager';
import { UserSettings, UserSettingsVersion } from '../../src/types/settings.types';

describe('StorageManager - User Settings', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = new StorageManager();
  });

  describe('saveUserSettings()', () => {
    it('should throw error if not initialized', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      await expect(storageManager.saveUserSettings(settings)).rejects.toThrow(
        'StorageManager not initialized'
      );
    });

    it('should throw error if settings missing version', async () => {
      // Mock initialized state
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: vi.fn() } };

      const invalidSettings = {
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      } as any;

      await expect(storageManager.saveUserSettings(invalidSettings)).rejects.toThrow(
        'UserSettings must have version and lastUpdated fields'
      );
    });

    it('should throw error if settings missing lastUpdated', async () => {
      // Mock initialized state
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: vi.fn() } };

      const invalidSettings = {
        version: UserSettingsVersion.V1,
        selectedModel: 'test-model',
      } as any;

      await expect(storageManager.saveUserSettings(invalidSettings)).rejects.toThrow(
        'UserSettings must have version and lastUpdated fields'
      );
    });

    it('should save valid settings to S5', async () => {
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut } };

      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        preferredPaymentToken: 'USDC',
      };

      await storageManager.saveUserSettings(settings);

      expect(mockPut).toHaveBeenCalledTimes(1);
      expect(mockPut).toHaveBeenCalledWith('home/user/settings.json', settings);
    });

    it('should throw error on S5 network failure', async () => {
      const mockPut = vi.fn().mockRejectedValue(new Error('Network error'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut } };

      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      await expect(storageManager.saveUserSettings(settings)).rejects.toThrow(
        'Failed to save user settings'
      );
    });

    it('should accept all valid UserSettings fields', async () => {
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut } };

      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        lastUsedModels: ['model1', 'model2'],
        lastHostAddress: '0x1234...',
        preferredHosts: ['0xabcd...'],
        preferredPaymentToken: 'ETH',
        autoApproveAmount: '10.0',
        advancedSettingsExpanded: true,
        theme: 'dark',
      };

      await storageManager.saveUserSettings(settings);

      expect(mockPut).toHaveBeenCalledWith('home/user/settings.json', settings);
    });
  });
});
