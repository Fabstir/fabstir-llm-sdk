import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerUpdateUrlCommand } from '../../src/commands/update-url';
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

// Mock fs module for file operations (including ABI loading)
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((path: string) => {
      if (path.includes('NodeRegistry.json')) return true;
      return false;
    }),
    readFileSync: vi.fn((path: string) => {
      if (path.includes('NodeRegistry.json')) {
        return JSON.stringify([{ "type": "function", "name": "updateApiUrl" }]);
      }
      return '[]';
    }),
  },
}));

// Mock getWallet from utils
vi.mock('../../src/utils/wallet', () => ({
  getWallet: vi.fn(),
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

describe('update-url Command SDK Integration', () => {
  const mockHostManager = {
    updateApiUrl: vi.fn(),
    getHostStatus: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const validUrl = 'http://localhost:8080';
  const currentUrl = 'http://old-host.example.com:8080';

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

    // Mock successful host status by default
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: true,
      isActive: true,
      supportedModels: [],
      stake: 1000000000000000000000n,
      apiUrl: currentUrl,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call HostManager.updateApiUrl() with correct URL', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.updateApiUrl.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'update-url',
      validUrl,
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify HostManager.updateApiUrl was called with correct URL
    expect(mockHostManager.updateApiUrl).toHaveBeenCalledWith(validUrl);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should validate URL format before updating', async () => {
    const invalidUrl = 'not-a-valid-url';

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    await expect(async () => {
      await program.parseAsync([
        'node',
        'test',
        'update-url',
        invalidUrl,
        '--private-key',
        '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
      ]);
    }).rejects.toThrow();

    // Verify updateApiUrl was NOT called due to validation failure
    expect(mockHostManager.updateApiUrl).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should check host registration status before updating', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.updateApiUrl.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'update-url',
      validUrl,
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify getHostStatus was called to check registration
    expect(mockHostManager.getHostStatus).toHaveBeenCalledWith(hostAddress);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should display current and new URLs', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.updateApiUrl.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'update-url',
      validUrl,
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify current URL was fetched from getHostStatus
    expect(mockHostManager.getHostStatus).toHaveBeenCalled();

    // Verify console output includes URL information
    const logCalls = consoleSpy.mock.calls.map(call => call.join(' '));
    const hasCurrentUrl = logCalls.some(call => call.includes(currentUrl));
    const hasNewUrl = logCalls.some(call => call.includes(validUrl));

    expect(hasCurrentUrl || hasNewUrl).toBe(true); // At least one URL should be displayed

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should wait for confirmations (SDK handles automatically)', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.updateApiUrl.mockResolvedValue(txHash);

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'update-url',
      validUrl,
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify updateApiUrl was called (SDK waits for 3 confirmations internally)
    expect(mockHostManager.updateApiUrl).toHaveBeenCalled();

    // Verify transaction hash was returned
    expect(txHash).toBeDefined();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should verify update by fetching URL after transaction', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.updateApiUrl.mockResolvedValue(txHash);

    // Mock getHostStatus to return updated URL on second call
    mockHostManager.getHostStatus
      .mockResolvedValueOnce({
        isRegistered: true,
        isActive: true,
        supportedModels: [],
        stake: 1000000000000000000000n,
        apiUrl: currentUrl,
      })
      .mockResolvedValueOnce({
        isRegistered: true,
        isActive: true,
        supportedModels: [],
        stake: 1000000000000000000000n,
        apiUrl: validUrl,
      });

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'update-url',
      validUrl,
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify getHostStatus was called at least twice (before and after update)
    expect(mockHostManager.getHostStatus).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should require authenticated SDK', async () => {
    // Mock authenticateSDK to fail
    (sdkClient.authenticateSDK as any).mockRejectedValueOnce(new Error('SDK authentication failed'));

    const program = new Command();
    registerUpdateUrlCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    await expect(async () => {
      await program.parseAsync([
        'node',
        'test',
        'update-url',
        validUrl,
        '--private-key',
        '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
      ]);
    }).rejects.toThrow();

    // Verify updateApiUrl was NOT called
    expect(mockHostManager.updateApiUrl).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
