import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing
const mockOrchestrate = vi.fn().mockResolvedValue({
  taskGraphId: 'g-1', synthesis: 'Final answer', subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 100,
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

const mockAuthenticate = vi.fn().mockResolvedValue(undefined);

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    getSessionManager: vi.fn(),
    getPaymentManager: vi.fn(),
    getModelManager: vi.fn().mockReturnValue({
      getAvailableModelsWithHosts: vi.fn().mockResolvedValue([]),
      setHostManager: vi.fn(),
    }),
    getClientManager: vi.fn().mockReturnValue({
      getHostManager: vi.fn().mockReturnValue({}),
    }),
  })),
  ChainRegistry: { getChain: vi.fn().mockReturnValue({
    rpcUrl: 'https://rpc.example.com',
    contracts: { jobMarketplace: '0x1', nodeRegistry: '0x2', paymentEscrow: '0x3', proofSystem: '0x4', hostEarnings: '0x5', usdcToken: '0x6', fabToken: '0x7' },
  }) },
  ChainId: { BASE_SEPOLIA: 84532 },
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
    expect(mockOrchestrate).toHaveBeenCalledWith('Analyze this data', expect.objectContaining({ onProgress: expect.any(Function) }));
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

  it('CLI authenticates SDK with privatekey before initialize', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    expect(mockAuthenticate).toHaveBeenCalledWith('privatekey', { privateKey: '0xabc123' });
    expect(mockAuthenticate.mock.invocationCallOrder[0]).toBeLessThan(mockInitialize.mock.invocationCallOrder[0]);
    consoleSpy.mockRestore();
  });

  it('CLI uses ChainRegistry for contract addresses when no explicit RPC URL', async () => {
    delete process.env.FABSTIR_RPC_URL;
    const { ChainRegistry } = await import('@fabstir/sdk-core');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    expect(ChainRegistry.getChain).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('CLI passes planning model from FABSTIR_PLANNING_MODEL env', async () => {
    process.env.FABSTIR_PLANNING_MODEL = 'Repo:planner.gguf';
    const { OrchestratorManager } = await import('../../src/core/OrchestratorManager');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    const config = (OrchestratorManager as any).mock.calls.at(-1)[0];
    expect(config.models.planning).toBe('Repo:planner.gguf');
    consoleSpy.mockRestore();
  });

  it('CLI passes deep model as planning model when FABSTIR_PLANNING_MODEL not set', async () => {
    delete process.env.FABSTIR_PLANNING_MODEL;
    const { OrchestratorManager } = await import('../../src/core/OrchestratorManager');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    const config = (OrchestratorManager as any).mock.calls.at(-1)[0];
    expect(config.models.planning).toBe('Repo:deep.gguf');
    consoleSpy.mockRestore();
  });

  it('CLI passes onProgress callback that logs to stderr', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCLI(['node', 'orchestrate', 'test goal']);
    const call = mockOrchestrate.mock.calls.at(-1);
    const onProgress = call[1]?.onProgress;
    expect(onProgress).toBeDefined();
    onProgress({ phase: 'decomposing', message: 'test msg' });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('decomposing'));
    stderrSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
