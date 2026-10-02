// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 21 — storage-level (plan §34 OO4): a RAG write that landed on S5, whose head this tab could not
 * record, finishes its bookkeeping and says it landed.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { SDKError } from '../../../src/types';
import { __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const DB = 'notes';
const dbDir = () => `home/rag/v1/${sealer().deriveId('db', DB)}`;

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

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function setup() {
  const net = new FakeS5Network();
  const tab: FakeS5Tab = net.tab();
  const broken = { on: false };
  const s = new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), cacheEnabled: true, pathToHash: tab.pathToHash, coherence: flaky(browserOrigin()(), broken) });
  return { net, broken, s };
}

const landed = { code: 'RAG_COHERENCE_UNAVAILABLE', details: { committed: true, retryable: false } };

beforeEach(() => __resetInProcessCoherenceForTests());

describe('OO4 — the write landed: this tab says so, and reads what it wrote', () => {
  test('removeDocument: committed — this tab no longer lists it, its body is swept, and a retry is NOT_FOUND', async () => {
    const { net, broken, s } = setup();
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addPendingDocument(DB, { id: 'd1' } as any);
    await s.putDocumentBody(DB, 'd1', 'secret body');
    broken.on = true;
    expect(await caught(s.removeDocument(DB, 'd1'))).toMatchObject(landed);
    broken.on = false;
    const meta: any = await s.getDatabaseMetadata(DB);
    expect({
      listed: (meta.pendingDocuments ?? []).map((d: any) => d.id),
      bodies: net.filePaths().filter((p) => p.includes('/documents/')).length,
    }).toEqual({ listed: [], bodies: 0 });
    expect((await caught(s.removeDocument(DB, 'd1'))).code).toBe('RAG_DOCUMENT_NOT_FOUND');
  });

  test('addVectors: committed — this tab reads the new count', async () => {
    const { broken, s } = setup();
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [{ id: 'v1', vector: [1, 2, 3], metadata: {} }]);
    broken.on = true;
    expect(await caught(s.addVectors(DB, [{ id: 'v2', vector: [4, 5, 6], metadata: {} }]))).toMatchObject(landed);
    broken.on = false;
    expect((await s.getDatabaseMetadata(DB)).vectorCount).toBe(2);
  });

  test('a commit that drops chunks: committed — the dropped chunk files are swept', async () => {
    const { net, broken, s } = setup();
    (s as any).chunkSize = 1;
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [{ id: 'v1', vector: [1, 2, 3], metadata: {} }, { id: 'v2', vector: [4, 5, 6], metadata: {} }]);
    const chunks = () => net.filePaths().filter((p) => p.startsWith(dbDir()) && /\/chunk-\d+$/.test(p)).length;
    expect(chunks()).toBe(2);
    broken.on = true;
    expect(await caught(s.deleteVector(DB, 'v2'))).toMatchObject(landed);
    broken.on = false;
    expect(chunks()).toBe(1);
  });

  test('deleteDatabase: committed — this tab no longer lists it, and a retry is NOT_FOUND', async () => {
    const { net, broken, s } = setup();
    await s.createDatabase({ name: DB, owner: ADDR });
    await s.addVectors(DB, [{ id: 'v1', vector: [1, 2, 3], metadata: {} }]);
    broken.on = true;
    expect(await caught(s.deleteDatabase(DB))).toMatchObject(landed);
    broken.on = false;
    expect({ files: net.filePaths().filter((p) => p.startsWith(dbDir())).length, listed: (await s.listDatabases()).map((d) => d.databaseName) })
      .toEqual({ files: 0, listed: [] });
    expect((await caught(s.deleteDatabase(DB))).code).toBe('RAG_DATABASE_NOT_FOUND');
  });

  test('createDatabase: committed — this tab lists it', async () => {
    const { broken, s } = setup();
    broken.on = true;
    expect(await caught(s.createDatabase({ name: DB, owner: ADDR }))).toMatchObject(landed);
    broken.on = false;
    expect((await s.listDatabases()).map((d) => d.databaseName)).toEqual([DB]);
  });
});
