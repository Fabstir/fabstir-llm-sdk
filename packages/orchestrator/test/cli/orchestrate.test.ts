import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing
const mockOrchestrate = vi.fn().mockResolvedValue({
  taskGraphId: 'g-1', synthesis: 'Final answer',
  subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 100,
});
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockServerStart = vi.fn().mockResolvedValue(undefined);
const mockServerStop = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/core/OrchestratorManager', () => ({
  OrchestratorManager: vi.fn().mockImplementation(() => ({
    orchestrate: mockOrchestrate,
    initialize: mockInitialize,
    destroy: mockDestroy,
  })),
}));

vi.mock('../../src/a2a/server/OrchestratorA2AServer', () => ({
  OrchestratorA2AServer: vi.fn().mockImplementation(() => ({
    start: mockServerStart,
    stop: mockServerStop,
  })),
}));

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    getSessionManager: vi.fn(),
    getPaymentManager: vi.fn(),
    getModelManager: vi.fn().mockReturnValue({
      getAvailableModelsWithHosts: vi.fn().mockResolvedValue([]),
    }),
  })),
}));

import { runCLI } from '../../src/cli/orchestrate';

describe('CLI', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FABSTIR_PRIVATE_KEY: '0xabc123',
      FABSTIR_FAST_MODEL: 'Repo:fast.gguf',
      FABSTIR_DEEP_MODEL: 'Repo:deep.gguf',
      FABSTIR_RPC_URL: 'http://localhost:8545',
      FABSTIR_CHAIN_ID: '84532',
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('CLI with goal argument calls orchestrate and prints result', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'Analyze this data']);
    expect(mockOrchestrate).toHaveBeenCalledWith('Analyze this data');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('CLI without goal starts A2A server', async () => {
    await runCLI(['node', 'orchestrate']);
    expect(mockServerStart).toHaveBeenCalled();
  });

  it('CLI reads config from environment variables', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    expect(mockInitialize).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('CLI exits with error on missing FABSTIR_PRIVATE_KEY', async () => {
    delete process.env.FABSTIR_PRIVATE_KEY;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    await runCLI(['node', 'orchestrate', 'test']);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FABSTIR_PRIVATE_KEY'));
    expect(exitSpy).toHaveBeenCalledWith(1);
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
