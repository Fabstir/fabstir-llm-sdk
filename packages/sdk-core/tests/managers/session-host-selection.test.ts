// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @file Session Host Selection Tests
 * @description Tests for SessionManager host selection integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { HostSelectionMode } from '../../src/types/settings.types';
import { HostInfo } from '../../src/types/models';
import { IHostSelectionService } from '../../src/interfaces/IHostSelectionService';

// Helper to create mock HostInfo
function createMockHost(address: string, apiUrl: string): HostInfo {
  return {
    address,
    apiUrl,
    metadata: {
      hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
      capabilities: ['inference'],
      location: 'US',
      maxConcurrent: 10,
      costPerToken: 0.001,
    },
    supportedModels: ['0x' + 'a'.repeat(64)],
    isActive: true,
    stake: 5000n * 10n ** 18n,
    minPricePerTokenNative: 1000n,
    minPricePerTokenStable: 2000n,
  };
}

// Create mock PaymentManager
function createMockPaymentManager() {
  return {
    createSessionJob: vi.fn().mockResolvedValue({ jobId: 123n, sessionId: 123n }),
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
  } as any;
}

// Create mock StorageManager
function createMockStorageManager(settings: any = null) {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    getHostSelectionMode: vi.fn().mockResolvedValue(settings?.hostSelectionMode ?? HostSelectionMode.AUTO),
    getUserSettings: vi.fn().mockResolvedValue(settings),
    updateUserSettings: vi.fn().mockResolvedValue(undefined),
    getUserAddress: vi.fn().mockResolvedValue('0xTestUser'),
    storeConversation: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
    loadConversation: vi.fn().mockResolvedValue(null),
    saveConversation: vi.fn().mockResolvedValue({ cid: 'test-cid' }),
  } as any;
}

// Create mock HostManager
function createMockHostManager() {
  return {
    getModelPricing: vi.fn().mockResolvedValue(2000n),
    getHostInfo: vi.fn().mockImplementation(async (address: string) => {
      return createMockHost(address, `http://${address.slice(0, 10)}:8080`);
    }),
  } as any;
}

// Create mock HostSelectionService
function createMockHostSelectionService(selectedHost: HostInfo | null = null): IHostSelectionService {
  return {
    selectHostForModel: vi.fn().mockResolvedValue(selectedHost),
    getRankedHostsForModel: vi.fn().mockResolvedValue([]),
    calculateHostScore: vi.fn().mockReturnValue(0.5),
    setHostManager: vi.fn(),
  } as any;
}

describe('SessionManager Host Selection Integration', () => {
  const modelId = '0x' + 'a'.repeat(64);
  const chainId = 84532;

  describe('startSession with automatic host selection', () => {
    it('should use HostSelectionService when no host specified', async () => {
      const selectedHost = createMockHost('0x' + '1'.repeat(40), 'http://selected-host:8080');
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      });
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(selectedHost);

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      const result = await sessionManager.startSession({
        modelId,
        chainId,
        // No host specified - should use selection service
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      expect(mockHostSelectionService.selectHostForModel).toHaveBeenCalledWith(
        modelId,
        HostSelectionMode.AUTO,
        undefined
      );
      expect(result.sessionId).toBeDefined();
    });

    it('should use user preferred mode from settings', async () => {
      const selectedHost = createMockHost('0x' + '1'.repeat(40), 'http://selected-host:8080');
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.CHEAPEST,
        preferredHostAddress: null,
      });
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(selectedHost);

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await sessionManager.startSession({
        modelId,
        chainId,
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      expect(mockHostSelectionService.selectHostForModel).toHaveBeenCalledWith(
        modelId,
        HostSelectionMode.CHEAPEST,
        undefined
      );
    });

    it('should pass preferredHostAddress for SPECIFIC mode', async () => {
      const preferredAddress = '0x' + '9'.repeat(40);
      const selectedHost = createMockHost(preferredAddress, 'http://preferred-host:8080');
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: preferredAddress,
      });
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(selectedHost);

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await sessionManager.startSession({
        modelId,
        chainId,
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      expect(mockHostSelectionService.selectHostForModel).toHaveBeenCalledWith(
        modelId,
        HostSelectionMode.SPECIFIC,
        preferredAddress
      );
    });

    it('should skip selection when host is explicitly provided', async () => {
      const explicitHost = '0x' + '5'.repeat(40);
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager();
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService();

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await sessionManager.startSession({
        modelId,
        chainId,
        host: explicitHost, // Explicit host
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      // Should NOT call selection service when host is provided
      expect(mockHostSelectionService.selectHostForModel).not.toHaveBeenCalled();
    });

    it('should store selected host in lastHostAddress', async () => {
      const selectedHost = createMockHost('0x' + '1'.repeat(40), 'http://selected-host:8080');
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      });
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(selectedHost);

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await sessionManager.startSession({
        modelId,
        chainId,
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      expect(mockStorageManager.updateUserSettings).toHaveBeenCalledWith({
        lastHostAddress: selectedHost.address,
      });
    });

    it('should throw error when no hosts available', async () => {
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.AUTO,
        preferredHostAddress: null,
      });
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(null); // No hosts

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await expect(
        sessionManager.startSession({
          modelId,
          chainId,
          paymentMethod: 'deposit',
          depositAmount: 1000000n,
          paymentToken: '0x' + '2'.repeat(40),
        })
      ).rejects.toThrow('No hosts available for the selected model');
    });

    it('should propagate SPECIFIC mode errors to caller', async () => {
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager({
        hostSelectionMode: HostSelectionMode.SPECIFIC,
        preferredHostAddress: '0x' + '9'.repeat(40),
      });
      const mockHostManager = createMockHostManager();

      // Mock selection service that throws error for unavailable host
      const mockHostSelectionService = {
        selectHostForModel: vi.fn().mockRejectedValue(
          new Error('Preferred host 0x9999999999999999999999999999999999999999 is not available')
        ),
        getRankedHostsForModel: vi.fn().mockResolvedValue([]),
        calculateHostScore: vi.fn().mockReturnValue(0.5),
        setHostManager: vi.fn(),
      } as any;

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await expect(
        sessionManager.startSession({
          modelId,
          chainId,
          paymentMethod: 'deposit',
          depositAmount: 1000000n,
          paymentToken: '0x' + '2'.repeat(40),
        })
      ).rejects.toThrow('Preferred host 0x9999999999999999999999999999999999999999 is not available');
    });
  });

  describe('setHostSelectionService', () => {
    it('should allow setting HostSelectionService after construction', async () => {
      const selectedHost = createMockHost('0x' + '1'.repeat(40), 'http://selected-host:8080');
      const mockPaymentManager = createMockPaymentManager();
      const mockStorageManager = createMockStorageManager();
      const mockHostManager = createMockHostManager();
      const mockHostSelectionService = createMockHostSelectionService(selectedHost);

      const sessionManager = new SessionManager(mockPaymentManager, mockStorageManager, mockHostManager);

      // Set after construction
      sessionManager.setHostSelectionService(mockHostSelectionService);
      await sessionManager.initialize();

      await sessionManager.startSession({
        modelId,
        chainId,
        paymentMethod: 'deposit',
        depositAmount: 1000000n,
        paymentToken: '0x' + '2'.repeat(40),
      });

      expect(mockHostSelectionService.selectHostForModel).toHaveBeenCalled();
    });
  });
});
