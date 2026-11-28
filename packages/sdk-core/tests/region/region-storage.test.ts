// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage region (1.39.27) T4: the S5 peer and the registration follow the region; Global is unchanged.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md R2, R3, R7, R8, R9.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { blake3 } from '@noble/hashes/blake3';

const created: any[] = [];
let instance: any;
function freshInstance() {
  return {
    identity: {},
    recoverIdentityFromSeedPhrase: vi.fn(async () => undefined),
    registerOnNewPortal: vi.fn(async () => undefined),
    getSigningPublicKey: vi.fn(async () => 'PUBKEY'),
    sign: vi.fn(async () => 'SIG'),
    setPortalAuth: vi.fn(),
    storePortalCredentials: vi.fn(async () => undefined),
    fs: { ensureIdentityInitialized: vi.fn(async () => undefined) },
  };
}
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
vi.mock('@julesl23/s5js', () => ({
  isS5RegistryUnavailableError: () => false,
  S5: { create: vi.fn(async (opts: any) => { created.push(opts); return instance; }) },
}));

import { StorageManager } from '../../src/managers/StorageManager';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { STORAGE_REGIONS } from '../../src/config/storage-regions';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';

const SEED = 'abandon adjust boy rush advice believe inform achieve alter club rural educate address peace myself';
const ADDR = '0x' + '4d'.repeat(20);
const AUTH = 'https://app.invalid/api/s5';
const UK = STORAGE_REGIONS.uk;

let calls: Array<{ url: string; body: any }>;
beforeEach(() => {
  created.length = 0;
  instance = freshInstance();
  calls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    // An updated backend (1.39.28): it echoes the request's region in both replies, and nothing for Global.
    const echo = body.region === undefined ? {} : { region: body.region };
    const reply = url.endsWith('/register') ? { challenge: 'AAAA', ...echo } : { authToken: 'TOKEN', ...echo };
    return new Response(JSON.stringify(reply), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** The 32-byte portal-host hash at the end of the signed registration challenge. */
const signedHostHash = () => {
  const message: Uint8Array = instance.sign.mock.calls[0][0];
  return Buffer.from(message.slice(message.length - 32)).toString('hex');
};
const hostHash = (h: string) => Buffer.from(blake3(new TextEncoder().encode(h))).toString('hex');

describe('a regional StorageManager (R7, R8)', () => {
  test('initialPeers is exactly the region peer', async () => {
    await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR);
    expect(created).toHaveLength(1);
    expect(created[0].initialPeers).toEqual([STORAGE_REGIONS.uk.peer]);
    expect(created[0].skipIdentityLoad).toBe(true);
  });

  test('a peer that is not the region\'s is refused before S5 starts', async () => {
    await expect(new StorageManager(STORAGE_REGIONS.global.peer, AUTH, true, 'uk').initialize(SEED, ADDR))
      .rejects.toMatchObject({ code: 'STORAGE_REGION_CONFIG_REFUSED' });
    expect(created).toHaveLength(0);
  });

  test('registration goes only through the backend, with region "uk" in both bodies and the UK portal signed and used', async () => {
    await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR);
    expect(calls.map((c) => c.url)).toEqual([`${AUTH}/register`, `${AUTH}/register-complete`]);
    expect(calls[0].body).toEqual({ pubKey: 'PUBKEY', region: 'uk' });
    expect(calls[1].body).toMatchObject({ pubKey: 'PUBKEY', signature: 'SIG', label: 'fabstir-sdk', region: 'uk' });
    expect(signedHostHash()).toBe(hostHash('s5-uk.platformlessai.ai'));
    expect(instance.setPortalAuth).toHaveBeenCalledWith('https://s5-uk.platformlessai.ai', 'TOKEN');
    expect(instance.storePortalCredentials.mock.calls[0][0]).toBe('https://s5-uk.platformlessai.ai');
    expect(instance.registerOnNewPortal).not.toHaveBeenCalled();
  });

  test('a master token, or no registration route at all, is refused — never a registration on any portal', async () => {
    await expect(new StorageManager(UK.peer, 'tok', false, 'uk').initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'STORAGE_REGION_CONFIG_REFUSED' });
    await expect(new StorageManager(UK.peer, undefined, false, 'uk').initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'STORAGE_REGION_CONFIG_REFUSED' });
    expect(created).toHaveLength(0); // refused before S5 starts
    expect(instance.registerOnNewPortal).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  test('a backend that refuses the region fails the start (no fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"no token for region uk"}', { status: 400 })));
    await expect(new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'STORAGE_INIT_ERROR' });
    expect(instance.fs.ensureIdentityInitialized).not.toHaveBeenCalled();
  });
});

describe('Global is unchanged (R2, acceptance f)', () => {
  test('the default peer; backend bodies carry no region; the Global portal is signed and used', async () => {
    await new StorageManager(undefined as any, AUTH, true).initialize(SEED, ADDR);
    expect(created[0].initialPeers).toEqual([StorageManager.DEFAULT_S5_PORTAL]);
    expect(calls[0].body).toEqual({ pubKey: 'PUBKEY' });
    expect(Object.keys(calls[1].body).sort()).toEqual(['label', 'pubKey', 'response', 'signature']);
    expect(signedHostHash()).toBe(hostHash('s5.platformlessai.ai'));
    expect(instance.setPortalAuth).toHaveBeenCalledWith('https://s5.platformlessai.ai', 'TOKEN');
  });
  test('master token and no-token registration still go to the Global portal', async () => {
    await new StorageManager(StorageManager.DEFAULT_S5_PORTAL, 'tok', false).initialize(SEED, ADDR);
    expect(instance.registerOnNewPortal).toHaveBeenCalledWith('https://s5.platformlessai.ai', 'tok');
    instance = freshInstance();
    await new StorageManager(StorageManager.DEFAULT_S5_PORTAL).initialize(SEED, ADDR);
    expect(instance.registerOnNewPortal).toHaveBeenCalledWith('https://s5.platformlessai.ai');
  });
  test('a caller peer (s5Config.portalUrl) is used as given', async () => {
    await new StorageManager('wss://zX@other.example/s5/p2p', 'tok', false).initialize(SEED, ADDR);
    expect(created[0].initialPeers).toEqual(['wss://zX@other.example/s5/p2p']);
  });
});

describe('FabstirSDKCore builds the StorageManager for its region (R7, R9)', () => {
  const cfg = (extra: any) => ({
    mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid',
    contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts }, ...extra,
  });
  test('uk: the region peer and descriptor, through the auth API', () => {
    const sm: any = (new FabstirSDKCore(cfg({ storageRegion: 'uk', s5Config: { authApiUrl: AUTH } })) as any).buildStorageManager();
    expect(sm.s5PortalUrl).toBe(STORAGE_REGIONS.uk.peer);
    expect(sm.region).toMatchObject({ key: 'uk', portalUrl: 'https://s5-uk.platformlessai.ai' });
    expect(sm.authApiUrl).toBe(AUTH);
    expect(sm.masterToken).toBeUndefined();
    expect((new FabstirSDKCore(cfg({ storageRegion: 'uk', s5Config: { authApiUrl: AUTH } })) as any).ragS5Portal()).toBe(STORAGE_REGIONS.uk.peer);
  });
  test('global: as before (default peer or the caller\'s, master token or auth API), no region', () => {
    const a: any = (new FabstirSDKCore(cfg({})) as any).buildStorageManager();
    expect(a.s5PortalUrl).toBe(StorageManager.DEFAULT_S5_PORTAL);
    expect(a.region).toBeUndefined();
    const b: any = (new FabstirSDKCore(cfg({ s5Config: { portalUrl: 'wss://zX@o/s5/p2p', masterToken: 'tok' } })) as any).buildStorageManager();
    expect(b.s5PortalUrl).toBe('wss://zX@o/s5/p2p');
    expect(b.masterToken).toBe('tok');
    expect((new FabstirSDKCore(cfg({})) as any).ragS5Portal()).toBe('http://localhost:5522');
  });
});

/** A backend whose replies are given per call: what /register and /register-complete answer with. */
function backendReplying(first: object, second: object = { authToken: 'TOKEN', region: 'uk' }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(url.endsWith('/register') ? first : second), { status: 200 });
  }));
}
const REFUSED = 'STORAGE_REGION_REGISTRATION_REFUSED';

describe('1.39.28: a regional registration needs the backend to echo the region in both replies (E-T1)', () => {
  test.each([
    ['no region', {}],
    ["'global'", { region: 'global' }],
    ["'UK' (not the key)", { region: 'UK' }],
    ['a non-string', { region: ['uk'] }],
  ])('/register replying with %s: refused before the challenge is signed, and /register-complete is never sent', async (_name, extra) => {
    backendReplying({ challenge: 'AAAA', ...extra });
    const err: any = await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR).catch((e) => e);
    expect(err).toMatchObject({ code: REFUSED, details: { region: 'uk', call: 'register', retryable: false } });
    expect(calls.map((c) => c.url)).toEqual([`${AUTH}/register`]);
    expect(instance.sign).not.toHaveBeenCalled();
    expect(instance.setPortalAuth).not.toHaveBeenCalled();
    expect(instance.storePortalCredentials).not.toHaveBeenCalled();
    expect(instance.fs.ensureIdentityInitialized).not.toHaveBeenCalled();
  });

  test('what came back is reported only as a short string, else null', async () => {
    backendReplying({ challenge: 'AAAA', region: 'global' });
    expect(await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR).catch((e) => e)).toMatchObject({ details: { received: 'global' } });
    instance = freshInstance();
    backendReplying({ challenge: 'AAAA', region: { long: 'x'.repeat(100) } });
    expect(await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR).catch((e) => e)).toMatchObject({ details: { received: null } });
    instance = freshInstance();
    backendReplying({ challenge: 'AAAA', region: 'x'.repeat(33) });
    expect(await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR).catch((e) => e)).toMatchObject({ details: { received: null } });
  });

  test.each([
    ['no region', { authToken: 'TOKEN' }],
    ["'global'", { authToken: 'TOKEN', region: 'global' }],
    ["'UK' (not the key)", { authToken: 'TOKEN', region: 'UK' }],
    ['a non-string', { authToken: 'TOKEN', region: ['uk'] }],
  ])('/register-complete replying with %s: refused, and its token is never set or stored', async (_name, second) => {
    backendReplying({ challenge: 'AAAA', region: 'uk' }, second);
    const err: any = await new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR).catch((e) => e);
    expect(err).toMatchObject({ code: REFUSED, details: { region: 'uk', call: 'register-complete', retryable: false } });
    expect(calls.map((c) => c.url)).toEqual([`${AUTH}/register`, `${AUTH}/register-complete`]);
    expect(instance.setPortalAuth).not.toHaveBeenCalled();
    expect(instance.storePortalCredentials).not.toHaveBeenCalled();
    expect(instance.fs.ensureIdentityInitialized).not.toHaveBeenCalled();
  });

  test('an error status keeps its own error (unchanged)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"no token for region uk"}', { status: 400 })));
    await expect(new StorageManager(UK.peer, AUTH, true, 'uk').initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'STORAGE_INIT_ERROR' });
  });
});

describe('1.39.28: Global reads no echo (E-T2)', () => {
  test('a Global reply that carries a region registers as today, with bodies unchanged', async () => {
    backendReplying({ challenge: 'AAAA', region: 'uk' }, { authToken: 'TOKEN', region: 'uk' });
    await new StorageManager(undefined as any, AUTH, true).initialize(SEED, ADDR);
    expect(calls[0].body).toEqual({ pubKey: 'PUBKEY' });
    expect(Object.keys(calls[1].body).sort()).toEqual(['label', 'pubKey', 'response', 'signature']);
    expect(instance.setPortalAuth).toHaveBeenCalledWith('https://s5.platformlessai.ai', 'TOKEN');
  });
  test('a Global reply with no region registers as today', async () => {
    backendReplying({ challenge: 'AAAA' }, { authToken: 'TOKEN' });
    await new StorageManager(undefined as any, AUTH, true).initialize(SEED, ADDR);
    expect(instance.setPortalAuth).toHaveBeenCalledWith('https://s5.platformlessai.ai', 'TOKEN');
    expect(instance.fs.ensureIdentityInitialized).toHaveBeenCalled();
  });
});

describe('1.39.28: the refusal fails the public sign-in under its own code (E-T3)', () => {
  const PK = '0x' + '11'.repeat(32);
  const signIn = (sdk: any) => {
    sdk.initializeManagers = async function (this: any) { this.storageManager = this.buildStorageManager(); await this._initStorage(false); };
    sdk.buildBridge = async () => {};
    return sdk.authenticate('privatekey', { privateKey: PK });
  };
  const ukCfg = () => ({
    mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid',
    contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts },
    storageRegion: 'uk', s5Config: { authApiUrl: AUTH, seedPhrase: SEED },
  });
  test('authenticate() rejects with STORAGE_REGION_REGISTRATION_REFUSED, not AUTH_FAILED or a degraded store', async () => {
    backendReplying({ challenge: 'AAAA' });
    const sdk: any = new FabstirSDKCore(ukCfg() as any);
    await expect(signIn(sdk)).rejects.toMatchObject({ code: REFUSED, details: { call: 'register' } });
    expect(sdk.storageUnavailable).toBeUndefined();
    expect(calls.map((c) => c.url)).toEqual([`${AUTH}/register`]);
    expect(sdk.isAuthenticated()).toBe(false);   // never left half signed in (the seed and address are forgotten)
    expect(sdk.s5Seed).toBeUndefined();
  });
  test('with both replies echoing, the same sign-in succeeds', async () => {
    const sdk: any = new FabstirSDKCore(ukCfg() as any);
    await signIn(sdk);
    expect(sdk.storageManager.isInitialized()).toBe(true);
    expect(instance.setPortalAuth).toHaveBeenCalledWith('https://s5-uk.platformlessai.ai', 'TOKEN');
  });
});
