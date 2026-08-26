// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Read/Write Provider Split
 *
 * Reads must ride the configured JSON-RPC endpoint, not the injected wallet.
 * See docs/platformless-ui/SDK-BUG-READS-ROUTED-THROUGH-SIGNER.md
 *
 * Two guards come with the split:
 *  1. Falling back to the wallet for reads is never silent.
 *  2. Read chain and signer chain cannot diverge unnoticed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { HostManager } from '../../src/managers/HostManager';
import { ModelManager } from '../../src/managers/ModelManager';

const NODE_REGISTRY = '0x1111111111111111111111111111111111111111';
const MODEL_REGISTRY = '0x2222222222222222222222222222222222222222';
const HOST_ADDRESS = '0x3333333333333333333333333333333333333333';
const MODEL_ID = '0x' + 'ab'.repeat(32);

/**
 * A provider that records every eth_call it serves, so a test can prove
 * which of two providers a read actually left through.
 */
function createRecordingProvider(label: string, chainId = 84532) {
  const calls: string[] = [];
  const provider: any = {
    label,
    calls,
    _isProvider: true,
    getNetwork: vi.fn().mockResolvedValue({ chainId: BigInt(chainId), name: label }),
    getBlockNumber: vi.fn().mockResolvedValue(1),
    getCode: vi.fn().mockResolvedValue('0x1234'),
    call: vi.fn().mockImplementation(async (tx: any) => {
      calls.push(tx.data ?? '0x');
      // Empty result decodes as a revert for most shapes; tests assert on
      // routing, not on decoded values, and swallow decode failures.
      return '0x';
    }),
    resolveName: vi.fn().mockImplementation(async (n: string) => n),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    broadcastTransaction: vi.fn(),
    getTransactionCount: vi.fn().mockResolvedValue(0),
    getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
    destroy: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  return provider;
}

function createRecordingSigner(provider: any, address = '0x4444444444444444444444444444444444444444') {
  const sent: any[] = [];
  const signer: any = {
    provider,
    sent,
    getAddress: vi.fn().mockResolvedValue(address),
    signMessage: vi.fn().mockResolvedValue('0x' + '11'.repeat(65)),
    call: vi.fn().mockImplementation(async (tx: any) => provider.call(tx)),
    resolveName: vi.fn().mockImplementation(async (n: string) => n),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    sendTransaction: vi.fn().mockImplementation(async (tx: any) => {
      sent.push(tx);
      return { hash: '0x' + 'de'.repeat(32), wait: vi.fn().mockResolvedValue({ status: 1 }) };
    }),
    connect: vi.fn(),
  };
  signer.connect.mockReturnValue(signer);
  return signer;
}

function createModelManagerStub() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getModelId: vi.fn(),
    isValidModelId: vi.fn().mockReturnValue(true),
    isModelApproved: vi.fn().mockResolvedValue(true),
    getModelInfo: vi.fn().mockResolvedValue({ modelId: MODEL_ID, approved: true }),
  } as any;
}

/** Swallow ABI decode failures — these tests assert on routing only. */
async function ignoringDecode(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    /* expected: the recording provider returns no decodable data */
  }
}

describe('HostManager read/write provider split', () => {
  let readProvider: any;
  let walletProvider: any;
  let signer: any;
  let modelManager: any;

  beforeEach(() => {
    readProvider = createRecordingProvider('rpcUrl');
    walletProvider = createRecordingProvider('wallet');
    signer = createRecordingSigner(walletProvider);
    modelManager = createModelManagerStub();
  });

  it('routes findHostsForModel reads through the read provider, not the wallet', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    await ignoringDecode(() => hm.findHostsForModel(MODEL_ID));

    expect(readProvider.calls.length).toBeGreaterThan(0);
    expect(walletProvider.calls).toHaveLength(0);
  });

  it('routes getNodeFullInfo reads through the read provider', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    await ignoringDecode(() => (hm as any).getHostInfo(HOST_ADDRESS));

    expect(readProvider.calls.length).toBeGreaterThan(0);
    expect(walletProvider.calls).toHaveLength(0);
  });

  it('routes getModelPricing reads through the read provider', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    await ignoringDecode(() =>
      (hm as any).getHostModelPrices(HOST_ADDRESS, '0x5555555555555555555555555555555555555555')
    );

    expect(readProvider.calls.length).toBeGreaterThan(0);
    expect(walletProvider.calls).toHaveLength(0);
  });

  it('routes getAllActiveNodes reads through the read provider', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    await ignoringDecode(() => (hm as any).discoverAllActiveHostsWithModels());

    expect(readProvider.calls.length).toBeGreaterThan(0);
    expect(walletProvider.calls).toHaveLength(0);
  });

  it('gives HostDiscoveryService the read provider', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    const discovery = (hm as any).discoveryService;
    expect(discovery).toBeDefined();
    expect((discovery as any).contract.runner).toBe(readProvider);
  });

  it('keeps writes on the signer', async () => {
    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );
    await hm.initialize();

    await ignoringDecode(() => (hm as any).updateApiUrl('https://host.example'));

    expect(signer.sendTransaction).toHaveBeenCalled();
  });

  it('falls back to the signer when no read provider is supplied', async () => {
    const hm = new HostManager(signer, NODE_REGISTRY, modelManager);
    await hm.initialize();

    await ignoringDecode(() => hm.findHostsForModel(MODEL_ID));

    expect(walletProvider.calls.length).toBeGreaterThan(0);
  });
});

describe('ModelManager reads', () => {
  it('uses the provider it is given, never a signer, for reads', async () => {
    const readProvider = createRecordingProvider('rpcUrl');
    const walletProvider = createRecordingProvider('wallet');
    const signer = createRecordingSigner(walletProvider);

    const mm = new ModelManager(readProvider, MODEL_REGISTRY, signer);
    await ignoringDecode(() => mm.initialize());

    await ignoringDecode(() => (mm as any).getModelDetails(MODEL_ID));

    expect(readProvider.calls.length).toBeGreaterThan(0);
    expect(walletProvider.calls).toHaveLength(0);
  });
});

describe('HostManager fallback is never silent', () => {
  it('warns when constructed without a read provider', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const walletProvider = createRecordingProvider('wallet');
    const signer = createRecordingSigner(walletProvider);
    const modelManager: any = createModelManagerStub();

    const hm = new HostManager(signer, NODE_REGISTRY, modelManager);

    expect((hm as any).getReadProviderSource()).toBe('wallet');
    const message = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toMatch(/read/i);
    expect(message).toMatch(/wallet|signer/i);
    warn.mockRestore();
  });

  it('reports the rpc source and stays quiet when a read provider is supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readProvider = createRecordingProvider('rpcUrl');
    const signer = createRecordingSigner(createRecordingProvider('wallet'));
    const modelManager: any = createModelManagerStub();

    const hm = new HostManager(
      signer, NODE_REGISTRY, modelManager, undefined, undefined, undefined, readProvider
    );

    expect((hm as any).getReadProviderSource()).toBe('rpcUrl');
    const message = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).not.toMatch(/reads.*wallet/i);
    warn.mockRestore();
  });
});

describe('FabstirSDKCore read provider', () => {
  const CONFIG = {
    mode: 'production',
    chainId: 84532,
    rpcUrl: 'https://rpc.example/base-sepolia',
    contractAddresses: {
      jobMarketplace: '0x1000000000000000000000000000000000000001',
      nodeRegistry: NODE_REGISTRY,
      proofSystem: '0x1000000000000000000000000000000000000003',
      hostEarnings: '0x1000000000000000000000000000000000000004',
      usdcToken: '0x1000000000000000000000000000000000000005',
      fabToken: '0x1000000000000000000000000000000000000006',
      modelRegistry: MODEL_REGISTRY,
    },
  } as any;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the read provider from rpcUrl even when the signer is injected', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore(CONFIG);

    const walletProvider = createRecordingProvider('wallet');
    sdk.signer = createRecordingSigner(walletProvider);
    sdk.provider = walletProvider;
    sdk.initializeReadProvider();

    expect(sdk.getReadProviderSource()).toBe('rpcUrl');
    expect(sdk.getReadProvider()).not.toBe(walletProvider);
    expect(sdk.getReadProvider()).toBeInstanceOf(ethers.JsonRpcProvider);
  });

  it('gives the read provider to HostManager and ModelManager, not the wallet provider', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore(CONFIG);

    const walletProvider = createRecordingProvider('wallet');
    sdk.signer = createRecordingSigner(walletProvider);
    sdk.provider = walletProvider;
    sdk.initializeReadProvider();

    const readProvider = sdk.getReadProvider();
    expect(readProvider).toBeInstanceOf(ethers.JsonRpcProvider);

    // The managers must be handed the read provider, not sdk.provider.
    const mm = new ModelManager(readProvider, MODEL_REGISTRY);
    expect((mm as any).modelRegistry.runner).toBe(readProvider);

    const hm = new HostManager(
      sdk.signer, NODE_REGISTRY, mm, undefined, undefined, undefined, readProvider
    );
    expect((hm as any).getReadProviderSource()).toBe('rpcUrl');
    expect((hm as any).nodeRegistryRead.runner).toBe(readProvider);
  });

  it('errors when the read chain and the signer chain diverge', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore(CONFIG);

    sdk.readProvider = createRecordingProvider('rpcUrl', 84532);
    sdk.readProviderSource = 'rpcUrl';
    sdk.signer = createRecordingSigner(createRecordingProvider('wallet', 1));

    await expect(sdk.assertReadWriteChainParity()).rejects.toThrow(/chain/i);
  });

  it('names both chain ids in the divergence error', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore(CONFIG);

    sdk.readProvider = createRecordingProvider('rpcUrl', 84532);
    sdk.readProviderSource = 'rpcUrl';
    sdk.signer = createRecordingSigner(createRecordingProvider('wallet', 1));

    await expect(sdk.assertReadWriteChainParity()).rejects.toThrow(/84532/);
    await expect(sdk.assertReadWriteChainParity()).rejects.toThrow(/\b1\b/);
  });

  it('passes when the read chain and the signer chain agree', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const sdk: any = new FabstirSDKCore(CONFIG);

    sdk.readProvider = createRecordingProvider('rpcUrl', 84532);
    sdk.readProviderSource = 'rpcUrl';
    sdk.signer = createRecordingSigner(createRecordingProvider('wallet', 84532));

    await expect(sdk.assertReadWriteChainParity()).resolves.toBeUndefined();
  });

  it('repoints the read provider at the new chain when the SDK switches chain', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const { ChainRegistry } = await import('../../src/config/ChainRegistry');
    const sdk: any = new FabstirSDKCore(CONFIG);

    sdk.signer = createRecordingSigner(createRecordingProvider('wallet'));
    sdk.provider = sdk.signer.provider;
    sdk.initializeReadProvider();

    const before = sdk.getReadProvider();
    const targetChain = 8453; // Base mainnet
    const targetRpc = ChainRegistry.getRpcUrl(targetChain);

    sdk.currentChainId = targetChain;
    await sdk.reinitializeReadProviderForChain();

    // Reads must not stay pinned to the chain the app switched away from.
    expect(sdk.getReadProvider()).not.toBe(before);
    if (targetRpc) {
      expect(sdk.getReadProvider()._getConnection().url).toBe(targetRpc);
    }
  });
});
