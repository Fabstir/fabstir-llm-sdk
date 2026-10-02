// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 22 — plan §35 PP3–PP9: the RAG manager reflects a write that landed; INVALID_ARGUMENT after a
 * broadcast; the SDK's own signers carry the hash they hold; a setup whose log landed; this call's session id from a
 * bundle; saveConversation(null).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';
import { afterBroadcast, sendFunding } from '../../src/contracts/funding-receipt';
import { AASigner } from '../../src/wallet/AASigner';
import { createSubAccountSigner } from '../../src/wallet/SubAccountSigner';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { SDKError } from '../../src/types';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import MarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { SEED, ADDR, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../src/storage/sealed/rag-coherence';

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

/** A browser head store whose writes fail while `broken.on`. */
function flaky(base: RagCoherence, broken: { on: boolean }): RagCoherence {
  const wrap = (c: RagCoherence): RagCoherence => ({
    ...c,
    putHead: async (key, head) => {
      if (broken.on) throw new SDKError('Sealed storage needs IndexedDB', 'RAG_COHERENCE_UNAVAILABLE', { missing: 'IndexedDB', retryable: false });
      return c.putHead(key, head);
    },
    scoped: (scope) => wrap(c.scoped(scope)),
  });
  return wrap(base);
}

function rag(tab: FakeS5Tab, coherence: RagCoherence) {
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash, coherence,
  } as any);
}

const DB = 'research';
const landed = { code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true } };

describe('PP3 — the RAG manager reflects a write that landed', () => {
  test('deleteDatabase: no longer listed, its sessions ended', async () => {
    const broken = { on: false };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), broken));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    broken.on = true;
    expect(await caught(m.deleteDatabase(DB))).toMatchObject(landed);
    expect({ listed: m.listDatabases().map((d) => d.databaseName), sessions: m.listSessions(DB).length, held: m.getSession(sessionId) })
      .toEqual({ listed: [], sessions: 0, held: null });
  });

  test('createSession: the session is registered and its id carried in the error; the database is listed', async () => {
    const broken = { on: true };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), broken));
    await m.initialize();
    const err = await caught(m.createSession(DB));
    expect(err).toMatchObject(landed);
    expect(m.getSession(err.details.sessionId)).toMatchObject({ databaseName: DB, status: 'active' });
    expect(m.listDatabases().map((d) => d.databaseName)).toEqual([DB]);
    broken.on = false;
    expect(await m.getOrCreateSessionId(DB)).toBe(err.details.sessionId);
  });

  test('addVectors: the listed count is the committed one', async () => {
    const broken = { on: false };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), broken));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    await m.addVectors(sessionId, [{ id: 'v1', vector: [1, 2, 3], metadata: {} }]);
    broken.on = true;
    expect(await caught(m.addVectors(sessionId, [{ id: 'v2', vector: [4, 5, 6], metadata: {} }]))).toMatchObject(landed);
    expect(m.listDatabases().find((d) => d.databaseName === DB)?.vectorCount).toBe(2);
  });

  test('a failure that did not land skips the bookkeeping', async () => {
    const m = rag(new FakeS5Network().tab(), browserOrigin()());
    await m.initialize();
    await m.createSession(DB);
    expect((await caught(m.createSession(DB))).code).toBe('RAG_DATABASE_EXISTS');
    expect(m.listSessions(DB)).toHaveLength(1);
  });
});

const MARKET = ChainRegistry.getChain(84532).contracts.jobMarketplace;
const HOST = ethers.Wallet.createRandom().address;
const MODEL = '0x' + '11'.repeat(32);
const TXHASH = '0x' + 'ab'.repeat(32);
const job = { host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' } as any;

function wrapper(signer: any, contract?: Record<string, unknown>) {
  const w = Object.create(JobMarketplaceWrapper.prototype);
  Object.assign(w, {
    chainId: 84532, contractAddress: MARKET, signer, verifyChain: async () => undefined, getDepositBalance: async () => '1000',
    contract: contract ?? new ethers.Contract(MARKET, MarketplaceABI as any, signer),
  });
  return w as JobMarketplaceWrapper;
}

describe('PP4 — INVALID_ARGUMENT is not a refusal before the broadcast', () => {
  test('without a hash: SESSION_FUNDING_UNCERTAIN', async () => {
    const error = Object.assign(new Error('invalid'), { code: 'INVALID_ARGUMENT' });
    expect(await caught(sendFunding({ getBlockNumber: async () => 1 }, async () => { throw error; })))
      .toMatchObject({ code: 'SESSION_FUNDING_UNCERTAIN', details: { cause: error, retryable: false } });
  });

  test('a private-key wallet whose broadcast landed while its block-number read came back malformed: never "nothing funded"', async () => {
    class Rpc extends ethers.JsonRpcProvider {
      broadcast: string[] = [];
      blockReads = 0;
      constructor() { super('http://127.0.0.1:1', 84532, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 }); }
      async _send(payload: any): Promise<any> {
        return (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
          const zero = '0x' + '00'.repeat(32);
          switch (p.method) {
            case 'eth_chainId': return { id: p.id, result: '0x14a34' };
            case 'eth_blockNumber': return { id: p.id, result: ++this.blockReads === 1 ? '0x64' : null };
            case 'eth_call': return { id: p.id, result: zero };
            case 'eth_estimateGas': return { id: p.id, result: '0x5208' };
            case 'eth_getTransactionCount': return { id: p.id, result: '0x0' };
            case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id: p.id, result: '0x1' };
            case 'eth_getBlockByNumber': return { id: p.id, result: { baseFeePerGas: '0x1', number: '0x64', hash: zero, parentHash: zero, timestamp: '0x0', nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x0', gasUsed: '0x0', miner: ethers.ZeroAddress, extraData: '0x', transactions: [] } };
            case 'eth_sendRawTransaction':
              this.broadcast.push(p.params[0]);
              return { id: p.id, result: ethers.Transaction.from(p.params[0]).hash };
            default: throw new Error('unexpected ' + p.method);
          }
        });
      }
    }
    const provider = new Rpc();
    const err = await caught(wrapper(new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider)).createSessionJob(job));
    expect(provider.broadcast).toHaveLength(1);
    expect(err.code).toBe('SESSION_FUNDING_UNCERTAIN');
  });
});

/** A JSON-RPC node for the AA signer: receipts never visible (or failing); transaction lookups time out. */
class AaRpc extends ethers.JsonRpcProvider {
  constructor() { super('http://127.0.0.1:1', 84532, { staticNetwork: true, batchMaxCount: 1 }); }
  async _send(payload: any): Promise<any> {
    return (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
      switch (p.method) {
        case 'eth_chainId': return { id: p.id, result: '0x14a34' };
        case 'eth_blockNumber': return { id: p.id, result: '0x64' };
        case 'eth_call': return { id: p.id, result: '0x' + '00'.repeat(32) };
        case 'eth_getTransactionReceipt': return { id: p.id, result: null };
        default: throw new Error('unexpected ' + p.method);
      }
    });
  }
}

describe('PP5 — the SDK\'s own signers carry the hash they hold', () => {
  test('Base Account sub-account: the wallet returned the hash, the lookup failed — SESSION_ID_UNRESOLVED with it', async () => {
    const calls: string[] = [];
    const eip1193 = {
      async request({ method }: { method: string }) {
        calls.push(method);
        switch (method) {
          case 'eth_chainId': return '0x14a34';
          case 'eth_blockNumber': return '0x64';
          case 'eth_call': return '0x' + '00'.repeat(32);
          case 'eth_sendTransaction': return TXHASH;
          case 'eth_getTransactionByHash': throw Object.assign(new Error('Request timed out'), { code: -32603 });
          default: throw new Error('unexpected ' + method);
        }
      },
    };
    const signer = createSubAccountSigner({ provider: eip1193, subAccount: ethers.Wallet.createRandom().address, primaryAccount: ethers.Wallet.createRandom().address, chainId: 84532 });
    const err = await caught(wrapper(signer).createSessionJob(job));
    expect(calls).toContain('eth_sendTransaction');
    expect(err).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH, retryable: false } });
  });

  test('a user rejection in the sub-account wallet is still "nothing funded"', async () => {
    const eip1193 = {
      async request({ method }: { method: string }) {
        switch (method) {
          case 'eth_chainId': return '0x14a34';
          case 'eth_blockNumber': return '0x64';
          case 'eth_call': return '0x' + '00'.repeat(32);
          case 'eth_sendTransaction': throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
          default: throw new Error('unexpected ' + method);
        }
      },
    };
    const signer = createSubAccountSigner({ provider: eip1193, subAccount: ethers.Wallet.createRandom().address, primaryAccount: ethers.Wallet.createRandom().address, chainId: 84532 });
    expect((await caught(wrapper(signer).createSessionJob(job))).code).toBe(4001);
  });

  test('AA: the user operation ran, its receipt not yet visible — SESSION_ID_UNRESOLVED with its hash', async () => {
    const sendUserOp = vi.fn(async () => ({ transactionHash: TXHASH }));
    const signer = new AASigner({ smartAccountAddress: ethers.Wallet.createRandom().address, eoaPrivateKey: ethers.Wallet.createRandom().privateKey, sendUserOp, chainId: 84532 } as any, new AaRpc());
    const err = await caught(wrapper(signer).createSessionJob(job));
    expect(sendUserOp).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH, cause: { code: 'AA_RECEIPT_NOT_VISIBLE' } } });
  }, 20_000);
});

describe('PP5 — afterBroadcast marks a failure the way ethers does', () => {
  test('ethers\' own info is kept; a value that is not an Error becomes one', () => {
    const marked: any = afterBroadcast(Object.assign(new Error('x'), { info: { payload: 1 } }), TXHASH);
    expect(marked.info).toEqual({ payload: 1, sendTransactionHash: TXHASH });
    const wrapped: any = afterBroadcast('boom', TXHASH);
    expect({ error: wrapped instanceof Error, message: wrapped.message, hash: wrapped.info.sendTransactionHash }).toEqual({ error: true, message: 'boom', hash: TXHASH });
  });
});

describe('PP6 — a setup whose log landed says so at the top', () => {
  function makeSM(storeConversation: () => Promise<unknown>) {
    const storageManager = { isInitialized: () => true, storeConversation: vi.fn(storeConversation), assertConversationLogWritable: vi.fn(), getUserAddress: () => '0xuser' };
    return new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, storageManager as any);
  }
  const config = { chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false };

  test('SESSION_FUNDED_SETUP_FAILED carries committed: true when its cause does', async () => {
    const sm = makeSM(async () => { throw new SDKError('head', 'RAG_COHERENCE_UNAVAILABLE', { committed: true, retryable: false }); });
    await sm.initialize();
    expect(await caught(sm.startSession(config))).toMatchObject({ code: 'SESSION_FUNDED_SETUP_FAILED', details: { stage: 'conversation-log', committed: true } });
  });

  test('and not when it did not land', async () => {
    const sm = makeSM(async () => { throw new SDKError('down', 'STORAGE_SAVE_ERROR', { retryable: true }); });
    await sm.initialize();
    expect((await caught(sm.startSession(config))).details.committed).toBeUndefined();
  });
});

describe('PP7 — this call\'s session id, never another sender\'s from the same bundle', () => {
  const iface = new ethers.Interface(MarketplaceABI as any);
  const ME = ethers.Wallet.createRandom().address;
  const OTHER = ethers.Wallet.createRandom().address;
  /** A creation event; `sender` is the depositor (or the delegate, for a delegated session). */
  const created = (name: string, id: bigint, sender: string, address = MARKET) => {
    const fragment = iface.getEvent(name)!;
    const args = fragment.inputs.map((input, i) => (i === 0 ? id : input.name === 'depositor' || input.name === 'delegate' ? sender
      : input.type === 'address' ? HOST : input.type === 'bytes32' ? MODEL : 1n));
    return { address, ...iface.encodeEventLog(fragment, args) };
  };
  const signer = { getAddress: async () => ME, provider: { getBlockNumber: async () => 1 } };
  const sent = (logs: unknown[]) => async () => { const t = { hash: TXHASH, wait: async () => ({ hash: TXHASH, status: 1, logs }) }; return { ...t, replaceableTransaction: () => t }; };

  test('the wrapper: another depositor\'s creation first — this signer\'s id', async () => {
    const w = wrapper(signer, { paused: async () => false, interface: iface, createSessionJobForModel: sent([created('SessionJobCreatedForModel', 7n, OTHER), created('SessionJobCreatedForModel', 42n, ME)]) });
    expect(await w.createSessionJob(job)).toBe(42);
  });

  test('the wrapper: only another sender\'s creation — SESSION_ID_UNRESOLVED with the hash', async () => {
    const w = wrapper(signer, { paused: async () => false, interface: iface, createSessionJobForModel: sent([created('SessionJobCreatedForModel', 7n, OTHER)]) });
    expect(await caught(w.createSessionJob(job))).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH } });
  });

  test('the wrapper\'s delegated session: matched by its delegate', async () => {
    const USDC = ChainRegistry.getChain(84532).contracts.usdcToken;
    const w = wrapper(signer, { paused: async () => false, interface: iface, createSessionForModelAsDelegate: sent([created('SessionCreatedByDelegate', 7n, OTHER), created('SessionCreatedByDelegate', 42n, ME)]) });
    expect(await w.createSessionForModelAsDelegate({ payer: OTHER, modelId: MODEL, host: HOST, paymentToken: USDC, amount: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)).toBe(42);
  });

  test('SessionJobManager\'s delegated session: from the marketplace, by its delegate', async () => {
    const logs = [created('SessionCreatedByDelegate', 7n, OTHER), created('SessionCreatedByDelegate', 9n, ME, ethers.Wallet.createRandom().address), created('SessionCreatedByDelegate', 100n, ME)];
    const marketplace: any = { connect: () => marketplace, createSessionForModelAsDelegate: sent(logs), target: MARKET };
    const manager = new SessionJobManager({ getJobMarketplace: () => marketplace, getContractAddress: () => MARKET, setSigner: async () => {} } as any);
    await manager.setSigner(signer as any);
    const result = await manager.createSessionForModelAsDelegate(OTHER, MODEL, HOST, ChainRegistry.getChain(84532).contracts.usdcToken, 1n, 1n, 3600, 100, 300);
    expect(result.sessionId).toBe(100n);
  });

  test('SessionJobManager\'s delegated session: none of this sender\'s — SESSION_ID_UNRESOLVED', async () => {
    const marketplace: any = { connect: () => marketplace, createSessionForModelAsDelegate: sent([created('SessionCreatedByDelegate', 7n, OTHER)]), target: MARKET };
    const manager = new SessionJobManager({ getJobMarketplace: () => marketplace, getContractAddress: () => MARKET, setSigner: async () => {} } as any);
    await manager.setSigner(signer as any);
    expect(await caught(manager.createSessionForModelAsDelegate(OTHER, MODEL, HOST, ChainRegistry.getChain(84532).contracts.usdcToken, 1n, 1n, 3600, 100, 300)))
      .toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH } });
  });
});

test('PP7 — SessionJobManager.createSessionJob: this signer\'s creation, from the marketplace', async () => {
  const iface = new ethers.Interface(MarketplaceABI as any);
  const USDC = ChainRegistry.getChain(84532).contracts.usdcToken;
  /** A node for the token steps: plenty of balance and allowance; the approval it always sends is mined 5 blocks deep. */
  class TokenRpc extends ethers.JsonRpcProvider {
    constructor() { super('http://127.0.0.1:1', 84532, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 }); }
    async _send(payload: any): Promise<any> {
      return (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
        const zero = '0x' + '00'.repeat(32);
        switch (p.method) {
          case 'eth_chainId': return { id: p.id, result: '0x14a34' };
          case 'eth_blockNumber': return { id: p.id, result: '0x64' };
          case 'eth_call': return { id: p.id, result: '0x' + 'ff'.repeat(16).padStart(64, '0') };
          case 'eth_getTransactionCount': return { id: p.id, result: '0x0' };
          case 'eth_estimateGas': return { id: p.id, result: '0x5208' };
          case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id: p.id, result: '0x1' };
          case 'eth_getBlockByNumber': return { id: p.id, result: { baseFeePerGas: '0x1', number: '0x64', hash: zero, parentHash: zero, timestamp: '0x0', nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x0', gasUsed: '0x0', miner: ethers.ZeroAddress, extraData: '0x', transactions: [] } };
          case 'eth_sendRawTransaction': return { id: p.id, result: ethers.Transaction.from(p.params[0]).hash };
          case 'eth_getTransactionReceipt': return { id: p.id, result: {
            transactionHash: p.params[0], blockHash: '0x' + '11'.repeat(32), blockNumber: '0x60', transactionIndex: '0x0', from: ethers.ZeroAddress,
            to: USDC, contractAddress: null, logs: [], logsBloom: '0x' + '00'.repeat(256), gasUsed: '0x5208', cumulativeGasUsed: '0x5208',
            effectiveGasPrice: '0x1', status: '0x1', type: '0x2',
          } };
          default: throw new Error('unexpected ' + p.method);
        }
      });
    }
  }
  const wallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, new TokenRpc());
  const OTHER = ethers.Wallet.createRandom().address;
  const created = (id: bigint, depositor: string, address = MARKET) => {
    const fragment = iface.getEvent('SessionJobCreatedForModel')!;
    return { address, ...iface.encodeEventLog(fragment, [id, depositor, HOST, MODEL, 1n]) };
  };
  const logs = [created(7n, OTHER), created(9n, wallet.address, ethers.Wallet.createRandom().address), created(42n, wallet.address)];
  const sent = async () => { const t = { hash: TXHASH, wait: async () => ({ hash: TXHASH, status: 1, logs }) }; return { ...t, replaceableTransaction: () => t }; };
  const marketplace: any = { connect: () => marketplace, createSessionJobForModelWithToken: sent, target: MARKET };
  const manager = new SessionJobManager({ getJobMarketplace: () => marketplace, getContractAddress: async () => MARKET, getUsdcTokenAddress: () => USDC, setSigner: async () => {} } as any);
  await manager.setSigner(wallet as any);
  const result = await manager.createSessionJob({ provider: HOST, modelId: MODEL, sessionConfig: { depositAmount: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } } as any);
  expect(result.jobId).toBe(42n);
});

describe('PP9 — saveConversation of no conversation', () => {
  test('null and undefined: STORAGE_CONVERSATION_INVALID, not retryable', async () => {
    const store = new StorageManager();
    Object.assign(store as any, { initialized: true, s5Client: new FakeS5Network().tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    for (const conversation of [null, undefined]) {
      expect(await caught(store.saveConversation(conversation as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { retryable: false } });
    }
  });
});
