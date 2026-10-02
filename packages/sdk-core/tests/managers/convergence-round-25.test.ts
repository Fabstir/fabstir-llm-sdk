// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 25 — plan §38 SS3, SS4: the manager refuses vectors that are not a list of vectors before anything;
 * the log migration reads a sealed log back before anything beside it — exchanges included — and before counting it.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { browserOrigin } from '../helpers/fake-locks';
import { SEED, ADDR, encryptionManager as em, sealer } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

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

describe('SS3 — the manager\'s addVectors refuses what is not a list of vectors, before anything', () => {
  for (const [label, value] of [['undefined', undefined], ['a record', { id: 'v1' }], ['a list of a record without its vector', [{ id: 'v1' }]]] as const) {
    test(`addVectors(${label}): RAG_VECTORS_INVALID, not retryable`, async () => {
      const net = new FakeS5Network();
      const m = new VectorRAGManager({
        userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
        s5Client: net.tab() as any, encryptionManager: em(), pathToHash: net.tab().pathToHash, coherence: browserOrigin()(),
      } as any);
      await m.initialize();
      const sessionId = await m.createSession('research');
      const writes = net.writes.length;
      expect(await caught(m.addVectors(sessionId, value as any))).toMatchObject({ code: 'RAG_VECTORS_INVALID', details: { retryable: false } });
      expect(net.writes.length).toBe(writes);
    });
  }
});

describe('SS4 — a sealed log that does not open keeps what is beside it, and is never counted', () => {
  const dir = (id: string) => `home/sessions/${ADDR}/${id}`;
  const legacyLog = (id: string) => ({ id, messages: [{ role: 'user', content: 'private question', timestamp: 1 }], metadata: {}, createdAt: 1, updatedAt: 1 });
  const unopenable = (id: string) => sealer().seal({ kind: 'cbor', value: { revision: 1, conversation: legacyLog(id) } }, 'conv/v1/another');
  function store(tab: FakeS5Tab) {
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    return s;
  }

  test('only exchanges beside it: failed, its exchanges kept', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c9')}/conversation.json`, unopenable('c9'), { mediaType: 'application/octet-stream' });
    await net.tab().fs.put(`${dir('c9')}/exchanges/1700000000000-abc.json`, { prompt: 'private question', response: 'x' });
    const report = await store(net.tab()).migrateLegacyConversationLogs();
    expect({ failed: report.failed.map((f: any) => f.id), alreadySealed: report.alreadySealed }).toEqual({ failed: ['c9'], alreadySealed: 0 });
    expect(net.filePaths()).toContain(`${dir('c9')}/exchanges/1700000000000-abc.json`);
  });

  test('a summary beside it: not counted alreadySealed', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(`${dir('c8')}/conversation.json`, unopenable('c8'), { mediaType: 'application/octet-stream' });
    await net.tab().fs.put(`${dir('c8')}/summary.json`, { summary: 'plaintext summary' });
    const report = await store(net.tab()).migrateLegacyConversationLogs();
    expect({ failed: report.failed.map((f: any) => f.id), alreadySealed: report.alreadySealed }).toEqual({ failed: ['c8'], alreadySealed: 0 });
  });
});
