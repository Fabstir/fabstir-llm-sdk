// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * set-model-pricing and clear-model-pricing command tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as sdkClient from '../../src/sdk/client';
import * as modelRegistry from '../../src/services/ModelRegistryClient';

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getAuthenticatedAddress: vi.fn(),
  getHostManager: vi.fn(),
  initializeSDK: vi.fn(),
  authenticateSDK: vi.fn(),
}));

// Mock ModelRegistryClient
vi.mock('../../src/services/ModelRegistryClient', () => ({
  validateModelString: vi.fn(),
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

import { registerSetModelPricingCommand } from '../../src/commands/set-model-pricing';
import { registerClearModelPricingCommand } from '../../src/commands/clear-model-pricing';

describe('set-model-pricing Command', () => {
  const mockHostManager = {
    setModelPricing: vi.fn(),
    getHostStatus: vi.fn(),
    getHostInfo: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const testModelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
  const testModelString = 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf';

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(hostAddress);
    (sdkClient.getHostManager as any).mockReturnValue(mockHostManager);
    (sdkClient.initializeSDK as any).mockResolvedValue({});
    (sdkClient.authenticateSDK as any).mockResolvedValue(undefined);

    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: true,
      isActive: true,
    });

    mockHostManager.setModelPricing.mockResolvedValue('0xmocktxhash123');

    (modelRegistry.validateModelString as any).mockResolvedValue({
      valid: true,
      modelId: testModelId,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls setModelPricing with correct modelId and stablePrice', async () => {
    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '10']);

    // USDC default: price 10 * PRICE_PRECISION(1000) = 10000
    expect(mockHostManager.setModelPricing).toHaveBeenCalledWith(testModelId, '0', '10000');
    consoleSpy.mockRestore();
  });

  it('validates model string format (rejects missing colon)', async () => {
    (modelRegistry.validateModelString as any).mockResolvedValue({
      valid: false,
      error: 'Invalid format. Expected "repo:fileName"',
    });

    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', 'invalidmodel', '--price', '10']);
    }).rejects.toThrow('Process.exit');

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('rejects unapproved model', async () => {
    (modelRegistry.validateModelString as any).mockResolvedValue({
      valid: false,
      error: 'Model is not approved',
    });

    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '10']);
    }).rejects.toThrow('Process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('not approved'));
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('rejects when host not registered', async () => {
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: false,
      isActive: false,
    });

    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '10']);
    }).rejects.toThrow('Process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('not registered'));
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('validates price range (rejects 0 and > 100,000,000)', async () => {
    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    // Price too low
    await expect(async () => {
      await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '0']);
    }).rejects.toThrow('Process.exit');

    vi.clearAllMocks();
    // Reset mocks for second test
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(hostAddress);
    (sdkClient.getHostManager as any).mockReturnValue(mockHostManager);
    (sdkClient.initializeSDK as any).mockResolvedValue({});
    (sdkClient.authenticateSDK as any).mockResolvedValue(undefined);
    mockHostManager.getHostStatus.mockResolvedValue({ isRegistered: true, isActive: true });
    (modelRegistry.validateModelString as any).mockResolvedValue({ valid: true, modelId: testModelId });

    // Price too high
    const consoleErrorSpy2 = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy2 = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      const program2 = new Command();
      registerSetModelPricingCommand(program2);
      await program2.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '100000001']);
    }).rejects.toThrow('Process.exit');

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    consoleErrorSpy2.mockRestore();
    processExitSpy2.mockRestore();
  });

  it('supports --price-type eth for native pricing', async () => {
    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '500000', '--price-type', 'eth']);

    // ETH: 500000 Gwei = 500000 * 1e9 wei = 500000000000000
    expect(mockHostManager.setModelPricing).toHaveBeenCalledWith(
      testModelId,
      '500000000000000',
      '0'
    );
    consoleSpy.mockRestore();
  });

  it('displays transaction hash on success', async () => {
    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '10']);

    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('0xmocktxhash123');
    consoleSpy.mockRestore();
  });

  it('defaults --price-type to usdc', async () => {
    const program = new Command();
    registerSetModelPricingCommand(program);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // No --price-type flag
    await program.parseAsync(['node', 'test', 'set-model-pricing', '--model', testModelString, '--price', '5']);

    // Should call with stablePrice set, nativePrice = "0"
    expect(mockHostManager.setModelPricing).toHaveBeenCalledWith(testModelId, '0', '5000');
    consoleSpy.mockRestore();
  });
});

describe('clear-model-pricing Command', () => {
  const mockHostManager = {
    clearModelPricing: vi.fn(),
    getHostStatus: vi.fn(),
  };

  const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
  const testModelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
  const testModelString = 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf';

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getAuthenticatedAddress as any).mockReturnValue(hostAddress);
    (sdkClient.getHostManager as any).mockReturnValue(mockHostManager);
    (sdkClient.initializeSDK as any).mockResolvedValue({});
    (sdkClient.authenticateSDK as any).mockResolvedValue(undefined);

    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: true,
      isActive: true,
    });

    mockHostManager.clearModelPricing.mockResolvedValue('0xcleartxhash456');

    (modelRegistry.validateModelString as any).mockResolvedValue({
      valid: true,
      modelId: testModelId,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls clearModelPricing with correct modelId', async () => {
    const program = new Command();
    registerClearModelPricingCommand(program);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await program.parseAsync(['node', 'test', 'clear-model-pricing', '--model', testModelString]);

    expect(mockHostManager.clearModelPricing).toHaveBeenCalledWith(testModelId);
    consoleSpy.mockRestore();
  });

  it('validates model string', async () => {
    (modelRegistry.validateModelString as any).mockResolvedValue({
      valid: false,
      error: 'Invalid format. Expected "repo:fileName"',
    });

    const program = new Command();
    registerClearModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'clear-model-pricing', '--model', 'invalidmodel']);
    }).rejects.toThrow('Process.exit');

    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('rejects when host not registered', async () => {
    mockHostManager.getHostStatus.mockResolvedValue({
      isRegistered: false,
      isActive: false,
    });

    const program = new Command();
    registerClearModelPricingCommand(program);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?) => { throw new Error(`Process.exit(${code})`); });

    await expect(async () => {
      await program.parseAsync(['node', 'test', 'clear-model-pricing', '--model', testModelString]);
    }).rejects.toThrow('Process.exit');

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('not registered'));
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });
});
