// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Start command tests
 * Tests for host node startup and lifecycle
 *
 * Sub-phase 5.1: Implement Start Command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHost } from '../../src/commands/start';
import * as ConfigStorage from '../../src/config/storage';
import { PIDManager } from '../../src/daemon/pid';
import * as processManager from '../../src/process/manager';
import * as networkUtils from '../../src/utils/network';

// Mock all external dependencies
vi.mock('../../src/config/storage');
vi.mock('../../src/daemon/pid');
vi.mock('../../src/process/manager');
vi.mock('../../src/utils/network', () => ({
  extractHostPort: vi.fn((url: string) => {
    const match = url.match(/:(\d+)/);
    return {
      host: url.includes('localhost') ? 'localhost' : 'example.com',
      port: match ? parseInt(match[1]) : 8080,
    };
  }),
}));

describe('Start Command - Sub-phase 5.1', () => {
  let mockPidManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock PID manager instance
    mockPidManager = {
      getPIDInfo: vi.fn(),
      isProcessRunning: vi.fn(),
      cleanupStalePID: vi.fn(),
      savePIDWithUrl: vi.fn(),
    };

    vi.mocked(PIDManager).mockImplementation(() => mockPidManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should load configuration from storage', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      await startHost({ daemon: true });

      expect(ConfigStorage.loadConfig).toHaveBeenCalled();
    });

    it('should fail if no configuration found', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      await expect(startHost({})).rejects.toThrow(
        'No configuration found. Run "fabstir-host register" first.'
      );
    });

    it('should fail if publicUrl not configured', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: '', // Empty public URL
        models: ['model1'],
        pricePerToken: 0.0001,
      });

      await expect(startHost({})).rejects.toThrow('No public URL configured. Re-register your host.');
    });

    it('should extract port from publicUrl', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:9000',
        models: ['model1'],
        pricePerToken: 0.0001,
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 9000, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:9000' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      await startHost({ daemon: true });

      expect(networkUtils.extractHostPort).toHaveBeenCalledWith('http://example.com:9000');
      expect(processManager.spawnInferenceServer).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 9000,
        })
      );
    });
  });

  describe('Already Running Detection', () => {
    it('should detect already running node via PID', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 9999,
        publicUrl: 'http://example.com:8080',
        startTime: new Date().toISOString(),
      });
      mockPidManager.isProcessRunning.mockReturnValue(true);

      await startHost({ daemon: true });

      expect(mockPidManager.getPIDInfo).toHaveBeenCalled();
      expect(mockPidManager.isProcessRunning).toHaveBeenCalledWith(9999);
      expect(processManager.spawnInferenceServer).not.toHaveBeenCalled();
    });

    it('should clean up stale PID if process not running', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue(null); // Stale PID cleaned
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      await startHost({ daemon: true });

      expect(mockPidManager.cleanupStalePID).toHaveBeenCalled();
      expect(processManager.spawnInferenceServer).toHaveBeenCalled();
    });
  });

  describe('Node Startup', () => {
    it('should start node with saved configuration', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1', 'model2'],
        pricePerToken: 0.0001,
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      await startHost({ daemon: true });

      expect(processManager.spawnInferenceServer).toHaveBeenCalledWith({
        port: 8080,
        host: '0.0.0.0',
        publicUrl: 'http://example.com:8080',
        models: ['model1', 'model2'],
        logLevel: 'info',
      });
    });

    it('should use custom logLevel if provided', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      await startHost({ daemon: true, logLevel: 'debug' });

      expect(processManager.spawnInferenceServer).toHaveBeenCalledWith(
        expect.objectContaining({
          logLevel: 'debug',
        })
      );
    });

    it('should save PID after successful start', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await startHost({ daemon: true });

      expect(mockPidManager.savePIDWithUrl).toHaveBeenCalledWith(12345, 'http://example.com:8080');
    });

    it('should update config with PID and start time', async () => {
      const existingConfig = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      };

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(existingConfig);

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await startHost({ daemon: true });

      expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          ...existingConfig,
          processPid: 12345,
          nodeStartTime: expect.any(String),
        })
      );
    });
  });

  describe('Daemon Mode', () => {
    it('should return immediately in daemon mode', async () => {
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

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      const result = await startHost({ daemon: true });

      // Should return without error
      expect(result).toBeUndefined();
    });
  });

  describe('Foreground Mode', () => {
    it('should setup log streaming in foreground mode', async () => {
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

      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: mockProcess as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });

      // Start in foreground but don't wait forever
      const promise = startHost({ daemon: false });

      // Give it a moment to setup listeners
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify log streaming was setup
      expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));

      // Note: We can't easily wait for the promise as it runs forever in foreground
      // In actual usage, this would be interrupted by Ctrl+C
    });
  });
});
