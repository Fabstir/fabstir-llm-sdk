// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Storage Preferences Tests
 * @description Tests for StorageManager preference helper methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageManager } from '../../src/managers/StorageManager';
import { HostSelectionMode, UserSettingsVersion } from '../../src/types/settings.types';
import { ModelInfo } from '../../src/types/models';

// Mock S5.js module
vi.mock('@julesl23/s5js', () => ({
  S5: {
    create: vi.fn().mockResolvedValue({
      recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
      registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
      fs: {
        ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(true),
        list: vi.fn().mockImplementation(async function* () {}),
        getMetadata: vi.fn().mockResolvedValue(null),
      },
      onConnectionChange: vi.fn().mockReturnValue(() => {}),
    }),
  },
}));

// Helper to create mock ModelManager
function createMockModelManager(models: Map<string, ModelInfo>) {
  return {
    getModelDetails: vi.fn().mockImplementation(async (modelId: string) => {
      return models.get(modelId) || null;
    }),
    isModelApproved: vi.fn().mockResolvedValue(true),
  };
}

// Helper to create mock ModelInfo
function createMockModel(modelId: string, repo: string, file: string): ModelInfo {
  return {
    modelId,
    huggingfaceRepo: repo,
    fileName: file,
    sha256Hash: '0x' + 'f'.repeat(64),
    approvalTier: 1,
    active: true,
    timestamp: Date.now(),
  };
}

describe('StorageManager Preference Helpers', () => {
  let storageManager: StorageManager;
  let mockS5Client: any;
  let storedSettings: any = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    storedSettings = null;

    // Create new instance
    storageManager = new StorageManager('wss://test-portal');

    // Get the mock S5 client
    const s5Module = await import('@julesl23/s5js');
    mockS5Client = await (s5Module.S5 as any).create();

    // Setup mock fs methods with settings storage
    mockS5Client.fs.put = vi.fn().mockImplementation(async (path: string, data: any) => {
      if (path === 'home/user/settings.json') {
        storedSettings = data;
      }
    });

    mockS5Client.fs.get = vi.fn().mockImplementation(async (path: string) => {
      if (path === 'home/user/settings.json') {
        return storedSettings;
      }
      return null;
    });

    // Initialize storage manager
    await storageManager.initialize('test-seed-phrase', '0xTestUser');
  });

  describe('getDefaultModel', () => {
    it('should return null when defaultModelId not set', async () => {
      // Settings exist but no defaultModelId
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const models = new Map<string, ModelInfo>();
      const mockModelManager = createMockModelManager(models);
      storageManager.setModelManager(mockModelManager as any);

      const result = await storageManager.getDefaultModel();
      expect(result).toBeNull();
    });

    it('should return ModelInfo when defaultModelId is set', async () => {
      const modelId = '0x' + 'a'.repeat(64);
      const model = createMockModel(modelId, 'repo/model', 'model.gguf');

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: modelId,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const models = new Map<string, ModelInfo>();
      models.set(modelId, model);
      const mockModelManager = createMockModelManager(models);
      storageManager.setModelManager(mockModelManager as any);

      const result = await storageManager.getDefaultModel();
      expect(result).not.toBeNull();
      expect(result!.modelId).toBe(modelId);
      expect(result!.huggingfaceRepo).toBe('repo/model');
    });

    it('should return null when defaultModelId refers to non-existent model', async () => {
      const modelId = '0x' + 'a'.repeat(64);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: modelId,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const models = new Map<string, ModelInfo>(); // Empty - model doesn't exist
      const mockModelManager = createMockModelManager(models);
      storageManager.setModelManager(mockModelManager as any);

      const result = await storageManager.getDefaultModel();
      expect(result).toBeNull();
    });

    it('should throw error if ModelManager not set', async () => {
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: '0x' + 'a'.repeat(64),
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      // Don't set ModelManager
      await expect(storageManager.getDefaultModel()).rejects.toThrow('ModelManager not set');
    });
  });

  describe('setDefaultModel', () => {
    it('should set defaultModelId when model exists', async () => {
      const modelId = '0x' + 'a'.repeat(64);
      const model = createMockModel(modelId, 'repo/model', 'model.gguf');

      // Initial settings
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const models = new Map<string, ModelInfo>();
      models.set(modelId, model);
      const mockModelManager = createMockModelManager(models);
      storageManager.setModelManager(mockModelManager as any);

      await storageManager.setDefaultModel(modelId);

      expect(storedSettings.defaultModelId).toBe(modelId);
    });

    it('should clear defaultModelId when passed null', async () => {
      const modelId = '0x' + 'a'.repeat(64);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: modelId,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const mockModelManager = createMockModelManager(new Map());
      storageManager.setModelManager(mockModelManager as any);

      await storageManager.setDefaultModel(null);

      expect(storedSettings.defaultModelId).toBeNull();
    });

    it('should throw error when model does not exist', async () => {
      const modelId = '0x' + 'a'.repeat(64);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      const models = new Map<string, ModelInfo>(); // Empty - model doesn't exist
      const mockModelManager = createMockModelManager(models);
      storageManager.setModelManager(mockModelManager as any);

      await expect(storageManager.setDefaultModel(modelId)).rejects.toThrow(
        `Model ${modelId} not found in registry`
      );
    });

    it('should throw error if ModelManager not set', async () => {
      const modelId = '0x' + 'a'.repeat(64);

      // Don't set ModelManager
      await expect(storageManager.setDefaultModel(modelId)).rejects.toThrow('ModelManager not set');
    });
  });

  describe('getHostSelectionMode', () => {
    it('should return AUTO by default when no settings exist', async () => {
      storedSettings = null; // No settings

      const result = await storageManager.getHostSelectionMode();
      expect(result).toBe(HostSelectionMode.AUTO);
    });

    it('should return stored hostSelectionMode', async () => {
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.CHEAPEST,
        preferredHostAddress: null,
      };

      const result = await storageManager.getHostSelectionMode();
      expect(result).toBe(HostSelectionMode.CHEAPEST);
    });

    it('should return AUTO when hostSelectionMode not set in V1 settings', async () => {
      storedSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: '',
        // V1 settings don't have hostSelectionMode
      };

      const result = await storageManager.getHostSelectionMode();
      expect(result).toBe(HostSelectionMode.AUTO);
    });
  });

  describe('setHostSelectionMode', () => {
    it('should update hostSelectionMode', async () => {
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      await storageManager.setHostSelectionMode(HostSelectionMode.RELIABLE);

      expect(storedSettings.hostSelectionMode).toBe(HostSelectionMode.RELIABLE);
    });

    it('should set preferredHostAddress when mode is SPECIFIC', async () => {
      const hostAddress = '0x' + '1'.repeat(40);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      await storageManager.setHostSelectionMode(HostSelectionMode.SPECIFIC, hostAddress);

      expect(storedSettings.hostSelectionMode).toBe(HostSelectionMode.SPECIFIC);
      expect(storedSettings.preferredHostAddress).toBe(hostAddress);
    });

    it('should throw error when SPECIFIC mode without preferredHostAddress', async () => {
      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      };

      await expect(storageManager.setHostSelectionMode(HostSelectionMode.SPECIFIC)).rejects.toThrow(
        'preferredHostAddress required for SPECIFIC mode'
      );
    });

    it('should clear preferredHostAddress when switching from SPECIFIC to other mode', async () => {
      const hostAddress = '0x' + '1'.repeat(40);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: '',
        defaultModelId: null,
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: hostAddress,
      };

      await storageManager.setHostSelectionMode(HostSelectionMode.AUTO);

      expect(storedSettings.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(storedSettings.preferredHostAddress).toBeNull();
    });
  });

  describe('clearAIPreferences', () => {
    it('should reset all AI preferences to defaults', async () => {
      const modelId = '0x' + 'a'.repeat(64);
      const hostAddress = '0x' + '1'.repeat(40);

      storedSettings = {
        version: UserSettingsVersion.V2,
        lastUpdated: Date.now(),
        selectedModel: 'some-model',
        defaultModelId: modelId,
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: hostAddress,
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      await storageManager.clearAIPreferences();

      expect(storedSettings.defaultModelId).toBeNull();
      expect(storedSettings.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(storedSettings.preferredHostAddress).toBeNull();
      // Other settings should remain unchanged
      expect(storedSettings.preferredPaymentToken).toBe('USDC');
      expect(storedSettings.theme).toBe('dark');
    });

    it('should work when no settings exist (creates new settings)', async () => {
      storedSettings = null;

      await storageManager.clearAIPreferences();

      expect(storedSettings).not.toBeNull();
      expect(storedSettings.defaultModelId).toBeNull();
      expect(storedSettings.hostSelectionMode).toBe(HostSelectionMode.AUTO);
      expect(storedSettings.preferredHostAddress).toBeNull();
    });
  });
});
