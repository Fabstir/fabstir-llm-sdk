/**
 * Stop command tests
 * Tests for stopping the host node
 *
 * Sub-phase 5.2: Enhance Stop Command
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stopCommand } from '../../src/commands/stop';
import { PIDManager } from '../../src/daemon/pid';
import { DaemonManager } from '../../src/daemon/manager';
import * as ConfigStorage from '../../src/config/storage';

// Mock dependencies
vi.mock('../../src/daemon/pid');
vi.mock('../../src/daemon/manager');
vi.mock('../../src/config/storage');

describe('Stop Command - Sub-phase 5.2', () => {
  let mockPidManager: any;
  let mockDaemonManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock PID manager instance
    mockPidManager = {
      getPIDInfo: vi.fn(),
      isProcessRunning: vi.fn(),
      removePID: vi.fn(),
      cleanupStalePID: vi.fn(),
    };

    // Setup mock daemon manager instance
    mockDaemonManager = {
      stopDaemon: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(PIDManager).mockImplementation(() => mockPidManager);
    vi.mocked(DaemonManager).mockImplementation(() => mockDaemonManager);
  });

  describe('PID Info Usage', () => {
    it('should use getPIDInfo() instead of readPID()', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
        processPid: 12345,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      expect(mockPidManager.getPIDInfo).toHaveBeenCalled();
      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(12345, expect.any(Object));
    });

    it('should show public URL when stopping', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
        processPid: 12345,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      // Should display URL in output
      const logOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logOutput).toContain('http://example.com:8080');

      consoleSpy.mockRestore();
    });
  });

  describe('Stale PID Handling', () => {
    it('should handle no PID gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      mockPidManager.getPIDInfo.mockReturnValue(null);

      await stopCommand.action({});

      expect(mockPidManager.cleanupStalePID).toHaveBeenCalled();
      expect(mockDaemonManager.stopDaemon).not.toHaveBeenCalled();

      const logOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logOutput).toContain('not running');

      consoleSpy.mockRestore();
    });

    it('should cleanup stale PID when process not found', async () => {
      mockPidManager.getPIDInfo.mockReturnValue(null);

      await stopCommand.action({});

      expect(mockPidManager.cleanupStalePID).toHaveBeenCalled();
    });
  });

  describe('Config Updates', () => {
    it('should clear processPid from config after stop', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });

      const existingConfig = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
        processPid: 12345,
        nodeStartTime: new Date().toISOString(),
      };

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(existingConfig);
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          ...existingConfig,
          processPid: undefined,
          nodeStartTime: undefined,
        })
      );
    });

    it('should preserve other config fields when clearing PID', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });

      const existingConfig = {
        version: '1.0.0',
        walletAddress: '0xABC...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 9000,
        publicUrl: 'http://example.com:9000',
        models: ['model1', 'model2'],
        pricePerToken: 0.0002,
        processPid: 12345,
      };

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(existingConfig);
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      const savedConfig = vi.mocked(ConfigStorage.saveConfig).mock.calls[0][0];
      expect(savedConfig.walletAddress).toBe('0xABC...');
      expect(savedConfig.inferencePort).toBe(9000);
      expect(savedConfig.models).toEqual(['model1', 'model2']);
      expect(savedConfig.processPid).toBeUndefined();
    });

    it('should handle missing config gracefully', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      // Should not throw
      await expect(stopCommand.action({})).resolves.not.toThrow();

      expect(ConfigStorage.saveConfig).not.toHaveBeenCalled();
    });
  });

  describe('Force and Timeout Options', () => {
    it('should pass timeout option to daemon manager', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({ timeout: 5000 });

      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('should pass force flag to daemon manager', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({ force: true });

      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({
          force: true,
        })
      );
    });

    it('should use default timeout of 10000ms', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({
          timeout: 10000,
        })
      );
    });
  });

  describe('Process Cleanup', () => {
    it('should remove PID file after stopping', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      expect(mockPidManager.removePID).toHaveBeenCalled();
    });

    it('should stop daemon before removing PID', async () => {
      const callOrder: string[] = [];

      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      mockDaemonManager.stopDaemon.mockImplementation(() => {
        callOrder.push('stopDaemon');
        return Promise.resolve();
      });
      mockPidManager.removePID.mockImplementation(() => {
        callOrder.push('removePID');
      });
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await stopCommand.action({});

      // Verify stop happens before PID removal
      expect(callOrder).toEqual(['stopDaemon', 'removePID']);
    });
  });
});
