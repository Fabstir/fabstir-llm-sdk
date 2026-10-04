// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 31 — plan §44 YY1, YY2, YY4: `migrateToSealedStorage` refused by configuration (the store a
 * `skipS5` sign-in installs included); a switch waits for a sign-in already running; `appendMessages` takes dense lists
 * of message objects only.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { StorageManager } from '../../src/managers/StorageManager';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

test('YY1 — a skipS5 SDK, its stand-in store installed as a sign-in does: STORAGE_NOT_AVAILABLE, no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (r: unknown) => unhandled.push(r);
  process.on('unhandledRejection', onUnhandled);
  try {
    const s = realSdk({ authenticated: true, userAddress: ethers.Wallet.createRandom().address });
    s.config.skipS5 = true;
    await s._initStorage(true);                                         // what initializeManagers runs for skipS5
    expect(s.storageManager).toBeTruthy();
    expect(await caught(s.migrateToSealedStorage())).toMatchObject({ code: 'STORAGE_NOT_AVAILABLE', details: { retryable: false } });
    await tick();
    await tick();
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  expect(unhandled).toEqual([]);
});

describe('YY2 — a switch waits for a sign-in already running', () => {
  function sdkWithSlowSignIn() {
    const real = ChainRegistry.getChain.bind(ChainRegistry);
    vi.spyOn(ChainRegistry, 'isChainSupported').mockImplementation((id: number) => id === 99999 || id === 84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: any) => id === 99999
      ? ({ chainId: 99999, contracts: { modelRegistry: '0x' + '1'.repeat(40), nodeRegistry: '0x' + '2'.repeat(40) } } as any) : real(id));
    const wallet = { slow: false, fails: false, release: () => {} };
    const s = realSdk({
      authenticateWithPrivateKey: async () => {
        if (wallet.slow) await new Promise<void>((r) => { wallet.release = r; });  // a wallet prompt open
        if (wallet.fails) throw new Error('wallet refused');
        s.userAddress = ethers.Wallet.createRandom().address; s.signer = { provider: {} }; s.provider = {};
      },
      assertReadWriteChainParity: async () => {},
      initializeManagers: async () => { s.paymentManager = { getCurrentChainId: () => 84532, switchChain: async () => {} }; },
    });
    return { s, wallet };
  }
  const key = (n: string) => '0x' + n.repeat(64);

  test('asked for while the sign-in\'s wallet prompt is open: it waits, then switches the identity that signed in', async () => {
    const { s, wallet } = sdkWithSlowSignIn();
    await s.authenticate('privatekey', { privateKey: key('2') });
    s.reinitializeManagersForChain = async () => {};
    wallet.slow = true;
    const signingIn = s.authenticate('privatekey', { privateKey: key('3') });
    await tick(); await tick();                                         // started: the previous identity forgotten
    const switching = s.switchChain(99999).then(() => 'switched', (e: any) => e?.code);
    await tick();
    wallet.release();
    await signingIn;
    expect({ switch: await switching, chainId: s.getChainId() }).toEqual({ switch: 'switched', chainId: 99999 });
  });

  test('… and when that sign-in fails: CHAIN_SWITCH_UNAUTHENTICATED, saying the SDK is not signed in', async () => {
    const { s, wallet } = sdkWithSlowSignIn();
    await s.authenticate('privatekey', { privateKey: key('2') });
    s.reinitializeManagersForChain = async () => {};
    wallet.slow = true;
    wallet.fails = true;
    const signingIn = s.authenticate('privatekey', { privateKey: key('3') }).then(() => 'signed in', (e: any) => e?.code);
    await tick(); await tick();
    const switching = s.switchChain(99999).then(() => 'switched', (e: any) => e);
    await tick();
    wallet.release();
    expect(await signingIn).toBe('AUTH_FAILED');
    const refusal = await switching;
    expect({ code: refusal?.code, chainId: s.getChainId() }).toEqual({ code: 'CHAIN_SWITCH_UNAUTHENTICATED', chainId: 84532 });
    expect(refusal.message).not.toMatch(/before authenticate/);
  });
});

describe('YY2 — the identity checks run once the sign-ins asked for before have settled', () => {
  test('a switch that waited for an aa-signer sign-in: AA_SWITCH_CHAIN_UNSUPPORTED, the chain unchanged', async () => {
    const real = ChainRegistry.getChain.bind(ChainRegistry);
    vi.spyOn(ChainRegistry, 'isChainSupported').mockImplementation((id: number) => id === 99999 || id === 84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: any) => id === 99999
      ? ({ chainId: 99999, contracts: { modelRegistry: '0x' + '1'.repeat(40), nodeRegistry: '0x' + '2'.repeat(40) } } as any) : real(id));
    let release!: () => void;
    const s = realSdk({
      authenticateWithPrivateKey: async () => { s.userAddress = ethers.Wallet.createRandom().address; s.signer = { provider: {} }; s.provider = {}; },
      authenticateWithAASigner: async () => {
        await new Promise<void>((r) => { release = r; });
        s.userAddress = ethers.Wallet.createRandom().address; s.signer = { provider: {} }; s.provider = {};
      },
      assertReadWriteChainParity: async () => {},
      initializeManagers: async () => { s.paymentManager = { getCurrentChainId: () => 84532, switchChain: async () => {} }; },
    });
    await s.authenticate('privatekey', { privateKey: '0x' + '2'.repeat(64) });
    s.reinitializeManagersForChain = async () => {};
    const signingIn = s.authenticate('aa-signer', {});
    await tick(); await tick();
    const switching = s.switchChain(99999).then(() => 'switched', (e: any) => e?.code);
    await tick();
    release();
    await signingIn;
    expect({ switch: await switching, chainId: s.getChainId() }).toEqual({ switch: 'AA_SWITCH_CHAIN_UNSUPPORTED', chainId: 84532 });
  });
});

describe('YY4 — appendMessages takes a dense list of message objects', () => {
  function logStore(tab: FakeS5Tab) {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    return s;
  }
  const message = (content: string, timestamp = 1) => ({ role: 'user', content, timestamp }) as any;
  // eslint-disable-next-line no-sparse-arrays
  const holed = [, message('a')];
  for (const [label, value] of [['a list with a hole', holed], ['a list of length 2 with nothing in it', new Array(2)], ['a list of lists', [[message('a')]]]] as const) {
    test(`${label}: STORAGE_CONVERSATION_INVALID, not retryable — nothing written`, async () => {
      const net = new FakeS5Network();
      const s = logStore(net.tab());
      const writes = net.writes.length;
      expect(await caught(s.appendMessages('c1', value as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { retryable: false } });
      expect(net.writes.length).toBe(writes);
    });
  }

  test('an empty list creates the conversation, with no messages (documented)', async () => {
    const s = logStore(new FakeS5Network().tab());
    await s.appendMessages('c1', []);
    expect((await s.loadConversation('c1'))?.messages).toEqual([]);
  });
});
