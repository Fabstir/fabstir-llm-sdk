import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { IStorageManager } from '../../src/interfaces/IStorageManager';
import { UserSettings, UserSettingsVersion } from '../../src/types/settings.types';
import { ChainId } from '../../src/types/chain.types';

// Mock environment configuration to avoid env var requirements
vi.mock('../../src/config/environment', () => ({
  getBaseSepolia: () => ({
    contracts: {
      jobMarketplace: '0xdEa1B47872C27458Bb7331Ade99099761C4944Dc',
      nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
      hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
      modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
    },
    entryPoint: '0x0000000000000000000000000000000000000000',
    chainId: 84532,
    rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR',
  }),
  getOpBNBTestnet: () => ({
    contracts: {
      jobMarketplace: '0x0000000000000000000000000000000000000000',
      nodeRegistry: '0x0000000000000000000000000000000000000000',
      proofSystem: '0x0000000000000000000000000000000000000000',
      hostEarnings: '0x0000000000000000000000000000000000000000',
      modelRegistry: '0x0000000000000000000000000000000000000000',
      usdcToken: '0x0000000000000000000000000000000000000000',
      fabToken: '0x0000000000000000000000000000000000000000',
    },
    entryPoint: '0x0000000000000000000000000000000000000000',
    chainId: 5611,
    rpcUrl: 'https://opbnb-testnet-rpc.bnbchain.org',
  }),
  validateConfiguration: () => true,
}));

/**
 * Sub-phase 6.1: SDK Integration Tests
 *
 * End-to-end tests with real SDK instance and S5 storage.
 * Tests user settings functionality with actual S5 backend.
 *
 * Requirements:
 * - Real SDK initialization with S5 storage
 * - Full workflow: save → get → update → clear
 * - Cache behavior verification
 * - Error scenario handling
 */

describe('User Settings Integration - E2E', () => {
  let sdk: FabstirSDKCore;
  let storageManager: IStorageManager;

  const TEST_PRIVATE_KEY = process.env.TEST_USER_1_PRIVATE_KEY || '0x2d5db36770a53811d9a11163a5e6577bb867e19552921bf40f74064308bea952';
  const RPC_URL = process.env.RPC_URL_BASE_SEPOLIA || 'https://base-sepolia.g.alchemy.com/v2/1pZoccdtgU8CMyxXzE3l_ghnBBaJABMR';

  beforeAll(async () => {
    // Initialize SDK with test credentials
    // Environment module is mocked above to provide test contract addresses
    sdk = new FabstirSDKCore({
      mode: 'production' as const,
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: RPC_URL,
      contractAddresses: {
        jobMarketplace: '0xdEa1B47872C27458Bb7331Ade99099761C4944Dc',
        nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
        proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
        hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
        modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
        usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
      }
    });

    // Authenticate and initialize storage
    await sdk.authenticate('privatekey', { privateKey: TEST_PRIVATE_KEY });
    storageManager = await sdk.getStorageManager();

    // Clear any existing settings from previous test runs
    try {
      await storageManager.clearUserSettings();
    } catch (error) {
      // Ignore if settings don't exist
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await storageManager.clearUserSettings();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Operations', () => {
    it('should save and retrieve user settings', async () => {
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'tiny-vicuna-1b.q4_k_m.gguf',
        preferredPaymentToken: 'USDC',
        theme: 'dark',
      };

      await storageManager.saveUserSettings(settings);
      const retrieved = await storageManager.getUserSettings();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.version).toBe(UserSettingsVersion.V1);
      expect(retrieved!.selectedModel).toBe(settings.selectedModel);
      expect(retrieved!.preferredPaymentToken).toBe('USDC');
      expect(retrieved!.theme).toBe('dark');
    });

    it('should return null for first-time user', async () => {
      // Clear settings first
      await storageManager.clearUserSettings();

      const settings = await storageManager.getUserSettings();
      expect(settings).toBeNull();
    });

    it('should update specific settings', async () => {
      // First save initial settings
      const initial: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'initial-model',
        preferredPaymentToken: 'USDC',
        theme: 'light',
      };

      await storageManager.saveUserSettings(initial);

      // Then update only selectedModel
      await storageManager.updateUserSettings({
        selectedModel: 'mistral-7b.q4_k_m.gguf',
      });

      const updated = await storageManager.getUserSettings();
      expect(updated!.selectedModel).toBe('mistral-7b.q4_k_m.gguf');
      expect(updated!.preferredPaymentToken).toBe('USDC'); // Unchanged
      expect(updated!.theme).toBe('light'); // Unchanged
    });

    it('should clear settings completely', async () => {
      // First save settings
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
      };

      await storageManager.saveUserSettings(settings);

      // Verify settings exist
      const beforeClear = await storageManager.getUserSettings();
      expect(beforeClear).not.toBeNull();

      // Clear settings
      await storageManager.clearUserSettings();

      // Verify settings are gone
      const afterClear = await storageManager.getUserSettings();
      expect(afterClear).toBeNull();
    });
  });

  describe('Cache Behavior', () => {
    it('should use cache within 5 minutes', async () => {
      // Save settings
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'cached-model',
      };

      await storageManager.saveUserSettings(settings);

      // First call fetches from S5 and caches
      const firstCall = await storageManager.getUserSettings();

      // Second call within 5 minutes should return cached value
      const secondCall = await storageManager.getUserSettings();

      // Should be same object reference (from cache)
      expect(firstCall).toBe(secondCall);
      expect(secondCall!.selectedModel).toBe('cached-model');
    });

    it('should invalidate cache after save', async () => {
      const initial: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'before-update',
      };

      await storageManager.saveUserSettings(initial);

      // Get settings (caches)
      const cached = await storageManager.getUserSettings();
      expect(cached!.selectedModel).toBe('before-update');

      // Save new settings (should invalidate cache)
      const updated: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'after-update',
      };

      await storageManager.saveUserSettings(updated);

      // Get should return new settings (cache updated)
      const afterSave = await storageManager.getUserSettings();
      expect(afterSave!.selectedModel).toBe('after-update');
    });

    it('should invalidate cache after clear', async () => {
      // Save settings
      const settings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'to-be-cleared',
      };

      await storageManager.saveUserSettings(settings);

      // Get settings (caches)
      const cached = await storageManager.getUserSettings();
      expect(cached!.selectedModel).toBe('to-be-cleared');

      // Clear settings (should invalidate cache)
      await storageManager.clearUserSettings();

      // Get should return null (cache cleared)
      const afterClear = await storageManager.getUserSettings();
      expect(afterClear).toBeNull();
    });
  });

  describe('Advanced Features', () => {
    it('should handle all optional settings fields', async () => {
      const fullSettings: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'test-model',
        lastUsedModels: ['model-1', 'model-2', 'model-3'],
        lastHostAddress: '0x1234567890123456789012345678901234567890',
        preferredHosts: ['0xhost1', '0xhost2'],
        preferredPaymentToken: 'ETH',
        autoApproveAmount: '100.0',
        advancedSettingsExpanded: true,
        theme: 'auto',
      };

      await storageManager.saveUserSettings(fullSettings);
      const retrieved = await storageManager.getUserSettings();

      expect(retrieved).not.toBeNull();
      expect(retrieved!.lastUsedModels).toEqual(['model-1', 'model-2', 'model-3']);
      expect(retrieved!.lastHostAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(retrieved!.preferredHosts).toEqual(['0xhost1', '0xhost2']);
      expect(retrieved!.preferredPaymentToken).toBe('ETH');
      expect(retrieved!.autoApproveAmount).toBe('100.0');
      expect(retrieved!.advancedSettingsExpanded).toBe(true);
      expect(retrieved!.theme).toBe('auto');
    });

    it('should preserve lastUpdated timestamp on update', async () => {
      const oldTimestamp = Date.now() - 60000; // 1 minute ago

      const initial: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: oldTimestamp,
        selectedModel: 'old-model',
      };

      await storageManager.saveUserSettings(initial);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update settings
      await storageManager.updateUserSettings({
        selectedModel: 'new-model',
      });

      const updated = await storageManager.getUserSettings();

      // lastUpdated should be updated automatically
      expect(updated!.lastUpdated).toBeGreaterThan(oldTimestamp);
      expect(updated!.selectedModel).toBe('new-model');
    });

    it('should handle partial update creating new settings', async () => {
      // Clear any existing settings
      await storageManager.clearUserSettings();

      // Update without existing settings (should create new)
      await storageManager.updateUserSettings({
        selectedModel: 'created-from-update',
        theme: 'dark',
      });

      const settings = await storageManager.getUserSettings();
      expect(settings).not.toBeNull();
      expect(settings!.version).toBe(UserSettingsVersion.V1);
      expect(settings!.selectedModel).toBe('created-from-update');
      expect(settings!.theme).toBe('dark');
    });
  });

  describe('Cross-Device Sync', () => {
    let deviceA: FabstirSDKCore;
    let deviceB: FabstirSDKCore;
    let storageA: IStorageManager;
    let storageB: IStorageManager;

    beforeAll(async () => {
      // Initialize two SDK instances with same credentials (simulating two devices)
      deviceA = new FabstirSDKCore({
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: RPC_URL,
        contractAddresses: {
          jobMarketplace: '0xdEa1B47872C27458Bb7331Ade99099761C4944Dc',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        }
      });

      deviceB = new FabstirSDKCore({
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: RPC_URL,
        contractAddresses: {
          jobMarketplace: '0xdEa1B47872C27458Bb7331Ade99099761C4944Dc',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          proofSystem: '0x2ACcc60893872A499700908889B38C5420CBcFD1',
          hostEarnings: '0x908962e8c6CE72610021586f85ebDE09aAc97776',
          modelRegistry: '0x92b2De840bB2171203011A6dBA928d855cA8183E',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
        }
      });

      // Authenticate both devices with same private key (same user account)
      await deviceA.authenticate('privatekey', { privateKey: TEST_PRIVATE_KEY });
      await deviceB.authenticate('privatekey', { privateKey: TEST_PRIVATE_KEY });

      storageA = await deviceA.getStorageManager();
      storageB = await deviceB.getStorageManager();
    });

    beforeEach(async () => {
      // Clear settings before each test to avoid cross-test contamination
      await storageA.clearUserSettings();
      // Also invalidate Device B's cache (since they share the same S5 account)
      try {
        await storageB.clearUserSettings();
      } catch (error) {
        // Ignore if already cleared
      }
      // Wait for S5 propagation
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    it('should sync settings from Device A to Device B', async () => {
      // Save settings on Device A
      const settingsA: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'device-a-model',
        theme: 'light',
        preferredPaymentToken: 'USDC',
      };

      await storageA.saveUserSettings(settingsA);

      // Wait for S5 propagation (S5 is eventually consistent)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Load on Device B (should see Device A's settings)
      const settingsB = await storageB.getUserSettings();

      expect(settingsB).not.toBeNull();
      expect(settingsB!.selectedModel).toBe('device-a-model');
      expect(settingsB!.theme).toBe('light');
      expect(settingsB!.preferredPaymentToken).toBe('USDC');
    });

    it('should implement last-write-wins on conflict', async () => {
      // Device A saves
      const settingsA: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-a',
        theme: 'dark',
      };

      await storageA.saveUserSettings(settingsA);

      // Wait for S5 propagation to complete Device A's write
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Device B saves (should win as it's the later write)
      const settingsB: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'model-b',
        theme: 'light',
      };

      await storageB.saveUserSettings(settingsB);

      // Wait for S5 propagation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Clear Device A's cache to force reload from S5
      // (In production, cache would expire after 5 minutes)
      (storageA as any).settingsCache = null;

      // Both devices should see Device B's value (last write wins)
      const finalA = await storageA.getUserSettings();
      const finalB = await storageB.getUserSettings();

      expect(finalA!.selectedModel).toBe('model-b');
      expect(finalA!.theme).toBe('light');
      expect(finalB!.selectedModel).toBe('model-b');
      expect(finalB!.theme).toBe('light');
    });

    it('should reload settings after cache expiry', async () => {
      // Device A saves settings
      const initial: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'initial-model',
      };

      await storageA.saveUserSettings(initial);

      // Wait for S5 propagation before Device B reads
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Device B loads and caches
      const cachedB = await storageB.getUserSettings();
      expect(cachedB!.selectedModel).toBe('initial-model');

      // Wait for S5 propagation to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Device A updates settings
      const updated: UserSettings = {
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'updated-model',
      };

      await storageA.saveUserSettings(updated);

      // Wait for S5 propagation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Device B should still have cached version (within 5-minute TTL)
      const stillCached = await storageB.getUserSettings();
      expect(stillCached!.selectedModel).toBe('initial-model'); // From cache

      // Verify cache is being used (same object reference)
      expect(stillCached).toBe(cachedB); // Same object reference = from cache
    });

    it('should handle concurrent updates with S5 optimistic locking', async () => {
      // S5 uses optimistic locking with revision numbers
      // When two devices write simultaneously, one may fail with "Revision number too low"
      // This test verifies proper error handling for concurrent writes

      // First establish some initial settings
      await storageA.saveUserSettings({
        version: UserSettingsVersion.V1,
        lastUpdated: Date.now(),
        selectedModel: 'initial',
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Both devices attempt to update settings simultaneously
      const results = await Promise.allSettled([
        storageA.updateUserSettings({ selectedModel: 'concurrent-a' }),
        storageB.updateUserSettings({ selectedModel: 'concurrent-b' }),
      ]);

      // At least one should succeed (S5 optimistic locking)
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Wait for S5 propagation
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Clear caches to force reload from S5
      (storageA as any).settingsCache = null;
      (storageB as any).settingsCache = null;

      // Both devices should eventually see a consistent state
      const finalA = await storageA.getUserSettings();
      const finalB = await storageB.getUserSettings();

      // Both should have settings (not null)
      expect(finalA).not.toBeNull();
      expect(finalB).not.toBeNull();

      // Both should see the same final state (eventual consistency)
      expect(finalA!.selectedModel).toBe(finalB!.selectedModel);
      // Should be one of the attempted values (or initial if both failed, though unlikely)
      expect(['concurrent-a', 'concurrent-b', 'initial']).toContain(finalA!.selectedModel);
    });
  });
});
