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
import { ClientManager } from '../../src/managers/ClientManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { TreasuryManager } from '../../src/managers/TreasuryManager';
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
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
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
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    const oldHost = { tag: 'OLD-84532' }; const oldModel = { tag: 'OLD-84532' };
    sdk.hostManager = oldHost; sdk.modelManager = oldModel;
    // Round 4: the ClientManager and TranscodeManager branches had never executed in this harness.
    const oldClient = { tag: 'OLD-CLIENT' }; const oldTranscode = { tag: 'OLD-TRANSCODE' };
    sdk.clientManager = oldClient; sdk.transcodeManager = oldTranscode; sdk.encryptionManager = {};
    vi.spyOn(ClientManager.prototype, 'initialize').mockResolvedValue(undefined);
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
    expect(sdk.clientManager).toBeInstanceOf(ClientManager); expect(sdk.clientManager).not.toBe(oldClient);
    expect(sdk.transcodeManager).toBeInstanceOf(TranscodeManager); expect(sdk.transcodeManager).not.toBe(oldTranscode);
    expect(sdk.sessionManager.setHostManager).toHaveBeenCalledWith(sdk.hostManager);
    expect(sdk.sessionManager.setHostSelectionService).toHaveBeenCalled();
    expect(sdk.trainingManager.hostSelectionService).toBe(service);           // a caller-installed service survives
  });
});

describe('switchChain is transactional — a whole switch or none of it', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  function sdkOn84532() {
    const sdk: any = new FabstirSDKCore({ ...CONFIG, trainingJobTimeoutSecs: 9000 });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn(), hostSelectionService: { tag: 'OLD-SVC' } };
    sdk.storageManager = {}; sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { tag: 'OLD-CM', getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { tag: 'OLD-RP', getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => { sdk.readProvider = { tag: 'NEW-RP' }; };
    sdk.hostManager = { tag: 'OLD-84532' }; sdk.modelManager = { tag: 'OLD-84532' };
    sdk.currentChainId = 84532; sdk.authenticated = true;
    sdk.walletProvider = { getCapabilities: () => ({ supportsChainSwitching: true }), switchChain: vi.fn(async () => {}) };
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);
    return sdk;
  }

  it('a rebuild that fails part-way leaves the SDK on the OLD chain with every old reference, and the retry really retries', async () => {
    // Found in Round 4: switchChain committed currentChainId BEFORE the rebuild and its guard
    // (`if (this.currentChainId === chainId) return`) turned the retry into a no-op — after one RPC
    // hiccup the SDK reported the new chain while the training wrapper, host and model managers were a
    // mix of old and new, and nothing short of re-authenticating repaired it.
    const sdk = sdkOn84532();
    await sdk.buildSidecarManagers();
    const before = { training: sdk.trainingManager, ltx: sdk.ltxManager, host: sdk.hostManager, model: sdk.modelManager, cm: sdk.contractManager, rp: sdk.readProvider };
    const events: any[] = []; sdk.on('chainChanged', (e: any) => events.push(e));
    const init = vi.spyOn(HostManager.prototype, 'initialize').mockRejectedValueOnce(new Error('rpc hiccup'));

    const failure: any = await sdk.switchChain(8453).then(() => null, (e: any) => e);
    expect(failure?.code).toBe('CHAIN_SWITCH_FAILED');
    expect(failure?.details).toMatchObject({ from: 84532, to: 8453 });
    expect(failure?.details?.cause?.message).toBe('rpc hiccup');                               // the underlying error is kept
    expect(failure?.message).toMatch(/back on chain 84532/);
    expect(sdk.getCurrentChainId()).toBe(84532);
    expect(sdk.config.chainId).toBe(84532);
    expect(sdk.trainingManager).toBe(before.training);
    expect(sdk.ltxManager).toBe(before.ltx);
    expect(sdk.hostManager).toBe(before.host);
    expect(sdk.modelManager).toBe(before.model);
    expect(sdk.contractManager).toBe(before.cm);
    expect(sdk.readProvider).toBe(before.rp);
    expect(sdk.sessionManager.setHostManager).toHaveBeenLastCalledWith(before.host);        // re-wired BACK
    expect(sdk.sessionManager.setHostSelectionService).toHaveBeenLastCalledWith({ tag: 'OLD-SVC' });
    expect(events).toEqual([]);                                                                // no chainChanged for a switch that did not happen
    expect(sdk.walletProvider.switchChain.mock.calls).toEqual([[8453], [84532]]);                // the wallet was moved BACK

    init.mockResolvedValue(undefined);
    await sdk.switchChain(8453);                                                               // the retry must RUN the rebuild
    expect(sdk.getCurrentChainId()).toBe(8453);
    expect(sdk.trainingManager).not.toBe(before.training);
    expect(sdk.trainingManager.jobMarketplace.chainId).toBe(8453);
    expect(sdk.hostManager).toBeInstanceOf(HostManager);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ oldChainId: 84532 });
  });

  it('a failure AFTER the sidecars were rebuilt still puts the previous sidecars back', async () => {
    // The mutant "rollback forgets ltx/training" survived the first test because HostManager.initialize
    // fails BEFORE buildSidecarManagers runs. Inject the failure after it: the previous TrainingManager and
    // LtxManager instances (the ones a caller may still hold) must be the SDK's again.
    const sdk = sdkOn84532();
    await sdk.buildSidecarManagers();
    const before = { training: sdk.trainingManager, ltx: sdk.ltxManager };
    vi.spyOn(HostManager.prototype, 'initialize').mockResolvedValue(undefined);
    const realBuild = sdk.buildSidecarManagers.bind(sdk);
    sdk.buildSidecarManagers = async () => { await realBuild(); throw new Error('late failure'); };
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_FAILED' });
    expect(sdk.trainingManager).toBe(before.training);
    expect(sdk.ltxManager).toBe(before.ltx);
    expect(sdk.getCurrentChainId()).toBe(84532);
  });

  it('CHAIN_SWITCH_UNSUPPORTED is a refusal, not a failure: it keeps its code and the state is untouched', async () => {
    const sdk = sdkOn84532();
    await sdk.buildSidecarManagers();
    const before = sdk.trainingManager;
    const sepolia = ChainRegistry.getChain(84532);
    (ChainRegistry.getChain as any).mockImplementation((id: number) => ({ ...sepolia, chainId: id, contracts: { ...sepolia.contracts, modelRegistry: undefined } }));
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_UNSUPPORTED' });
    expect(sdk.getCurrentChainId()).toBe(84532);
    expect(sdk.trainingManager).toBe(before);
    expect(sdk.walletProvider.switchChain).not.toHaveBeenCalled();                              // refused BEFORE the wallet moved
    expect(sdk.readProvider).toEqual({ tag: 'OLD-RP', getNetwork: expect.any(Function) });
  });
});

describe('switchChain — re-entrancy and the unauthenticated case', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('a second switchChain to the SAME target while one is in flight is refused too — not resolved as a no-op', async () => {
    // Found in Round 5: the "already on target chain" early return ran before the in-flight guard, and the chain id
    // is committed before the rebuild, so a concurrent same-target call resolved while the managers were still a mix.
    const sdk: any = new FabstirSDKCore({ ...CONFIG });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {};
    sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    sdk.hostManager = { tag: 'OLD' }; sdk.modelManager = { tag: 'OLD' };
    sdk.currentChainId = 84532; sdk.authenticated = true;
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);
    vi.spyOn(HostManager.prototype, 'initialize').mockImplementation(() => new Promise((r) => setTimeout(r, 5)));
    const first = sdk.switchChain(8453);
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_IN_PROGRESS' });
    await first;
    expect(sdk.getCurrentChainId()).toBe(8453);
    expect(sdk.trainingManager.chainId).toBe(8453);
    await sdk.switchChain(8453);                                                              // AFTER completion the same target is the ordinary no-op
  });

  it('a second switchChain while one is in flight is refused, and the first completes cleanly', async () => {
    const sdk: any = new FabstirSDKCore({ ...CONFIG });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    sdk.hostManager = { tag: 'OLD' }; sdk.modelManager = { tag: 'OLD' };
    sdk.currentChainId = 84532; sdk.authenticated = true;
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453, 5611]);
    vi.spyOn(HostManager.prototype, 'initialize').mockImplementation(() => new Promise((r) => setTimeout(r, 5)));
    const first = sdk.switchChain(8453);
    await expect(sdk.switchChain(5611)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_IN_PROGRESS' });
    await first;
    expect(sdk.getCurrentChainId()).toBe(8453);
    expect(sdk.trainingManager.chainId).toBe(8453);
  });

  it('switchChain before authenticate() is refused: authenticate would build every manager from the constructor chain', async () => {
    const sdk: any = new FabstirSDKCore({ ...CONFIG });
    sdk.walletProvider = { getCapabilities: () => ({ supportsChainSwitching: true }), switchChain: vi.fn(async () => {}) };
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_UNAUTHENTICATED' });
    expect(sdk.getCurrentChainId()).toBe(84532);
    expect(sdk.config.chainId).toBe(84532);
    expect(sdk.walletProvider.switchChain).not.toHaveBeenCalled();
  });
});

describe('Round 5 — switchChain edges', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  function sdkOn84532NoWallet() {
    const sdk: any = new FabstirSDKCore({ ...CONFIG });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {}; sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    sdk.hostManager = { tag: 'OLD' }; sdk.modelManager = { tag: 'OLD' };
    sdk.currentChainId = 84532; sdk.authenticated = true;
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);
    return sdk;
  }

  it('rolls back without a wallet provider (private-key auth) and the retry works', async () => {
    const sdk = sdkOn84532NoWallet();
    await sdk.buildSidecarManagers();
    const before = sdk.trainingManager;
    const init = vi.spyOn(HostManager.prototype, 'initialize').mockRejectedValueOnce(new Error('rpc hiccup'));
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_FAILED' });
    expect(sdk.getCurrentChainId()).toBe(84532);
    expect(sdk.trainingManager).toBe(before);
    init.mockResolvedValue(undefined);
    await sdk.switchChain(8453);
    expect(sdk.getCurrentChainId()).toBe(8453);
  });

  it('when the wallet cannot be moved back, the call still rejects CHAIN_SWITCH_FAILED and the message says the wallet stayed', async () => {
    const sdk = sdkOn84532NoWallet();
    await sdk.buildSidecarManagers();
    sdk.walletProvider = { getCapabilities: () => ({ supportsChainSwitching: true }), switchChain: vi.fn(async (id: number) => { if (id === 84532) throw new Error('user rejected'); }) };
    vi.spyOn(HostManager.prototype, 'initialize').mockRejectedValueOnce(new Error('rpc hiccup'));
    const e: any = await sdk.switchChain(8453).then(() => null, (x: any) => x);
    expect(e.code).toBe('CHAIN_SWITCH_FAILED');
    expect(e.message).toMatch(/wallet stayed on chain 8453/);
    expect(sdk.getCurrentChainId()).toBe(84532);
  });

  it('the in-flight guard clears after a completed switch: a later switch is accepted', async () => {
    const sdk = sdkOn84532NoWallet();
    await sdk.buildSidecarManagers();
    vi.spyOn(HostManager.prototype, 'initialize').mockResolvedValue(undefined);
    (ChainRegistry.getSupportedChains as any).mockReturnValue([84532, 8453, 5611]);
    await sdk.switchChain(8453);
    await sdk.switchChain(5611);
    expect(sdk.getCurrentChainId()).toBe(5611);
  });
});

describe('Round 5 — the payment and treasury managers follow the switch, and the rollback', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  function sdkOn84532() {
    const sdk: any = new FabstirSDKCore({ ...CONFIG });
    sdk.signer = { provider: { getNetwork: async () => ({ chainId: 84532n }) }, getAddress: async () => `0x${'ee'.repeat(20)}` };
    sdk.sessionManager = { setHostManager: vi.fn(), setHostSelectionService: vi.fn() }; sdk.storageManager = {};
    sdk.paymentManager = { switchChain: vi.fn(async () => {}), getCurrentChainId: () => 84532 };
    sdk.contractManager = { tag: 'OLD-CM', getContractAddress: async () => CONFIG.contractAddresses.usdcToken };
    sdk.treasuryManager = { tag: 'OLD-TREASURY' };
    vi.spyOn(TreasuryManager.prototype, 'initialize').mockResolvedValue(undefined);
    sdk.readProvider = { getNetwork: async () => ({ chainId: 84532n }) };
    sdk.reinitializeReadProviderForChain = async () => {};
    sdk.hostManager = { tag: 'OLD' }; sdk.modelManager = { tag: 'OLD' };
    sdk.currentChainId = 84532; sdk.authenticated = true;
    const sepolia = ChainRegistry.getChain(84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: number) => ({ ...sepolia, chainId: id }));
    vi.spyOn(ChainRegistry, 'isChainSupported').mockReturnValue(true);
    vi.spyOn(ChainRegistry, 'getSupportedChains').mockReturnValue([84532, 8453]);
    return sdk;
  }

  it('a completed switch moves PaymentManagerMultiChain and rebuilds TreasuryManager on the new ContractManager', async () => {
    // Found in Round 5: SDK_API promised "never a mixed state" while payments without an explicit chainId and
    // every treasury call kept running on the OLD chain after a switch.
    const sdk = sdkOn84532();
    await sdk.buildSidecarManagers();
    vi.spyOn(HostManager.prototype, 'initialize').mockResolvedValue(undefined);
    await sdk.switchChain(8453);
    expect(sdk.paymentManager.switchChain).toHaveBeenCalledWith(8453);
    expect(sdk.treasuryManager).toBeInstanceOf(TreasuryManager);
    expect((sdk.treasuryManager as any).contractManager).toBe(sdk.contractManager);               // bound to the NEW ContractManager
  });

  it('a failed switch moves the payment manager back and keeps the old TreasuryManager', async () => {
    const sdk = sdkOn84532();
    await sdk.buildSidecarManagers();
    const oldTreasury = sdk.treasuryManager;
    vi.spyOn(HostManager.prototype, 'initialize').mockRejectedValueOnce(new Error('rpc hiccup'));
    await expect(sdk.switchChain(8453)).rejects.toMatchObject({ code: 'CHAIN_SWITCH_FAILED' });
    expect(sdk.paymentManager.switchChain.mock.calls).toEqual([[8453], [84532]]);
    expect(sdk.treasuryManager).toBe(oldTreasury);
  });
});
