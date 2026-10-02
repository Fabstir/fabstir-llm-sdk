// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 30 — plan §43 XX4–XX7: `appendMessages` refuses what is not a list of messages; `switchChain`
 * joins the identity queue (a sign-in never interleaves with a switch); `migrateToSealedStorage` without storage is
 * refused, coded; a log is saved under the id asked for.
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

function logStore(tab: FakeS5Tab) {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}
const message = (content: string, timestamp = 1) => ({ role: 'user', content, timestamp }) as any;

describe('XX4 — appendMessages refuses what is not a list of messages, before anything', () => {
  for (const [label, value] of [['null', null], ['one message, not a list', message('hi')], ['a string', 'hi'], ['a list holding null', [null]]] as const) {
    test(`${label}: STORAGE_CONVERSATION_INVALID, not retryable — nothing written`, async () => {
      const net = new FakeS5Network();
      const s = logStore(net.tab());
      const writes = net.writes.length;
      expect(await caught(s.appendMessages('c1', value as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { retryable: false } });
      expect(net.writes.length).toBe(writes);
    });
  }

  test('appendMessage(id, null) is refused the same', async () => {
    const s = logStore(new FakeS5Network().tab());
    expect(await caught(s.appendMessage('c1', null as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { retryable: false } });
  });

  test('a list of messages still appends', async () => {
    const s = logStore(new FakeS5Network().tab());
    await s.appendMessages('c1', [message('q'), message('a', 2)]);
    expect((await s.loadConversation('c1'))?.messages.map((m: any) => m.content)).toEqual(['q', 'a']);
  });
});

describe('XX7 — a log is saved under the id asked for, never its own `id` field', () => {
  const dir = (id: string) => `home/sessions/${ADDR}/${id}`;
  async function legacyLogWithoutId(net: FakeS5Network) {
    await net.tab().fs.put(`${dir('C')}/conversation.json`, { messages: [message('own')], metadata: {}, createdAt: 1, updatedAt: 1 });
  }

  test('an append to a legacy log with no id: sealed at its own path, the reply in it', async () => {
    const net = new FakeS5Network();
    await legacyLogWithoutId(net);
    const s = logStore(net.tab());
    await s.appendMessages('C', [message('reply', 2)]);
    expect(net.filePaths().filter((p) => p.includes('/undefined/'))).toEqual([]);
    expect((await s.loadConversation('C'))?.messages.map((m: any) => m.content)).toEqual(['own', 'reply']);
  });

  test('a metadata update to it: the same', async () => {
    const net = new FakeS5Network();
    await legacyLogWithoutId(net);
    const s = logStore(net.tab());
    await s.updateConversationMetadata('C', { status: 'ended' });
    expect(net.filePaths().filter((p) => p.includes('/undefined/'))).toEqual([]);
    expect((await s.loadConversation('C'))?.metadata).toMatchObject({ status: 'ended' });
  });
});

describe('XX5 — switchChain is on the identity queue', () => {
  function twoIdentities() {
    const real = ChainRegistry.getChain.bind(ChainRegistry);
    vi.spyOn(ChainRegistry, 'isChainSupported').mockImplementation((id: number) => id === 99999 || id === 84532);
    vi.spyOn(ChainRegistry, 'getChain').mockImplementation((id: any) => id === 99999
      ? ({ chainId: 99999, contracts: { modelRegistry: '0x' + '1'.repeat(40), nodeRegistry: '0x' + '2'.repeat(40) } } as any) : real(id));
    const as = { who: 'A', fails: false };
    const s = realSdk({
      authenticateWithPrivateKey: async () => {
        if (as.fails) throw new Error('wallet refused');
        s.userAddress = ethers.Wallet.createRandom().address; s.signer = { provider: {}, who: as.who }; s.provider = {};
      },
      assertReadWriteChainParity: async () => {},
      initializeManagers: async () => {
        s.trainingManager = { id: as.who, signer: s.signer, chainId: s.config.chainId };
        s.paymentManager = { getCurrentChainId: () => 84532, switchChain: async () => {} };
      },
    });
    return { s, as };
  }
  const key = (n: string) => '0x' + n.repeat(64);

  test('a sign-in as B during A\'s switch waits for it: a failed switch restores A\'s managers before B\'s are built', async () => {
    const { s, as } = twoIdentities();
    await s.authenticate('privatekey', { privateKey: key('2') });
    let fail!: (e: Error) => void;
    s.reinitializeReadProviderForChain = () => new Promise((_, reject) => { fail = reject; });
    const switching = s.switchChain(99999).then(() => 'switched', (e: any) => e?.code);
    await tick();
    as.who = 'B';
    const signingIn = s.authenticate('privatekey', { privateKey: key('3') });
    await tick();
    expect(s.getTrainingManager().id).toBe('A');                       // B's sign-in has not started
    fail(new Error('rpc down'));
    expect(await switching).toBe('CHAIN_SWITCH_FAILED');
    await signingIn;
    const training = s.getTrainingManager();
    expect({ training: training.id, signer: training.signer.who, signedInAs: s.signer.who }).toEqual({ training: 'B', signer: 'B', signedInAs: 'B' });
  });

  test('a switch asked for as a sign-in starts waits for it — and refuses once that sign-in failed', async () => {
    const { s, as } = twoIdentities();
    await s.authenticate('privatekey', { privateKey: key('2') });
    s.reinitializeManagersForChain = async () => {};
    as.fails = true;
    const signingIn = s.authenticate('privatekey', { privateKey: key('3') }).then(() => 'signed in', (e: any) => e?.code);
    const switching = s.switchChain(99999).then(() => 'switched', (e: any) => e?.code);
    expect({ signIn: await signingIn, switch: await switching, chainId: s.getChainId() })
      .toEqual({ signIn: 'AUTH_FAILED', switch: 'CHAIN_SWITCH_UNAUTHENTICATED', chainId: 84532 });
  });

  test('a switch that waited for a sign-in that succeeded switches that identity', async () => {
    const { s, as } = twoIdentities();
    await s.authenticate('privatekey', { privateKey: key('2') });
    s.reinitializeManagersForChain = async () => {};
    as.who = 'B';
    const signingIn = s.authenticate('privatekey', { privateKey: key('3') });
    const switching = s.switchChain(99999);
    await signingIn;
    await switching;
    expect({ chainId: s.getChainId(), signedInAs: s.signer.who }).toEqual({ chainId: 99999, signedInAs: 'B' });
  });
});

describe('XX6 — migrateToSealedStorage without storage is refused, coded, before anything starts', () => {
  for (const mode of ['hostOnly', 'skipS5'] as const) {
    test(`${mode}: STORAGE_NOT_AVAILABLE, not retryable — and no unhandled rejection`, async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (r: unknown) => unhandled.push(r);
      process.on('unhandledRejection', onUnhandled);
      try {
        const s = realSdk({ authenticated: true });
        s.config[mode] = true;
        expect(await caught(s.migrateToSealedStorage())).toMatchObject({ code: 'STORAGE_NOT_AVAILABLE', details: { retryable: false } });
        await tick();
        await tick();
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
      expect(unhandled).toEqual([]);
    });
  }
});
