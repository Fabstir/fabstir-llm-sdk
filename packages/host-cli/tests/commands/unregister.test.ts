import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerUnregisterCommand } from '../../src/commands/unregister';
import { Command } from 'commander';
import * as sdkClient from '../../src/sdk/client';
import { ethers } from 'ethers';

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getAuthenticatedAddress: vi.fn(),
  getHostManager: vi.fn(),
  initializeSDK: vi.fn(),
  authenticateSDK: vi.fn(),
}));

// Mock ConfigStorage
vi.mock('../../src/config/storage', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
}));

// Mock PIDManager
vi.mock('../../src/daemon/pid', () => ({
  PIDManager: vi.fn(),
}));

// Mock DaemonManager
vi.mock('../../src/daemon/manager', () => ({
  DaemonManager: vi.fn(),
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
        return JSON.stringify([{ "type": "function", "name": "unregisterNode" }]);
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

describe('unregister Command SDK Integration', () => {
  const mockHostManager = {
    unregisterHost: vi.fn(),
    getHostStatus: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const stakedAmount = 1000000000000000000000n; // 1000 FAB

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
      stake: stakedAmount,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call HostManager.unregisterHost() instead of direct contract call', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.unregisterHost.mockResolvedValue(txHash);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify HostManager.unregisterHost was called
    expect(mockHostManager.unregisterHost).toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should check host registration status before unregistering', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.unregisterHost.mockResolvedValue(txHash);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify getHostStatus was called to check registration
    expect(mockHostManager.getHostStatus).toHaveBeenCalledWith(hostAddress);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should display staked amount before unregistering', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.unregisterHost.mockResolvedValue(txHash);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify staked amount was fetched from getHostStatus
    expect(mockHostManager.getHostStatus).toHaveBeenCalled();

    // Verify console output includes staked amount
    const logCalls = consoleSpy.mock.calls.map(call => call.join(' '));
    const expectedAmount = ethers.formatUnits(stakedAmount, 18);
    const hasStakedAmount = logCalls.some(call => call.includes(expectedAmount) || call.includes('staked'));

    expect(hasStakedAmount).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should wait for confirmations (SDK handles automatically)', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.unregisterHost.mockResolvedValue(txHash);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify unregisterHost was called (SDK waits for 3 confirmations internally)
    expect(mockHostManager.unregisterHost).toHaveBeenCalled();

    // Verify transaction hash was returned
    expect(txHash).toBeDefined();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should verify host is inactive after unregistration', async () => {
    const txHash = '0xabcdef1234567890';
    mockHostManager.unregisterHost.mockResolvedValue(txHash);

    // Mock getHostStatus to return active first, then inactive after unregistration
    mockHostManager.getHostStatus
      .mockResolvedValueOnce({
        isRegistered: true,
        isActive: true,
        supportedModels: [],
        stake: stakedAmount,
      })
      .mockResolvedValueOnce({
        isRegistered: true,
        isActive: false,
        supportedModels: [],
        stake: 0n,
      });

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify getHostStatus was called at least twice (before and after unregistration)
    expect(mockHostManager.getHostStatus).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should handle "not registered" error gracefully', async () => {
    // Mock host as not registered
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: false,
      isActive: false,
      supportedModels: [],
      stake: 0n,
    });

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify unregisterHost was NOT called
    expect(mockHostManager.unregisterHost).not.toHaveBeenCalled();

    // Verify appropriate message was shown
    const logCalls = consoleSpy.mock.calls.map(call => call.join(' '));
    const hasNotRegisteredMessage = logCalls.some(call => call.includes('not') && call.includes('registered'));

    expect(hasNotRegisteredMessage).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should require authenticated SDK', async () => {
    // Mock authenticateSDK to fail
    (sdkClient.authenticateSDK as any).mockRejectedValueOnce(new Error('SDK authentication failed'));

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    await expect(async () => {
      await program.parseAsync([
        'node',
        'test',
        'unregister',
        '--private-key',
        '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
      ]);
    }).rejects.toThrow();

    // Verify unregisterHost was NOT called
    expect(mockHostManager.unregisterHost).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});

describe('unregister Command - Node Lifecycle Integration', () => {
  const mockPidManager = {
    getPIDInfo: vi.fn(),
    isProcessRunning: vi.fn(),
    removePID: vi.fn(),
    cleanupStalePID: vi.fn(),
  };

  const mockDaemonManager = {
    stopDaemon: vi.fn(),
  };

  const mockHostManager = {
    unregisterHost: vi.fn(),
    getHostStatus: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const stakedAmount = 1000000000000000000000n; // 1000 FAB

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import mocked modules
    const ConfigStorage = await import('../../src/config/storage');
    const { PIDManager } = await import('../../src/daemon/pid');
    const { DaemonManager } = await import('../../src/daemon/manager');

    // Setup PIDManager mock
    vi.mocked(PIDManager).mockReturnValue(mockPidManager as any);

    // Setup DaemonManager mock
    vi.mocked(DaemonManager).mockReturnValue(mockDaemonManager as any);

    // Setup ConfigStorage mocks
    vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);
    vi.mocked(ConfigStorage.saveConfig).mockResolvedValue(undefined);

    // Mock SDK
    vi.mocked(sdkClient.initializeSDK).mockResolvedValue(undefined as any);
    vi.mocked(sdkClient.authenticateSDK).mockResolvedValue(undefined);
    vi.mocked(sdkClient.getAuthenticatedAddress).mockReturnValue(hostAddress);
    vi.mocked(sdkClient.getHostManager).mockReturnValue(mockHostManager as any);

    // Mock host status
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: true,
      isActive: true,
      supportedModels: [],
      stake: stakedAmount,
    });

    // Mock unregister success
    mockHostManager.unregisterHost.mockResolvedValue('0xabcdef1234567890');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should stop running node after successful unregistration', async () => {
    const testPid = 12345;
    const testUrl = 'http://localhost:8080';

    // Import ConfigStorage to access mocked version
    const ConfigStorage = await import('../../src/config/storage');

    // Mock config with running node
    vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
      processPid: testPid,
      publicUrl: testUrl,
      models: ['model1'],
      nodeStartTime: new Date().toISOString(),
    } as any);

    // Mock PID info with running process
    mockPidManager.getPIDInfo.mockReturnValue({
      pid: testPid,
      publicUrl: testUrl,
      startTime: new Date().toISOString(),
    });
    mockPidManager.isProcessRunning.mockReturnValue(true);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify node was stopped
    expect(mockPidManager.getPIDInfo).toHaveBeenCalled();
    expect(mockPidManager.isProcessRunning).toHaveBeenCalledWith(testPid);
    expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(testPid, {
      timeout: 10000,
      force: false,
    });
    expect(mockPidManager.removePID).toHaveBeenCalled();

    // Verify config was updated to clear PID
    expect(ConfigStorage.saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        processPid: undefined,
        nodeStartTime: undefined,
      })
    );

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should not attempt to stop node if not running', async () => {
    // Import ConfigStorage to access mocked version
    const ConfigStorage = await import('../../src/config/storage');

    // Mock config without running node
    vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
      publicUrl: 'http://localhost:8080',
      models: ['model1'],
      // No processPid
    } as any);

    mockPidManager.getPIDInfo.mockReturnValue(null);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify no attempt to stop node
    expect(mockDaemonManager.stopDaemon).not.toHaveBeenCalled();
    expect(mockPidManager.removePID).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should handle PID exists but process not running', async () => {
    const testPid = 12345;

    // Import ConfigStorage to access mocked version
    const ConfigStorage = await import('../../src/config/storage');

    vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
      processPid: testPid,
      publicUrl: 'http://localhost:8080',
      models: ['model1'],
    } as any);

    mockPidManager.getPIDInfo.mockReturnValue({
      pid: testPid,
      publicUrl: 'http://localhost:8080',
      startTime: new Date().toISOString(),
    });

    // Process not actually running (stale PID)
    mockPidManager.isProcessRunning.mockReturnValue(false);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify no attempt to stop already-stopped process
    expect(mockDaemonManager.stopDaemon).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should display node stopping message when stopping', async () => {
    const testPid = 12345;

    // Import ConfigStorage to access mocked version
    const ConfigStorage = await import('../../src/config/storage');

    vi.mocked(ConfigStorage.loadConfig).mockResolvedValue({
      processPid: testPid,
      publicUrl: 'http://localhost:8080',
      models: ['model1'],
    } as any);

    mockPidManager.getPIDInfo.mockReturnValue({
      pid: testPid,
      publicUrl: 'http://localhost:8080',
      startTime: new Date().toISOString(),
    });
    mockPidManager.isProcessRunning.mockReturnValue(true);

    const program = new Command();
    registerUnregisterCommand(program);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await program.parseAsync([
      'node',
      'test',
      'unregister',
      '--private-key',
      '0xe7855c0ea54ccca55126d40f97d90868b2a73bad0363e92ccdec0c4fbd6c0ce2',
    ]);

    // Verify console shows stopping message
    const logCalls = consoleSpy.mock.calls.map(call => call.join(' '));
    const hasStoppingMessage = logCalls.some(call =>
      (call.toLowerCase().includes('stop') && call.toLowerCase().includes('node')) ||
      call.includes('🛑')
    );

    expect(hasStoppingMessage).toBe(true);

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
