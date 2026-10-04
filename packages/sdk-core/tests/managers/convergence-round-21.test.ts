// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 21 — plan §34 OO1–OO7: a superseded sign-in never touches the bridge; the exact-URL contract;
 * a funding send that failed after it was broadcast; the log's head; a conversation that cannot be sealed; the
 * transcode id; records.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { sendFunding } from '../../src/contracts/funding-receipt';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { SDKError } from '../../src/types';
import MarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { FakeS5Network } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { ADDR, sealer } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../src/storage/sealed/rag-coherence';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

/** A WebSocket double: opens on the next turn; `close()` only records. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen?: () => void; onerror?: (e: unknown) => void; onclose?: () => void; onmessage?: (e: unknown) => void;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  close() { this.closed = true; }
  send() {}
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A sign-in on the real `_authenticate`, off S5 and off the chain: the wallet step and the network check replaced. */
function signingIn(fields: Record<string, unknown> = {}) {
  const s = realSdk({
    authenticateWithPrivateKey: async () => { s.userAddress = ethers.Wallet.createRandom().address; s.signer = { provider: {} }; s.provider = {}; },
    assertReadWriteChainParity: async () => {},
    ...fields,
  });
  s.config.hostOnly = true;
  return s;
}

/** Every fetch the bridge makes: health answers at once. */
function bridgeFetches() {
  const asked: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => { asked.push(url); return { ok: true, json: async () => ({ status: 'healthy', services: {} }) }; });
  return asked;
}

describe('OO1 — a superseded sign-in never touches the bridge', () => {
  test('a sign-out during the sign-in\'s network check (autoConnect): no client built, nothing asked, no socket', async () => {
    const asked = bridgeFetches();
    let parity!: () => void;
    const s = signingIn({ assertReadWriteChainParity: () => new Promise<void>((r) => { parity = r; }) });
    s.config.bridgeConfig.autoConnect = true;
    const signIn = s.authenticate('privatekey', { privateKey: '0x' + '2'.repeat(64) }).then(() => 'signed in', (e: any) => e?.code);
    await tick();
    await s.disconnect();
    parity();                                                         // the network answer, after the sign-out
    expect(await signIn).toBe('AUTH_SUPERSEDED');
    await tick();
    expect({ asked, sockets: FakeSocket.all.length, client: s.getBridgeClient(), authenticated: s.isAuthenticated() })
      .toEqual({ asked: [], sockets: 0, client: undefined, authenticated: false });
  });

  test('a sign-out during the autoConnect: the sign-in is superseded — never authenticated, its client dropped', async () => {
    let healthy!: () => void;
    vi.stubGlobal('fetch', () => new Promise((r) => { healthy = () => r({ ok: true, json: async () => ({ status: 'healthy', services: {} }) }); }));
    const s = signingIn({ initializeManagers: async () => {} });
    s.config.bridgeConfig.autoConnect = true;
    const signIn = s.authenticate('privatekey', { privateKey: '0x' + '2'.repeat(64) }).then(() => 'signed in', (e: any) => e?.code);
    for (let i = 0; i < 50 && !healthy; i++) await tick();
    await s.disconnect();
    healthy();
    expect(await signIn).toBe('AUTH_SUPERSEDED');
    expect({ authenticated: s.isAuthenticated(), client: s.getBridgeClient(), open: FakeSocket.all.filter((x) => !x.closed).length })
      .toEqual({ authenticated: false, client: undefined, open: 0 });
  });

  test('a sign-in that stands: its client is for bridgeConfig.url — connected first with autoConnect, untouched without', async () => {
    const asked = bridgeFetches();
    const plain = signingIn({ initializeManagers: async () => {} });
    plain.config.bridgeConfig.url = 'http://bridge.example:7000';    // not the default
    await plain.authenticate('privatekey', { privateKey: '0x' + '2'.repeat(64) });
    const client = plain.getBridgeClient();
    expect({ built: client instanceof UnifiedBridgeClient, url: client.getBridgeUrl(), asked: asked.length })
      .toEqual({ built: true, url: 'http://bridge.example:7000', asked: 0 });

    const auto = signingIn({ initializeManagers: async () => {} });
    auto.config.bridgeConfig.autoConnect = true;
    const connects: Array<{ client: UnifiedBridgeClient; signedIn: boolean }> = [];
    vi.spyOn(UnifiedBridgeClient.prototype, 'connect').mockImplementation(async function (this: UnifiedBridgeClient) {
      await tick();
      connects.push({ client: this, signedIn: auto.isAuthenticated() });
    });
    await auto.authenticate('privatekey', { privateKey: '0x' + '2'.repeat(64) });
    // Awaited by the sign-in (the constructor's own autoConnect call shares it — §29 JJ2), before it is authenticated.
    expect(connects.length).toBeGreaterThan(0);
    expect(connects.every((c) => c.client === auto.getBridgeClient() && !c.signedIn)).toBe(true);
  });
});

describe('OO2 — connectToBridge(url): exactly bridgeConfig.url, or no argument', () => {
  test('a trailing "/", another case, "" and null all refuse BRIDGE_URL_MISMATCH; the exact URL and no argument connect', async () => {
    const s = realSdk({ authenticated: true });
    const configured: string = s.config.bridgeConfig.url;
    const outcome = async (url: unknown) => {
      const held = new UnifiedBridgeClient({ bridgeUrl: configured } as any);
      (held as any).connect = vi.fn(async () => {});
      s.bridgeClient = held;
      try { await s.connectToBridge(url); return 'connected'; } catch (e: any) { return e?.code; }
    };
    const results: unknown[] = [];
    for (const url of [undefined, configured, configured + '/', configured.toUpperCase(), '', null]) results.push(await outcome(url));
    expect(results).toEqual(['connected', 'connected', 'BRIDGE_URL_MISMATCH', 'BRIDGE_URL_MISMATCH', 'BRIDGE_URL_MISMATCH', 'BRIDGE_URL_MISMATCH']);
  });
});

describe('OO3 — a funding send that failed after it was broadcast is never "nothing was funded"', () => {
  const MARKET = ChainRegistry.getChain(84532).contracts.jobMarketplace;
  const HOST = ethers.Wallet.createRandom().address;
  const MODEL = '0x' + '11'.repeat(32);
  const TXHASH = '0x' + 'ab'.repeat(32);
  const job = { host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' } as any;

  function wrapper(signer: ethers.Signer) {
    const w = Object.create(JobMarketplaceWrapper.prototype);
    Object.assign(w, {
      chainId: 84532, contractAddress: MARKET, signer, verifyChain: async () => undefined, getDepositBalance: async () => '1000',
      contract: new ethers.Contract(MARKET, MarketplaceABI as any, signer),
    });
    return w as JobMarketplaceWrapper;
  }

  /** A browser wallet (EIP-1193) behind ethers' BrowserProvider; `sendTransaction` decides what the broadcast does. */
  async function browserWallet(sendTransaction: () => unknown, estimateGas: () => unknown = () => '0x5208') {
    const from = ethers.Wallet.createRandom().address;
    let switched = false;
    const calls: string[] = [];
    const eip1193 = {
      async request({ method }: { method: string }) {
        calls.push(method);
        switch (method) {
          case 'eth_chainId': return switched ? '0x1' : '0x14a34';
          case 'eth_accounts': case 'eth_requestAccounts': return [from];
          case 'eth_blockNumber': return '0x64';
          case 'eth_estimateGas': return estimateGas();
          case 'eth_sendTransaction': { const hash = sendTransaction(); switched = true; return hash; }
          case 'eth_getTransactionByHash': return null;
          case 'eth_call': return '0x' + '00'.repeat(32);
          default: throw new Error('unexpected ' + method);
        }
      },
    };
    return { signer: await new ethers.BrowserProvider(eip1193 as any).getSigner(), calls };
  }

  test('a browser wallet broadcasts, then its poll fails: SESSION_ID_UNRESOLVED with the hash, not retryable', async () => {
    const { signer, calls } = await browserWallet(() => TXHASH);   // the wallet switches chain right after: the poll fails
    const err = await caught(wrapper(signer).createSessionJob(job));
    expect(calls).toContain('eth_sendTransaction');
    expect(err).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH, retryable: false, cause: { code: 'NETWORK_ERROR' } } });
  });

  test('a private-key wallet whose broadcast reply is lost: SESSION_FUNDING_UNCERTAIN, not retryable, the cause kept', async () => {
    class LossyRpc extends ethers.JsonRpcProvider {
      broadcast: string[] = [];
      constructor() { super('http://127.0.0.1:1', 84532, { staticNetwork: true, batchMaxCount: 1 }); }
      async _send(payload: any): Promise<any> {
        return (Array.isArray(payload) ? payload : [payload]).map((p: any) => {
          const zero = '0x' + '00'.repeat(32);
          switch (p.method) {
            case 'eth_chainId': return { id: p.id, result: '0x14a34' };
            case 'eth_blockNumber': return { id: p.id, result: '0x64' };
            case 'eth_call': return { id: p.id, result: zero };
            case 'eth_estimateGas': return { id: p.id, result: '0x5208' };
            case 'eth_getTransactionCount': return { id: p.id, result: '0x0' };
            case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': return { id: p.id, result: '0x1' };
            case 'eth_getBlockByNumber': return { id: p.id, result: { baseFeePerGas: '0x1', number: '0x64', hash: zero, parentHash: zero, timestamp: '0x0', nonce: '0x0000000000000000', difficulty: '0x0', gasLimit: '0x0', gasUsed: '0x0', miner: ethers.ZeroAddress, extraData: '0x', transactions: [] } };
            case 'eth_sendRawTransaction':
              this.broadcast.push(p.params[0]);                       // the node has it: money moves
              throw Object.assign(new Error('request timeout'), { code: 'TIMEOUT' });
            default: throw new Error('unexpected ' + p.method);
          }
        });
      }
    }
    const provider = new LossyRpc();
    const err = await caught(wrapper(new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider)).createSessionJob(job));
    expect(provider.broadcast).toHaveLength(1);
    expect(err).toBeInstanceOf(SDKError);
    expect(err).toMatchObject({ code: 'SESSION_FUNDING_UNCERTAIN', details: { retryable: false } });
    expect(err.details.cause).toBeDefined();
  });

  test('the user rejects in the wallet: refused before any broadcast — the wallet\'s own error, nothing funded', async () => {
    const { signer } = await browserWallet(() => { throw Object.assign(new Error('User denied transaction signature.'), { code: 4001 }); });
    expect(await caught(wrapper(signer).createSessionJob(job))).toMatchObject({ code: 'ACTION_REJECTED' });
  });

  test('a revert in estimation: refused before any broadcast — CALL_EXCEPTION, never sent', async () => {
    const { signer, calls } = await browserWallet(() => TXHASH, () => { throw Object.assign(new Error('execution reverted'), { code: 3, data: '0x' }); });
    expect(await caught(wrapper(signer).createSessionJob(job))).toMatchObject({ code: 'CALL_EXCEPTION' });
    expect(calls).not.toContain('eth_sendTransaction');
  });

  const provider = { getBlockNumber: async () => 100 };
  const failing = (error: unknown) => sendFunding(provider, async () => { throw error; });

  test('every refusal known to precede a broadcast is rethrown as it came', async () => {
    // Not INVALID_ARGUMENT since §35 PP4: ethers raises it after a broadcast too.
    for (const code of ['ACTION_REJECTED', 'CALL_EXCEPTION', 'INSUFFICIENT_FUNDS', 'NONCE_EXPIRED', 'REPLACEMENT_UNDERPRICED', 4001]) {
      const error = Object.assign(new Error(`refused: ${code}`), { code });
      expect(await caught(failing(error))).toBe(error);
    }
  });

  test('a hash wins over any code: an INVALID_ARGUMENT from the poll after the broadcast is SESSION_ID_UNRESOLVED', async () => {
    const error = Object.assign(new Error('invalid'), { code: 'INVALID_ARGUMENT', info: { sendTransactionHash: TXHASH } });
    expect(await caught(failing(error))).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: TXHASH, cause: error, retryable: false } });
  });

  test('anything else may have been broadcast: SESSION_FUNDING_UNCERTAIN — an uncoded error, a timeout, an unknown code', async () => {
    for (const error of [new Error('socket hang up'), Object.assign(new Error('t'), { code: 'TIMEOUT' }), Object.assign(new Error('u'), { code: 'UNKNOWN_ERROR' }), 'a string']) {
      expect(await caught(failing(error))).toMatchObject({ code: 'SESSION_FUNDING_UNCERTAIN', details: { cause: error, retryable: false } });
    }
  });

  test('the start block cannot be read: nothing was sent — that error, unclassified', async () => {
    const send = vi.fn();
    const down = new Error('rpc down');
    expect(await caught(sendFunding({ getBlockNumber: async () => { throw down; } }, send))).toBe(down);
    expect(send).not.toHaveBeenCalled();
  });

  test('startSession passes SESSION_FUNDING_UNCERTAIN through unwrapped', async () => {
    const uncertain = new SDKError('may have been sent', 'SESSION_FUNDING_UNCERTAIN', { retryable: false });
    const storageManager = { isInitialized: () => true, assertConversationLogWritable: vi.fn(), storeConversation: vi.fn(), appendMessages: vi.fn(), getUserAddress: () => '0xuser' };
    const sm = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockRejectedValue(uncertain) } as any, storageManager as any);
    await sm.initialize();
    const config = { chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false };
    expect(await caught(sm.startSession(config))).toBe(uncertain);
  });
});

/** A browser head store whose writes fail while `broken.on` (an IndexedDB quota or abort); reads work. */
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

function logStore(coherence?: RagCoherence) {
  const net = new FakeS5Network();
  const store = new StorageManager();
  Object.assign(store as any, { initialized: true, s5Client: net.tab(), userAddress: ADDR, connectionStatus: 'connected', sealer: sealer(), ...(coherence ? { coherence } : {}) });
  return store;
}

const message = (content: string) => ({ role: 'user' as const, content, timestamp: Date.now() });

describe('OO4 — a log written whose head this tab could not record says it was written', () => {
  test('saveConversation: the head store\'s error with committed: true — and the log reads back', async () => {
    const broken = { on: false };
    const store = logStore(flaky(browserOrigin()(), broken));
    broken.on = true;
    const err = await caught(store.saveConversation({ id: 'c1', messages: [message('hi')], metadata: {}, createdAt: 1, updatedAt: 1 } as any));
    broken.on = false;
    expect(err).toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true, retryable: false } });
    expect((await store.loadConversation('c1'))?.messages.map((m) => m.content)).toEqual(['hi']);
  });

  test('appendMessages: STORAGE_APPEND_ERROR carries committed: true, not retryable', async () => {
    const broken = { on: false };
    const store = logStore(flaky(browserOrigin()(), broken));
    broken.on = true;
    const err = await caught(store.appendMessages('c2', [message('q'), message('a')]));
    broken.on = false;
    expect(err).toMatchObject({ code: 'STORAGE_APPEND_ERROR', details: { committed: true, retryable: false } });
    expect((await store.loadConversation('c2'))?.messages.map((m) => m.content)).toEqual(['q', 'a']);
  });

  test('a write that did not land never says committed', async () => {
    const store = logStore();
    (store as any).s5Client.fs.put = async () => { throw new SDKError('portal refused', 'S5_IO_ERROR', { retryable: false }); };
    const err = await caught(store.saveConversation({ id: 'c3', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 } as any));
    expect(err.code).toBe('STORAGE_SAVE_ERROR');
    expect(err.details.committed).toBeUndefined();
  });
});

describe('OO5 — a conversation the sealer cannot encode', () => {
  const unsealable = () => [{ f() {} }, { s: Symbol('x') }].map((metadata) => ({ id: 'c4', messages: [], metadata, createdAt: 1, updatedAt: 1 }));

  test('saveConversation: STORAGE_CONVERSATION_INVALID, not retryable — nothing written', async () => {
    for (const conversation of unsealable()) {
      const store = logStore();
      const put = vi.spyOn((store as any).s5Client.fs, 'put');
      expect(await caught(store.saveConversation(conversation as any))).toMatchObject({ code: 'STORAGE_CONVERSATION_INVALID', details: { conversationId: 'c4', retryable: false } });
      expect(put).not.toHaveBeenCalled();
    }
  });

  test('an append of an unsealable message: not retryable', async () => {
    const store = logStore();
    const err = await caught(store.appendMessages('c5', [{ ...message('q'), extra: () => 1 } as any]));
    expect(err).toMatchObject({ code: 'STORAGE_APPEND_ERROR', details: { retryable: false, cause: { code: 'STORAGE_CONVERSATION_INVALID' } } });
  });

  test('no sealer is not a conversation problem: its own code', async () => {
    const store = logStore();
    (store as any).sealer = undefined;
    expect((await caught(store.saveConversation({ id: 'c6', messages: [], metadata: {}, createdAt: 1, updatedAt: 1 } as any))).code).not.toBe('STORAGE_CONVERSATION_INVALID');
  });
});

describe('OO6 — createTranscodeJob returns the session\'s own job id', () => {
  test('never a 0 in its place', async () => {
    const startSession = vi.fn(async () => ({ sessionId: 9n, jobId: undefined }));
    const m = new TranscodeManager({ startSession } as any, { uploadJSON: async () => 'cid' } as any, {} as any, {} as any, {} as any, 84532);
    const result = await m.createTranscodeJob({ hostAddress: ethers.Wallet.createRandom().address, chainId: 84532, maxDuration: 60, mediaFormats: [{ id: 1, ext: 'mp4', vcodec: 'h264', acodec: 'aac' }] } as any);
    expect(result.jobId).not.toBe(0n);
  });
});
