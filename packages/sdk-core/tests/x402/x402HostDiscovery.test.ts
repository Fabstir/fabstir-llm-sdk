// Copyright (c) 2025 Fabstir — BUSL-1.1
import { describe, it, expect, vi } from 'vitest';
import { HostManager } from '../../src/managers/HostManager';
import type { HostMetadata } from '../../src/types/models';

/** Helper: build a mock host entry for getNodeFullInfo */
function makeHost(address: string, metadata: Record<string, any>, apiUrl = 'http://host:8080', models: string[] = []) {
  return {
    address,
    info: [
      address,   // [0] operator
      1000n,     // [1] stake
      true,      // [2] isActive
      JSON.stringify(metadata), // [3] metadata JSON
      apiUrl,    // [4] apiUrl
      models,    // [5] modelIds
      100n,      // [6] native price
      200n,      // [7] stable price
    ],
  };
}

/** Create a HostManager with mocked internals */
function createMockHostManager(hosts: ReturnType<typeof makeHost>[]) {
  // Use Object.create to skip the constructor (which validates nodeRegistryAddress)
  const manager = Object.create(HostManager.prototype) as InstanceType<typeof HostManager>;
  (manager as any).initialized = true;
  (manager as any).contractManager = null;
  (manager as any).modelManager = { isValidModelId: vi.fn().mockReturnValue(true) };
  (manager as any).nodeRegistry = {
    getNodesForModel: vi.fn().mockImplementation((_modelId: string) =>
      Promise.resolve(hosts.map(h => h.address)),
    ),
    getNodeFullInfo: vi.fn().mockImplementation((addr: string) => {
      const host = hosts.find(h => h.address === addr);
      if (!host) throw new Error('Not found');
      return Promise.resolve(host.info);
    }),
    getAllActiveNodes: vi.fn().mockResolvedValue(hosts.map(h => h.address)),
    getModelPricing: vi.fn().mockResolvedValue(100n),
  };
  return manager;
}

const X402_META = {
  hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
  capabilities: ['inference', 'streaming'],
  location: 'US',
  maxConcurrent: 8,
  x402: { payTo: '0xPayee', asset: '0xUSDC', network: 'base', pricePerRequest: '100000' },
};
const PLAIN_META = {
  hardware: { gpu: 'RTX 3090', vram: 24, ram: 32 },
  capabilities: ['inference'],
  location: 'EU',
  maxConcurrent: 4,
};

describe('x402 Host Discovery', () => {
  it('getX402CapableHosts returns only hosts with x402 metadata', async () => {
    const mgr = createMockHostManager([
      makeHost('0xA', X402_META),
      makeHost('0xB', PLAIN_META),
    ]);
    const result = await mgr.getX402CapableHosts();
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xA');
    expect(result[0].metadata.x402).toEqual(X402_META.x402);
  });

  it('getX402CapableHosts filters by modelId when provided', async () => {
    const mgr = createMockHostManager([
      makeHost('0xC', X402_META, 'http://c:8080', ['0xmodel1']),
    ]);
    const result = await mgr.getX402CapableHosts('0xmodel1');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xC');
    // Should have used findHostsForModel path (getNodesForModel)
    expect((mgr as any).nodeRegistry.getNodesForModel).toHaveBeenCalledWith('0xmodel1');
  });

  it('x402 metadata is preserved in findHostsForModel results', async () => {
    const mgr = createMockHostManager([
      makeHost('0xD', X402_META, 'http://d:8080', ['0xmodel2']),
    ]);
    const result = await mgr.findHostsForModel('0xmodel2');
    expect(result).toHaveLength(1);
    expect(result[0].metadata.x402).toEqual(X402_META.x402);
  });

  it('getX402CapableHosts returns empty array when no x402 hosts', async () => {
    const mgr = createMockHostManager([
      makeHost('0xE', PLAIN_META),
      makeHost('0xF', PLAIN_META),
    ]);
    const result = await mgr.getX402CapableHosts();
    expect(result).toHaveLength(0);
  });
});
