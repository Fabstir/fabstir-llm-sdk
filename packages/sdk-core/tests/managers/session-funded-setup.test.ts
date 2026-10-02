// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 8 — nothing after funding throws without the ids (plan I7, D23, D24).
 *
 * A failure after the deposit left the wallet used to throw with no job id, so the UI could not release the
 * deposit and it stayed locked for the session's whole duration.
 */

import { describe, test, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import MarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import 'fake-indexeddb/auto';

const HOST = ethers.Wallet.createRandom().address;
const MODEL = '0x' + '11'.repeat(32);

function makeSM(storage: Record<string, unknown> = {}) {
  const storageManager = {
    isInitialized: () => true,
    storeConversation: vi.fn().mockResolvedValue(undefined),
    assertConversationLogWritable: vi.fn(),
    getUserAddress: () => '0xuser',
    ...storage,
  };
  const paymentManager = { isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) };
  const sm = new SessionManager(paymentManager as any, storageManager as any);
  return { sm, storageManager, paymentManager };
}

const startConfig = (over: Record<string, unknown> = {}) => ({
  chainId: 84532, host: HOST, modelId: 'tiny-model', endpoint: 'http://host.test:8080',
  pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, ...over,
});

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

describe('startSession — failures after funding carry the ids (D23)', () => {
  test('a conversation-log write failure → SESSION_FUNDED_SETUP_FAILED with sessionId and jobId; the session stays registered', async () => {
    const { sm } = makeSM({ storeConversation: vi.fn().mockRejectedValue(new Error('S5 down')) });
    await sm.initialize();
    const err = await caught(sm.startSession(startConfig()));
    expect(err.code).toBe('SESSION_FUNDED_SETUP_FAILED');
    expect(err.details).toMatchObject({ sessionId: 77n, jobId: 77n, stage: 'conversation-log', registered: true, retryable: false });
    expect(err.details.cause.message).toBe('S5 down');
    expect(sm.getSession('77')?.status).toBe('active');
  });

  test('a session-group link failure → SESSION_FUNDED_SETUP_FAILED at stage session-group-link', async () => {
    const { sm } = makeSM();
    (sm as any).sessionGroupManager = {
      getSessionGroup: vi.fn().mockResolvedValue({ id: 'g1' }),
      addChatSession: vi.fn().mockRejectedValue(new Error('group save failed')),
    };
    await sm.initialize();
    const err = await caught(sm.startSession(startConfig({ groupId: 'g1' })));
    expect(err.code).toBe('SESSION_FUNDED_SETUP_FAILED');
    expect(err.details).toMatchObject({ sessionId: 77n, jobId: 77n, stage: 'session-group-link' });
  });
});

describe('startSession — what can fail without the job fails BEFORE funding (D23)', () => {
  test('an invalid RAG config is refused and no session is funded', async () => {
    const { sm, paymentManager } = makeSM();
    await sm.initialize();
    await expect(sm.startSession(startConfig({ ragConfig: { enabled: true, databaseNames: ['db'], topK: 500 } }))).rejects.toThrow(/topK/);
    expect(paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  test('an empty groupId is refused and no session is funded', async () => {
    const { sm, paymentManager } = makeSM();
    await sm.initialize();
    await expect(sm.startSession(startConfig({ groupId: '' }))).rejects.toThrow(/group/i);
    expect(paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  test('a group that does not exist (or is not the user\'s) is refused and no session is funded', async () => {
    const { sm, paymentManager } = makeSM();
    (sm as any).sessionGroupManager = { getSessionGroup: vi.fn().mockRejectedValue(new Error('Session group not found')) };
    await sm.initialize();
    await expect(sm.startSession(startConfig({ groupId: 'missing' }))).rejects.toThrow(/not found/);
    expect(paymentManager.createSessionJob).not.toHaveBeenCalled();
  });

  test('SESSION_ID_UNRESOLVED from the funding transaction reaches the caller unwrapped, with its tx hash', async () => {
    const { sm, paymentManager } = makeSM();
    paymentManager.createSessionJob.mockRejectedValue(Object.assign(new Error('no event'), { code: 'SESSION_ID_UNRESOLVED', details: { txHash: '0xfeed' } }));
    await sm.initialize();
    const err = await caught(sm.startSession(startConfig()));
    expect(err.code).toBe('SESSION_ID_UNRESOLVED');
    expect(err.details.txHash).toBe('0xfeed');
  });
});

describe('registerDelegatedSession — the caller funded it; a log failure still says so (D23)', () => {
  test('SESSION_FUNDED_SETUP_FAILED with the ids and registered: true', async () => {
    const { sm } = makeSM({ storeConversation: vi.fn().mockRejectedValue(new Error('S5 down')) });
    await sm.initialize();
    const err = await caught(sm.registerDelegatedSession({
      sessionId: 88n, jobId: 89n, hostUrl: 'http://host.test:8080', hostAddress: HOST, model: 'm', chainId: 84532,
      depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600,
    } as any));
    expect(err.code).toBe('SESSION_FUNDED_SETUP_FAILED');
    expect(err.details).toMatchObject({ sessionId: 88n, jobId: 89n, stage: 'conversation-log', registered: true });
    expect(sm.getSession('88')).toBeDefined();
  });
});

describe('JobMarketplaceWrapper — a funded session never comes back as job id 0 (D24)', () => {
  const USDC = ChainRegistry.getChain(84532).contracts.usdcToken;

  const MARKET = ChainRegistry.getChain(84532).contracts.jobMarketplace;
  const iface = new ethers.Interface(MarketplaceABI as any);

  function wrapper(contract: Record<string, unknown>) {
    const w = Object.create(JobMarketplaceWrapper.prototype);
    Object.assign(w, {
      chainId: 84532,
      contractAddress: MARKET,
      signer: { getAddress: async () => HOST, provider: { getBlockNumber: async () => 1 } },
      contract: { paused: async () => false, interface: iface, ...contract },
      verifyChain: async () => undefined,
      getDepositBalance: async () => '1000',
    });
    return w as JobMarketplaceWrapper;
  }

  // A sent transaction as ethers returns it: re-armed for replacement detection by the wrapper (plan §14 S3).
  const sent = (hash: string, wait: () => Promise<unknown>) => { const t = { hash, wait: vi.fn(wait) }; return { ...t, replaceableTransaction: () => t }; };
  const tx = (receipt: any) => sent('0xabc', async () => ({ hash: '0xabc', status: 1, ...receipt }));
  const failingTx = () => sent('0xdef', async () => { throw new Error('RPC timeout'); });
  /** A raw marketplace log (topics + data), decoded by the wrapper through the contract interface. */
  const log = (name: string, id: bigint) => {
    if (name === 'Transfer') return { address: MARKET, topics: [ethers.id('Transfer(address,address,uint256)')], data: '0x' };
    const fragment = iface.getEvent(name)!;
    const args = fragment.inputs.map((input, i) => (i === 0 ? id : input.type === 'address' ? HOST : input.type === 'bytes32' ? MODEL : input.type === 'bool' ? false : 1n));
    return { address: MARKET, ...iface.encodeEventLog(fragment, args) };
  };

  const paths: Array<[string, string, string, (w: JobMarketplaceWrapper) => Promise<number>]> = [
    ['createSessionJob (ETH)', 'createSessionJobForModel', 'SessionJobCreated',
      (w) => w.createSessionJob({ host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' } as any)],
    ['createSessionJob (USDC)', 'createSessionJobForModelWithToken', 'SessionJobCreated',
      (w) => w.createSessionJob({ host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '1', paymentToken: USDC } as any)],
    ['createSessionFromDeposit', 'createSessionFromDepositForModel', 'SessionCreatedByDepositor',
      (w) => w.createSessionFromDeposit({ host: HOST, modelId: MODEL, paymentToken: USDC, deposit: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)],
    ['createSessionForModelAsDelegate', 'createSessionForModelAsDelegate', 'SessionCreatedByDelegate',
      (w) => w.createSessionForModelAsDelegate({ payer: HOST, modelId: MODEL, host: HOST, paymentToken: USDC, amount: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)],
  ];

  for (const [label, method, event, call] of paths) {
    test(`${label}: the event's id is returned`, async () => {
      expect(await call(wrapper({ [method]: async () => tx({ logs: [log(event, 42n)] }) }))).toBe(42);
    });

    test(`${label}: no creation event → SESSION_ID_UNRESOLVED with the tx hash (was: job id 0)`, async () => {
      const err = await caught(call(wrapper({ [method]: async () => tx({ logs: [log('Transfer', 1n)] }) })));
      expect(err.code).toBe('SESSION_ID_UNRESOLVED');
      expect(err.details.txHash).toBe('0xabc');
    });

    test(`${label}: a receipt that cannot be read after broadcast → SESSION_ID_UNRESOLVED with the tx hash`, async () => {
      const err = await caught(call(wrapper({ [method]: async () => failingTx() })));
      expect(err.code).toBe('SESSION_ID_UNRESOLVED');
      expect(err.details.txHash).toBe('0xdef');
    });
  }
});

describe('startSession — SESSION_START_ERROR says whether retrying may help (§19 Z14)', () => {
  test("the cause's own verdict, at the top; none when the cause gives none", async () => {
    const { SDKError } = await import('../../src/types');
    for (const [cause, verdict] of [
      [new SDKError('S5 is disconnected', 'STORAGE_OFFLINE', { retryable: true }), true],
      [new SDKError('no Web Locks', 'RAG_COHERENCE_UNAVAILABLE', { retryable: false }), false],
      [new Error('something else'), undefined],
    ] as const) {
      const { sm, paymentManager } = makeSM({ assertConversationLogWritable: vi.fn().mockRejectedValue(cause) });
      await sm.initialize();
      const err = await caught(sm.startSession(startConfig()));
      expect(err.code).toBe('SESSION_START_ERROR');
      expect(err.details.retryable).toBe(verdict);
      expect(paymentManager.createSessionJob).not.toHaveBeenCalled();
    }
  });
});

