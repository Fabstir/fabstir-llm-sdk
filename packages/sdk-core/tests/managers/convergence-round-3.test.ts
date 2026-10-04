// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 3 — manager and consumer-contract classes (plan §15 T3, T4, T6, T8).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import { FakeS5Network } from '../helpers/fake-s5';
import { ADDR, SEED, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { SessionManager } from '../../src/managers/SessionManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { SDKError } from '../../src/types';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';
import 'fake-indexeddb/auto';

const HOST = ethers.Wallet.createRandom().address;

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function vrm(net: FakeS5Network) {
  const tab = net.tab();
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
  });
}

beforeEach(() => __resetInProcessCoherenceForTests());
afterEach(() => vi.unstubAllGlobals());

describe('T3 — the manager\'s "all databases" is complete or an error', () => {
  test('listAllDatabases is on the manager and names what could not be read', async () => {
    const net = new FakeS5Network();
    const m = vrm(net);
    await m.initialize();
    await m.createSession('alpha');
    await m.createSession('beta');
    (m as any).vectorStore.invalidateCaches();
    net.fail('get', `home/rag/v1/${sealer().deriveId('db', 'beta')}/manifest`, 'network', 100);
    const err = await caught(m.listAllDatabases());
    expect(err).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE', details: { retryable: true } });
    expect(err.details.failed.some((f: any) => f.dbId === sealer().deriveId('db', 'beta'))).toBe(true);
  }, 30_000);

  test('the all-databases walks use the listed metadata: no second read (no race with another tab\'s delete)', async () => {
    const net = new FakeS5Network();
    const m = vrm(net);
    await m.initialize();
    await m.createSession('alpha');
    await m.addPendingDocument('alpha', { id: 'a1' });
    (m as any).vectorStore.getDatabaseMetadata = async (name: string) => {
      throw new SDKError(`Database "${name}" not found`, 'RAG_DATABASE_NOT_FOUND');   // deleted meanwhile
    };
    expect((await m.getPendingDocuments()).map((d: any) => d.id)).toEqual(['a1']);
  });

  test('refreshDatabases replaces the list only from a complete one', async () => {
    const net = new FakeS5Network();
    const m = vrm(net);
    await m.initialize();
    await m.createSession('alpha');
    await m.createSession('beta');
    net.fail('get', `home/rag/v1/${sealer().deriveId('db', 'beta')}/manifest`, 'network', 1000);
    expect(await caught(m.refreshDatabases())).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE' });
    expect(m.listDatabases().map((d) => d.databaseName).sort()).toEqual(['alpha', 'beta']);
  }, 30_000);
});

describe('T4 — an exchange reaches the log as one unit, in order', () => {
  // Since §27 HH1 an exchange is one store call, asked for at once; the store keeps a conversation's calls in order
  // (pinned on the real store in convergence-round-14).
  test('two exchanges whose log writes are not awaited never interleave', async () => {
    let answered = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { const n = ++answered; return { ok: true, json: async () => ({ response: `A${n}` }) }; }));
    const logged: string[] = [];
    const storageManager = {
      isInitialized: () => true, assertConversationLogWritable: vi.fn(), storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessages: vi.fn(async (_id: string, ms: any[]) => { await new Promise((r) => setTimeout(r, 5)); logged.push(...ms.map((m) => m.content)); }),
      getUserAddress: () => '0xu',
    };
    const sm = new SessionManager({ isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) } as any, storageManager as any);
    await sm.initialize();
    await sm.startSession({ chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false } as any);
    await Promise.all([sm.sendPrompt(77n, 'Q1'), sm.sendPrompt(77n, 'Q2')]);
    await vi.waitFor(() => expect(logged).toHaveLength(4));
    expect(logged).toEqual(['Q1', 'A1', 'Q2', 'A2']);
    expect(storageManager.appendMessages.mock.calls.map((c: any[]) => c[1].map((m: any) => m.content))).toEqual([['Q1', 'A1'], ['Q2', 'A2']]);
  });
});

describe('T6 — consent to discard unreadable items reaches the store', () => {
  test('migrateToSealedStorage → migrateLegacyRagStorage → the store', async () => {
    const seen: any[] = [];
    const m = vrm(new FakeS5Network());
    (m as any).vectorStore.migrateLegacyStorage = async (opts: any) => { seen.push(opts.discardUnreadable); return { startedAt: 0, finishedAt: 0, databases: [], purgedRoots: [] }; };
    const fake = {
      config: {},                                                     // a real SDK always has one (§44 YY1 reads it)
      getVectorRAGReady: async () => undefined,
      getVectorRAGManager: () => m,
      getStorageManager: () => ({ migrateLegacyConversationLogs: async () => ({ sealed: 0, alreadySealed: 0, purged: [], failed: [] }) }),
    };
    await (FabstirSDKCore.prototype as any).migrateToSealedStorage.call(fake, { discardUnreadable: ['db'] });
    expect(seen).toEqual([['db']]);
  });
});

describe('T8 — small contract gaps', () => {
  test('the preflight is awaited: an async refusal stops startSession before funding', async () => {
    const storageManager = {
      isInitialized: () => true, storeConversation: vi.fn(), appendMessage: vi.fn(), getUserAddress: () => '0xu',
      assertConversationLogWritable: vi.fn().mockRejectedValue(new SDKError('IndexedDB will not open', 'RAG_COHERENCE_UNAVAILABLE')),
    };
    const payment = { isInitialized: () => true, createSessionJob: vi.fn().mockResolvedValue(77) };
    const sm = new SessionManager(payment as any, storageManager as any);
    await sm.initialize();
    await caught(sm.startSession({ chainId: 84532, host: HOST, modelId: 'm', endpoint: 'http://h:8080', pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false } as any));
    expect(payment.createSessionJob).not.toHaveBeenCalled();
  });

  test('a completed RAG migration report is never lost to a failed refresh', async () => {
    const m = vrm(new FakeS5Network());
    const report = { startedAt: 0, finishedAt: 0, databases: [{ name: 'x', status: 'migrated', vectors: 0, documents: 0 }], purgedRoots: [] };
    (m as any).vectorStore.migrateLegacyStorage = async () => report;
    (m as any).refreshDatabases = async () => { throw new SDKError('blip', 'RAG_DISCOVERY_INCOMPLETE'); };
    const err = await caught(m.migrateLegacyRagStorage());
    expect(err).toMatchObject({ code: 'RAG_DISCOVERY_INCOMPLETE', details: { report } });
  });
});
