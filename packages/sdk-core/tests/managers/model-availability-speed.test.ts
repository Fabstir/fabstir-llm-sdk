// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * 1.39.33: getAvailableModelsWithHosts in seconds (docs/development/IMPLEMENTATION-MODEL-AVAILABILITY-SPEED.md A1–A5).
 * One host pass for all models, bounded reads, no JSON-RPC batches, single flight, region-aware availability.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

const registry: any = vi.hoisted(() => ({}));

vi.mock('ethers', async () => {
  const actual: any = await vi.importActual('ethers');
  return { ...actual, Contract: vi.fn().mockImplementation(() => registry) };
});

Object.assign(registry, {
  getAllModels: vi.fn(),
  models: vi.fn(async () => ({ huggingfaceRepo: 'r', fileName: 'f.gguf', sha256Hash: '0x' + 'f'.repeat(64), approvalTier: 1, active: true, timestamp: 1n })),
  isModelApproved: vi.fn(async () => true),
  APPROVAL_THRESHOLD: vi.fn(async () => 3),
  runner: { provider: { getCode: vi.fn(async () => '0x1234') } },
  getAddress: vi.fn(async () => '0x' + '1'.repeat(40)),
});

import { ModelManager } from '../../src/managers/ModelManager';
import { HostManager } from '../../src/managers/HostManager';
import { RegionPolicy } from '../../src/utils/region-policy';
import { sharedRpcProvider, RPC_BATCH_MAX_COUNT } from '../../src/utils/rpc-provider';

const ids = (n: number) => Array.from({ length: n }, (_, i) => '0x' + (i + 1).toString(16).padStart(64, '0'));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HOST_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const HOST_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const host = (address: string) => ({ address, apiUrl: 'http://host:8080', metadata: {} as any, supportedModels: [], isActive: true, stake: 0n, minPricePerTokenNative: 0n, minPricePerTokenStable: 2000n });

function hostManagerWith(byModel: (ids: readonly string[], opts?: any) => Promise<Map<string, any[]>>, single?: (id: string, opts?: any) => Promise<any[]>) {
  return { findHostsForModels: vi.fn(byModel), findHostsForModel: vi.fn(single ?? (async () => [])) } as any;
}

async function modelManagerWith(hm: any) {
  const mm = new ModelManager({} as any, '0x' + '1'.repeat(40));
  mm.setHostManager(hm);
  await mm.initialize();
  return mm;
}

const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); };

describe('ModelManager.getAvailableModelsWithHosts (B1, A3, A4, A5)', () => {
  beforeEach(quiet);

  it('B1: one host pass for all models, asking for region-allowed hosts; results in the models\' order', async () => {
    const models = ids(5);
    registry.getAllModels.mockResolvedValue(models);
    const hm = hostManagerWith(async (list) => new Map(list.map((id, i) => [id, i % 2 ? [] : [host(HOST_A)]])));
    const mm = await modelManagerWith(hm);
    const results = await mm.getAvailableModelsWithHosts();
    expect(hm.findHostsForModels).toHaveBeenCalledTimes(1);
    expect(hm.findHostsForModels).toHaveBeenCalledWith(models, { inRegion: true });
    expect(hm.findHostsForModel).not.toHaveBeenCalled();
    expect(results.map((r) => r.model.modelId)).toEqual(models);
    expect(results.map((r) => r.hostCount)).toEqual([1, 0, 1, 0, 1]);
    expect(results.map((r) => r.isAvailable)).toEqual([true, false, true, false, true]);
  });

  it('A3: overlapping calls share one run; each gets its own array and objects; a later call runs again', async () => {
    registry.getAllModels.mockResolvedValue(ids(3));
    const hm = hostManagerWith(async (list) => { await delay(5); return new Map(list.map((id) => [id, [host(HOST_A)]])); });
    const mm = await modelManagerWith(hm);
    const [a, b] = await Promise.all([mm.getAvailableModelsWithHosts(), mm.getAvailableModelsWithHosts()]);
    expect(hm.findHostsForModels).toHaveBeenCalledTimes(1);
    expect(registry.getAllModels.mock.calls.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].priceRange).not.toBe(b[0].priceRange);
    expect(a[0].model).not.toBe(b[0].model);   // review MINOR 1
    expect(a[0].model).toEqual(b[0].model);
    await mm.getAvailableModelsWithHosts();
    expect(hm.findHostsForModels).toHaveBeenCalledTimes(2);
  });

  it('review MINOR 2: a call with another host manager does not join a run made with the first; the old run never clears the new', async () => {
    registry.getAllModels.mockResolvedValue(ids(2));
    let releaseX!: () => void;
    const x = hostManagerWith(async (list) => { await new Promise<void>((r) => { releaseX = r; }); return new Map(list.map((id) => [id, [host(HOST_A)]])); });
    const y = hostManagerWith(async (list) => { await delay(5); return new Map(list.map((id) => [id, [host(HOST_B), host(HOST_B)]])); });
    const mm = await modelManagerWith(x);
    const first = mm.getAvailableModelsWithHosts();
    await delay(1);
    mm.setHostManager(y);
    const second = mm.getAvailableModelsWithHosts();
    const third = mm.getAvailableModelsWithHosts();   // joins y's run
    releaseX();
    expect((await first)[0].hostCount).toBe(1);
    expect((await second)[0].hostCount).toBe(2);
    expect((await third)[0].hostCount).toBe(2);
    expect(y.findHostsForModels).toHaveBeenCalledTimes(1);
  });

  it('review MINOR 2: the first run settling while the second is in flight leaves the second shared', async () => {
    registry.getAllModels.mockResolvedValue(ids(2));
    let releaseY!: () => void;
    const x = hostManagerWith(async (list) => new Map(list.map((id) => [id, [host(HOST_A)]])));
    const y = hostManagerWith(async (list) => { await new Promise<void>((r) => { releaseY = r; }); return new Map(list.map((id) => [id, []])); });
    const mm = await modelManagerWith(x);
    const first = mm.getAvailableModelsWithHosts();
    mm.setHostManager(y);
    const second = mm.getAvailableModelsWithHosts();
    await first;                                     // x's run settles while y's is still in flight
    const late = mm.getAvailableModelsWithHosts();   // must join y's run, not start a third
    await delay(1);
    releaseY();
    await Promise.all([second, late]);
    expect(y.findHostsForModels).toHaveBeenCalledTimes(1);
  });

  it('A3/A5: a failed run rejects every caller sharing it; the next call starts afresh', async () => {
    registry.getAllModels.mockResolvedValue(ids(3));
    let fail = true;
    const hm = hostManagerWith(async (list) => { await delay(1); if (fail) throw new Error('Failed to find hosts for models: rpc down'); return new Map(list.map((id) => [id, []])); });
    const mm = await modelManagerWith(hm);
    const both = await Promise.allSettled([mm.getAvailableModelsWithHosts(), mm.getAvailableModelsWithHosts()]);
    expect(both.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    fail = false;
    await expect(mm.getAvailableModelsWithHosts()).resolves.toHaveLength(3);
  });

  it('getModelPriceRange asks for region-allowed hosts too', async () => {
    registry.getAllModels.mockResolvedValue(ids(1));
    const hm = hostManagerWith(async () => new Map(), async () => [host(HOST_A)]);
    const mm = await modelManagerWith(hm);
    await mm.getModelPriceRange(ids(1)[0]);
    expect(hm.findHostsForModel).toHaveBeenCalledWith(ids(1)[0], { inRegion: true });
  });

  it('B2: getAllApprovedModels reads at most 8 models at a time, keeps their order', async () => {
    const models = ids(20);
    registry.getAllModels.mockResolvedValue(models);
    let inFlight = 0, max = 0;
    const realModels = registry.models;
    registry.models = vi.fn(async (id: string) => { inFlight++; max = Math.max(max, inFlight); await delay(2 + (parseInt(id.slice(-2), 16) % 3)); inFlight--; return realModels(id); });
    try {
      const mm = await modelManagerWith(hostManagerWith(async () => new Map()));
      const list = await mm.getAllApprovedModels();
      expect(list.map((m) => m.modelId)).toEqual(models);
      expect(max).toBe(8);
    } finally { registry.models = realModels; }
  });
});

describe('HostManager.findHostsForModels (B1, A4)', () => {
  const USDC = '0x' + '4'.repeat(40);
  const M1 = '0x' + 'a1'.repeat(32), M2 = '0x' + 'b2'.repeat(32), M3 = '0x' + 'c3'.repeat(32);
  const info = (address: string, models: string[], apiUrl = 'http://host:8080') => [address, 1000n, true, '', apiUrl, models, 3000n, 2000n];
  let hm: HostManager;
  let reg: any;

  beforeEach(() => {
    quiet();
    hm = new HostManager(ethers.Wallet.createRandom(), '0x' + '2'.repeat(40), { isValidModelId: () => true } as any, '0x' + '3'.repeat(40));
    reg = {
      getAllActiveNodes: vi.fn(async () => [HOST_A, HOST_B]),
      getNodeFullInfo: vi.fn(async (a: string) => (a === HOST_A ? info(a, [M1, M2]) : info(a, [M2, M3]))),
      getHostModelPrices: vi.fn(async (a: string) => (a === HOST_A ? [[M1, M2], [10n, 20n]] : [[M2, M3], [30n, 0n]])),
      getNodesForModel: vi.fn(), getModelPricing: vi.fn(),
    };
    Object.assign(hm as any, { nodeRegistry: reg, nodeRegistryRead: reg, initialized: true, contractManager: { getContractAddress: async (n: string) => (n === 'usdcToken' ? USDC : undefined) } });
  });

  it('1 + 2 × hosts reads, however many models; no per-model reads', async () => {
    await hm.findHostsForModels([M1, M2, M3, '0x' + 'd4'.repeat(32)]);
    expect(reg.getAllActiveNodes).toHaveBeenCalledTimes(1);
    expect(reg.getNodeFullInfo).toHaveBeenCalledTimes(2);
    expect(reg.getHostModelPrices).toHaveBeenCalledTimes(2);
    expect(reg.getHostModelPrices).toHaveBeenCalledWith(HOST_A, USDC);
    expect(reg.getNodesForModel).not.toHaveBeenCalled();
    expect(reg.getModelPricing).not.toHaveBeenCalled();
  });

  it('a host counts for a model it lists AND prices; 0 or no price leaves it out; every id has an entry', async () => {
    const none = '0x' + 'd4'.repeat(32);
    const byModel = await hm.findHostsForModels([M1, M2, M3, none]);
    const view = (id: string) => byModel.get(id)!.map((h) => [h.address, h.minPricePerTokenStable]);
    expect(view(M1)).toEqual([[HOST_A, 10n]]);
    expect(view(M2)).toEqual([[HOST_A, 20n], [HOST_B, 30n]]);
    expect(view(M3)).toEqual([]);          // HOST_B lists it but its price is 0
    expect(view(none)).toEqual([]);
    expect([...byModel.keys()]).toEqual([M1, M2, M3, none]);
  });

  it('a model id is matched whatever its letter case, and returned under the id given', async () => {
    const byModel = await hm.findHostsForModels([M1.toUpperCase().replace('0X', '0x')]);
    expect([...byModel.values()][0].map((h) => h.address)).toEqual([HOST_A]);
  });

  it('a host\'s own model list and price list are matched whatever their letter case', async () => {
    const UP = (id: string) => '0x' + id.slice(2).toUpperCase();
    reg.getNodeFullInfo.mockImplementation(async (a: string) => info(a, [UP(M1)]));
    reg.getHostModelPrices.mockImplementation(async () => [[UP(M1)], [9n]]);
    const byModel = await hm.findHostsForModels([M1]);
    expect(byModel.get(M1)!.map((h) => [h.address, h.minPricePerTokenStable])).toEqual([[HOST_A, 9n], [HOST_B, 9n]]);
  });

  it('review MINOR 3: a host that lists a model twice counts once', async () => {
    reg.getNodeFullInfo.mockImplementation(async (a: string) => info(a, [M1, M1]));
    reg.getHostModelPrices.mockImplementation(async () => [[M1], [5n]]);
    const byModel = await hm.findHostsForModels([M1]);
    expect(byModel.get(M1)!.map((h) => h.address)).toEqual([HOST_A, HOST_B]);
  });

  it('no model ids: no reads at all', async () => {
    expect(await hm.findHostsForModels([])).toEqual(new Map());
    expect(reg.getAllActiveNodes).not.toHaveBeenCalled();
  });

  it('a model a host lists but nobody asked for is ignored', async () => {
    const byModel = await hm.findHostsForModels([M1]);   // HOST_A also lists M2, HOST_B lists M2 and M3
    expect([...byModel.keys()]).toEqual([M1]);
    expect(byModel.get(M1)!.map((h) => h.address)).toEqual([HOST_A]);
  });

  it('each HostInfo is its own object (a price per model), metadata too; the host info is parsed once per host', async () => {
    const byModel = await hm.findHostsForModels([M1, M2]);
    const [a1, a2] = [byModel.get(M1)![0], byModel.get(M2)![0]];
    expect(a1).not.toBe(a2);
    expect(a1.metadata).not.toBe(a2.metadata);
    expect([a1.minPricePerTokenStable, a2.minPricePerTokenStable]).toEqual([10n, 20n]);
    const parses = (console.log as any).mock.calls.filter((c: any[]) => String(c[0]).startsWith('[HostManager] Raw getNodeFullInfo')).length;
    expect(parses).toBe(2);
  });

  it('a host whose reads fail is skipped; the others still count', async () => {
    reg.getHostModelPrices.mockImplementation(async (a: string) => { if (a === HOST_A) throw new Error('rpc'); return [[M2, M3], [30n, 5n]]; });
    const byModel = await hm.findHostsForModels([M1, M2, M3]);
    expect(byModel.get(M1)).toEqual([]);
    expect(byModel.get(M2)!.map((h) => h.address)).toEqual([HOST_B]);
  });

  it('no USDC configured: no price reads, every listing host counts (as findHostsForModel)', async () => {
    (hm as any).contractManager = undefined;
    const byModel = await hm.findHostsForModels([M3]);
    expect(reg.getHostModelPrices).not.toHaveBeenCalled();
    expect(byModel.get(M3)!.map((h) => h.address)).toEqual([HOST_B]);
  });

  it('the active-host list failing rejects the call (DISCOVERY_ERROR), as before', async () => {
    reg.getAllActiveNodes.mockRejectedValue(new Error('rpc down'));
    await expect(hm.findHostsForModels([M1])).rejects.toMatchObject({ code: 'DISCOVERY_ERROR' });
  });

  it('an invalid model id is refused', async () => {
    (hm as any).modelManager = { isValidModelId: (id: string) => id !== 'bad' };
    await expect(hm.findHostsForModels([M1, 'bad'])).rejects.toMatchObject({ code: 'DISCOVERY_ERROR' });
  });

  it('hosts are read at most 8 at a time', async () => {
    const many = Array.from({ length: 12 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0'));
    reg.getAllActiveNodes.mockResolvedValue(many);
    let inFlight = 0, max = 0;
    reg.getNodeFullInfo.mockImplementation(async (a: string) => { inFlight++; max = Math.max(max, inFlight); await delay(3); inFlight--; return info(a, [M1]); });
    reg.getHostModelPrices.mockResolvedValue([[M1], [1n]]);
    const byModel = await hm.findHostsForModels([M1]);
    expect(byModel.get(M1)!.map((h) => h.address)).toEqual(many);
    expect(max).toBe(8);
  });

  it('A4: inRegion keeps only region-allowed hosts per model; Global and the default keep all', async () => {
    hm.setRegionPolicy(new RegionPolicy('uk', [{ address: HOST_B, apiOrigin: 'http://host:8080' }]));
    expect((await hm.findHostsForModels([M2], { inRegion: true })).get(M2)!.map((h) => h.address)).toEqual([HOST_B]);
    expect((await hm.findHostsForModels([M2])).get(M2)!.map((h) => h.address)).toEqual([HOST_A, HOST_B]);
    hm.setRegionPolicy(new RegionPolicy('global'));
    expect((await hm.findHostsForModels([M2], { inRegion: true })).get(M2)!.map((h) => h.address)).toEqual([HOST_A, HOST_B]);
  });
});

describe('HostManager.findHostsForModel (1.39.33: parallel hosts, inRegion)', () => {
  const info = (address: string, apiUrl = 'http://host:8080') => [address, 1000n, true, '', apiUrl, ['0xm'], 3000n, 2000n];
  let hm: HostManager;
  let reg: any;

  beforeEach(() => {
    quiet();
    hm = new HostManager(ethers.Wallet.createRandom(), '0x' + '2'.repeat(40), { isValidModelId: () => true } as any, '0x' + '3'.repeat(40));
    reg = {
      getNodesForModel: vi.fn(async () => [HOST_A, HOST_B]),
      getNodeFullInfo: vi.fn(async (a: string) => info(a)),
      getModelPricing: vi.fn(async () => 1234n),
    };
    Object.assign(hm as any, { nodeRegistry: reg, nodeRegistryRead: reg, initialized: true });
  });

  it('a model\'s hosts are read at most 8 at a time, results in the registry\'s order', async () => {
    const many = Array.from({ length: 12 }, (_, i) => '0x' + (i + 1).toString(16).padStart(40, '0'));
    reg.getNodesForModel.mockResolvedValue(many);
    let inFlight = 0, max = 0;
    reg.getNodeFullInfo.mockImplementation(async (a: string) => { inFlight++; max = Math.max(max, inFlight); await delay(3); inFlight--; return info(a); });
    const hosts = await hm.findHostsForModel('0xm');
    expect(hosts.map((h) => h.address)).toEqual(many);
    expect(max).toBe(8);
  });

  it('a failed host-info read skips that host (as before)', async () => {
    reg.getNodeFullInfo.mockImplementationOnce(async () => { throw new Error('rpc'); });
    expect((await hm.findHostsForModel('0xm')).map((h) => h.address)).toEqual([HOST_B]);
  });

  it('pricing: each host gets its per-model USDC price; a host without one is left out (as before)', async () => {
    (hm as any).contractManager = { getContractAddress: async (n: string) => (n === 'usdcToken' ? '0x' + '4'.repeat(40) : undefined) };
    reg.getModelPricing.mockImplementation(async (a: string) => { if (a === HOST_B) throw new Error('no pricing'); return 777n; });
    const hosts = await hm.findHostsForModel('0xm');
    expect(hosts.map((h) => [h.address, h.minPricePerTokenStable])).toEqual([[HOST_A, 777n]]);
  });

  it('A4: inRegion keeps only the hosts the region allows; Global and the default keep all; another URL does not count', async () => {
    hm.setRegionPolicy(new RegionPolicy('uk', [{ address: HOST_A, apiOrigin: 'http://host:8080' }]));
    expect((await hm.findHostsForModel('0xm', { inRegion: true })).map((h) => h.address)).toEqual([HOST_A]);
    expect((await hm.findHostsForModel('0xm')).map((h) => h.address)).toEqual([HOST_A, HOST_B]);
    hm.setRegionPolicy(new RegionPolicy('uk', [{ address: HOST_A, apiOrigin: 'https://elsewhere.invalid' }]));
    expect(await hm.findHostsForModel('0xm', { inRegion: true })).toEqual([]);
    hm.setRegionPolicy(new RegionPolicy('global'));
    expect((await hm.findHostsForModel('0xm', { inRegion: true })).map((h) => h.address)).toEqual([HOST_A, HOST_B]);
  });
});

describe('the shared RPC provider sends no JSON-RPC batches (B3)', () => {
  it('batchMaxCount is 1', () => {
    const p = sharedRpcProvider('http://batch-check.invalid', 84532);
    expect(RPC_BATCH_MAX_COUNT).toBe(1);
    expect((p as any)._getOption('batchMaxCount')).toBe(1);
  });
});
