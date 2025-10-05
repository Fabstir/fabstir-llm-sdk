/**
 * Register command integration tests
 * Tests for pre-registration node startup and lifecycle management
 *
 * Sub-phase 4.1: Pre-Registration Node Startup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RegistrationConfig } from '../../src/registration/manager';
import { saveConfig, loadConfig } from '../../src/config/storage';
import * as processManager from '../../src/process/manager';
import * as networkUtils from '../../src/utils/network';
import * as diagnostics from '../../src/utils/diagnostics';
import { ethers } from 'ethers';

// Mock all external dependencies
vi.mock('../../src/sdk/client', () => ({
  initializeSDK: vi.fn().mockResolvedValue({
    getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
  }),
  authenticateSDK: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/registration/manager', () => ({
  checkRegistrationStatus: vi.fn().mockResolvedValue({
    isRegistered: false,
  }),
  validateRegistrationRequirements: vi.fn().mockResolvedValue({
    canRegister: true,
    errors: [],
  }),
  registerHost: vi.fn().mockResolvedValue({
    success: true,
    transactionHash: '0xabc123...',
    hostInfo: {
      hostAddress: '0x1234567890123456789012345678901234567890',
      stakedAmount: ethers.parseEther('1000'),
    },
  }),
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
  isLocalhostUrl: vi.fn(),
}));
vi.mock('../../src/utils/diagnostics');

describe('Register Integration - Sub-phase 4.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startNodeBeforeRegistration', () => {
    it('should start node with ProcessManager before registration', async () => {
      const { startNodeBeforeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);

      const handle = await startNodeBeforeRegistration({
        apiUrl: 'http://example.com:8080',
        models: ['test-model'],
      });

      expect(processManager.spawnInferenceServer).toHaveBeenCalledWith({
        port: 8080,
        host: '0.0.0.0',
        publicUrl: 'http://example.com:8080',
        models: ['test-model'],
        logLevel: 'info',
      });

      expect(handle.pid).toBe(12345);
    });

    it('should warn if localhost URL is used', async () => {
      const { startNodeBeforeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [] },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.isLocalhostUrl).mockReturnValue(true);
      vi.mocked(networkUtils.warnIfLocalhost).mockImplementation(() => {});

      await startNodeBeforeRegistration({
        apiUrl: 'http://localhost:8080',
        models: ['test-model'],
      });

      expect(networkUtils.warnIfLocalhost).toHaveBeenCalledWith('http://localhost:8080');
    });

    it('should verify public URL accessibility after node starts', async () => {
      const { startNodeBeforeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);

      await startNodeBeforeRegistration({
        apiUrl: 'http://example.com:8080',
        models: ['test-model'],
      });

      expect(networkUtils.verifyPublicEndpoint).toHaveBeenCalledWith('http://example.com:8080');
    });

    it('should show troubleshooting if public URL not accessible', async () => {
      const { startNodeBeforeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(false);
      vi.mocked(processManager.stopInferenceServer).mockResolvedValue();

      await expect(
        startNodeBeforeRegistration({
          apiUrl: 'http://example.com:8080',
          models: ['test-model'],
        })
      ).rejects.toThrow('not accessible');

      expect(diagnostics.showNetworkTroubleshooting).toHaveBeenCalledWith('http://example.com:8080');
      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });

    it('should stop node if public URL verification fails', async () => {
      const { startNodeBeforeRegistration } = await import('../../src/commands/register');
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
        startNodeBeforeRegistration({
          apiUrl: 'http://example.com:8080',
          models: ['test-model'],
        })
      ).rejects.toThrow();

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });
  });

  describe('executeRegistration with node startup', () => {
    it('should save PID to config after successful registration', async () => {
      const { executeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 12345,
        process: {} as any,
        config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://example.com:8080' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
      });
      vi.mocked(saveConfig).mockResolvedValue();

      const config: RegistrationConfig = {
        stakeAmount: ethers.parseEther('1000'),
        apiUrl: 'http://example.com:8080',
        models: ['test-model'],
      };

      await executeRegistration(config);

      expect(saveConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          processPid: 12345,
          nodeStartTime: expect.any(String),
          publicUrl: 'http://example.com:8080',
        })
      );
    });

    it('should include all config fields when saving PID', async () => {
      const { executeRegistration } = await import('../../src/commands/register');
      const mockHandle = {
        pid: 99999,
        process: {} as any,
        config: { port: 9000, host: '0.0.0.0', models: [], publicUrl: 'http://my-host.com:9000' },
        status: 'running' as const,
        startTime: new Date(),
        logs: [],
      };

      vi.mocked(processManager.spawnInferenceServer).mockResolvedValue(mockHandle);
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(true);
      vi.mocked(loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 9000,
        publicUrl: 'http://my-host.com:9000',
        models: ['model1', 'model2'],
        pricePerToken: 0.0001,
      });
      vi.mocked(saveConfig).mockResolvedValue();

      const config: RegistrationConfig = {
        stakeAmount: ethers.parseEther('500'),
        apiUrl: 'http://my-host.com:9000',
        models: ['model1', 'model2'],
      };

      await executeRegistration(config);

      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.processPid).toBe(99999);
      expect(savedConfig.publicUrl).toBe('http://my-host.com:9000');
      expect(savedConfig.models).toEqual(['model1', 'model2']);
    });

    it('should stop node if blockchain registration fails (rollback)', async () => {
      const { executeRegistration } = await import('../../src/commands/register');
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

      // Mock registration failure
      const { registerHost } = await import('../../src/registration/manager');
      vi.mocked(registerHost).mockRejectedValue(new Error('Blockchain transaction failed'));

      const config: RegistrationConfig = {
        stakeAmount: ethers.parseEther('1000'),
        apiUrl: 'http://example.com:8080',
        models: ['test-model'],
      };

      await expect(executeRegistration(config)).rejects.toThrow();

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });

    it('should not save config if registration fails', async () => {
      const { executeRegistration } = await import('../../src/commands/register');
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

      // Mock registration failure
      const { registerHost } = await import('../../src/registration/manager');
      vi.mocked(registerHost).mockRejectedValue(new Error('Transaction reverted'));

      const config: RegistrationConfig = {
        stakeAmount: ethers.parseEther('1000'),
        apiUrl: 'http://example.com:8080',
        models: ['test-model'],
      };

      await expect(executeRegistration(config)).rejects.toThrow();

      expect(saveConfig).not.toHaveBeenCalled();
    });
  });
});
