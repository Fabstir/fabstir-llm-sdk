// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 24 — plan §37 RR2–RR4: a write's own result, never a second read; a landed write carries its
 * result; deleteVectors' edges through the manager; the log migration's order.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { SDKError } from '../../src/types';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
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
const vector = (id: string, n: number, metadata: Record<string, unknown> = {}) => ({ id, vector: [n, n + 1, n + 2], metadata });
const count = (m: VectorRAGManager) => m.listDatabases().find((d) => d.databaseName === DB)?.vectorCount;

describe('RR2 — the count is the write\'s own, never a second read', () => {
  test('a read after the write would fail: the add resolves, and the listed count is the committed one', async () => {
    const m = rag(new FakeS5Network().tab(), browserOrigin()());
    await m.initialize();
    const sessionId = await m.createSession(DB);
    vi.spyOn((m as any).vectorStore, 'getStats').mockRejectedValue(new SDKError('S5 read failed', 'S5_IO_ERROR', { retryable: true }));
    await m.addVectors(sessionId, [vector('a', 1), vector('b', 2)]);
    expect(count(m)).toBe(2);
  });

  test('landed with its head not recorded: committed: true, and the count is still the committed one', async () => {
    const broken = { on: false };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), broken));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    vi.spyOn((m as any).vectorStore, 'getStats').mockRejectedValue(new SDKError('S5 read failed', 'S5_IO_ERROR', { retryable: true }));
    broken.on = true;
    expect(await caught(m.addVectors(sessionId, [vector('a', 1), vector('b', 2), vector('c', 3)]))).toMatchObject({ code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true, result: 3 } });
    expect(count(m)).toBe(3);
  });

  test('a count-returning delete that landed carries its count', async () => {
    const broken = { on: false };
    const m = rag(new FakeS5Network().tab(), flaky(browserOrigin()(), broken));
    await m.initialize();
    const sessionId = await m.createSession(DB);
    await m.addVectors(sessionId, [vector('a', 1, { doc: 'x' }), vector('b', 2, { doc: 'x' }), vector('c', 3, { doc: 'y' })]);
    broken.on = true;
    expect(await caught(m.deleteByMetadata(sessionId, { doc: 'x' }))).toMatchObject({ details: { committed: true, result: 2 } });
  });
});

describe('RR3 — deleteVectors through the manager', () => {
  test('an empty list: nothing written', async () => {
    const net = new FakeS5Network();
    const m = rag(net.tab(), browserOrigin()());
    await m.initialize();
    const sessionId = await m.createSession(DB);
    const writes = net.writes.length;
    await m.deleteVectors(sessionId, []);
    expect(net.writes.length).toBe(writes);
  });
});

describe('RR4 — the log migration reads a log back before counting it, and only when it must', () => {
  const dir = (id: string) => `home/sessions/${ADDR}/${id}`;
  const legacyLog = (id: string) => ({ id, messages: [{ role: 'user', content: 'private question', timestamp: 1 }], metadata: {}, createdAt: 1, updatedAt: 1 });
  function store(tab: FakeS5Tab, fields: Record<string, unknown> = {}) {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer(), ...fields });
    return s;
  }
  const unopenableSealer = () => { const real = sealer(); return { ...real, seal: (p: any, context: string) => real.seal(p, `${context}/unopenable`) }; };

  test('a reseal that does not open, with plaintext beside it: failed, never counted', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c1')}/conversation.json`, legacyLog('c1'));
    await net.tab().fs.put(`${dir('c1')}/conversation-plaintext.json`, legacyLog('c1'));
    const report = await store(net.tab(), { sealer: unopenableSealer() }).migrateLegacyConversationLogs();
    expect({ sealed: report.sealed, failed: report.failed.map((f: any) => f.id) }).toEqual({ sealed: 0, failed: ['c1'] });
  });

  test('a reseal that does not open, with nothing beside it: still read back — failed, never counted', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c2')}/conversation.json`, legacyLog('c2'));
    const report = await store(net.tab(), { sealer: unopenableSealer() }).migrateLegacyConversationLogs();
    expect({ sealed: report.sealed, failed: report.failed.map((f: any) => f.id) }).toEqual({ sealed: 0, failed: ['c2'] });
  });

  test('a log sealed before, with nothing beside it: not downloaded', async () => {
    const net = new FakeS5Network();
    const s = store(net.tab());
    await s.saveConversation(legacyLog('c3') as any);                 // sealed, nothing beside it
    const readLog = vi.spyOn(s as any, '_readLog');
    const report = await s.migrateLegacyConversationLogs();
    expect({ alreadySealed: report.alreadySealed, reads: readLog.mock.calls.length }).toEqual({ alreadySealed: 1, reads: 0 });
  });
});
