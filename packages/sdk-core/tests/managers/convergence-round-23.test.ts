// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 23 — plan §36 QQ1, QQ3–QQ6: `committed: true` across every step of a multi-step call (deleteVectors,
 * the log migration, addVectors' count, the session setup); PP7's deposit path and the senders read before the send.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import { SessionJobManager } from '../../src/contracts/SessionJobManager';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { SDKError } from '../../src/types';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import MarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { SEED, ADDR, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests, createRagCoherence, type RagCoherence } from '../../src/storage/sealed/rag-coherence';

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

const headFailure = () => new SDKError('Sealed storage needs IndexedDB', 'RAG_COHERENCE_UNAVAILABLE', { missing: 'IndexedDB', retryable: false });

/**
 * A browser head store whose writes fail while `faults.puts`, and whose reads fail while `faults.reads` — set by a
 * failing write when `faults.readsFollow` (a store that broke mid-call).
 */
function flaky(base: RagCoherence, faults: { puts: boolean; reads?: boolean; readsFollow?: boolean }): RagCoherence {
  const wrap = (c: RagCoherence): RagCoherence => ({
    ...c,
    putHead: async (key, head) => {
      if (faults.puts) { if (faults.readsFollow) faults.reads = true; throw headFailure(); }
      return c.putHead(key, head);
    },
    getHead: async (key) => { if (faults.reads) throw headFailure(); return c.getHead(key); },
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
const vector = (id: string, n: number) => ({ id, vector: [n, n + 1, n + 2], metadata: {} });

describe('QQ1 — deleteVectors is one write: committed: true covers every id', () => {
  test('three ids, the head not recorded: all three deleted', async () => {
    const net = new FakeS5Network();
    const faults = { puts: false };
    const m = rag(net.tab(), flaky(browserOrigin()(), faults));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    await m.addVectors(sessionId, [vector('a', 1), vector('b', 2), vector('c', 3), vector('d', 4)]);
    faults.puts = true;
    expect(await caught(m.deleteVectors(sessionId, ['a', 'b', 'c']))).toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true } });
    faults.puts = false;
    const fresh = rag(net.tab(), browserOrigin()());
    await fresh.initialize();
    expect((await fresh.listVectors(DB)).map((v) => v.id)).toEqual(['d']);
  });

  test('an id that is not there is no error', async () => {
    const m = rag(new FakeS5Network().tab(), browserOrigin()());
    await m.initialize();
    const sessionId = await m.createSession(DB);
    await m.addVectors(sessionId, [vector('a', 1), vector('b', 2)]);
    await m.deleteVectors(sessionId, ['a', 'nope']);
    expect((await m.listVectors(DB)).map((v) => v.id)).toEqual(['b']);
  });
});

describe('QQ4 — a failed count read after a landed write never hides that it landed', () => {
  test('addVectors: the head store fails its reads too — still committed: true', async () => {
    const faults = { puts: false, reads: false, readsFollow: true };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), faults));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    await m.addVectors(sessionId, [vector('a', 1)]);
    faults.puts = true;                                               // its head fails — then its count read too
    expect(await caught(m.addVectors(sessionId, [vector('b', 2)]))).toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true } });
  });
});

describe('QQ3 — the log migration: a reseal that landed is sealed; nothing is purged beside a log that does not open', () => {
  const dir = (id: string) => `home/sessions/${ADDR}/${id}`;
  const legacyLog = (id: string) => ({ id, messages: [{ role: 'user', content: 'private question', timestamp: 1 }], metadata: {}, createdAt: 1, updatedAt: 1 });
  function store(tab: FakeS5Tab, fields: Record<string, unknown> = {}) {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer(), ...fields });
    return s;
  }

  test('the head not recorded: counted sealed, its plaintext summary and exchanges purged', async () => {
    const net = new FakeS5Network();
    const t = net.tab();
    await t.fs.put(`${dir('41')}/conversation.json`, legacyLog('41'));
    await t.fs.put(`${dir('41')}/summary.json`, { summary: 'plaintext summary' });
    await t.fs.put(`${dir('41')}/exchanges/1700000000000-abc.json`, { prompt: 'private question', response: 'x' });
    const base = createRagCoherence({ isBrowser: false });
    const s = store(net.tab(), { coherence: { ...base, putHead: async () => { throw headFailure(); } } });
    const report = await s.migrateLegacyConversationLogs();
    expect({ sealed: report.sealed, failed: report.failed }).toEqual({ sealed: 1, failed: [] });
    expect(net.filePaths().filter((p) => p.startsWith(dir('41')))).toEqual([`${dir('41')}/conversation.json`]);
  });

  test('a reseal that fails outright: failed, its plaintext copies kept', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c3')}/conversation.json`, legacyLog('c3'));
    await net.tab().fs.put(`${dir('c3')}/summary.json`, { summary: 'plaintext summary' });
    net.fail('put', `${dir('c3')}/conversation.json`, new SDKError('portal refused', 'S5_IO_ERROR', { retryable: false }), 5);
    const report = await store(net.tab()).migrateLegacyConversationLogs();
    expect({ sealed: report.sealed, failed: report.failed.map((f: any) => f.id) }).toEqual({ sealed: 0, failed: ['c3'] });
    expect(net.filePaths()).toContain(`${dir('c3')}/summary.json`);
  });

  test('a resealed log that does not open: its plaintext copy is kept', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c1')}/conversation.json`, legacyLog('c1'));
    await net.tab().fs.put(`${dir('c1')}/conversation-plaintext.json`, legacyLog('c1'));
    const real = sealer();
    const s = store(net.tab(), { sealer: { ...real, seal: (p: any, context: string) => real.seal(p, `${context}/unopenable`) } });
    const report = await s.migrateLegacyConversationLogs();
    expect(report.failed.map((f: any) => f.id)).toEqual(['c1']);
    expect(net.filePaths()).toContain(`${dir('c1')}/conversation-plaintext.json`);
  });

  test('a log sealed by an earlier run that does not open: its plaintext siblings are kept', async () => {
    const net = new FakeS5Network();
    const unopenable = sealer().seal({ kind: 'cbor', value: { revision: 1, conversation: legacyLog('c2') } }, 'conv/v1/another');
    await net.tab().fs.put(`${dir('c2')}/conversation.json`, unopenable, { mediaType: 'application/octet-stream' });
    await net.tab().fs.put(`${dir('c2')}/summary.json`, { summary: 'plaintext summary' });
    const report = await store(net.tab()).migrateLegacyConversationLogs();
    expect(report.failed.map((f: any) => f.id)).toEqual(['c2']);
    expect(net.filePaths()).toContain(`${dir('c2')}/summary.json`);
  });
});

const HOST = ethers.Wallet.createRandom().address;
const MODEL = '0x' + '11'.repeat(32);
const TXHASH = '0x' + 'ab'.repeat(32);

describe('QQ5 — a landed log step does not skip the rest of the setup', () => {
  const config = { chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false, groupId: 'g1' };
  function makeSM(addChatSession: () => Promise<unknown>) {
    const storageManager = {
      isInitialized: () => true, assertConversationLogWritable: vi.fn(), getUserAddress: () => '0xuser',
      storeConversation: vi.fn(async () => { throw new SDKError('head', 'RAG_COHERENCE_UNAVAILABLE', { committed: true, retryable: false }); }),
    };
    const sm = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, storageManager as any);
    const groups = { getSessionGroup: vi.fn().mockResolvedValue({ id: 'g1' }), addChatSession: vi.fn(addChatSession) };
    (sm as any).sessionGroupManager = groups;
    return { sm, groups };
  }

  test('the group link still runs; then committed: true — the setup completed', async () => {
    const { sm, groups } = makeSM(async () => {});
    await sm.initialize();
    const err = await caught(sm.startSession(config));
    expect(groups.addChatSession).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ code: 'SESSION_FUNDED_SETUP_FAILED', details: { stage: 'conversation-log', committed: true } });
  });

  test('a log step that did not land: the setup stops there — no group link', async () => {
    const { sm, groups } = makeSM(async () => {});
    (sm as any).storageManager.storeConversation = vi.fn(async () => { throw new SDKError('portal down', 'STORAGE_SAVE_ERROR', { retryable: true }); });
    await sm.initialize();
    expect(await caught(sm.startSession(config))).toMatchObject({ code: 'SESSION_FUNDED_SETUP_FAILED', details: { stage: 'conversation-log' } });
    expect(groups.addChatSession).not.toHaveBeenCalled();
  });

  test('the group link failing after it: that step\'s failure, never "set up"', async () => {
    const { sm } = makeSM(async () => { throw new Error('group save failed'); });
    await sm.initialize();
    const err = await caught(sm.startSession(config));
    expect(err).toMatchObject({ code: 'SESSION_FUNDED_SETUP_FAILED', details: { stage: 'session-group-link' } });
    expect(err.details.committed).toBeUndefined();
  });
});

describe('QQ6 — PP7 pins: the deposit path; the sender read before the send', () => {
  const iface = new ethers.Interface(MarketplaceABI as any);
  const MARKET = ChainRegistry.getChain(84532).contracts.jobMarketplace;
  const USDC = ChainRegistry.getChain(84532).contracts.usdcToken;
  const ME = ethers.Wallet.createRandom().address;
  const OTHER = ethers.Wallet.createRandom().address;
  const created = (name: string, id: bigint, sender: string) => {
    const fragment = iface.getEvent(name)!;
    const args = fragment.inputs.map((input, i) => (i === 0 ? id : input.name === 'depositor' || input.name === 'delegate' ? sender
      : input.type === 'address' ? HOST : input.type === 'bytes32' ? MODEL : 1n));
    return { address: MARKET, ...iface.encodeEventLog(fragment, args) };
  };
  /** A signer whose address lookup fails once the funding transaction was sent. */
  function lookups() {
    const state = { sent: false };
    const signer = { getAddress: async () => { if (state.sent) throw new Error('lookup down'); return ME; }, provider: { getBlockNumber: async () => 1 } };
    const sent = (logs: unknown[]) => async () => {
      state.sent = true;
      const t = { hash: TXHASH, wait: async () => ({ hash: TXHASH, status: 1, logs }) };
      return { ...t, replaceableTransaction: () => t };
    };
    return { signer, sent, state };
  }
  function wrapper(signer: any, contract: Record<string, unknown>) {
    const w = Object.create(JobMarketplaceWrapper.prototype);
    Object.assign(w, { chainId: 84532, contractAddress: MARKET, signer, verifyChain: async () => undefined, getDepositBalance: async () => '1000', contract: { paused: async () => false, interface: iface, ...contract } });
    return w as JobMarketplaceWrapper;
  }

  test('createSessionFromDeposit: another depositor\'s creation first — this signer\'s id (its host another address)', async () => {
    const { signer, sent } = lookups();
    const w = wrapper(signer, { createSessionFromDepositForModel: sent([created('SessionCreatedByDepositor', 7n, OTHER), created('SessionCreatedByDepositor', 42n, ME)]) });
    expect(await w.createSessionFromDeposit({ host: HOST, modelId: MODEL, paymentToken: USDC, deposit: '1', pricePerToken: 1, duration: 3600, proofInterval: 100 } as any)).toBe(42);
  });

  test('the wrapper reads its sender before the send: a lookup failing after it changes nothing', async () => {
    const { signer, sent } = lookups();
    const w = wrapper(signer, { createSessionJobForModel: sent([created('SessionJobCreatedForModel', 42n, ME)]) });
    expect(await w.createSessionJob({ host: HOST, modelId: MODEL, pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' } as any)).toBe(42);
  });

  test('SessionJobManager\'s delegated session reads the marketplace and its delegate before the send', async () => {
    const { signer, sent, state } = lookups();
    const marketplace: any = { connect: () => marketplace, createSessionForModelAsDelegate: sent([created('SessionCreatedByDelegate', 100n, ME)]), target: MARKET };
    const contractManager = {
      getJobMarketplace: () => marketplace, setSigner: async () => {},
      getContractAddress: async () => { if (state.sent) throw new Error('config read after the send'); return MARKET; },
    };
    const manager = new SessionJobManager(contractManager as any);
    await manager.setSigner(signer as any);
    const result = await manager.createSessionForModelAsDelegate(OTHER, MODEL, HOST, USDC, 1n, 1n, 3600, 100, 300);
    expect(result.sessionId).toBe(100n);
  });
});
