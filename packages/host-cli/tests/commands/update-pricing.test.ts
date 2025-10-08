/**
 * Update-pricing command tests
 * Tests for updating host minimum price per token
 *
 * Sub-phase 3.2: Update-Pricing Command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerUpdatePricingCommand } from '../../src/commands/update-pricing';
import { Command } from 'commander';
import * as sdkClient from '../../src/sdk/client';

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getAuthenticatedAddress: vi.fn(),
  getHostManager: vi.fn(),
  initializeSDK: vi.fn(),
  authenticateSDK: vi.fn(),
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    blue: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    yellow: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
  }
}));

describe('update-pricing Command', () => {
  const mockHostManager = {
    updatePricing: vi.fn(),
    getHostInfo: vi.fn(),
    getHostStatus: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const currentPrice = 2000n;

  const mockSDK = {
    isAuthenticated: vi.fn(),
    getHostManager: vi.fn(),
    config: {
      contractAddresses: {
        nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getSDK as any).mockReturnValue(mockSDK);
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(hostAddress);
    (sdkClient.getHostManager as any).mockReturnValue(mockHostManager);
    (sdkClient.initializeSDK as any).mockResolvedValue(mockSDK);
    (sdkClient.authenticateSDK as any).mockResolvedValue(undefined);
    mockSDK.isAuthenticated.mockReturnValue(true);
    mockSDK.getHostManager.mockReturnValue(mockHostManager);

    // Mock host info with current pricing
    mockHostManager.getHostInfo.mockResolvedValue({
      address: hostAddress,
      apiUrl: 'http://localhost:8080',
      metadata: { hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 }, capabilities: [], location: 'us-east', maxConcurrent: 5, costPerToken: 0.0001 },
      supportedModels: [],
      isActive: true,
      stake: 1000000000000000000000n,
      minPricePerToken: currentPrice,
    });

    // Mock host status
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: true,
      isActive: true,
      supportedModels: [],
      stake: 1000000000000000000000n,
      apiUrl: 'http://localhost:8080',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call HostManager.updatePricing() with correct price', async () => {
    const newPrice = '3000';
    const txHash = '0xabcdef1234567890';
    mockHostManager.updatePricing.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdatePricingCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'update-pricing', '--price', newPrice]);

    expect(mockHostManager.updatePricing).toHaveBeenCalledWith(newPrice);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(txHash));

    consoleSpy.mockRestore();
  });

  it('should display current and new pricing', async () => {
    const newPrice = '5000';
    const txHash = '0xabcdef1234567890';
    mockHostManager.updatePricing.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdatePricingCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'update-pricing', '--price', newPrice]);

    // Verify current price is displayed
    const outputCalls = consoleSpy.mock.calls.map(call => call.join(' '));
    const hasCurrentPrice = outputCalls.some(call =>
      call.includes('Current') && call.includes('2000')
    );
    const hasNewPrice = outputCalls.some(call =>
      call.includes('New') && call.includes('5000')
    );

    expect(hasCurrentPrice).toBe(true);
    expect(hasNewPrice).toBe(true);

    consoleSpy.mockRestore();
  });

  it('should reject when host not registered', async () => {
    // Mock host as not registered
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: false,
      isActive: false,
      supportedModels: [],
      stake: 0n,
    });

    const program = new Command();
    registerUpdatePricingCommand(program);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit(${code})`);
    });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'update-pricing', '--price', '3000']);
    }).rejects.toThrow('Process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('not registered')
    );

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should validate price range', async () => {
    const program = new Command();
    registerUpdatePricingCommand(program);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit(${code})`);
    });

    // Test price too low
    await expect(async () => {
      await program.parseAsync(['node', 'test', 'update-pricing', '--price', '50']);
    }).rejects.toThrow('Process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/price|invalid/i)
    );

    vi.clearAllMocks();

    // Test price too high
    await expect(async () => {
      const program2 = new Command();
      registerUpdatePricingCommand(program2);
      await program2.parseAsync(['node', 'test', 'update-pricing', '--price', '200000']);
    }).rejects.toThrow('Process.exit');

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
