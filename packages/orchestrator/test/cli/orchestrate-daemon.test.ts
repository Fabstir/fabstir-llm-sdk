// The delegate-daemon path of runCLI (orchestrator 0.8.0, IMPLEMENTATION-ORCHESTRATOR-OPENSHELL round 1 G3): the pool
// that serves /v1/* — the path an OpenShell sandbox uses — gets the pinned host.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const poolConfigs: any[] = [];
vi.mock('../../src/core/SessionPool', () => ({ SessionPool: vi.fn().mockImplementation((cfg: any) => { poolConfigs.push(cfg); return {}; }) }));
vi.mock('../../src/core/ModelRouter', () => ({ ModelRouter: vi.fn().mockImplementation(() => ({ initialize: vi.fn(async () => {}), getAvailableModels: () => [] })) }));
vi.mock('../../src/openai/OpenAIServer', () => ({ OpenAIServer: vi.fn().mockImplementation(() => ({ app: { get: vi.fn(), post: vi.fn() }, start: vi.fn(async () => {}) })) }));
vi.mock('../../src/delegate/control-plane', () => ({ DelegateControlPlane: vi.fn().mockImplementation(() => ({ mount: vi.fn() })) }));
vi.mock('../../src/delegate/delegate-key', async () => {
  const { ethers } = await vi.importActual<typeof import('ethers')>('ethers');
  const wallet = ethers.Wallet.createRandom();
  return { loadOrCreateDelegateKey: vi.fn(() => ({ wallet, address: wallet.address })), defaultDelegateKeyPath: () => '/tmp/x' };
});
vi.mock('ethers', async () => {
  const actual = await vi.importActual<any>('ethers');
  class FakeProvider { async getBalance() { return 10n ** 18n; } }
  return { ...actual, ethers: { ...actual.ethers, JsonRpcProvider: FakeProvider } };
});
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => ({
    authenticateAsDelegate: vi.fn(async () => {}),
    getPaymentManager: vi.fn(() => ({})),
    getModelManager: vi.fn(() => ({ setHostManager: vi.fn() })),
    getClientManager: vi.fn(() => ({ getHostManager: vi.fn(() => ({})) })),
  })),
  ChainRegistry: { getChain: vi.fn(() => ({ rpcUrl: 'https://rpc.example.com', contracts: { jobMarketplace: '0x1' } })) },
  ChainId: { BASE_SEPOLIA: 84532 },
  SDK_CAPABILITIES: { hostEndpointFromRegistry: true, hostLivenessBeforeFunding: true },
}));

import { runCLI } from '../../src/cli/orchestrate';

describe('delegate daemon (FABSTIR_PAYER)', () => {
  const env = process.env;
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    poolConfigs.length = 0;
    process.env = { FABSTIR_PAYER: '0x' + '9'.repeat(40), FABSTIR_DEEP_MODEL: 'Repo:deep.gguf', FABSTIR_CHAIN_ID: '84532', FABSTIR_RPC_URL: 'http://rpc' } as any;
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  // restore only the console spy: restoreAllMocks would also reset the module mocks' implementations
  afterEach(() => { process.env = env; log.mockRestore(); });

  it('G3: the daemon pool gets FABSTIR_HOST', async () => {
    process.env.FABSTIR_HOST = '0x' + '4'.repeat(40);
    await runCLI(['node', 'orchestrate']);
    expect(poolConfigs).toHaveLength(1);
    expect(poolConfigs[0]).toMatchObject({ host: '0x' + '4'.repeat(40), delegatePayer: '0x' + '9'.repeat(40) });
  });

  it('G3b: unset, the daemon pool has no host (AUTO)', async () => {
    await runCLI(['node', 'orchestrate']);
    expect(poolConfigs[0].host).toBeUndefined();
  });
});
