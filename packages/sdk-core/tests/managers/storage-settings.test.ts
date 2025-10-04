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

  describe('getUserSettings()', () => {
    it('should throw error if not initialized', async () => {
      await expect(storageManager.getUserSettings()).rejects.toThrow(
        'StorageManager not initialized'
      );
    });

    it('should return null for first-time user (no settings file)', async () => {
      const mockGet = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      const result = await storageManager.getUserSettings();

      expect(result).toBeNull();
      expect(mockGet).toHaveBeenCalledWith('home/user/settings.json');
    });

    it('should return saved settings', async () => {
      const savedSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      const mockGet = vi.fn().mockResolvedValue(savedSettings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      const result = await storageManager.getUserSettings();

      expect(result).toEqual(savedSettings);
      expect(mockGet).toHaveBeenCalledWith('home/user/settings.json');
    });

    it('should return null if settings file not found', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('File not found'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      const result = await storageManager.getUserSettings();

      expect(result).toBeNull();
    });

    it('should throw error if settings missing version field', async () => {
      const invalidSettings = {
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(invalidSettings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      await expect(storageManager.getUserSettings()).rejects.toThrow(
        'Invalid UserSettings structure'
      );
    });

    it('should throw error if settings missing lastUpdated field', async () => {
      const invalidSettings = {
        version: UserSettingsVersion.V1,
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(invalidSettings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      await expect(storageManager.getUserSettings()).rejects.toThrow(
        'Invalid UserSettings structure'
      );
    });

    it('should throw error on network error (not "not found")', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network timeout'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      await expect(storageManager.getUserSettings()).rejects.toThrow(
        'Failed to load user settings'
      );
    });
  });

  describe('updateUserSettings()', () => {
    it('should throw error if not initialized', async () => {
      const partial: PartialUserSettings = { selectedModel: 'new-model' };

      await expect(storageManager.updateUserSettings(partial)).rejects.toThrow(
        'StorageManager not initialized'
      );
    });

    it('should merge partial update with existing settings', async () => {
      const existingSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - 1000,
        selectedModel: 'old-model',
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      const mockGet = vi.fn().mockResolvedValue(existingSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      const partial: PartialUserSettings = { selectedModel: 'new-model' };

      await storageManager.updateUserSettings(partial);

      expect(mockGet).toHaveBeenCalledWith('home/user/settings.json');
      expect(mockPut).toHaveBeenCalledTimes(1);

      const savedSettings = mockPut.mock.calls[0][1];
      expect(savedSettings.selectedModel).toBe('new-model');
      expect(savedSettings.preferredPaymentToken).toBe('USDC'); // Preserved
      expect(savedSettings.theme).toBe('dark'); // Preserved
      expect(savedSettings.version).toBe(UserSettingsVersion.V1);
      expect(savedSettings.lastUpdated).toBeGreaterThan(existingSettings.lastUpdated);
    });

    it('should preserve unchanged fields', async () => {
      const existingSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - 1000,
        selectedModel: 'model-1',
        lastUsedModels: ['model-a', 'model-b'],
        preferredPaymentToken: 'ETH',
        autoApproveAmount: '5.0',
      };

      const mockGet = vi.fn().mockResolvedValue(existingSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      const partial: PartialUserSettings = { theme: 'light' };

      await storageManager.updateUserSettings(partial);

      const savedSettings = mockPut.mock.calls[0][1];
      expect(savedSettings.selectedModel).toBe('model-1'); // Unchanged
      expect(savedSettings.lastUsedModels).toEqual(['model-a', 'model-b']); // Unchanged
      expect(savedSettings.preferredPaymentToken).toBe('ETH'); // Unchanged
      expect(savedSettings.autoApproveAmount).toBe('5.0'); // Unchanged
      expect(savedSettings.theme).toBe('light'); // Updated
    });

    it('should update lastUpdated timestamp', async () => {
      const oldTimestamp = Date.now() - 5000;
      const existingSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: oldTimestamp,
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(existingSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      await storageManager.updateUserSettings({ theme: 'dark' });

      const savedSettings = mockPut.mock.calls[0][1];
      expect(savedSettings.lastUpdated).toBeGreaterThan(oldTimestamp);
    });

    it('should create new settings if none exist', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      const partial: PartialUserSettings = {
        selectedModel: 'first-model',
        preferredPaymentToken: 'USDC',
      };

      await storageManager.updateUserSettings(partial);

      expect(mockPut).toHaveBeenCalledTimes(1);
      const savedSettings = mockPut.mock.calls[0][1];
      expect(savedSettings.version).toBe(UserSettingsVersion.V1);
      expect(savedSettings.selectedModel).toBe('first-model');
      expect(savedSettings.preferredPaymentToken).toBe('USDC');
      expect(savedSettings.lastUpdated).toBeDefined();
    });

    it('should throw error on network failure', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      const partial: PartialUserSettings = { selectedModel: 'new-model' };

      await expect(storageManager.updateUserSettings(partial)).rejects.toThrow(
        'Failed to update user settings'
      );
    });

    it('should handle empty partial update', async () => {
      const existingSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - 1000,
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(existingSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      await storageManager.updateUserSettings({});

      const savedSettings = mockPut.mock.calls[0][1];
      expect(savedSettings.selectedModel).toBe('test-model'); // Unchanged
      expect(savedSettings.lastUpdated).toBeGreaterThan(existingSettings.lastUpdated);
    });
  });

  describe('clearUserSettings()', () => {
    it('should throw error if not initialized', async () => {
      await expect(storageManager.clearUserSettings()).rejects.toThrow(
        'StorageManager not initialized'
      );
    });

    it('should delete settings file', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { delete: mockDelete } };

      await storageManager.clearUserSettings();

      expect(mockDelete).toHaveBeenCalledWith('home/user/settings.json');
    });

    it('should not throw if settings file does not exist', async () => {
      const mockDelete = vi.fn().mockResolvedValue(false); // Returns false when file doesn't exist
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { delete: mockDelete } };

      await expect(storageManager.clearUserSettings()).resolves.toBeUndefined();
      expect(mockDelete).toHaveBeenCalledWith('home/user/settings.json');
    });

    it('should result in getUserSettings returning null after clear', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockGet = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = {
        fs: {
          delete: mockDelete,
          get: mockGet
        }
      };

      await storageManager.clearUserSettings();
      const settings = await storageManager.getUserSettings();

      expect(mockDelete).toHaveBeenCalledWith('home/user/settings.json');
      expect(settings).toBeNull();
    });

    it('should throw error on network failure', async () => {
      const mockDelete = vi.fn().mockRejectedValue(new Error('Network error'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { delete: mockDelete } };

      await expect(storageManager.clearUserSettings()).rejects.toThrow(
        'Failed to clear user settings'
      );
    });
  });

  describe('Cache with TTL', () => {
    it('should return cached value within TTL', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'cached-model',
      };

      const mockGet = vi.fn().mockResolvedValue(settings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // First call - should hit S5
      const firstResult = await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cache
      const secondResult = await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(1); // Still 1, not 2
      expect(secondResult).toEqual(firstResult);
    });

    it('should expire cache after 5 minutes', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(settings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // First call
      await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Manually expire cache by setting old timestamp
      const cache = (storageManager as any).settingsCache;
      if (cache) {
        cache.timestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      }

      // Second call should fetch from S5 again
      await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should reduce S5 calls with cache hits', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(settings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Make 5 calls
      for (let i = 0; i < 5; i++) {
        await storageManager.getUserSettings();
      }

      // Should only call S5 once (other 4 are cache hits)
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should call S5 on cache miss', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockGet = vi.fn().mockResolvedValue(settings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Ensure no cache
      (storageManager as any).settingsCache = null;

      // Should call S5
      await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should cache null for first-time user', async () => {
      const mockGet = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // First call
      const firstResult = await storageManager.getUserSettings();
      expect(firstResult).toBeNull();
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second call should use cached null
      const secondResult = await storageManager.getUserSettings();
      expect(secondResult).toBeNull();
      expect(mockGet).toHaveBeenCalledTimes(1); // Still 1
    });
  });

  describe('Cache Invalidation', () => {
    it('should update cache after save', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'saved-model',
      };

      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(settings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut, get: mockGet } };

      // Save settings
      await storageManager.saveUserSettings(settings);

      // Get should use cache (not call S5)
      const retrieved = await storageManager.getUserSettings();
      expect(retrieved).toEqual(settings);
      expect(mockGet).toHaveBeenCalledTimes(0); // Should NOT call S5, use cache
    });

    it('should update cache after update', async () => {
      const initialSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - 1000,
        selectedModel: 'old-model',
      };

      const mockGet = vi.fn().mockResolvedValue(initialSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      // Update settings
      await storageManager.updateUserSettings({ selectedModel: 'new-model' });

      // Reset mock call count
      mockGet.mockClear();

      // Get should use cache (not call S5 again)
      const retrieved = await storageManager.getUserSettings();
      expect(retrieved?.selectedModel).toBe('new-model');
      expect(mockGet).toHaveBeenCalledTimes(0); // Should use cache
    });

    it('should invalidate cache after clear', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockDelete = vi.fn().mockResolvedValue(true);
      const mockGet = vi.fn()
        .mockResolvedValueOnce(settings) // First get
        .mockResolvedValueOnce(undefined); // After clear
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { delete: mockDelete, get: mockGet } };

      // Get settings to populate cache
      await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Clear settings
      await storageManager.clearUserSettings();

      // Verify cache is null
      const cache = (storageManager as any).settingsCache;
      expect(cache).toBeNull();

      // Next get should fetch from S5 (cache miss)
      await storageManager.getUserSettings();
      expect(mockGet).toHaveBeenCalledTimes(2); // Called again after clear
    });

    it('should use new cache after save', async () => {
      const settings1: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-1',
      };

      const settings2: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-2',
      };

      const mockPut = vi.fn().mockResolvedValue(undefined);
      const mockGet = vi.fn().mockResolvedValue(settings1);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut, get: mockGet } };

      // Save first settings
      await storageManager.saveUserSettings(settings1);

      // Get should return settings1 from cache
      let retrieved = await storageManager.getUserSettings();
      expect(retrieved?.selectedModel).toBe('model-1');

      // Save second settings
      await storageManager.saveUserSettings(settings2);

      // Get should return settings2 from NEW cache
      retrieved = await storageManager.getUserSettings();
      expect(retrieved?.selectedModel).toBe('model-2');
      expect(mockGet).toHaveBeenCalledTimes(0); // Never called S5 get
    });

    it('should use new cache after update', async () => {
      const initialSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - 1000,
        selectedModel: 'initial-model',
        theme: 'dark',
      };

      const mockGet = vi.fn().mockResolvedValue(initialSettings);
      const mockPut = vi.fn().mockResolvedValue(undefined);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet, put: mockPut } };

      // First update
      await storageManager.updateUserSettings({ selectedModel: 'updated-model-1' });
      mockGet.mockClear();

      // Get should use cache
      let retrieved = await storageManager.getUserSettings();
      expect(retrieved?.selectedModel).toBe('updated-model-1');
      expect(retrieved?.theme).toBe('dark'); // Preserved
      expect(mockGet).toHaveBeenCalledTimes(0);

      // Second update
      await storageManager.updateUserSettings({ theme: 'light' });
      mockGet.mockClear();

      // Get should use NEW cache
      retrieved = await storageManager.getUserSettings();
      expect(retrieved?.selectedModel).toBe('updated-model-1'); // Still preserved
      expect(retrieved?.theme).toBe('light'); // Updated
      expect(mockGet).toHaveBeenCalledTimes(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error with code when S5 not initialized', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      // Don't initialize - s5Client is undefined
      try {
        await storageManager.saveUserSettings(settings);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_NOT_INITIALIZED');
        expect(error.message).toContain('not initialized');
      }
    });

    it('should include error code in save failures', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      const mockPut = vi.fn().mockRejectedValue(new Error('S5 connection failed'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut } };

      try {
        await storageManager.saveUserSettings(settings);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_SAVE_ERROR');
        expect(error.message).toContain('Failed to save user settings');
        expect(error.details?.originalError).toBeDefined();
      }
    });

    it('should include error code in load failures', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network timeout'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      try {
        await storageManager.getUserSettings();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_LOAD_ERROR');
        expect(error.message).toContain('Failed to load user settings');
        expect(error.details?.originalError).toBeDefined();
      }
    });

    it('should include error code for invalid settings structure', async () => {
      const invalidSettings = {
        selectedModel: 'test-model',
        // Missing version and lastUpdated
      };

      const mockGet = vi.fn().mockResolvedValue(invalidSettings);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      try {
        await storageManager.getUserSettings();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('INVALID_SETTINGS_STRUCTURE');
        expect(error.message).toContain('Invalid UserSettings structure');
      }
    });

    it('should include error code in update failures', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Connection refused'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      try {
        await storageManager.updateUserSettings({ selectedModel: 'new-model' });
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_UPDATE_ERROR');
        expect(error.message).toContain('Failed to update user settings');
      }
    });

    it('should include error code in clear failures', async () => {
      const mockDelete = vi.fn().mockRejectedValue(new Error('Permission denied'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { delete: mockDelete } };

      try {
        await storageManager.clearUserSettings();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_CLEAR_ERROR');
        expect(error.message).toContain('Failed to clear user settings');
      }
    });

    it('should preserve original error in details', async () => {
      const originalError = new Error('S5 network timeout');
      const mockPut = vi.fn().mockRejectedValue(originalError);
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { put: mockPut } };

      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      try {
        await storageManager.saveUserSettings(settings);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.details?.originalError).toBe(originalError);
        expect(error.message).toContain('S5 network timeout');
      }
    });

    it('should provide user-friendly error messages', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      try {
        await storageManager.getUserSettings();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Error message should be descriptive, not just raw error
        expect(error.message).toContain('Failed to load user settings');
        expect(error.code).toBe('STORAGE_LOAD_ERROR');
      }
    });
  });

  describe('Offline Mode Support', () => {
    it('should return stale cache on network error', async () => {
      const cachedSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - (10 * 60 * 1000), // 10 minutes old (expired)
        selectedModel: 'cached-model',
      };

      const mockGet = vi.fn().mockRejectedValue(new Error('Network timeout'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Pre-populate cache with expired data
      (storageManager as any).settingsCache = {
        data: cachedSettings,
        timestamp: Date.now() - (10 * 60 * 1000), // Expired (older than 5 min TTL)
      };

      // Should return stale cache instead of throwing
      const result = await storageManager.getUserSettings();
      expect(result).toEqual(cachedSettings);
      expect(result?.selectedModel).toBe('cached-model');
    });

    it('should throw error on network failure with no cache', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('Network timeout'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // No cache
      (storageManager as any).settingsCache = null;

      try {
        await storageManager.getUserSettings();
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.code).toBe('STORAGE_LOAD_ERROR');
        expect(error.message).toContain('Failed to load user settings');
      }
    });

    it('should use stale cache on connection refused error', async () => {
      const cachedSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now() - (8 * 60 * 1000), // 8 minutes old
        selectedModel: 'offline-model',
        theme: 'dark',
      };

      const mockGet = vi.fn().mockRejectedValue(new Error('Connection refused'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Pre-populate cache
      (storageManager as any).settingsCache = {
        data: cachedSettings,
        timestamp: Date.now() - (8 * 60 * 1000),
      };

      const result = await storageManager.getUserSettings();
      expect(result).toEqual(cachedSettings);
      expect(result?.theme).toBe('dark');
    });

    it('should use stale cache for null (first-time user) on network error', async () => {
      const mockGet = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Cache has null (first-time user, expired)
      (storageManager as any).settingsCache = {
        data: null,
        timestamp: Date.now() - (10 * 60 * 1000),
      };

      const result = await storageManager.getUserSettings();
      expect(result).toBeNull();
    });

    it('should prioritize fresh cache over network error fallback', async () => {
      const cachedSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'fresh-cached-model',
      };

      const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));
      (storageManager as any).initialized = true;
      (storageManager as any).s5Client = { fs: { get: mockGet } };

      // Fresh cache (within 5-min TTL)
      (storageManager as any).settingsCache = {
        data: cachedSettings,
        timestamp: Date.now() - (2 * 60 * 1000), // 2 minutes old
      };

      // Should return cache WITHOUT calling S5 (cache hit, no network call)
      const result = await storageManager.getUserSettings();
      expect(result).toEqual(cachedSettings);
      expect(mockGet).toHaveBeenCalledTimes(0); // Should NOT call S5
    });
  });
});
