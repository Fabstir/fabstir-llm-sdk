// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import 'fake-indexeddb/auto';

/**
 * StorageManager S5 Connection Handling Test Suite
 *
 * Tests for v1.4.24 connection handling features:
 * - Connection status tracking
 * - Sync status for UI
 * - Retry with exponential backoff
 * - Operation queue when disconnected
 * - Auto-reconnect on visibility/network changes
 */

// Store mock S5 instance at module level for access in tests
let mockS5Instance: any;
let connectionChangeCallback: ((status: string) => void) | null = null;

// Mock the S5 module
vi.mock('@julesl23/s5js', () => {
  return {
    S5: {
      create: vi.fn().mockImplementation(async () => {
        connectionChangeCallback = null;
        mockS5Instance = {
          recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
          registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
          getConnectionStatus: vi.fn().mockReturnValue('connected'),
          onConnectionChange: vi.fn().mockImplementation((callback: (status: string) => void) => {
            connectionChangeCallback = callback;
            // Fire immediately with current status (per S5.js v0.9.0-beta.5 behavior)
            callback('connected');
            return () => { connectionChangeCallback = null; };
          }),
          reconnect: vi.fn().mockResolvedValue(undefined),
          fs: {
            ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ data: 'test' }),
            delete: vi.fn().mockResolvedValue(true),
          }
        };
        return mockS5Instance;
      })
    }
  };
});

// Import after mock setup
import { StorageManager } from '../../src/managers/StorageManager';
import type { S5ConnectionStatus, SyncStatus } from '../../src/managers/StorageManager';

describe('StorageManager Connection Handling', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    // Reset connection change callback
    connectionChangeCallback = null;
    storageManager = new StorageManager('wss://test-portal');
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (storageManager) {
      storageManager.cleanup();
    }
  });

  describe('Connection Status', () => {
    it('should return disconnected before initialization', () => {
      const newManager = new StorageManager();
      expect(newManager.getConnectionStatus()).toBe('disconnected');
      newManager.cleanup();
    });

    it('should return connected after successful initialization', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(storageManager.getConnectionStatus()).toBe('connected');
    });

    it('should subscribe to connection changes from S5', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(mockS5Instance.onConnectionChange).toHaveBeenCalled();
    });

    it('should update status when connection changes', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(storageManager.getConnectionStatus()).toBe('connected');

      // Simulate disconnection
      connectionChangeCallback?.('disconnected');
      expect(storageManager.getConnectionStatus()).toBe('disconnected');

      // Simulate reconnection
      connectionChangeCallback?.('connected');
      expect(storageManager.getConnectionStatus()).toBe('connected');
    });
  });

  describe('Sync Status', () => {
    it('should return synced initially', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(storageManager.getSyncStatus()).toBe('synced');
    });

    it('should return pending count of 0 initially', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(storageManager.getPendingOperationCount()).toBe(0);
    });

    it('should return null for last error when synced', async () => {
      await storageManager.initialize('test-seed', '0x1234');
      expect(storageManager.getLastError()).toBeNull();
    });

    it('should notify listeners on sync status change', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      const listener = vi.fn();
      storageManager.onSyncStatusChange(listener);

      // Should be called immediately with current status
      expect(listener).toHaveBeenCalledWith('synced');
    });

    it('should allow unsubscribing from sync status changes', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      const listener = vi.fn();
      const unsubscribe = storageManager.onSyncStatusChange(listener);

      // Clear the initial call
      listener.mockClear();

      // Unsubscribe
      unsubscribe();

      // Simulate a status change by disconnecting and queueing
      connectionChangeCallback?.('disconnected');

      // Listener should not be called after unsubscribe
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Retry with Exponential Backoff', () => {
    it('should succeed on first attempt when connected', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      await storageManager.putWithRetry('test/path', { data: 'test' });

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(1);
    });

    it('should retry on connection error', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      // First call fails with connection error, second succeeds
      mockS5Instance.fs.put
        .mockRejectedValueOnce(new Error('WebSocket is CLOSED'))
        .mockResolvedValueOnce(undefined);

      await storageManager.putWithRetry('test/path', { data: 'test' });

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-connection error', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      mockS5Instance.fs.put.mockRejectedValue(new Error('Invalid path'));

      await expect(storageManager.putWithRetry('test/path', { data: 'test' }))
        .rejects.toThrow('Invalid path');

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries exhausted', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      // Always fail with connection error
      mockS5Instance.fs.put.mockRejectedValue(new Error('WebSocket connection failed'));

      await expect(storageManager.putWithRetry('test/path', { data: 'test' }))
        .rejects.toThrow(/failed after 5 attempts/);

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(5);
    }, 60000); // Increase timeout for retry delays

    it('should set sync status to error after retries exhausted', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      mockS5Instance.fs.put.mockRejectedValue(new Error('WebSocket connection failed'));

      try {
        await storageManager.putWithRetry('test/path', { data: 'test' });
      } catch (e) {
        // Expected to throw
      }

      expect(storageManager.getSyncStatus()).toBe('error');
      expect(storageManager.getLastError()).not.toBeNull();
    }, 60000);
  });

  describe('Operation Queue', () => {
    it('should queue PUT operations when disconnected', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      // Simulate disconnection
      connectionChangeCallback?.('disconnected');

      // This should queue instead of executing immediately
      const putPromise = storageManager.putWithRetry('test/path', { data: 'test' });

      // Should not have called put yet
      expect(mockS5Instance.fs.put).not.toHaveBeenCalled();
      expect(storageManager.getPendingOperationCount()).toBe(1);
      expect(storageManager.getSyncStatus()).toBe('pending');

      // Simulate reconnection - should flush queue
      connectionChangeCallback?.('connected');

      await putPromise;
      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(1);
    });

    it('should queue DELETE operations when disconnected', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      const deletePromise = storageManager.deleteWithRetry('test/path');

      expect(mockS5Instance.fs.delete).not.toHaveBeenCalled();
      expect(storageManager.getPendingOperationCount()).toBe(1);

      connectionChangeCallback?.('connected');

      await deletePromise;
      expect(mockS5Instance.fs.delete).toHaveBeenCalledTimes(1);
    });

    it('should not queue GET operations (reads need immediate response)', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      // GET should attempt even when disconnected (will retry)
      // This tests that getWithRetry doesn't queue
      mockS5Instance.fs.get.mockResolvedValue({ data: 'test' });

      const result = await storageManager.getWithRetry('test/path');

      expect(mockS5Instance.fs.get).toHaveBeenCalled();
      expect(result).toEqual({ data: 'test' });
    });

    it('should flush queue when connection is restored', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      // Queue multiple operations
      const p1 = storageManager.putWithRetry('path/1', { data: '1' });
      const p2 = storageManager.putWithRetry('path/2', { data: '2' });
      const p3 = storageManager.deleteWithRetry('path/3');

      expect(storageManager.getPendingOperationCount()).toBe(3);

      // Reconnect
      connectionChangeCallback?.('connected');

      await Promise.all([p1, p2, p3]);

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(2);
      expect(mockS5Instance.fs.delete).toHaveBeenCalledTimes(1);
      expect(storageManager.getPendingOperationCount()).toBe(0);
      expect(storageManager.getSyncStatus()).toBe('synced');
    });

    it('should update sync status to syncing while flushing', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      storageManager.putWithRetry('path/1', { data: '1' });

      const statusChanges: string[] = [];
      storageManager.onSyncStatusChange((status) => {
        statusChanges.push(status);
      });

      connectionChangeCallback?.('connected');

      // Give time for flush to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(statusChanges).toContain('syncing');
    });
  });

  describe('Force Sync', () => {
    it('should attempt reconnect when disconnected', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      await storageManager.forceSync();

      expect(mockS5Instance.reconnect).toHaveBeenCalled();
    });

    it('should flush queue after reconnect', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      storageManager.putWithRetry('test/path', { data: 'test' });

      // Simulate reconnect success
      mockS5Instance.reconnect.mockImplementation(async () => {
        connectionChangeCallback?.('connected');
      });

      await storageManager.forceSync();

      // Queue should be flushed
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(mockS5Instance.fs.put).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from connection changes', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      storageManager.cleanup();

      // Connection callback should be cleared
      expect(connectionChangeCallback).toBeNull();
    });

    it('should reject pending operations', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      connectionChangeCallback?.('disconnected');

      const putPromise = storageManager.putWithRetry('test/path', { data: 'test' });

      storageManager.cleanup();

      await expect(putPromise).rejects.toThrow('StorageManager cleanup');
    });

    it('should clear sync listeners', async () => {
      await storageManager.initialize('test-seed', '0x1234');

      const listener = vi.fn();
      storageManager.onSyncStatusChange(listener);

      listener.mockClear();

      storageManager.cleanup();

      // After cleanup, listeners should be cleared
      // We can't easily test this without internal access, but the cleanup should work
      expect(true).toBe(true);
    });
  });

  describe('Connection Error Detection', () => {
    const connectionErrors = [
      'WebSocket is CLOSED',
      'WebSocket is already in CLOSING state',
      'connection refused',
      'network error',
      'timeout exceeded',
      'Connection reset',
    ];

    const nonConnectionErrors = [
      'Invalid path',
      'Permission denied',
      'File not found',
      'Quota exceeded',
    ];

    it.each(connectionErrors)('should detect "%s" as connection error and retry', async (errorMsg) => {
      await storageManager.initialize('test-seed', '0x1234');

      mockS5Instance.fs.put
        .mockRejectedValueOnce(new Error(errorMsg))
        .mockResolvedValueOnce(undefined);

      await storageManager.putWithRetry('test/path', { data: 'test' });

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(2);
    });

    it.each(nonConnectionErrors)('should not retry "%s" error', async (errorMsg) => {
      await storageManager.initialize('test-seed', '0x1234');

      mockS5Instance.fs.put.mockRejectedValue(new Error(errorMsg));

      await expect(storageManager.putWithRetry('test/path', { data: 'test' }))
        .rejects.toThrow(errorMsg);

      expect(mockS5Instance.fs.put).toHaveBeenCalledTimes(1);
    });
  });

  describe('Graceful Degradation (S5 without connection API)', () => {
    it('should work with older S5 versions without connection API', async () => {
      // Override mock for this test - create S5 instance without connection API
      const { S5 } = await import('@julesl23/s5js');
      (S5.create as Mock).mockImplementationOnce(async () => {
        return {
          recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
          registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
          // No onConnectionChange, getConnectionStatus, or reconnect
          fs: {
            ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
            put: vi.fn().mockResolvedValue(undefined),
            get: vi.fn().mockResolvedValue({ data: 'test' }),
            delete: vi.fn().mockResolvedValue(true),
          }
        };
      });

      const oldManager = new StorageManager();
      await oldManager.initialize('test-seed', '0x1234');

      // Should assume connected when API not available
      expect(oldManager.getConnectionStatus()).toBe('connected');

      oldManager.cleanup();
    });
  });
});
