// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * `config.trainingJobTimeoutSecs` must survive validateConfig and be the value handed to the
 * TrainingManager as `trainJobTimeoutSecs`. The deps line only executes after authentication,
 * so the wiring is pinned two ways: the normalised config carries the field, and the
 * initialisation source names the dep (a source pin, like the prototype checks elsewhere).
 * Predicted profile: GREEN.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { HostManager } from '../../src/managers/HostManager';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { TRAIN_JOB_TIMEOUT_SECS, TrainingManager } from '../../src/managers/TrainingManager';

const CONFIG = {
  mode: 'production', chainId: 84532, rpcUrl: 'https://rpc.example/base-sepolia',
  contractAddresses: {
    jobMarketplace: `0x${'10'.repeat(20)}`, nodeRegistry: `0x${'11'.repeat(20)}`, proofSystem: `0x${'12'.repeat(20)}`,
    hostEarnings: `0x${'13'.repeat(20)}`, usdcToken: `0x${'14'.repeat(20)}`, fabToken: `0x${'15'.repeat(20)}`, modelRegistry: `0x${'16'.repeat(20)}`,
  },
  trainingModelId: `0x${'11'.repeat(32)}`,
} as any;

describe('config.trainingJobTimeoutSecs wiring', () => {
  it('survives validateConfig', () => {
    const sdk: any = new FabstirSDKCore({ ...CONFIG, trainingJobTimeoutSecs: 9000 });
    expect(sdk.config.trainingJobTimeoutSecs).toBe(9000);
    expect((new FabstirSDKCore(CONFIG) as any).config.trainingJobTimeoutSecs).toBeUndefined();
  });

  it('TrainingManager defaults trainJobTimeoutSecs to the M0 constant and honours an override', () => {
    // The config → deps wiring itself is pinned BEHAVIOURALLY by the switchChain test below
    // (buildSidecarManagers hands 9000 through), so no source-text regex is needed here.
    const m: any = new TrainingManager({ trainingModelId: CONFIG.trainingModelId, usdcAddress: CONFIG.contractAddresses.usdcToken } as any);
    expect(m.trainJobTimeoutSecs).toBe(TRAIN_JOB_TIMEOUT_SECS);
    expect((new TrainingManager({ trainingModelId: CONFIG.trainingModelId, usdcAddress: CONFIG.contractAddresses.usdcToken, trainJobTimeoutSecs: 100 } as any) as any).trainJobTimeoutSecs).toBe(100);
  });
});

describe('switchChain rebuilds the sidecar managers', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('TrainingManager (and its JobMarketplace wrapper) follow the chain switch — the pre-flight verifies against the NEW chain', async () => {
    // Before: reinitializeManagersForChain rebuilt the ContractManager only; TrainingManager kept a
    // wrapper pinned to the old chainId, so every adopted submit after a switch failed the chain check
    // — terminal (sessionDecode), on a session the card had already paid for.
    const sdk: any = new FabstirSDKCore({ ...CONFIG, trainingJobTimeoutSecs: 9000 });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = {};
    sdk.hostManager = { tag: 'OLD-84532' }; sdk.modelManager = { tag: 'OLD-84532' };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    vi.spyOn(HostManager.prototype, 'initialize').mockResolvedValue(undefined);
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.reinitializeReadProviderForChain = async () => {};                    // no network in a unit test
    sdk.currentChainId = 84532;
    await sdk.buildSidecarManagers();
    const before = sdk.trainingManager;
    expect(before).toBeInstanceOf(TrainingManager);
    expect(before.trainJobTimeoutSecs).toBe(9000);

    // Only Base Sepolia is registered in this environment; answer any chain id with its config so
    // the wrapper can be constructed for the NEW id (what is under test is the rebuild, not the registry).
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);
    sdk.currentChainId = 8453;
    await sdk.reinitializeManagersForChain();
    expect(sdk.trainingManager).not.toBe(before);
    expect(sdk.trainingManager.chainId).toBe(8453);
    expect(sdk.trainingManager.jobMarketplace.chainId).toBe(8453);
    expect(sdk.trainingManager.trainJobTimeoutSecs).toBe(9000);              // config survives the rebuild
  });

  it('is a WHOLE rebuild: HostManager/ModelManager follow the chain too, and the SessionManager is re-wired', async () => {
    // Found in Round 3: rebuilding only the sidecars left HostManager on the OLD chain, so on the
    // adopted path the session read (new chain) and the price read (old chain) disagreed — a spurious
    // adoptedSessionParams and a second card session for a session that was fine.
    const sdk: any = new FabstirSDKCore({ ...CONFIG, trainingJobTimeoutSecs: 9000 });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = {};
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    const oldHost = { tag: 'OLD-84532' }; const oldModel = { tag: 'OLD-84532' };
    sdk.hostManager = oldHost; sdk.modelManager = oldModel;
    sdk.currentChainId = 84532;
    await sdk.buildSidecarManagers();
    const service = { getRankedHostsForModel: vi.fn() };
    sdk.trainingManager.setHostSelectionService(service);
    vi.spyOn(HostManager.prototype, 'initialize').mockResolvedValue(undefined);
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);

    sdk.currentChainId = 8453;
    await sdk.reinitializeManagersForChain();

    expect(sdk.hostManager).not.toBe(oldHost);
    expect(sdk.hostManager).toBeInstanceOf(HostManager);
    expect(sdk.modelManager).not.toBe(oldModel);
    expect(sdk.sessionManager.setHostManager).toHaveBeenCalledWith(sdk.hostManager);
    expect(sdk.sessionManager.setHostSelectionService).toHaveBeenCalled();
    expect(sdk.trainingManager.hostSelectionService).toBe(service);           // a caller-installed service survives
  });
});
