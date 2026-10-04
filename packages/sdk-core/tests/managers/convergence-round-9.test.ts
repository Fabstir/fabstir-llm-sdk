// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 9 — SDK-level classes (plan §22 CC5, CC7, CC8; CC2 superseded by §23 DD1).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { StorageManager } from '../../src/managers/StorageManager';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { DEFAULT_RAG_CONFIG } from '../../src/rag/config';
import { FakeS5Network } from '../helpers/fake-s5';
import { SEED, ADDR, encryptionManager as em } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const initStorage = (FabstirSDKCore.prototype as any)._initStorage;

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function manager() {
  const tab = new FakeS5Network().tab();
  return new VectorRAGManager({
    userAddress: ADDR, seedPhrase: SEED, config: DEFAULT_RAG_CONFIG, sessionManager: {} as any,
    s5Client: tab as any, encryptionManager: em(), pathToHash: tab.pathToHash,
  });
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// CC2 (a per-call token on the flag) is superseded by §23 DD1 — identity changes run one after another; its tests
// are in convergence-round-10.test.ts.

describe("CC5 — the manager's own dimension check is coded", () => {
  test('RAG_VECTOR_DIMENSION_MISMATCH, not retryable', async () => {
    const m = manager();
    await m.initialize();
    const session = await m.createSession('kb');
    expect(await caught(m.addVectors(session, [{ id: 'a', vector: [0.1, 0.1], metadata: {} }, { id: 'b', vector: [0.1], metadata: {} }] as any)))
      .toMatchObject({ code: 'RAG_VECTOR_DIMENSION_MISMATCH', details: { retryable: false } });
  });
});

describe('CC7 — the unavailable store does not depend on native async functions', () => {
  test('an async member down-levelled by a consumer toolchain (a plain function returning a promise) still rejects', async () => {
    const original = StorageManager.prototype.loadConversation;
    StorageManager.prototype.loadConversation = function (this: StorageManager, id: string) { return original.call(this, id); } as any;
    try {
      const s: any = Object.create(FabstirSDKCore.prototype);
      Object.assign(s, { authenticated: true, s5Seed: SEED, userAddress: ADDR, storageManager: { initialize: async () => { throw new Error('portal down'); }, isInitialized: () => true, dispose() {} } });
      await initStorage.call(s, false);
      let result: unknown;
      expect(() => { result = s.storageManager.loadConversation('x'); }).not.toThrow();
      await expect(result).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    } finally {
      StorageManager.prototype.loadConversation = original;
    }
  });
});

describe('CC8 — refreshDatabases returns the complete entries it read', () => {
  test('document arrays survive a refresh; manager-only fields are kept', async () => {
    const m = manager();
    await m.initialize();
    await m.createSession('kb');
    await m.addPendingDocument('kb', { id: 'd1' });
    (m as any).metadataService.update('kb', { isPublic: true });
    const entry = (await m.refreshDatabases()).find((d) => d.databaseName === 'kb')!;
    expect(entry.pendingDocuments?.map((d: any) => d.id)).toEqual(['d1']);
    expect(entry.isPublic).toBe(true);
  });
});
