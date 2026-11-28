// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage region (1.39.27) T2 + T3: construction refusals, and the one seed entry point on every sign-in path.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md §0 S1–S5, R2–R4, R6, R15; owner acceptance (c).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
vi.mock('../../src/wallet', async (orig) => ({
  ...(await orig<any>()),
  ensureSubAccount: vi.fn(async () => ({ address: SUB, isNew: false })),
  createSubAccountSigner: vi.fn(() => ({ getAddress: async () => SUB })),
}));

import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { AuthManager } from '../../src/managers/AuthManager';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { ChainId } from '../../src/types/chain.types';
import { STORAGE_REGIONS } from '../../src/config/storage-regions';
import {
  deriveRegionalS5Seed, generateS5SeedFromAddress, generateS5SeedFromPrivateKey, entropyToS5Phrase,
  addressSeedBytes, privateKeySeedBytes, deriveEntropyFromAddress, deriveEntropyFromPrivateKey,
} from '../../src/utils/s5-seed-derivation';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { ensureSubAccount } from '../../src/wallet';

const PK = '0x' + '11'.repeat(32);
const WALLET = new ethers.Wallet(PK);
const ADDR = WALLET.address;
const PRIMARY = ethers.getAddress('0x' + '2b'.repeat(20));
const SUB = ethers.getAddress('0x' + '3c'.repeat(20));
const BASE = 'abandon adjust boy rush advice believe inform achieve alter club rural educate address peace myself';
const AUTH_API = 'https://app.invalid/api/s5';

const cfg = (extra: any = {}) => ({
  mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid',
  contractAddresses: { ...ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts }, ...extra,
});
const uk = (s5Config: any = {}, extra: any = {}) => cfg({ storageRegion: 'uk', s5Config: { authApiUrl: AUTH_API, ...s5Config }, ...extra });
const signer = (address: string) => ({ getAddress: async () => address, signMessage: vi.fn(async () => { throw new Error('never asked to sign'); }) }) as any;

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (m.has(k) ? m.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => { m.set(k, v); }),
    removeItem: vi.fn((k: string) => { m.delete(k); }),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    map: m,
  };
}

let ls: ReturnType<typeof fakeLocalStorage>;
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ls = fakeLocalStorage();
  (globalThis as any).window = { localStorage: ls };
  (globalThis as any).localStorage = ls;
});
afterEach(() => { delete (globalThis as any).window; delete (globalThis as any).localStorage; vi.restoreAllMocks(); });

describe('T2 — construction', () => {
  test('default and global construct as today; getStorageRegion', () => {
    expect((new FabstirSDKCore(cfg()) as any).getStorageRegion()).toBe('global');
    expect((new FabstirSDKCore(cfg({ storageRegion: 'global', s5Config: { masterToken: 't', portalUrl: 'wss://x@y/s5/p2p' } })) as any).getStorageRegion()).toBe('global');
    expect((new FabstirSDKCore(uk()) as any).getStorageRegion()).toBe('uk');
  });
  test("'eu' is unavailable; anything else is invalid", () => {
    expect(() => new FabstirSDKCore(cfg({ storageRegion: 'eu' }))).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_UNAVAILABLE' }));
    expect(() => new FabstirSDKCore(cfg({ storageRegion: 'UK' }))).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_INVALID' }));
  });
  test('a regional session refuses masterToken, a portalUrl of another region, and a missing authApiUrl', () => {
    const refused = (c: any, field: string) => expect(() => new FabstirSDKCore(c)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_CONFIG_REFUSED', details: expect.objectContaining({ field }) }));
    refused(uk({ masterToken: 'tok' }), 'masterToken');
    refused(uk({ portalUrl: STORAGE_REGIONS.global.peer }), 'portalUrl');
    refused(uk({ portalUrl: 'https://s5.platformlessai.ai' }), 'portalUrl');
    refused(cfg({ storageRegion: 'uk' }), 'authApiUrl');
    refused(cfg({ storageRegion: 'uk', s5Config: { authApiUrl: '' } }), 'authApiUrl');
  });
  test("the region's own peer or portal URL as portalUrl is accepted; skipS5 and hostOnly need no authApiUrl", () => {
    expect(() => new FabstirSDKCore(uk({ portalUrl: STORAGE_REGIONS.uk.peer }))).not.toThrow();
    expect(() => new FabstirSDKCore(uk({ portalUrl: STORAGE_REGIONS.uk.portalUrl }))).not.toThrow();
    expect(() => new FabstirSDKCore(cfg({ storageRegion: 'uk', skipS5: true }))).not.toThrow();
    expect(() => new FabstirSDKCore(cfg({ storageRegion: 'uk', hostOnly: true }))).not.toThrow();
  });
  test('the capability flag', () => {
    expect((SDK_CAPABILITIES as any).storageRegion).toBe(true);
  });
});

describe('T3 — the regional seed on every sign-in path (S1, S2, S4)', () => {
  test('the sync seed bytes equal the async derivations they mirror', async () => {
    for (const a of [ADDR, PRIMARY, SUB]) for (const c of [84532, 5611]) {
      expect(Buffer.from(addressSeedBytes(a, c))).toEqual(Buffer.from(await deriveEntropyFromAddress(a, c)));
    }
    for (const k of [PK, '22'.repeat(32), '0x' + 'ab'.repeat(32)]) {
      expect(Buffer.from(privateKeySeedBytes(k))).toEqual(Buffer.from(await deriveEntropyFromPrivateKey(k)));
    }
  });

  test('privatekey, no supplied seed: derived from the private-key seed', async () => {
    const sdk: any = new FabstirSDKCore(uk());
    await sdk.authenticateWithPrivateKey(PK);
    expect(sdk.s5Seed).toBe(deriveRegionalS5Seed(await generateS5SeedFromPrivateKey(PK), 'uk'));
  });
  test('privatekey with a supplied seed: derived from the supplied seed', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await sdk.authenticateWithPrivateKey(PK);
    expect(sdk.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
  });
  test('aa-signer: derived from the EOA key, or from the supplied seed', async () => {
    const opts = { smartAccountAddress: PRIMARY, eoaPrivateKey: PK, sendUserOp: async () => '0x', rpcUrl: 'https://rpc.invalid', chainId: 84532 };
    const a: any = new FabstirSDKCore(uk());
    await a.authenticateWithAASigner(opts);
    expect(a.s5Seed).toBe(deriveRegionalS5Seed(await generateS5SeedFromPrivateKey(PK), 'uk'));
    const b: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await b.authenticateWithAASigner(opts);
    expect(b.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
  });
  test('signer with a supplied seed: derived; with none: refused, never address-derived or cached', async () => {
    const ok: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await ok.authenticateWithSigner(signer(ADDR));
    expect(ok.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
    // A Global seed already in the cache for this address is not reused (acceptance c).
    ls.map.set(`fabstir_s5_seed_${ADDR.toLowerCase()}_v4`, JSON.stringify({ version: 'v4', seed: BASE }));
    ls.getItem.mockClear();
    const none: any = new FabstirSDKCore(uk());
    await expect(none.authenticateWithSigner(signer(ADDR))).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REQUIRED' });
    expect(none.s5Seed).toBeUndefined();
    expect(ls.getItem).not.toHaveBeenCalled();
  });
  test('metamask with no supplied seed: refused; with one: derived', async () => {
    (globalThis as any).window.ethereum = {
      request: async ({ method }: any) => method === 'eth_chainId' ? '0x14a34' : ['eth_accounts', 'eth_requestAccounts'].includes(method) ? [ADDR] : null,
    };
    const none: any = new FabstirSDKCore(uk());
    await expect(none.authenticateWithMetaMask()).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REQUIRED' });
    const ok: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await ok.authenticateWithMetaMask();
    expect(ok.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
  });
  test('a supplied seed equal to the address-derived one is refused, on any supported chain (S4)', async () => {
    for (const chain of ChainRegistry.getSupportedChains()) {
      const pub = await generateS5SeedFromAddress(ADDR, chain);
      const sdk: any = new FabstirSDKCore(uk({ seedPhrase: pub }));
      await expect(sdk.authenticateWithSigner(signer(ADDR))).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED', details: expect.objectContaining({ reason: 'ADDRESS_DERIVED' }) });
      const pk: any = new FabstirSDKCore(uk({ seedPhrase: pub.toUpperCase() })); // the same seed, written differently
      await expect(pk.authenticateWithPrivateKey(PK)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED' });
    }
  });
  test('M06: the address-derived seed of a chain this build has not configured is refused too (every known chain id)', async () => {
    for (const chain of [84532, 8453, 5611]) {
      const sdk: any = new FabstirSDKCore(uk({ seedPhrase: await generateS5SeedFromAddress(ADDR, chain) }));
      await expect(sdk.authenticateWithSigner(signer(ADDR))).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED' });
    }
  });
  test('M15: Base Account in a region with no supplied seed: refused, the cache never read, nothing derived from the primary', async () => {
    const sdk: any = new FabstirSDKCore(uk());
    const seen: any[] = [];
    sdk._authenticate = vi.fn(async (...args: any[]) => { seen.push(args); return sdk.authenticateWithSigner(args[1].signer, args[3], args[4]); });
    ls.getItem.mockClear();
    await expect(sdk._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, sdk.identityEpoch)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REQUIRED' });
    expect(ls.getItem).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);   // refused before the sub-account step, so nothing derived from the primary
  });
  test('an unreadable supplied seed is refused, not derived', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: 'not a phrase' }));
    await expect(sdk.authenticateWithPrivateKey(PK)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED', details: expect.objectContaining({ reason: 'INVALID_PHRASE' }) });
  });
  test('Base Account: no pre-derivation from the primary, and the primary-derived seed is refused (S4)', async () => {
    const pub = await generateS5SeedFromAddress(PRIMARY, 84532);
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: pub }));
    const seen: any[] = [];
    sdk._authenticate = vi.fn(async (...args: any[]) => { seen.push(args); return sdk.authenticateWithSigner(args[1].signer, args[3], args[4]); });
    await expect(sdk._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, sdk.identityEpoch))
      .rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED', details: expect.objectContaining({ reason: 'ADDRESS_DERIVED' }) });
    expect(seen).toHaveLength(0);                    // refused before any wallet step (review round 1, m3)
    const fine: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    fine._authenticate = vi.fn(async (...args: any[]) => { seen.push(args); throw new Error('stop'); });
    await expect(fine._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, fine.identityEpoch)).rejects.toThrow('stop');
    expect(seen[0][3]).toBeUndefined();              // no derivedSeed handed on in a region
    expect(seen[0][4]).toEqual([PRIMARY]);           // the primary is checked at the signer step too
    const ok: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await ok.authenticateWithSigner(signer(SUB), undefined, [PRIMARY]);
    expect(ok.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
    expect(ls.getItem).not.toHaveBeenCalled();
  });
});

describe('T3 — cache, hand-backs and setS5Seed (S3, S5)', () => {
  test('after a regional sign-in nothing is written to the cache', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await sdk.authenticateWithSigner(signer(ADDR));
    sdk.userAddress = ADDR;
    sdk.cacheDerivedSeed();
    expect(ls.setItem).not.toHaveBeenCalled();
    expect(ls.length).toBe(0);
  });
  test('getS5Seed refuses in a region; global hands it back as before', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await sdk.authenticateWithPrivateKey(PK);
    expect(() => sdk.getS5Seed()).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_SEALED' }));
    const g: any = new FabstirSDKCore(cfg());
    await g.authenticateWithPrivateKey(PK);
    expect(g.getS5Seed()).toBe(await generateS5SeedFromPrivateKey(PK));
  });
  test('setS5Seed derives in a region (the same entry point), and refuses an unreadable or address-derived seed', async () => {
    const sdk: any = new FabstirSDKCore(uk());
    sdk.userAddress = ADDR;
    sdk.setS5Seed(BASE);
    expect(sdk.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
    expect(() => sdk.setS5Seed('nope')).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
    expect(() => sdk.setS5Seed(entropyToS5Phrase(addressSeedBytes(ADDR, 84532)))).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
    const g: any = new FabstirSDKCore(cfg());
    g.setS5Seed(BASE);
    expect(g.s5Seed).toBe(BASE);
  });
  test('AuthManager in a region: no seed hand-back, no legacy seed path, no S5 of its own (R6)', async () => {
    const am = new AuthManager(WALLET, undefined, ADDR, deriveRegionalS5Seed(BASE, 'uk'), 'uk');
    expect(() => am.getS5Seed()).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_SEALED' }));
    await expect(am.authenticate('privatekey' as any, { privateKey: PK } as any)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_SEALED' });
    await expect(am.initializeS5()).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_SEALED' });
    expect(new AuthManager(WALLET, undefined, ADDR, BASE).getS5Seed()).toBe(BASE);
  });
});

describe("T3 — 'global' is 1.39.26 on every path (acceptance f)", () => {
  test('privatekey: the same seed and the same sealing key', async () => {
    const sdk: any = new FabstirSDKCore(cfg());
    await sdk.authenticateWithPrivateKey(PK);
    const seed = await generateS5SeedFromPrivateKey(PK);
    expect(sdk.s5Seed).toBe(seed);
    expect(EncryptionManager.fromSeed(sdk.s5Seed, ADDR).getPublicKey()).toBe(EncryptionManager.fromSeed(seed, ADDR).getPublicKey());
  });
  test('signer: the cached seed first, then the address-derived one, and caching after sign-in', async () => {
    const g: any = new FabstirSDKCore(cfg());
    await g.authenticateWithSigner(signer(ADDR));
    expect(g.s5Seed).toBe(await generateS5SeedFromAddress(ADDR, 84532));
    g.userAddress = ADDR;
    g.cacheDerivedSeed();
    expect(ls.setItem).toHaveBeenCalledTimes(1);
    ls.map.set(`fabstir_s5_seed_${ADDR.toLowerCase()}_v4`, JSON.stringify({ version: 'v4', seed: BASE }));
    const c: any = new FabstirSDKCore(cfg());
    await c.authenticateWithSigner(signer(ADDR));
    expect(c.s5Seed).toBe(BASE);
  });
  test('a supplied seed is used as given and never cached', async () => {
    const g: any = new FabstirSDKCore(cfg({ s5Config: { seedPhrase: BASE } }));
    await g.authenticateWithSigner(signer(ADDR));
    expect(g.s5Seed).toBe(BASE);
    g.userAddress = ADDR;
    g.cacheDerivedSeed();
    expect(ls.setItem).not.toHaveBeenCalled();
  });
});

describe('review round 1 (adversarial m3 m4; plan 6 7; the public entry point)', () => {
  /** The public sign-in, with its post-seed steps (managers, bridge) stubbed: what a consumer calls. */
  const signIn = async (sdk: any, method: string, options: any) => {
    sdk.initializeManagers = async () => {};
    sdk.buildBridge = async () => {};
    return sdk.authenticate(method, options);
  };
  test('the region refusals reach a consumer of authenticate() with their own codes, not AUTH_FAILED', async () => {
    await expect(signIn(new FabstirSDKCore(uk()), 'signer', { signer: signer(ADDR) })).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REQUIRED' });
    await expect(signIn(new FabstirSDKCore(uk({ seedPhrase: 'not a phrase' })), 'privatekey', { privateKey: PK })).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED' });
  });
  test('a full regional sign-in (authenticate) reads and writes no seed in localStorage (plan 7)', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    ls.getItem.mockClear();
    await signIn(sdk, 'privatekey', { privateKey: PK });
    expect(sdk.s5Seed).toBe(deriveRegionalS5Seed(BASE, 'uk'));
    expect(ls.getItem).not.toHaveBeenCalled();
    expect(ls.setItem).not.toHaveBeenCalled();
    const g: any = new FabstirSDKCore(cfg());
    await signIn(g, 'signer', { signer: signer(ADDR) });
    expect(ls.setItem).toHaveBeenCalledTimes(1);   // Global still caches its derived seed after sign-in
  });
  test('Global sealing key equals the frozen 1.39.26 value (plan 6)', async () => {
    const sdk: any = new FabstirSDKCore(cfg());
    await sdk.authenticateWithPrivateKey(PK);
    expect(EncryptionManager.fromSeed(sdk.s5Seed, ADDR).getPublicKey()).toBe('0x' + '02bcaa294cec36e66df6744f1959399ab684136b03827258a628a236ac9190dbac');
  });
  test('m3: Base Account in a region is refused before any wallet step (no seed, or the primary-derived one)', async () => {
    (ensureSubAccount as any).mockClear();
    const none: any = new FabstirSDKCore(uk());
    await expect(none._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, none.identityEpoch)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REQUIRED' });
    const pub: any = new FabstirSDKCore(uk({ seedPhrase: await generateS5SeedFromAddress(PRIMARY, 84532) }));
    await expect(pub._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, pub.identityEpoch)).rejects.toMatchObject({ code: 'STORAGE_REGION_SEED_REFUSED' });
    expect(ensureSubAccount).not.toHaveBeenCalled();
  });
  test('m4: setS5Seed after a Base Account sign-in still refuses the primary-derived seed', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await sdk.authenticateWithSigner(signer(SUB), undefined, [PRIMARY]);
    expect(() => sdk.setS5Seed(entropyToS5Phrase(addressSeedBytes(PRIMARY, 84532)))).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
  });
});

test('an SDK whose config names no region is Global (the default), e.g. a config built without validateConfig', async () => {
  const stub: any = Object.create(FabstirSDKCore.prototype);
  stub.config = { chainId: 84532, rpcUrl: 'https://rpc.invalid' };
  expect(stub.isRegional()).toBe(false);
  stub.userAddress = ADDR;
  await stub.authenticateWithSigner(signer(ADDR));
  expect(stub.s5Seed).toBe(await generateS5SeedFromAddress(ADDR, 84532));
});

describe('review round 2 (m1 m2 m3 m7)', () => {
  test('m1: a Base Account sign-in that fails after the up-front check leaves the previous identity\'s addresses alone', async () => {
    const sdk: any = new FabstirSDKCore(uk({ seedPhrase: BASE }));
    await sdk.authenticateWithSigner(signer(SUB), undefined, [PRIMARY]);
    (ensureSubAccount as any).mockRejectedValueOnce(new Error('user cancelled'));
    const OTHER = ethers.getAddress('0x' + '9e'.repeat(20));
    await expect(sdk._authenticateWithBaseAccount({ provider: {}, primaryAccount: OTHER }, sdk.identityEpoch)).rejects.toThrow('user cancelled');
    expect(() => sdk.setS5Seed(entropyToS5Phrase(addressSeedBytes(PRIMARY, 84532)))).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
  });
  test('m2: a hostOnly Base Account sign-in in a region needs no seed', async () => {
    const sdk: any = new FabstirSDKCore(cfg({ storageRegion: 'uk', hostOnly: true }));
    sdk._authenticate = vi.fn(async () => undefined);
    await sdk._authenticateWithBaseAccount({ provider: {}, primaryAccount: PRIMARY }, sdk.identityEpoch).catch(() => undefined);
    expect(sdk._authenticate).toHaveBeenCalled();   // not refused up front
  });
  test('m3: a region refusal from the storage start fails the sign-in with its code (never a degraded store)', async () => {
    const init = (FabstirSDKCore.prototype as any)._initStorage;
    const refusal = Object.assign(new Error('refused'), { code: 'STORAGE_REGION_CONFIG_REFUSED' });
    const self: any = { s5Seed: BASE, userAddress: ADDR, ensureAuthenticated() {}, storageManager: { initialize: async () => { throw refusal; }, isInitialized: () => false, dispose() {} } };
    await expect(init.call(self, false)).rejects.toBe(refusal);
  });
  test('m7: setS5Seed does not grow the remembered addresses', () => {
    const sdk: any = new FabstirSDKCore(uk());
    sdk.userAddress = ADDR;
    for (let i = 0; i < 3; i++) sdk.setS5Seed(BASE);
    expect(sdk.regionIdentityAddresses).toEqual([ADDR]);
  });
});

test('round 3 m4: getStorageRegion reads an absent region as Global, like isRegional', () => {
  const stub: any = Object.create(FabstirSDKCore.prototype);
  stub.config = {};
  expect(stub.getStorageRegion()).toBe('global');
  expect(stub.regionPolicy().restricted).toBe(false);
});
