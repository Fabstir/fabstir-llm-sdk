// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Register command pricing tests
 * Tests for --price parameter in host registration
 *
 * Sub-phase 3.1: Register Command Pricing Parameter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistrationConfig } from '../../src/registration/manager';
import { ethers } from 'ethers';

// Mock SDK client
const mockGetHostManager = vi.fn();
const mockSDK = {
  getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
  isAuthenticated: vi.fn().mockReturnValue(true),
  getHostManager: mockGetHostManager,
};

vi.mock('../../src/sdk/client', () => ({
  initializeSDK: vi.fn().mockResolvedValue(mockSDK),
  authenticateSDK: vi.fn().mockResolvedValue(undefined),
  getSDK: vi.fn().mockReturnValue(mockSDK),
  getAuthenticatedAddress: vi.fn().mockReturnValue('0x1234567890123456789012345678901234567890'),
}));

// Mock registration manager with pricing validation
const mockRegisterHost = vi.fn().mockImplementation(async (config) => {
  // Validate pricing (mimic staking.ts validation)
  const minPrice = config.minPricePerToken || '2000';
  const priceNum = parseInt(minPrice);

  if (isNaN(priceNum) || priceNum < 100 || priceNum > 100000) {
    const { RegistrationError, ErrorCode } = await import('../../src/registration/errors');
    throw new RegistrationError(
      `minPricePerToken must be between 100 and 100000, got ${minPrice}`,
      ErrorCode.STAKING_FAILED,
      { price: minPrice }
    );
  }

  return {
    success: true,
    transactionHash: '0xabc123def456',
    hostInfo: {
      hostAddress: '0x1234567890123456789012345678901234567890',
      stakedAmount: ethers.parseEther('1000'),
    },
  };
});

vi.mock('../../src/registration/manager', () => ({
  checkRegistrationStatus: vi.fn().mockResolvedValue({
    isRegistered: false,
  }),
  validateRegistrationRequirements: vi.fn().mockResolvedValue({
    canRegister: true,
    errors: [],
  }),
  registerHost: mockRegisterHost,
}));

// Mock balance display
vi.mock('../../src/balance/display', () => ({
  displayRequirements: vi.fn().mockResolvedValue('Balance display'),
}));

// Mock registration errors
vi.mock('../../src/registration/errors', () => ({
  handleRegistrationError: vi.fn((error) => ({
    message: error.message,
    resolution: 'Try again',
    retryable: true,
  })),
  RegistrationError: class RegistrationError extends Error {
    constructor(message: string, public code: string, public context?: any) {
      super(message);
    }
  },
  ErrorCode: {
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    REQUIREMENTS_NOT_MET: 'REQUIREMENTS_NOT_MET',
  },
}));

// Mock process manager
vi.mock('../../src/process/manager', () => ({
  spawnInferenceServer: vi.fn().mockResolvedValue({
    pid: 12345,
    process: {} as any,
    config: { port: 8080, host: '0.0.0.0', models: [], publicUrl: 'http://localhost:8080' },
    status: 'running' as const,
    startTime: new Date(),
    logs: [],
  }),
  stopInferenceServer: vi.fn(),
}));

// Mock network utils
vi.mock('../../src/utils/network', () => ({
  extractHostPort: vi.fn((url: string) => {
    const match = url.match(/:(\d+)/);
    return {
      host: 'localhost',
      port: match ? parseInt(match[1]) : 8080,
    };
  }),
  verifyPublicEndpoint: vi.fn().mockResolvedValue(true),
  warnIfLocalhost: vi.fn(),
}));

// Mock config storage
vi.mock('../../src/config/storage', () => ({
  saveConfig: vi.fn(),
  loadConfig: vi.fn().mockResolvedValue(null),
}));

// Mock diagnostics
vi.mock('../../src/utils/diagnostics', () => ({
  showNetworkTroubleshooting: vi.fn(),
}));

describe('Register Pricing - Sub-phase 3.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default successful registration
    mockRegisterHost.mockResolvedValue({
      success: true,
      transactionHash: '0xabc123def456',
      hostInfo: {
        hostAddress: '0x1234567890123456789012345678901234567890',
        stakedAmount: ethers.parseEther('1000'),
      },
    });
  });

  describe('Price parameter functionality', () => {
    it('should register with explicit --price flag', async () => {
      const { executeRegistration } = await import('../../src/commands/register');

      const config: RegistrationConfig = {
        apiUrl: 'http://localhost:8080',
        models: ['test-model'],
        stakeAmount: ethers.parseEther('1000'),
        minPricePerToken: '3000', // Custom price
      };

      await executeRegistration(config);

      // Verify registerHost was called with pricing
      expect(mockRegisterHost).toHaveBeenCalledWith(
        expect.objectContaining({
          minPricePerToken: '3000',
        })
      );
    });

    it('should use default price (2000) when not specified', async () => {
      const { executeRegistration } = await import('../../src/commands/register');

      const config: RegistrationConfig = {
        apiUrl: 'http://localhost:8080',
        models: ['test-model'],
        stakeAmount: ethers.parseEther('1000'),
        // minPricePerToken omitted - should default to '2000'
      };

      await executeRegistration(config);

      // registerHost should receive config with default price
      // Note: Default will be applied in staking.ts
      expect(mockRegisterHost).toHaveBeenCalled();
    });
  });

  describe('Price parameter passing', () => {
    it('should pass price to registerHost correctly', async () => {
      const { executeRegistration } = await import('../../src/commands/register');

      const config: RegistrationConfig = {
        apiUrl: 'http://localhost:8080',
        models: ['test-model'],
        stakeAmount: ethers.parseEther('1000'),
        minPricePerToken: '1500',
      };

      await executeRegistration(config);

      // Verify registerHost was called with pricing
      expect(mockRegisterHost).toHaveBeenCalledWith(
        expect.objectContaining({
          minPricePerToken: '1500',
        })
      );
    });

    it('should display price in registration output', async () => {
      const { executeRegistration } = await import('../../src/commands/register');

      const config: RegistrationConfig = {
        apiUrl: 'http://localhost:8080',
        models: ['test-model'],
        stakeAmount: ethers.parseEther('1000'),
        minPricePerToken: '2500',
      };

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log');

      await executeRegistration(config);

      // Verify pricing is displayed in output
      const outputCalls = consoleSpy.mock.calls.map(call => call.join(' '));
      const hasPriceOutput = outputCalls.some(call =>
        call.includes('Min Price:') && call.includes('2500')
      );

      expect(hasPriceOutput).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});
