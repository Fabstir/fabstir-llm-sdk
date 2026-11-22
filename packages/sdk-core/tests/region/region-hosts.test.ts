// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage region (1.39.27) T5 + T6: the region host gate on every path that reaches a host, and web search refused.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md R10–R12. Invariant: in a region nothing — request, socket,
 * funding — goes to a host unless its address is listed AND the URL is at the listed origin; empty list: nothing.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { RegionPolicy, hostOrigin } from '../../src/utils/region-policy';
import { SessionManager } from '../../src/managers/SessionManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { PaymentManager as PaymentManagerMultiChain } from '../../src/managers/PaymentManagerMultiChain';
import { HostManager } from '../../src/managers/HostManager';
import { ClientManager } from '../../src/managers/ClientManager';
import { LtxManager } from '../../src/managers/LtxManager';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';
import { resolveWebSearch } from '../../src/utils/search-query-resolver';
import { LTX_ERROR_CODES } from '../../src/errors/ltx-errors';
import { TRAINING_ERROR_CODES } from '../../src/errors/training-errors';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';

const H1 = ethers.getAddress('0x' + '5a'.repeat(20));
const H2 = ethers.getAddress('0x' + '6b'.repeat(20));
const H1_URL = 'https://h1.example:8443';
const LISTED = [{ address: H1, apiOrigin: H1_URL }];
const MODEL = ethers.id('region-test-model');   // a bytes32 model id, used as given
const REGION = { code: 'REGION_HOST_NOT_ALLOWED' };

let fetchSpy: any;
let connectSpy: any;
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  connectSpy = vi.spyOn(WebSocketClient.prototype, 'connect').mockImplementation(async () => { throw new Error('a socket was opened'); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const refusedWith = (reason: string) => expect.objectContaining({ code: 'REGION_HOST_NOT_ALLOWED', details: expect.objectContaining({ reason, region: 'uk' }) });

describe('RegionPolicy (R10)', () => {
  test('global is unrestricted; uk today refuses everything (NO_HOSTS)', () => {
    const g = new RegionPolicy('global');
    expect(g.restricted).toBe(false);
    expect(g.regional).toBe(false);
    expect(() => g.assertHost({ address: H2, endpoint: 'https://any.example', job: 'session' })).not.toThrow();
    const uk = new RegionPolicy('uk');
    expect(uk.restricted).toBe(true);
    expect(uk.regional).toBe(true);
    expect(() => uk.assertHost({ address: H1, endpoint: H1_URL, job: 'session' })).toThrow(refusedWith('NO_HOSTS'));
    expect(() => uk.assertHost({ endpoint: H1_URL, job: 'session' })).toThrow(refusedWith('NO_HOSTS'));
  });
  test('a listed address at its listed origin passes, in every URL form the SDK uses', () => {
    const p = new RegionPolicy('uk', LISTED);
    for (const endpoint of [H1_URL, `${H1_URL}/`, `${H1_URL}/v1/ws`, 'wss://h1.example:8443/v1/ws', 'HTTPS://H1.EXAMPLE:8443']) {
      expect(() => p.assertHost({ address: H1, endpoint, job: 'session' })).not.toThrow();
      expect(() => p.assertHost({ address: H1.toLowerCase(), endpoint, job: 'session' })).not.toThrow();
    }
    expect(() => p.assertHost({ endpoint: H1_URL, job: 'probe' })).not.toThrow(); // URL-only: any listed origin
    expect(() => p.assertHost({ address: H1, job: 'fund' })).not.toThrow();       // address-only (funding)
  });
  test('an unlisted address, another origin, a port or scheme change, or nothing named is refused', () => {
    const p = new RegionPolicy('uk', LISTED);
    expect(() => p.assertHost({ address: H2, endpoint: H1_URL, job: 'session' })).toThrow(refusedWith('HOST_NOT_LISTED'));
    for (const endpoint of ['https://evil.example', 'https://h1.example:8444', 'http://h1.example:8443', 'not a url', 'ftp://h1.example:8443']) {
      expect(() => p.assertHost({ address: H1, endpoint, job: 'session' })).toThrow(refusedWith('ENDPOINT_NOT_LISTED'));
      expect(() => p.assertHost({ endpoint, job: 'probe' })).toThrow(refusedWith('ENDPOINT_NOT_LISTED'));
    }
    expect(() => p.assertHost({ job: 'session' })).toThrow(refusedWith('HOST_NOT_LISTED'));
  });
  test('the endpoint transform of a listed origin is accepted; filter keeps only allowed hosts', () => {
    const p = new RegionPolicy('uk', LISTED);
    const t = (u: string) => u.replace('h1.example', 'host.docker.internal');
    expect(() => p.assertHost({ address: H1, endpoint: 'https://host.docker.internal:8443', job: 'session' }, t)).not.toThrow();
    expect(p.filter([{ address: H2, apiUrl: H1_URL }, { address: H1, apiUrl: 'https://evil.example' }, { address: H1, apiUrl: H1_URL }]))
      .toEqual([{ address: H1, apiUrl: H1_URL }]);
    expect(hostOrigin('wss://A.example/v1/ws')).toBe('https://a.example');
  });
});

/** A SessionManager past its initialisation, with the region policy and doubles that record any contact. */
function sm(policy: RegionPolicy): any {
  const paymentManager = { createSessionJob: vi.fn(async () => 1) };
  const storageManager = {
    getHostSelectionMode: vi.fn(async () => 'auto'), getUserSettings: vi.fn(async () => null),
    assertConversationLogWritable: vi.fn(async () => undefined), getUserAddress: vi.fn(async () => '0x1'),
  };
  const m: any = new SessionManager(paymentManager as any, storageManager as any);
  m.initialized = true;
  m.setRegionPolicy(policy);
  m.hostManager = { getHostInfo: vi.fn(async () => ({ isActive: true, apiUrl: H1_URL, supportedModels: [MODEL] })) };
  m._checkHostHealth = vi.fn(async () => ({ status: 'unreachable' }));
  return m;
}
const record = (m: any, provider: string, endpoint: string) => {
  m.sessions.set('7', { sessionId: 7n, jobId: 7n, chainId: 84532, model: MODEL, provider, endpoint, status: 'active', prompts: [], responses: [], checkpoints: [], totalTokens: 0, startTime: Date.now() });
};
const noContact = (m: any) => {
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(connectSpy).not.toHaveBeenCalled();
  expect(m.paymentManager.createSessionJob).not.toHaveBeenCalled();
};

describe('SessionManager gates, empty UK list: every path refuses before any contact (acceptance a)', () => {
  test('startSession, explicit host or auto-selected', async () => {
    const m = sm(new RegionPolicy('uk'));
    m.hostSelectionService = { selectHostForModel: vi.fn() };
    await expect(m.startSession({ chainId: 84532, host: H1, modelId: MODEL })).rejects.toMatchObject(REGION);
    await expect(m.startSession({ chainId: 84532, host: H1, endpoint: H1_URL, modelId: MODEL })).rejects.toMatchObject(REGION);
    await expect(m.startSession({ chainId: 84532, modelId: MODEL })).rejects.toMatchObject(REGION);
    expect(m.hostSelectionService.selectHostForModel).not.toHaveBeenCalled();
    expect(m.hostManager.getHostInfo).not.toHaveBeenCalled();
    expect(m._checkHostHealth).not.toHaveBeenCalled();
    noContact(m);
  });
  test('adopted, delegated and session-auth', async () => {
    const m = sm(new RegionPolicy('uk'));
    expect(() => m.registerExternalSession({ sessionId: 7n, jobId: 7n, endpoint: H1_URL, hostAddress: H1, model: MODEL, chainId: 84532 })).toThrow(expect.objectContaining(REGION));
    await expect(m.registerDelegatedSession({ sessionId: 8n, jobId: 8n, hostUrl: H1_URL, hostAddress: H1, model: MODEL, chainId: 84532, nodeHttpUrl: H1_URL, authorisation: { scheme: 'x', signature: '0x', clientAddress: H1 } })).rejects.toMatchObject(REGION);
    await expect(m.postSessionAuth(H1_URL, 8n, { scheme: 'x', signature: '0x', clientAddress: H1 })).rejects.toMatchObject(REGION);
    expect(m.sessions.size).toBe(0);
    noContact(m);
  });
  test('every record-based path (a record restored from storage or adopted earlier)', async () => {
    const m = sm(new RegionPolicy('uk'));
    m.encryptionManager = {};   // generateImage's own precondition, so it reaches the endpoint
    record(m, H1, H1_URL);
    expect(() => m.requireEndpoint(m.sessions.get('7'), '7')).toThrow(expect.objectContaining(REGION));
    await expect(m.sendPrompt(7n, 'hi')).rejects.toMatchObject(REGION);
    await expect(m.generateImage('7', 'a cat')).rejects.toMatchObject(REGION);
    await expect(m.generateEmbeddings(7n, ['a'])).rejects.toMatchObject(REGION);
    m.sessions.get('7').status = 'paused';
    await expect(m.resumeSession(7n)).rejects.toMatchObject(REGION);
    m.sessions.get('7').status = 'active';
    m.wsClient = { isConnected: () => true, sendMessage: vi.fn(), onMessage: vi.fn() };
    m.sessions.get('7').ragContext = { vectorDbId: 'db' };
    await expect(m.searchVectors('7', [0.1], 1)).rejects.toMatchObject(REGION);
    expect(m.wsClient.sendMessage).not.toHaveBeenCalled();
    await expect(m.isJobCompletionNode('7', true)).rejects.toMatchObject(REGION);   // refused like every gate, never probed
    noContact(m);
  });
  test('URL-only methods', async () => {
    const m = sm(new RegionPolicy('uk'));
    await expect(m.generateImageHttpRequest(H1_URL, 'a cat')).rejects.toMatchObject(REGION);
    noContact(m);
  });
});

describe('SessionManager gates with a listed host (R10, R11)', () => {
  test('explicit host: listed passes to its health probe at the listed origin; unlisted refused before the registry read', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    await expect(m.startSession({ chainId: 84532, host: H1, modelId: MODEL })).rejects.toMatchObject({ code: expect.not.stringMatching(/^REGION/) });
    m.hostManager.getHostInfo.mockClear();
    await expect(m.startSession({ chainId: 84532, host: H2, modelId: MODEL })).rejects.toMatchObject(REGION);
    expect(m.hostManager.getHostInfo).not.toHaveBeenCalled();
  });
  test('a listed address with another endpoint (caller or registry) is refused before any probe or funding', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    await expect(m.startSession({ chainId: 84532, host: H1, endpoint: 'https://evil.example', modelId: MODEL })).rejects.toMatchObject(refusedWith('ENDPOINT_NOT_LISTED'));
    m.hostManager.getHostInfo = vi.fn(async () => ({ isActive: true, apiUrl: 'https://moved.example', supportedModels: [MODEL] }));
    await expect(m.startSession({ chainId: 84532, host: H1, modelId: MODEL })).rejects.toMatchObject(refusedWith('ENDPOINT_NOT_LISTED'));
    expect(m._checkHostHealth).not.toHaveBeenCalled();
    noContact(m);
  });
  test('auto-select skips an unlisted host without probing it', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    const picks = [{ address: H2, apiUrl: 'https://h2.example' }, { address: H1, apiUrl: H1_URL }];
    m.hostSelectionService = { selectHostForModel: vi.fn(async (_m: any, _mode: any, _p: any, excluded: string[]) => picks.find((h) => !excluded.includes(h.address))) };
    await expect(m.startSession({ chainId: 84532, modelId: MODEL })).rejects.toBeDefined();
    expect(m._checkHostHealth.mock.calls.map((c: any[]) => c[0])).toEqual([H1_URL]);
    // The real service gets the region's filter, applied before ranking, so outside hosts are not re-ranked one by one.
    const allow = m.hostSelectionService.selectHostForModel.mock.calls[0][4];
    expect(allow({ address: H2, apiUrl: 'https://h2.example' })).toBe(false);
    expect(allow({ address: H1, apiUrl: H1_URL })).toBe(true);
  });
  test('an adopted session at another origin is refused; at the listed one it is recorded', () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    expect(() => m.registerExternalSession({ sessionId: 7n, jobId: 7n, endpoint: 'https://evil.example', hostAddress: H1, model: MODEL, chainId: 84532 })).toThrow(expect.objectContaining(REGION));
    m.registerExternalSession({ sessionId: 7n, jobId: 7n, endpoint: H1_URL, hostAddress: H1, model: MODEL, chainId: 84532 });
    expect(m.requireEndpoint(m.sessions.get('7'), '7')).toBe(H1_URL);
  });
});

describe('the other managers (R11)', () => {
  test('funding: PaymentManagerMultiChain.createSessionJob refuses an unlisted host before any contract call', async () => {
    const pm: any = new PaymentManagerMultiChain(undefined, 84532);
    pm.setRegionPolicy(new RegionPolicy('uk', LISTED));
    pm.initialized = true;
    await expect(pm.createSessionJob({ host: H2, model: MODEL, amount: '1', pricePerToken: 1, duration: 60, proofInterval: 100, chainId: 84532 } as any)).rejects.toMatchObject(REGION);
  });
  test('transcode load balancing: only listed hosts are probed; none listed refuses before ranking', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    const tm: any = new TranscodeManager(m, {} as any, 84532 as any);
    const ranked = [{ host: { address: H2, apiUrl: 'https://h2.example' } }, { host: { address: H1, apiUrl: H1_URL } }];
    tm.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => ranked) });
    m.startSession = vi.fn(async () => { throw new Error('stop here'); });
    await expect(tm.submitTranscodeWithLoadBalancing('s5://cid', [], MODEL, { maxHostRetries: 3, retryDelayMs: 0 })).rejects.toBeDefined();
    expect(fetchSpy.mock.calls.map((c: any[]) => String(c[0])).every((u: string) => u.startsWith(H1_URL))).toBe(true);
    const empty = sm(new RegionPolicy('uk'));
    const tm2: any = new TranscodeManager(empty, {} as any, 84532 as any);
    const rank = vi.fn(async () => ranked);
    tm2.setHostSelectionService({ getRankedHostsForModel: rank });
    await expect(tm2.submitTranscodeWithLoadBalancing('s5://cid', [], MODEL)).rejects.toMatchObject({ name: 'TranscodeError', code: 'REGION_HOST_NOT_ALLOWED' });
    expect(rank).not.toHaveBeenCalled();
  });
  test('transcode probes by URL', async () => {
    const tm: any = new TranscodeManager(sm(new RegionPolicy('uk')), {} as any, 84532 as any);
    await expect(tm.isTranscodingAvailable(H1_URL)).rejects.toMatchObject(REGION);
    await expect(tm.isTrustlessAvailable(H1_URL)).rejects.toMatchObject(REGION);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('LTX and training: refused as their own error types, before anything is funded', async () => {
    const m = sm(new RegionPolicy('uk'));
    m.assertConfidentialHost = vi.fn();
    const ltx: any = Object.create(LtxManager.prototype);
    ltx.sessionManager = m;
    expect(() => ltx.assertConfidentialHost(H1)).toThrow(expect.objectContaining({ name: 'LtxError', code: 'REGION_HOST_NOT_ALLOWED' }));
    const tr: any = Object.create(TrainingManager.prototype);
    tr.sessionManager = m;
    await expect(tr.submitTraining({ hostAddress: H1, endpoint: H1_URL } as any)).rejects.toMatchObject({ name: 'TrainingError', code: 'REGION_HOST_NOT_ALLOWED', detail: expect.objectContaining({ consumed: false }) });
    expect(LTX_ERROR_CODES).toContain('REGION_HOST_NOT_ALLOWED');
    expect(TRAINING_ERROR_CODES).toContain('REGION_HOST_NOT_ALLOWED');
    noContact(m);
  });
  test('HostManager probes; ClientManager legacy job and probes', async () => {
    const hm: any = Object.create(HostManager.prototype);
    hm.publicKeyCache = new Map();
    hm.getHostInfo = vi.fn(async () => ({ apiUrl: H1_URL, metadata: {} }));
    hm.setRegionPolicy(new RegionPolicy('uk'));
    await expect(hm.getHostPublicKey(H1)).rejects.toMatchObject(REGION);
    await expect(hm.getImageGenerationCapabilities(H1, H1_URL)).rejects.toMatchObject(REGION);
    expect(await hm.getWebSearchCapabilities(H1, H1_URL)).toMatchObject({ supportsWebSearch: false, supportsInferenceSearch: false });
    const cm: any = Object.create(ClientManager.prototype);
    cm.setRegionPolicy(new RegionPolicy('uk'));
    cm.initialized = true; cm.signer = {};
    await expect(cm.createInferenceJob({ repo: 'r', file: 'f' }, 'p', 1, { hostAddress: H1 })).rejects.toMatchObject(REGION);
    await expect(cm.getNodeChains(H1_URL)).rejects.toMatchObject(REGION);
    await expect(cm.checkNodeHealth(H1_URL)).rejects.toMatchObject(REGION);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('global: no gate anywhere (the policy is unrestricted)', async () => {
    const m = sm(new RegionPolicy('global'));
    record(m, H2, 'https://h2.example');
    expect(m.requireEndpoint(m.sessions.get('7'), '7')).toBe('https://h2.example');
    expect(() => m.registerExternalSession({ sessionId: 9n, jobId: 9n, endpoint: 'https://h2.example', hostAddress: H2, model: MODEL, chainId: 84532 })).not.toThrow();
  });
  test('the SDK installs one policy for its region in every manager it builds', () => {
    const base = { mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid', contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts } };
    const sdk: any = new FabstirSDKCore({ ...base, storageRegion: 'uk', s5Config: { authApiUrl: 'https://a.invalid' } } as any);
    const m: any = new SessionManager({} as any, {} as any);
    sdk.wireSessionManagerPolicy(m);
    expect(m.getRegionPolicy().region).toBe('uk');
    expect(m.getRegionPolicy().restricted).toBe(true);
    expect(sdk.regionPolicy().region).toBe('uk');
    const g: any = new FabstirSDKCore(base as any);
    const m2: any = new SessionManager({} as any, {} as any);
    g.wireSessionManagerPolicy(m2);
    expect(m2.getRegionPolicy().restricted).toBe(false);
    // A SessionManager nobody wired is Global (unrestricted), as before 1.39.27.
    expect((new SessionManager({} as any, {} as any) as any).getRegionPolicy().region).toBe('global');
  });
});

describe('T6 — web search refused in a region (R12, acceptance e)', () => {
  test('resolveWebSearch: an explicit request refuses; auto-detection resolves to off', () => {
    expect(() => resolveWebSearch(undefined, 'hi', { webSearch: true }, 'uk')).toThrow(expect.objectContaining({ code: 'WEB_SEARCH_REFUSED_IN_REGION' }));
    expect(() => resolveWebSearch({ forceEnabled: true }, 'hi', undefined, 'uk')).toThrow(expect.objectContaining({ code: 'WEB_SEARCH_REFUSED_IN_REGION' }));
    expect(resolveWebSearch(undefined, 'what is the latest news today?', undefined, 'uk')).toEqual({ enabled: false, maxSearches: 0, queries: null });
    expect(resolveWebSearch({ forceDisabled: true }, 'latest news', { webSearch: false }, 'uk').enabled).toBe(false);
    // global: as before
    expect(resolveWebSearch(undefined, 'what is the latest news today?').enabled).toBe(true);
    expect(resolveWebSearch(undefined, 'hi', { webSearch: true }, 'global').enabled).toBe(true);
  });
  test('webSearch() and searchDirect() refuse, even for a listed host; a session forcing search on is refused at start', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    record(m, H1, H1_URL);
    await expect(m.webSearch(7n, 'q')).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    await expect(m.searchDirect(H1_URL, 'q')).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    await expect(m.startSession({ chainId: 84532, host: H1, modelId: MODEL, webSearch: { forceEnabled: true } })).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    await expect(m.registerDelegatedSession({ sessionId: 8n, jobId: 8n, hostUrl: H1_URL, hostAddress: H1, model: MODEL, chainId: 84532, webSearch: { forceEnabled: true } })).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    noContact(m);
  });
});

describe('the SDK wires its region into every manager that reaches a host (R11)', () => {
  const base = { mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid', contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts } };
  const ukSdk = (): any => new FabstirSDKCore({ ...base, storageRegion: 'uk', s5Config: { authApiUrl: 'https://a.invalid' } } as any);

  test('PaymentManager (built in initializeManagers)', async () => {
    const sdk = ukSdk();
    sdk.initializeReadProvider = () => {}; sdk.assertReadWriteChainParity = async () => {}; sdk.watchWalletChainChanges = () => {};
    sdk.contractManager = {};
    await sdk.initializeManagers();   // no signer: only the payment and treasury managers are built
    expect(sdk.paymentManager.regionPolicy.region).toBe('uk');
  });
  test('HostManager (constructModelAndHostManagers) and ClientManager (buildClientManager)', async () => {
    const sdk = ukSdk();
    vi.spyOn(HostManager.prototype as any, 'initialize').mockResolvedValue(undefined);
    sdk.signer = ethers.Wallet.createRandom();
    sdk.readProvider = new ethers.JsonRpcProvider('https://rpc.invalid', 84532, { staticNetwork: true });
    sdk.contractManager = {};
    await sdk.constructModelAndHostManagers({ modelRegistry: base.contractAddresses.modelRegistry, nodeRegistry: base.contractAddresses.nodeRegistry });
    expect(sdk.hostManager.regionPolicy.region).toBe('uk');
    expect(sdk.buildClientManager().regionPolicy.region).toBe('uk');
  });
});

describe('mutation-gate round 1 (survivors M29 M38 M44 M47 M52 M60 M69 M70)', () => {
  const H3 = ethers.getAddress('0x' + '7c'.repeat(20));
  const TWO = [{ address: H1, apiOrigin: H1_URL }, { address: H3, apiOrigin: 'https://h3.example' }];
  test('M29: a listed address at ANOTHER listed host\'s origin is refused', () => {
    const p = new RegionPolicy('uk', TWO);
    expect(() => p.assertHost({ address: H1, endpoint: 'https://h3.example', job: 'session' })).toThrow(refusedWith('ENDPOINT_NOT_LISTED'));
    expect(() => p.assertHost({ address: H3, endpoint: 'https://h3.example', job: 'session' })).not.toThrow();
  });
  test('M38: a delegated session with no session-auth is gated on its own hostUrl', async () => {
    const m = sm(new RegionPolicy('uk'));
    await expect(m.registerDelegatedSession({ sessionId: 8n, jobId: 8n, hostUrl: H1_URL, hostAddress: H1, model: MODEL, chainId: 84532 })).rejects.toMatchObject(REGION);
    expect(m.sessions.size).toBe(0);
  });
  test('M44: webSearch() refuses as web search before anything about the session', async () => {
    const m = sm(new RegionPolicy('uk'));
    record(m, H1, H1_URL);
    await expect(m.webSearch(7n, 'q')).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
  });
  test('M47: the streaming path decides search through the region (auto-detection off)', () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    expect(m.resolveSearch({ webSearch: undefined }, 'what is the latest news today?', undefined).enabled).toBe(false);
    expect(() => m.resolveSearch({}, 'hi', { webSearch: true })).toThrow(expect.objectContaining({ code: 'WEB_SEARCH_REFUSED_IN_REGION' }));
    const g = sm(new RegionPolicy('global'));
    expect(g.resolveSearch({}, 'what is the latest news today?', undefined).enabled).toBe(true);
  });
  test('M52: transcode load balancing never probes an unlisted host (confidential list allows both)', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    m.setConfidentialHosts([H1, H2]);
    const tm: any = new TranscodeManager(m, {} as any, 84532 as any);
    tm.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => [{ host: { address: H2, apiUrl: 'https://h2.example' } }, { host: { address: H1, apiUrl: H1_URL } }]) });
    m.startSession = vi.fn(async () => { throw new Error('stop here'); });
    await expect(tm.submitTranscodeWithLoadBalancing('s5://cid', [], MODEL, { maxHostRetries: 3, retryDelayMs: 0 })).rejects.toBeDefined();
    const urls = fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u: string) => u.startsWith(H1_URL))).toBe(true);
    expect(m.startSession.mock.calls.every((c: any[]) => c[0].host === H1)).toBe(true);
  });
  test('M60: a legacy inference job with no host named is refused before any selection', async () => {
    const cm: any = Object.create(ClientManager.prototype);
    cm.setRegionPolicy(new RegionPolicy('uk'));
    cm.initialized = true; cm.signer = {};
    cm.modelManager = { getModelId: vi.fn() };
    await expect(cm.createInferenceJob({ repo: 'r', file: 'f' }, 'p', 1)).rejects.toMatchObject(REGION);
    expect(cm.modelManager.getModelId).not.toHaveBeenCalled();
  });
  test('M69: the SDK gives its AuthManager the region', async () => {
    const base = { mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid', contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts } };
    const sdk: any = new FabstirSDKCore({ ...base, storageRegion: 'uk', s5Config: { authApiUrl: 'https://a.invalid' } } as any);
    sdk.initializeReadProvider = () => {}; sdk.assertReadWriteChainParity = async () => {}; sdk.watchWalletChainChanges = () => {};
    sdk.contractManager = {};
    await sdk.initializeManagers();
    expect(() => sdk.authManager.getS5Seed()).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_SEALED' }));
  });
  test('M70: training load balancing tries only the region\'s hosts', async () => {
    const tr: any = Object.create(TrainingManager.prototype);
    tr.hostSelectionService = { getRankedHostsForModel: vi.fn(async () => [{ host: { address: H2, apiUrl: 'https://h2.example' } }, { host: { address: H1, apiUrl: H1_URL } }]) };
    tr.validateAgainstBundle = () => {};
    tr.trainingModelId = MODEL;
    tr.sessionManager = { getConfidentialHosts: () => [H1, H2], getRegionPolicy: () => new RegionPolicy('uk', LISTED) };
    tr.submitTraining = vi.fn(async () => 'handle');
    expect(await tr.submitTrainingWithLoadBalancing({} as any)).toBe('handle');
    expect(tr.submitTraining.mock.calls.map((c: any[]) => c[0].hostAddress)).toEqual([H1]);
  });
});

test('M73: SessionManager decides search only through its region-aware wrapper (source guard)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/managers/SessionManager.ts', import.meta.url), 'utf8');
  const calls = src.match(/resolveWebSearch\(/g) ?? [];
  expect(calls).toHaveLength(1);
  expect(src).toContain('return resolveWebSearch(session.webSearch, prompt, options, this.regionPolicy.region);');
});

test('HostSelectionService: the region filter applies before the ranking window (a 12th-ranked region host is found)', async () => {
  const { HostSelectionService } = await import('../../src/services/HostSelectionService');
  const hosts = Array.from({ length: 12 }, (_, i) => ({ address: ethers.getAddress('0x' + (i + 16).toString(16).repeat(20).slice(0, 40)), apiUrl: `https://h${i}.example`, stake: BigInt(100 - i), isActive: true, minPricePerToken: 1n, minPricePerTokenNative: 1n, minPricePerTokenStable: 1n }));
  const svc: any = new HostSelectionService({ findHostsForModel: async () => hosts } as any);
  const last = hosts[11].address;
  const ranked = await svc.getRankedHostsForModel(MODEL, 'auto', 10, (h: any) => h.address === last);
  expect(ranked.map((r: any) => r.host.address)).toEqual([last]);
  expect((await svc.selectHostForModel(MODEL, 'auto', undefined, [], (h: any) => h.address === last))?.address).toBe(last);
});

test('M75: listed hosts exist but none serves the model: the region refusal, not NO_HOSTS_AVAILABLE', async () => {
  const m = sm(new RegionPolicy('uk', LISTED));
  m.hostSelectionService = { selectHostForModel: vi.fn(async () => null) };   // the service filtered everything out
  await expect(m.startSession({ chainId: 84532, modelId: MODEL })).rejects.toMatchObject(refusedWith('HOST_NOT_LISTED'));
  const g = sm(new RegionPolicy('global'));
  g.hostSelectionService = { selectHostForModel: vi.fn(async () => null) };
  await expect(g.startSession({ chainId: 84532, modelId: MODEL })).rejects.toMatchObject({ code: 'NO_HOSTS_AVAILABLE' });
});

describe('review round 1 (adversarial M1 M2 m1 m2; plan 8): every region refusal before contact, under its own code', () => {
  test('M1: a prompt forcing search (option or session config) is refused before any socket', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    record(m, H1, H1_URL);
    m.refuseIfSettledOnChain = async () => {};
    await expect(m.sendPromptStreaming(7n, 'hello', undefined, { webSearch: true })).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    m.sessions.get('7').webSearch = { forceEnabled: true };
    await expect(m.sendPromptStreaming(7n, 'hello')).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    noContact(m);
  });
  test('M1: a region refusal raised inside the prompt path reaches the caller as itself, not WS_PROMPT_ERROR', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    record(m, H1, H1_URL);
    m.sessions.get('7').encryption = true;
    m.encryptionManager = {};
    m.refuseIfSettledOnChain = async () => {};
    connectSpy.mockImplementation(async () => {});
    vi.spyOn(WebSocketClient.prototype, 'isConnected').mockReturnValue(true);
    m.sendEncryptedInit = async () => { throw new RegionPolicy('uk').assertHost({ address: H1, job: 'session' }) as any; };
    await expect(m.sendPromptStreaming(7n, 'hello')).rejects.toMatchObject({ code: 'REGION_HOST_NOT_ALLOWED' });
  });
  test('M2: the HostManager gate accepts the endpoint transform its SessionManager uses', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    const hm: any = Object.create(HostManager.prototype);
    hm.publicKeyCache = new Map();
    hm.setRegionPolicy(new RegionPolicy('uk', LISTED));
    hm.getHostInfo = vi.fn(async () => ({ apiUrl: H1_URL, metadata: {} }));
    const t = (u: string) => u.replace('h1.example', 'host.docker.internal');
    m.setEndpointTransform(t);
    m.setHostManager(hm);
    vi.spyOn(HostManager.prototype as any, 'getHostPublicKey');
    // the transformed endpoint passes the gate (the challenge itself then fails on the stubbed fetch, not on the region)
    await expect(hm.getHostPublicKey(H1, 'https://host.docker.internal:8443')).rejects.not.toMatchObject(REGION);
    const other: any = Object.create(HostManager.prototype);
    other.publicKeyCache = new Map(); other.setRegionPolicy(new RegionPolicy('uk', LISTED));
    other.getHostInfo = hm.getHostInfo;
    await expect(other.getHostPublicKey(H1, 'https://host.docker.internal:8443')).rejects.toMatchObject(REGION);   // no transform shared
  });
  test('m1: checkpoint recovery keeps the region code (not RECOVERY_FAILED)', async () => {
    const m = sm(new RegionPolicy('uk'));
    record(m, H1, H1_URL);
    await expect(m.recoverFromCheckpoints(7n)).rejects.toMatchObject(REGION);
  });
  test('m2: a REST prompt refuses explicit search and tells the node web_search false', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    record(m, H1, H1_URL);
    m.refuseIfSettledOnChain = async () => {};
    await expect(m.sendPrompt(7n, 'hello', { webSearch: true })).rejects.toMatchObject({ code: 'WEB_SEARCH_REFUSED_IN_REGION' });
    expect(fetchSpy).not.toHaveBeenCalled();
    await m.sendPrompt(7n, 'hello').catch(() => undefined);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({ web_search: false, max_searches: 0 });
    const g = sm(new RegionPolicy('global'));
    record(g, H1, H1_URL);
    g.refuseIfSettledOnChain = async () => {};
    fetchSpy.mockClear();
    await g.sendPrompt(7n, 'hello').catch(() => undefined);
    expect('web_search' in JSON.parse(fetchSpy.mock.calls[0][1].body)).toBe(false);   // Global body unchanged
  });
  test('plan 8: transcode probes refuse as TranscodeError', async () => {
    const tm: any = new TranscodeManager(sm(new RegionPolicy('uk')), {} as any, 84532 as any);
    await expect(tm.isTranscodingAvailable(H1_URL)).rejects.toMatchObject({ name: 'TranscodeError', code: 'REGION_HOST_NOT_ALLOWED' });
  });
});

describe('review round 2 (M1 m4 m5)', () => {
  const trainer = (policy: RegionPolicy, confidential: string[] | undefined, ranked: any[]) => {
    const tr: any = Object.create(TrainingManager.prototype);
    const rank = vi.fn(async () => ranked);
    tr.hostSelectionService = { getRankedHostsForModel: rank };
    tr.validateAgainstBundle = () => {};
    tr.trainingModelId = MODEL;
    tr.sessionManager = { getConfidentialHosts: () => confidential, getRegionPolicy: () => policy };
    tr.submitTraining = vi.fn(async () => 'handle');
    return { tr, rank };
  };
  test('M1: training load balancing in a region with no host refuses with the region code, before ranking', async () => {
    const { tr, rank } = trainer(new RegionPolicy('uk'), [H1], [{ host: { address: H1, apiUrl: H1_URL } }]);
    await expect(tr.submitTrainingWithLoadBalancing({} as any)).rejects.toMatchObject({ name: 'TrainingError', code: 'REGION_HOST_NOT_ALLOWED', detail: expect.objectContaining({ consumed: false }) });
    expect(rank).not.toHaveBeenCalled();
    const none = trainer(new RegionPolicy('uk'), undefined, []);
    await expect(none.tr.submitTrainingWithLoadBalancing({} as any)).rejects.toMatchObject({ code: 'REGION_HOST_NOT_ALLOWED' });   // region first, as transcode
  });
  test('M1: confidential hosts exist but none is in the region: the region code', async () => {
    const { tr } = trainer(new RegionPolicy('uk', LISTED), [H2], [{ host: { address: H2, apiUrl: 'https://h2.example' } }]);
    await expect(tr.submitTrainingWithLoadBalancing({} as any)).rejects.toMatchObject({ code: 'REGION_HOST_NOT_ALLOWED', detail: expect.objectContaining({ reason: 'HOST_NOT_LISTED' }) });
  });
  test('m4: createTranscodeJob refuses before any upload or chain read', async () => {
    const m = sm(new RegionPolicy('uk'));
    const storage = { uploadEncryptedBlob: vi.fn() };
    const tm: any = new TranscodeManager(m, storage as any, 84532 as any);
    tm.sizeTranscodeSession = vi.fn();
    await expect(tm.createTranscodeJob({ hostAddress: H1, mediaFormats: [{ id: 1, ext: 'mp4', vcodec: 'av1', acodec: 'opus' }], maxDuration: 10, chainId: 84532 })).rejects.toMatchObject({ name: 'TranscodeError', code: 'REGION_HOST_NOT_ALLOWED' });
    expect(storage.uploadEncryptedBlob).not.toHaveBeenCalled();
    expect(tm.sizeTranscodeSession).not.toHaveBeenCalled();
  });
  test('m5: transcode probes accept the SessionManager\'s endpoint transform', async () => {
    const m = sm(new RegionPolicy('uk', LISTED));
    m.setEndpointTransform((u: string) => u.replace('h1.example', 'host.docker.internal'));
    const tm: any = new TranscodeManager(m, {} as any, 84532 as any);
    await expect(tm.isTranscodingAvailable('https://host.docker.internal:8443')).resolves.toBe(false);   // gated through, then the stubbed fetch answers {}
  });
});

describe('review round 3 (m2 m3)', () => {
  test('m2: a transcode probe on a miswired manager fails with its own error, not a region refusal', async () => {
    const tm: any = new TranscodeManager({ assertRegionHost: () => { throw new TypeError('boom'); } } as any, {} as any, 84532 as any);
    await expect(tm.isTranscodingAvailable(H1_URL)).rejects.toThrow(TypeError);
  });
  test('m3: the training HOST_NOT_LISTED refusal names the region and the job', async () => {
    const tr: any = Object.create(TrainingManager.prototype);
    tr.hostSelectionService = { getRankedHostsForModel: async () => [{ host: { address: H2, apiUrl: 'https://h2.example' } }] };
    tr.validateAgainstBundle = () => {}; tr.trainingModelId = MODEL;
    tr.sessionManager = { getConfidentialHosts: () => [H2], getRegionPolicy: () => new RegionPolicy('uk', LISTED) };
    await expect(tr.submitTrainingWithLoadBalancing({} as any)).rejects.toMatchObject({ detail: expect.objectContaining({ region: 'uk', job: 'training' }) });
  });
});
