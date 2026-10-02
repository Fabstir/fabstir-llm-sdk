// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 2 — manager and consumer-contract classes (plan §14 S3, S4, S5, S6).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import ABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { FakeS5Network } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { ADDR, SEED, encryptionManager as em } from '../helpers/sealed-fixtures';
import { SessionManager } from '../../src/managers/SessionManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { SDKError } from '../../src/types';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';
import 'fake-indexeddb/auto';

const HOST = ethers.Wallet.createRandom().address;
const MODEL = '0x' + '11'.repeat(32);
const iface = new ethers.Interface(ABI as any);
const MARKET = ChainRegistry.getChain(84532).contracts.jobMarketplace;
const USDC = ChainRegistry.getChain(84532).contracts.usdcToken;

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => __resetInProcessCoherenceForTests());
afterEach(() => vi.unstubAllGlobals());

describe('S3 — a funding receipt is found by what was mined', () => {
  /** A raw log as a plain (replacement) receipt carries it: address, topics, data — no parsed `fragment`. */
  function rawLog(event: string, id: bigint, address = MARKET) {
    const fragment = iface.getEvent(event)!;
    const args = fragment.inputs.map((input, i) =>
      i === 0 ? id : input.type === 'address' ? HOST : input.type === 'bytes32' ? MODEL : input.type === 'bool' ? false : 1n);
    return { address, ...iface.encodeEventLog(fragment, args) };
  }

  function world(receipt: unknown) {
    const order: string[] = [];
    const provider = { getBlockNumber: vi.fn(async () => { order.push('block'); return 100; }) };
    const rearmed = { hash: '0xOLD', wait: vi.fn(async () => receipt) };
    const sent = { hash: '0xOLD', replaceableTransaction: vi.fn(() => rearmed), wait: vi.fn(async () => { throw new Error('the un-armed response must not be awaited'); }) };
    const send = async () => { order.push('send'); return sent; };
    const w = Object.create(JobMarketplaceWrapper.prototype);
    Object.assign(w, {
      chainId: 84532, contractAddress: MARKET, signer: { getAddress: async () => HOST, provider }, verifyChain: async () => undefined,
      getDepositBalance: async () => '1000',
      contract: {
        paused: async () => false, interface: iface,
        createSessionJobForModel: send, createSessionJobForModelWithToken: send,
        createSessionFromDepositForModel: send, createSessionForModelAsDelegate: send,
      },
    });
    return { w: w as JobMarketplaceWrapper, sent, order };
  }

  const paths: Array<[string, string, (w: JobMarketplaceWrapper) => Promise<number>]> = [
    ['createSessionJob (ETH)', 'SessionJobCreatedForModel',
      (w) => w.createSessionJob({ host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' } as any)],
    ['createSessionJob (USDC)', 'SessionJobCreatedForModel',
      (w) => w.createSessionJob({ host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '1', paymentToken: USDC } as any)],
    ['createSessionFromDeposit', 'SessionCreatedByDepositor',
      (w) => w.createSessionFromDeposit({ host: HOST, modelId: MODEL, paymentToken: USDC, deposit: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)],
    ['createSessionForModelAsDelegate', 'SessionCreatedByDelegate',
      (w) => w.createSessionForModelAsDelegate({ payer: HOST, modelId: MODEL, host: HOST, paymentToken: USDC, amount: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)],
  ];

  for (const [label, event, call] of paths) {
    test(`${label}: waits on the response re-armed from the block read before sending, and decodes the plain receipt's log`, async () => {
      const { w, sent, order } = world({ hash: '0xNEW', status: 1, logs: [rawLog(event, 4242n)] });
      expect(await call(w)).toBe(4242);
      expect(order).toEqual(['block', 'send']);
      expect(sent.replaceableTransaction).toHaveBeenCalledWith(100);
    });

    test(`${label}: no creation event → SESSION_ID_UNRESOLVED carrying the MINED hash`, async () => {
      const { w } = world({ hash: '0xNEW', status: 1, logs: [rawLog(event, 1n, ethers.Wallet.createRandom().address)] }); // same event, another contract
      expect(await caught(call(w))).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: '0xNEW' } });
    });
  }
});

describe('S4 — every code a consumer branches on reaches it', () => {
  function makeSM(payment: Record<string, unknown>) {
    const storageManager = {
      isInitialized: () => true, assertConversationLogWritable: vi.fn(), storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn().mockResolvedValue(undefined), getUserAddress: () => '0xuser',
    };
    return new SessionManager({ isInitialized: () => true, ...payment } as any, storageManager as any);
  }
  const startConfig = { chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false };

  test('startSession surfaces SESSION_NOT_FUNDED unwrapped, with its txHash', async () => {
    const sm = makeSM({ createSessionJob: vi.fn().mockRejectedValue(new SDKError('reverted', 'SESSION_NOT_FUNDED', { txHash: '0xR' })) });
    await sm.initialize();
    expect(await caught(sm.startSession(startConfig as any))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { txHash: '0xR' } });
  });

  test('startSession: any other failure before funding stays SESSION_START_ERROR (nothing was funded), cause kept', async () => {
    const sm = makeSM({ createSessionJob: vi.fn().mockRejectedValue(new SDKError('no', 'INSUFFICIENT_BALANCE')) });
    await sm.initialize();
    expect(await caught(sm.startSession(startConfig as any))).toMatchObject({ code: 'SESSION_START_ERROR', details: { originalError: { code: 'INSUFFICIENT_BALANCE' } } });
  });

  function vrm(net: FakeS5Network, extra: Record<string, unknown> = {}) {
    const tab = net.tab();
    return new VectorRAGManager({
      userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
      s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash, ...extra,
    });
  }

  test('createSession keeps the store\'s codes (RAG_DATABASE_EXISTS, STORAGE_OFFLINE); getOrCreateSessionId reuses an existing database', async () => {
    const net = new FakeS5Network();
    const a = vrm(net);
    await a.initialize();
    await a.createSession('db');
    const b = vrm(net);
    await b.initialize();
    expect(await caught(b.createSession('db'))).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    expect(typeof (await vrm(net).getOrCreateSessionId('db'))).toBe('string');
    const offline = vrm(net, { isOnline: () => false });
    await offline.initialize();
    expect(await caught(offline.createSession('new'))).toMatchObject({ code: 'STORAGE_OFFLINE' });
  });
});

describe('S5 — the manager answers from the store, not from a second list', () => {
  function vrm(net: FakeS5Network, coherence?: any) {
    const tab = net.tab();
    return new VectorRAGManager({
      userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
      s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash, ...(coherence ? { coherence } : {}),
    });
  }

  test('a database deleted in another tab does not break getPendingDocuments / updateDocumentStatus in this one', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin();
    const a = vrm(net, origin());
    await a.initialize();
    await a.createSession('alpha');
    await a.createSession('beta');
    await a.addPendingDocument('beta', { id: 'd1' });
    const b = vrm(net, origin());
    await b.initialize();
    await a.deleteDatabase('alpha');
    expect((await b.getPendingDocuments()).map((d: any) => d.id)).toEqual(['d1']);
    await b.updateDocumentStatus('d1', 'processing');
  });

  test('getPendingDocuments(name) reads the store: another tab\'s new database works; an unknown name is RAG_DATABASE_NOT_FOUND', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin();
    const b = vrm(net, origin());
    await b.initialize();
    const a = vrm(net, origin());
    await a.initialize();
    await a.createSession('fresh');
    await a.addPendingDocument('fresh', { id: 'q' });
    expect((await b.getPendingDocuments('fresh')).map((d: any) => d.id)).toEqual(['q']);
    expect(await caught(b.getPendingDocuments('nope'))).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
  });

  test('refreshDatabases never drops a database because its read failed', async () => {
    const net = new FakeS5Network();
    const m = vrm(net, browserOrigin()());
    await m.initialize();
    await m.createSession('alpha');
    await m.createSession('beta');
    const betaId = (await import('../helpers/sealed-fixtures')).sealer().deriveId('db', 'beta');
    net.fail('get', new RegExp(`home/rag/v1/${betaId}/manifest`), 'network', 1000);
    await m.refreshDatabases().catch(() => undefined);
    expect(m.listDatabases().map((d) => d.databaseName).sort()).toEqual(['alpha', 'beta']);
  }, 30_000);
});

describe('S6 — R2 completed', () => {
  test('streamResponse finishes while the log write is still pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ response: 'paid' }) })));
    const storageManager = {
      isInitialized: () => true, assertConversationLogWritable: vi.fn(), storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn(() => new Promise(() => {})), getUserAddress: () => '0xu',
    };
    const sm = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, storageManager as any);
    await sm.initialize();
    await sm.startSession({ chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false } as any);
    const outcome = await Promise.race([sm.streamResponse(77n, 'q', () => undefined).then(() => 'done'), new Promise((r) => setTimeout(() => r('still waiting on the log'), 1500))]);
    expect(outcome).toBe('done');
  });

  test('sendPrompt returns the paid reply while the log write is still pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ response: 'the paid answer' }) })));
    const storageManager = {
      isInitialized: () => true, assertConversationLogWritable: vi.fn(), storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn(() => new Promise(() => {})), getUserAddress: () => '0xu',
    };
    const sm = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, storageManager as any);
    await sm.initialize();
    await sm.startSession({ chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false } as any);
    const outcome = await Promise.race([sm.sendPrompt(77n, 'q'), new Promise((r) => setTimeout(() => r('still waiting on the log'), 1000))]);
    expect(String(outcome)).toContain('the paid answer');
  });
});
