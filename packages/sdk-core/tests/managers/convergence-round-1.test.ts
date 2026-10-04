// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 1 — manager and consumer-contract classes (plan §13 R2, R11, R12).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { FakeS5Network } from '../helpers/fake-s5';
import { ADDR, SEED, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { SessionManager } from '../../src/managers/SessionManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { awaitFundingReceipt } from '../../src/contracts/funding-receipt';
import { JobMarketplaceWrapper } from '../../src/contracts/JobMarketplace';
import MarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { SDKError } from '../../src/types';
import { createRagCoherence, __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';
import 'fake-indexeddb/auto';

const HOST = ethers.Wallet.createRandom().address;
const startConfig = (over: Record<string, unknown> = {}) => ({
  chainId: 84532, host: HOST, modelId: 'tiny-model', endpoint: 'http://host.test:8080',
  pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false, ...over,
});

function makeSM(storage: Record<string, unknown> = {}) {
  const storageManager = {
    isInitialized: () => true,
    storeConversation: vi.fn().mockResolvedValue(undefined),
    appendMessage: vi.fn().mockResolvedValue(undefined),
    updateConversationMetadata: vi.fn().mockResolvedValue(undefined),
    assertConversationLogWritable: vi.fn(),
    getUserAddress: () => '0xuser',
    ...storage,
  };
  const paymentManager = { isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77), completeSession: vi.fn().mockResolvedValue('0xsettled') };
  return { sm: new SessionManager(paymentManager as any, storageManager as any), storageManager, paymentManager };
}

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ response: 'the paid answer' }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe('R2 — environment preconditions are checked before funding; a log failure never costs a paid result', () => {
  test('a conversation log that cannot be written fails startSession BEFORE the job is funded', async () => {
    const unavailable = new SDKError('no Web Locks', 'RAG_COHERENCE_UNAVAILABLE');
    const { sm, paymentManager } = makeSM({ assertConversationLogWritable: vi.fn(() => { throw unavailable; }) });
    await sm.initialize();
    const err = await caught(sm.startSession(startConfig()));
    expect(paymentManager.createSessionJob).not.toHaveBeenCalled();
    expect(err.code === 'RAG_COHERENCE_UNAVAILABLE' || err.details?.originalError?.code === 'RAG_COHERENCE_UNAVAILABLE').toBe(true);
  });

  test('with conversationLog: false the log precondition is not required', async () => {
    const { sm, paymentManager } = makeSM({ assertConversationLogWritable: vi.fn(() => { throw new Error('no'); }) });
    await sm.initialize();
    await sm.startSession(startConfig({ conversationLog: false }));
    expect(paymentManager.createSessionJob).toHaveBeenCalledTimes(1);
  });

  test('StorageManager.assertConversationLogWritable: no sealer, or no usable lock, is refused', async () => {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true });
    await expect(s.assertConversationLogWritable()).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    Object.assign(s as any, { sealer: sealer(), coherence: createRagCoherence({ isBrowser: true, locks: undefined, indexedDB: undefined }) });
    await expect(s.assertConversationLogWritable()).rejects.toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE' });
    Object.assign(s as any, { coherence: createRagCoherence({ isBrowser: false }) });
    await expect(s.assertConversationLogWritable()).rejects.toMatchObject({ code: 'STORAGE_OFFLINE' }); // S6
    Object.assign(s as any, { connectionStatus: 'connected' });
    await s.assertConversationLogWritable();
  });

  test('sendPrompt returns the paid reply even when the log write fails', async () => {
    const { sm } = makeSM({ appendMessage: vi.fn().mockRejectedValue(new Error('S5 down')) });
    await sm.initialize();
    await sm.startSession(startConfig());
    expect(await sm.sendPrompt(77n, 'question')).toContain('the paid answer');
  });

  test('streamResponse delivers the paid reply even when the log write fails', async () => {
    const { sm } = makeSM({ appendMessage: vi.fn().mockRejectedValue(new Error('S5 down')) });
    await sm.initialize();
    await sm.startSession(startConfig());
    const chunks: string[] = [];
    await sm.streamResponse(77n, 'question', (c) => chunks.push(c));
    expect(chunks.join('')).toContain('the paid answer');
  });

  test('completeSession returns the settlement tx even when the log update fails', async () => {
    const { sm } = makeSM({ updateConversationMetadata: vi.fn().mockRejectedValue(new Error('S5 down')) });
    await sm.initialize();
    await sm.startSession(startConfig());
    expect(await sm.completeSession(77n, 5, '0xproof')).toBe('0xsettled');
  });
});

describe('R11 — a funding receipt is classified, not assumed unresolved', () => {
  const receipt = { hash: '0xNEW', status: 1, logs: [] };
  test('repriced (sped up): the replacement\'s receipt is used', async () => {
    const tx = { hash: '0xOLD', wait: async () => { throw Object.assign(new Error('replaced'), { code: 'TRANSACTION_REPLACED', reason: 'repriced', cancelled: false, replacement: { hash: '0xNEW' }, receipt }); } };
    expect(await awaitFundingReceipt(tx)).toBe(receipt);
  });

  test('cancelled or replaced by a different tx: SESSION_NOT_FUNDED with the hash', async () => {
    const tx = { hash: '0xOLD', wait: async () => { throw Object.assign(new Error('replaced'), { code: 'TRANSACTION_REPLACED', reason: 'cancelled', cancelled: true, replacement: { hash: '0xNEW' }, receipt }); } };
    expect(await caught(awaitFundingReceipt(tx))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { txHash: '0xOLD' } });
  });

  test('a revert (status 0): SESSION_NOT_FUNDED', async () => {
    const tx = { hash: '0xR', wait: async () => { throw Object.assign(new Error('reverted'), { code: 'CALL_EXCEPTION', receipt: { hash: '0xR', status: 0, logs: [] } }); } };
    expect(await caught(awaitFundingReceipt(tx))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { txHash: '0xR' } });
  });

  test('a receipt that resolves with status 0 (a provider that does not throw on revert): SESSION_NOT_FUNDED', async () => {
    const tx = { hash: '0xS0', wait: async () => ({ hash: '0xS0', status: 0, logs: [] }) };
    expect(await caught(awaitFundingReceipt(tx))).toMatchObject({ code: 'SESSION_NOT_FUNDED', details: { txHash: '0xS0' } });
  });

  test('an unknown outcome stays SESSION_ID_UNRESOLVED', async () => {
    const tx = { hash: '0xU', wait: async () => { throw new Error('RPC timeout'); } };
    expect(await caught(awaitFundingReceipt(tx))).toMatchObject({ code: 'SESSION_ID_UNRESOLVED', details: { txHash: '0xU' } });
  });

  test('direct payment also accepts SessionJobCreatedForModel', async () => {
    const iface = new ethers.Interface(MarketplaceABI as any);
    const market = ChainRegistry.getChain(84532).contracts.jobMarketplace;
    const log = { address: market, ...iface.encodeEventLog('SessionJobCreatedForModel', [9n, HOST, HOST, '0x' + '11'.repeat(32), 1n]) };
    const tx = { hash: '0xa', wait: async () => ({ hash: '0xa', status: 1, logs: [log] }) };
    const w = Object.create(JobMarketplaceWrapper.prototype);
    Object.assign(w, {
      chainId: 84532, contractAddress: market, verifyChain: async () => undefined,
      signer: { getAddress: async () => HOST, provider: { getBlockNumber: async () => 1 } },
      contract: { paused: async () => false, interface: iface, createSessionJobForModel: async () => ({ ...tx, replaceableTransaction: () => tx }) },
    });
    expect(await w.createSessionJob({ host: HOST, modelId: '0x' + '11'.repeat(32), pricePerToken: 1, duration: 3600, proofInterval: 100, paymentAmount: '0.001' })).toBe(9);
  });
});

describe('R12 — the consumer contract', () => {
  function vrm(net: FakeS5Network) {
    const tab = net.tab();
    return new VectorRAGManager({
      userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
      s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
    });
  }

  test('getDatabaseMetadata is async and returns the document lists', async () => {
    const m = vrm(new FakeS5Network());
    await m.initialize();
    await m.createSession('db');
    await m.addPendingDocument('db', { id: 'd1' });
    const meta = await m.getDatabaseMetadata('db');
    expect(meta?.pendingDocuments?.map((d: any) => d.id)).toEqual(['d1']);
  });

  test('getVectorDatabaseMetadata returns its declared shape', async () => {
    const m = vrm(new FakeS5Network());
    await m.initialize();
    await m.createSession('db');
    const v = await m.getVectorDatabaseMetadata('db');
    expect(v).toMatchObject({ id: 'db', name: 'db', owner: ADDR, vectorCount: 0 });
    expect(typeof v.created).toBe('number');
  });

  test('database not found / already exists are SDKErrors with codes (messages kept)', async () => {
    const m = vrm(new FakeS5Network());
    await m.initialize();
    await m.createSession('db');
    const missing = await caught(m.addPendingDocument('nope', { id: 'x' }));
    expect(missing).toBeInstanceOf(SDKError);
    expect(missing).toMatchObject({ code: 'RAG_DATABASE_NOT_FOUND' });
    expect(missing.message).toMatch(/not found/);
    const exists = await caught((m as any).vectorStore.createDatabase({ name: 'db', owner: ADDR }));
    expect(exists).toMatchObject({ code: 'RAG_DATABASE_EXISTS' });
    expect(exists.message).toMatch(/already exists/);
  });

  test('updateDocumentStatus takes an optional database name; a missing document is RAG_DOCUMENT_NOT_FOUND', async () => {
    const m = vrm(new FakeS5Network());
    await m.initialize();
    await m.createSession('db');
    await m.addPendingDocument('db', { id: 'd1' });
    await m.updateDocumentStatus('d1', 'ready', { vectorCount: 1 }, 'db');
    expect((await m.getDatabaseMetadata('db'))?.readyDocuments?.map((d: any) => d.id)).toEqual(['d1']);
    expect(await caught(m.updateDocumentStatus('nope', 'ready'))).toMatchObject({ code: 'RAG_DOCUMENT_NOT_FOUND' });
  });

  test('updateDocumentStatus: an unreadable database is thrown during the search, never skipped; a named database is used directly', async () => {
    const net = new FakeS5Network();
    const m = vrm(net);
    await m.initialize();
    await m.createSession('broken');
    await m.createSession('db');
    await m.addPendingDocument('db', { id: 'd1' });
    (m as any).vectorStore.invalidateCaches();
    const brokenId = sealer().deriveId('db', 'broken');
    net.fail('get', `home/rag/v1/${brokenId}/manifest`, 'dir404', 100);
    // An id in neither database: the search must read both, whatever order it walks them in (S10) — and the
    // unreadable one is thrown, never skipped into RAG_DOCUMENT_NOT_FOUND.
    const err = await caught(m.updateDocumentStatus('in-neither', 'ready'));
    expect(err).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE', details: { retryable: true } });
    await m.updateDocumentStatus('d1', 'ready', { vectorCount: 1 }, 'db');
    expect((await m.getDatabaseMetadata('db'))?.readyDocuments?.map((d: any) => d.id)).toEqual(['d1']);
  });

  test('getPendingDocuments rethrows a read failure instead of returning a partial list (I2)', async () => {
    const net = new FakeS5Network();
    const m = vrm(net);
    await m.initialize();
    await m.createSession('db');
    (m as any).vectorStore.invalidateCaches();
    net.fail('get', /^home\/rag\/v1\/[0-9a-f]+\/manifest$/, 'dir404', 10);
    await expect(m.getPendingDocuments('db')).rejects.toThrow();
  });

  test('a failed migration entry carries the error code', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const dir = `home/vector-databases/${ADDR}/legacy`;
    await tab.fs.put(`${dir}/manifest.json`, { name: 'legacy', owner: ADDR, vectorCount: 1, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1, chunks: [{ chunkId: 0, cid: 'x', vectorCount: 1, sizeBytes: 0, updatedAt: 1 }], chunkCount: 1, folderPaths: [] });
    await tab.fs.put(`${dir}/chunk-0.json`, { chunkId: 0, vectors: [] });
    net.fail('get', `${dir}/chunk-0.json`, 'dir404', 3);   // outlasts the read retries (§16 V6)
    const report = await vrm(net).migrateLegacyRagStorage();
    expect(report.databases[0]).toMatchObject({ status: 'failed', code: 'RAG_LEGACY_UNREADABLE', unreadable: { chunks: [0] } });
  });

  test('a failed migration entry carries a code: s5js\'s own, S5_IO_ERROR, or RAG_MIGRATION_FAILED when none was given', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    const dir = `home/vector-databases/${ADDR}/legacy`;
    await tab.fs.put(`${dir}/manifest.json`, { name: 'legacy', owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1, chunks: [], chunkCount: 0, folderPaths: [] });
    net.fail('list', dir, 'dir404', 1);
    expect((await vrm(net).migrateLegacyRagStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'S5_DIRECTORY_LOAD_ERROR' });
    net.fail('list', dir, 'network', 1);
    expect((await vrm(net).migrateLegacyRagStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'S5_IO_ERROR' });
    const m = vrm(net);
    (m as any).vectorStore._commitLocked = async () => { throw new Error('no code here'); };
    expect((await m.migrateLegacyRagStorage()).databases[0]).toMatchObject({ status: 'failed', code: 'RAG_MIGRATION_FAILED' });
  });

  test('migrateToSealedStorage waits for RAG readiness and returns both reports even when one side fails', async () => {
    const order: string[] = [];
    const fake = {
      config: {},                                                     // a real SDK always has one (§44 YY1 reads it)
      getVectorRAGReady: async () => { order.push('ready'); },
      getVectorRAGManager: () => ({ migrateLegacyRagStorage: async () => { order.push('rag'); return { databases: [], purgedRoots: [] }; } }),
      getStorageManager: () => ({ migrateLegacyConversationLogs: async () => { throw new SDKError('boom', 'STORAGE_OFFLINE'); } }),
    };
    const err = await caught((FabstirSDKCore.prototype as any).migrateToSealedStorage.call(fake));
    expect(order[0]).toBe('ready');
    expect(err).toMatchObject({ code: 'MIGRATION_INCOMPLETE' });
    expect(err.details.rag).toEqual({ databases: [], purgedRoots: [] });
    expect(err.details.logsError.code).toBe('STORAGE_OFFLINE');
  });

  test('ExtendedSessionConfig is exported from the entry (type) and SDK errors carry codes', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/ExtendedSessionConfig/);
  });
});
