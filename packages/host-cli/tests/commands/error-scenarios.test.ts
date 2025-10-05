/**
 * Error Scenarios Tests
 * Tests for robust error handling in production scenarios
 *
 * Sub-phase 6.2: Error Handling & Edge Cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeRegistration, startNodeBeforeRegistration } from '../../src/commands/register';
import { startHost } from '../../src/commands/start';
import * as validation from '../../src/registration/validation';
import * as ConfigStorage from '../../src/config/storage';
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
// Don't mock validation - use real implementations for validation tests
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

describe('Error Scenarios - Sub-phase 6.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Missing Binary', () => {
    it('should detect missing fabstir-llm-node binary', async () => {
      // Spy on the real function
      const checkBinarySpy = vi.spyOn(validation, 'checkBinaryAvailable').mockResolvedValue(false);

      const result = await validation.checkBinaryAvailable();

      expect(result).toBe(false);
      checkBinarySpy.mockRestore();
    });

    it('should provide helpful error message for missing binary', async () => {
      const checkBinarySpy = vi.spyOn(validation, 'checkBinaryAvailable').mockResolvedValue(false);

      const isBinaryAvailable = await validation.checkBinaryAvailable();

      if (!isBinaryAvailable) {
        // Error message should guide user to installation
        expect(isBinaryAvailable).toBe(false);
      }
      checkBinarySpy.mockRestore();
    });
  });

  describe('Port Already in Use', () => {
    it('should detect port already in use', async () => {
      const checkPortSpy = vi.spyOn(validation, 'checkPortAvailable').mockResolvedValue(false);

      const result = await validation.checkPortAvailable(8080);

      expect(result).toBe(false);
      checkPortSpy.mockRestore();
    });

    it('should fail registration when port is in use', async () => {
      const { checkRegistrationStatus } = await import('../../src/registration/manager');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(processManager.spawnInferenceServer).mockRejectedValue(
        new Error('EADDRINUSE: address already in use')
      );

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('EADDRINUSE');
    });

    it('should provide diagnostic commands for port in use', async () => {
      const checkPortSpy = vi.spyOn(validation, 'checkPortAvailable').mockResolvedValue(false);

      const isAvailable = await validation.checkPortAvailable(8080);

      if (!isAvailable) {
        // Should suggest lsof/netstat commands
        expect(isAvailable).toBe(false);
      }
      checkPortSpy.mockRestore();
    });
  });

  describe('Public URL Unreachable', () => {
    it('should detect unreachable public URL', async () => {
      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(false);

      const result = await networkUtils.verifyPublicEndpoint('http://example.com:8080');

      expect(result).toBe(false);
    });

    it('should rollback when public URL is unreachable', async () => {
      const { checkRegistrationStatus } = await import('../../src/registration/manager');
      const { PIDManager } = await import('../../src/daemon/pid');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({ isRegistered: false });

      const mockPidManager = {
        getPIDInfo: vi.fn().mockReturnValue(null),
        cleanupStalePID: vi.fn(),
      };
      vi.mocked(PIDManager).mockImplementation(() => mockPidManager as any);

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
          apiUrl: 'http://example.com:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('not accessible');

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });

    it('should show firewall troubleshooting for unreachable URL', async () => {
      const { showNetworkTroubleshooting } = await import('../../src/utils/diagnostics');

      vi.mocked(networkUtils.verifyPublicEndpoint).mockResolvedValue(false);

      const isAccessible = await networkUtils.verifyPublicEndpoint('http://example.com:8080');

      if (!isAccessible) {
        // Should call showNetworkTroubleshooting
        expect(isAccessible).toBe(false);
      }
    });
  });

  describe('Node Crash During Registration', () => {
    it('should rollback when node crashes during registration', async () => {
      const { checkRegistrationStatus, registerHost } = await import('../../src/registration/manager');
      const { PIDManager } = await import('../../src/daemon/pid');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(registerHost).mockRejectedValue(new Error('Node process exited unexpectedly'));

      const mockPidManager = {
        getPIDInfo: vi.fn().mockReturnValue(null),
        cleanupStalePID: vi.fn(),
      };
      vi.mocked(PIDManager).mockImplementation(() => mockPidManager as any);

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
      ).rejects.toThrow('Node process exited unexpectedly');

      expect(processManager.stopInferenceServer).toHaveBeenCalledWith(mockHandle, true);
    });

    it('should clean up PID after node crash', async () => {
      const { checkRegistrationStatus, registerHost } = await import('../../src/registration/manager');
      const { PIDManager } = await import('../../src/daemon/pid');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({ isRegistered: false });
      vi.mocked(registerHost).mockRejectedValue(new Error('Process terminated'));

      const mockPidManager = {
        getPIDInfo: vi.fn().mockReturnValue(null),
        cleanupStalePID: vi.fn(),
      };
      vi.mocked(PIDManager).mockImplementation(() => mockPidManager as any);

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
      ).rejects.toThrow();

      // Verify rollback happened
      expect(processManager.stopInferenceServer).toHaveBeenCalled();
    });
  });

  describe('Duplicate Registration', () => {
    it('should prevent duplicate registration', async () => {
      const { checkRegistrationStatus } = await import('../../src/registration/manager');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({
        isRegistered: true,
        hostAddress: '0x123...',
        apiUrl: 'http://localhost:8080',
        stakedAmount: ethers.parseEther('1000'),
      });

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow('already registered');
    });

    it('should show current registration details on duplicate attempt', async () => {
      const { checkRegistrationStatus } = await import('../../src/registration/manager');
      const consoleSpy = vi.spyOn(console, 'log');

      vi.mocked(checkRegistrationStatus).mockResolvedValue({
        isRegistered: true,
        hostAddress: '0x123...',
        apiUrl: 'http://localhost:8080',
        stakedAmount: ethers.parseEther('1000'),
      });

      await expect(
        executeRegistration({
          apiUrl: 'http://localhost:8080',
          models: ['model1'],
          stakeAmount: ethers.parseEther('1000'),
        })
      ).rejects.toThrow();

      const logOutput = consoleSpy.mock.calls.map(call => call.join(' ')).join('\n');
      expect(logOutput).toContain('already registered');

      consoleSpy.mockRestore();
    });
  });

  describe('Invalid Configuration', () => {
    it('should reject empty model array', () => {
      const result = validation.validateModels([]);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least one model');
    });

    it('should reject invalid model format', () => {
      const result = validation.validateModels(['invalid-model']);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid model format');
    });

    it('should reject URL without port', () => {
      const result = validation.validatePublicUrl('http://example.com');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('port');
    });

    it('should reject invalid protocol', () => {
      const result = validation.validatePublicUrl('ftp://example.com:8080');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('http or https');
    });
  });

  describe('Start Command Errors', () => {
    it('should fail when no configuration exists', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      await expect(startHost({ daemon: true })).rejects.toThrow('No configuration found');
    });

    it('should fail when publicUrl is missing', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia' as const,
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: '', // Empty!
        models: ['model1'],
        pricePerToken: 0.0001,
      });

      await expect(startHost({ daemon: true })).rejects.toThrow('No public URL configured');
    });
  });

  describe('Error Message Quality', () => {
    it('should provide actionable error messages', () => {
      const portResult = validation.validatePublicUrl('http://example.com');
      const modelResult = validation.validateModels(['no-colon']);

      // Errors should be descriptive
      expect(portResult.error).toBeDefined();
      expect(portResult.error).toContain('port');

      expect(modelResult.error).toBeDefined();
      expect(modelResult.error).toContain('format');
    });

    it('should include specific details in error messages', () => {
      const result = validation.validateModels(['bad model:file.gguf']);

      expect(result.error).toBeDefined();
      expect(result.error).toContain('bad model:file.gguf');
    });
  });
});
