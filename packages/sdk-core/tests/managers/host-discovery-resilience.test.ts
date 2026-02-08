// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { HostManager } from '../../src/managers/HostManager';

/**
 * Tests for host discovery resilience — Bugs 1, 2, 3
 *
 * Bug 1: discoverAllActiveHostsWithModels() silently drops hosts with bad metadata
 * Bug 2: findHostsForModel() bare JSON.parse crashes entire search
 * Bug 3: No per-host try-catch — one RPC failure drops ALL hosts
 */

function createMockNodeRegistry(overrides: Record<string, any> = {}) {
  return {
    getAllActiveNodes: vi.fn().mockResolvedValue([]),
    getNodesForModel: vi.fn().mockResolvedValue([]),
    getNodeFullInfo: vi.fn().mockResolvedValue([
      ethers.ZeroAddress, BigInt(0), false, '', '', [], BigInt(0), BigInt(0)
    ]),
    registerNode: vi.fn().mockResolvedValue({ hash: '0x', wait: vi.fn().mockResolvedValue({ status: 1 }) }),
    nodes: vi.fn().mockResolvedValue([ethers.ZeroAddress, BigInt(0), false]),
    getNode: vi.fn(),
    target: '0x1234567890123456789012345678901234567890',
    interface: {
      encodeFunctionData: vi.fn().mockReturnValue('0x'),
      fragments: [1, 2, 3]
    },
    ...overrides
  };
}

function createHostManager() {
  const wallet = ethers.Wallet.createRandom();
  const nodeRegistryAddress = '0x1234567890123456789012345678901234567890';
  const fabTokenAddress = '0xFAB0000000000000000000000000000000000000';
  const modelManager = {
    getModelId: vi.fn().mockResolvedValue('0xmodel123'),
    isModelApproved: vi.fn().mockResolvedValue(true),
    isValidModelId: vi.fn().mockReturnValue(true)
  } as any;

  const hostManager = new HostManager(wallet, nodeRegistryAddress, modelManager, fabTokenAddress);
  return { hostManager, wallet, modelManager };
}

function makeHostInfo(address: string, metadata: string, apiUrl = 'http://host:8080') {
  return [
    address,          // operator at index 0
    BigInt(1000),     // stake at index 1
    true,             // isActive at index 2
    metadata,         // metadata at index 3
    apiUrl,           // apiUrl at index 4
    ['0xmodel123'],   // supportedModels at index 5
    BigInt(3000),     // minPricePerTokenNative at index 6
    BigInt(2000)      // minPricePerTokenStable at index 7
  ];
}

const VALID_METADATA = JSON.stringify({
  hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
  capabilities: ['inference', 'streaming'],
  location: 'US-East',
  maxConcurrent: 4,
  costPerToken: 1000,
  publicKey: '02' + 'ab'.repeat(32)
});

const HOST_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HOST_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const HOST_C = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

describe('discoverAllActiveHostsWithModels — resilience', () => {
  let hostManager: HostManager;
  let nodeRegistry: ReturnType<typeof createMockNodeRegistry>;

  beforeEach(() => {
    const hm = createHostManager();
    hostManager = hm.hostManager;
    nodeRegistry = createMockNodeRegistry();
    (hostManager as any).nodeRegistry = nodeRegistry;
    (hostManager as any).initialized = true;
  });

  test('host with invalid JSON metadata is included with defaults (Bug 1)', async () => {
    nodeRegistry.getAllActiveNodes.mockResolvedValue([HOST_A, HOST_B]);
    nodeRegistry.getNodeFullInfo
      .mockResolvedValueOnce(makeHostInfo(HOST_A, VALID_METADATA))
      .mockResolvedValueOnce(makeHostInfo(HOST_B, '{invalid json!!!'));

    const hosts = await hostManager.discoverAllActiveHostsWithModels();

    expect(hosts).toHaveLength(2);
    // Host B should have default metadata, not be dropped
    const hostB = hosts.find(h => h.address === HOST_B);
    expect(hostB).toBeDefined();
    expect(hostB!.metadata.hardware.gpu).toBe('Unknown');
    expect(hostB!.metadata.capabilities).toEqual(['inference', 'streaming']);
  });

  test('host with empty string metadata is included with defaults (Bug 1)', async () => {
    nodeRegistry.getAllActiveNodes.mockResolvedValue([HOST_A, HOST_B]);
    nodeRegistry.getNodeFullInfo
      .mockResolvedValueOnce(makeHostInfo(HOST_A, VALID_METADATA))
      .mockResolvedValueOnce(makeHostInfo(HOST_B, ''));

    const hosts = await hostManager.discoverAllActiveHostsWithModels();

    expect(hosts).toHaveLength(2);
    const hostB = hosts.find(h => h.address === HOST_B);
    expect(hostB).toBeDefined();
    expect(hostB!.metadata.hardware.gpu).toBe('Unknown');
    expect(hostB!.metadata.maxConcurrent).toBe(10);
  });

  test('getNodeFullInfo failure for one host does not drop others (Bug 3)', async () => {
    nodeRegistry.getAllActiveNodes.mockResolvedValue([HOST_A, HOST_B, HOST_C]);
    nodeRegistry.getNodeFullInfo
      .mockResolvedValueOnce(makeHostInfo(HOST_A, VALID_METADATA))
      .mockRejectedValueOnce(new Error('RPC timeout for host B'))
      .mockResolvedValueOnce(makeHostInfo(HOST_C, VALID_METADATA));

    const hosts = await hostManager.discoverAllActiveHostsWithModels();

    expect(hosts).toHaveLength(2);
    expect(hosts.map(h => h.address)).toEqual([HOST_A, HOST_C]);
  });

  test('empty getAllActiveNodes returns empty array', async () => {
    nodeRegistry.getAllActiveNodes.mockResolvedValue([]);

    const hosts = await hostManager.discoverAllActiveHostsWithModels();

    expect(hosts).toEqual([]);
  });

  test('default metadata uses contract pricing from info[7]', async () => {
    nodeRegistry.getAllActiveNodes.mockResolvedValue([HOST_A]);
    nodeRegistry.getNodeFullInfo.mockResolvedValueOnce(
      makeHostInfo(HOST_A, '')  // Empty metadata → defaults
    );

    const hosts = await hostManager.discoverAllActiveHostsWithModels();

    expect(hosts).toHaveLength(1);
    // info[7] is BigInt(2000) from makeHostInfo
    expect(hosts[0].metadata.costPerToken).toBe(2000);
  });
});

describe('findHostsForModel — resilience', () => {
  let hostManager: HostManager;
  let nodeRegistry: ReturnType<typeof createMockNodeRegistry>;

  beforeEach(() => {
    const hm = createHostManager();
    hostManager = hm.hostManager;
    nodeRegistry = createMockNodeRegistry();
    (hostManager as any).nodeRegistry = nodeRegistry;
    (hostManager as any).initialized = true;
  });

  test('host with invalid metadata is included with defaults (Bug 2)', async () => {
    const modelId = '0x' + 'ab'.repeat(32);
    nodeRegistry.getNodesForModel.mockResolvedValue([HOST_A, HOST_B]);
    nodeRegistry.getNodeFullInfo
      .mockResolvedValueOnce(makeHostInfo(HOST_A, VALID_METADATA))
      .mockResolvedValueOnce(makeHostInfo(HOST_B, 'not json'));

    const hosts = await hostManager.findHostsForModel(modelId);

    expect(hosts).toHaveLength(2);
    const hostB = hosts.find(h => h.address === HOST_B);
    expect(hostB).toBeDefined();
    expect(hostB!.metadata.hardware.gpu).toBe('Unknown');
  });

  test('getNodeFullInfo failure for one host returns remaining hosts (Bug 3)', async () => {
    const modelId = '0x' + 'ab'.repeat(32);
    nodeRegistry.getNodesForModel.mockResolvedValue([HOST_A, HOST_B, HOST_C]);
    nodeRegistry.getNodeFullInfo
      .mockResolvedValueOnce(makeHostInfo(HOST_A, VALID_METADATA))
      .mockRejectedValueOnce(new Error('RPC timeout'))
      .mockResolvedValueOnce(makeHostInfo(HOST_C, VALID_METADATA));

    const hosts = await hostManager.findHostsForModel(modelId);

    expect(hosts).toHaveLength(2);
    expect(hosts.map(h => h.address)).toEqual([HOST_A, HOST_C]);
  });

  test('getNodesForModel returns empty array → returns empty', async () => {
    const modelId = '0x' + 'ab'.repeat(32);
    nodeRegistry.getNodesForModel.mockResolvedValue([]);

    const hosts = await hostManager.findHostsForModel(modelId);

    expect(hosts).toEqual([]);
  });
});
