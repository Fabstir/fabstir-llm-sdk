// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Host Lifecycle Integration Tests
 * End-to-end tests for complete host lifecycle
 *
 * Sub-phase 6.1: End-to-End Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeRegistration } from '../../src/commands/register';
import { startHost } from '../../src/commands/start';
import { stopCommand } from '../../src/commands/stop';
import { checkRegistrationStatus } from '../../src/registration/manager';
import * as ConfigStorage from '../../src/config/storage';
import { PIDManager } from '../../src/daemon/pid';
import * as processManager from '../../src/process/manager';
import * as networkUtils from '../../src/utils/network';
import { ethers } from 'ethers';

// Mock dependencies
vi.mock('../../src/sdk/client', () => ({
  initializeSDK: vi.fn().mockResolvedValue({
    getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
  }),
  authenticateSDK: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/registration/manager', () => ({
  checkRegistrationStatus: vi.fn(),
  validateRegistrationRequirements: vi.fn().mockResolvedValue({
    canRegister: true,
    errors: [],
  }),
  registerHost: vi.fn(),
}));

vi.mock('../../src/balance/display', () => ({
  displayRequirements: vi.fn().mockResolvedValue('Balance display'),
}));

vi.mock('../../src/registration/errors', () => ({
  handleRegistrationError: vi.fn((error) => ({
    message: error.message,
    resolution: 'Try again',
    retryable: true,
  })),
}));

vi.mock('../../src/config/storage');
vi.mock('../../src/daemon/pid');
vi.mock('../../src/daemon/manager');
vi.mock('../../src/process/manager');
vi.mock('../../src/utils/network', () => ({
  extractHostPort: vi.fn((url: string) => {
    const match = url.match(/:(\d+)/);
    return {
      host: url.includes('localhost') ? 'localhost' : 'example.com',
      port: match ? parseInt(match[1]) : 8080,
    };
  }),
  verifyPublicEndpoint: vi.fn(),
  warnIfLocalhost: vi.fn(),
}));
vi.mock('../../src/utils/diagnostics');

describe('Host Lifecycle Integration - Sub-phase 6.1', () => {
  let mockPidManager: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock PID manager instance
    mockPidManager = {
      getPIDInfo: vi.fn(),
      isProcessRunning: vi.fn(),
      savePIDWithUrl: vi.fn(),
      removePID: vi.fn(),
      cleanupStalePID: vi.fn(),
    };

    vi.mocked(PIDManager).mockImplementation(() => mockPidManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Full Registration Flow', () => {
    it('should complete registration and start node', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({
        isRegistered: false,
      });

      vi.mocked(registerHost).mockResolvedValue({
        success: true,
        transactionHash: '0xabc123...',
        hostInfo: {
          hostAddress: '0x1234567890123456789012345678901234567890',
          stakedAmount: ethers.parseEther('1000'),
        },
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      const result = await executeRegistration({
        apiUrl: 'http://localhost:8080',
        models: ['CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf'],
        stakeAmount: ethers.parseEther('1000'),
      });

      expect(result.success).toBe(true);
      expect(processManager.spawnInferenceServer).toHaveBeenCalled();
      expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          processPid: 12345,
        })
      );
    });

    it('should save PID and config after registration', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(registerHost).mockResolvedValue({
        success: true,
        transactionHash: '0xabc123...',
        hostInfo: {
          hostAddress: '0x1234567890123456789012345678901234567890',
          stakedAmount: ethers.parseEther('1000'),
        },
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await executeRegistration({
        apiUrl: 'http://localhost:8080',
        models: ['model1'],
        stakeAmount: ethers.parseEther('1000'),
      });

      expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          processPid: 12345,
          nodeStartTime: expect.any(String),
        })
      );
    });
  });

  describe('Node Accessibility', () => {
    it('should verify node is accessible after registration', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(registerHost).mockResolvedValue({
        success: true,
        transactionHash: '0xabc123...',
        hostInfo: {
          hostAddress: '0x1234567890123456789012345678901234567890',
          stakedAmount: ethers.parseEther('1000'),
        },
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await executeRegistration({
        apiUrl: 'http://localhost:8080',
        models: ['model1'],
        stakeAmount: ethers.parseEther('1000'),
      });

      expect(networkUtils.verifyPublicEndpoint).toHaveBeenCalledWith('http://localhost:8080');
    });

    it('should rollback if node not accessible', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({ isRegistered: false });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [] },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(false);
      vi.mocked(processManager.stopInferenceServer).mockResolvedValue();

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('not accessible');

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });
  });

  describe('Stop Command Integration', () => {
    it('should stop running node and clear PID', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://localhost:8080',
        startTime: new Date().toISOString(),
      });

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
        processPid: 12345,
        nodeStartTime: new Date().toISOString(),
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      const { DaemonManager } = await import('../../src/daemon/manager');
      const mockDaemonManager = {
        stopDaemon: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(DaemonManager).mockImplementation(() => mockDaemonManager as any);

      await stopCommand.action({});

      expect(mockPidManager.removePID).toHaveBeenCalled();
      expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          processPid: undefined,
          nodeStartTime: undefined,
        })
      );
    });

    it('should verify PID is cleared after stop', async () => {
      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://localhost:8080',
        startTime: new Date().toISOString(),
      });

      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
        processPid: 12345,
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      const { DaemonManager } = await import('../../src/daemon/manager');
      const mockDaemonManager = {
        stopDaemon: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(DaemonManager).mockImplementation(() => mockDaemonManager as any);

      await stopCommand.action({});

      const savedConfig = vi.mocked(ConfigStorage.saveConfig).mock.calls[0][0];
      expect(savedConfig.processPid).toBeUndefined();
      expect(savedConfig.nodeStartTime).toBeUndefined();
    });
  });

  describe('Restart Flow', () => {
    it('should restart node with saved configuration', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1', 'model2'],
        pricePerToken: 0.0001,
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 99999,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      await startHost({ daemon: true });

      expect(processManager.spawnInferenceServer).toHaveBeenCalledWith(
        expect.objectContaining({
          models: ['model1', 'model2'],
          publicUrl: 'http://localhost:8080',
        })
      );
    });

    it('should detect already running node', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });

      mockPidManager.getPIDInfo.mockReturnValue({
        pid: 12345,
        publicUrl: 'http://localhost:8080',
        startTime: new Date().toISOString(),
      });
      mockPidManager.isProcessRunning.mockReturnValue(true);

      await startHost({ daemon: true });

      expect(processManager.spawnInferenceServer).not.toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle port already in use', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({ isRegistered: false });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockRejectedValue(
        new Error('Address already in use')
      );

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('Address already in use');
    });

    it('should handle blockchain registration failure', async () => {
      const { registerHost, checkRegistrationStatus: checkStatus } = await import('../../src/registration/manager');

      vi.mocked(checkStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(registerHost).mockRejectedValue(new Error('Transaction reverted'));

      mockPidManager.getPIDInfo.mockReturnValue(null);
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [] },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(processManager.stopInferenceServer).mockResolvedValue();

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('Transaction reverted');

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });

    it('should handle missing configuration', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      await expect(startHost({ daemon: true })).rejects.toThrow(
        'No configuration found'
      );
    });
  });

  describe('Daemon vs Foreground Mode', () => {
    it('should return immediately in daemon mode', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        pricePerToken: 0.0001,
      });

      mockPidManager.getPIDInfo.mockReturnValue(null);
      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue({
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue();

      const result = await startHost({ daemon: true });

      expect(result).toBeUndefined();
      expect(mockPidManager.savePIDWithUrl).toHaveBeenCalled();
    });
  });
});
