// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 4 — consumer-contract classes at the SDK surface (plan §16 V10, V11).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { SDKError } from '../../src/types';

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

describe('V10 — MIGRATION_INCOMPLETE carries a RAG report that completed before its refresh failed', () => {
  test('details.rag is the report, not undefined', async () => {
    const report = { startedAt: 0, finishedAt: 0, databases: [{ name: 'x', status: 'migrated', vectors: 0, documents: 0 }], purgedRoots: [] };
    const fake = {
      config: {},                                                     // a real SDK always has one (§44 YY1 reads it)
      getVectorRAGReady: async () => undefined,
      getVectorRAGManager: () => ({ migrateLegacyRagStorage: async () => { throw new SDKError('refresh blip', 'RAG_DISCOVERY_INCOMPLETE', { report }); } }),
      getStorageManager: () => ({ migrateLegacyConversationLogs: async () => ({ sealed: 0, alreadySealed: 0, purged: [], failed: [] }) }),
    };
    const err = await caught((FabstirSDKCore.prototype as any).migrateToSealedStorage.call(fake));
    expect(err).toMatchObject({ code: 'MIGRATION_INCOMPLETE', details: { rag: report } });
  });
});

describe('V11 — the entry exports what its own signatures use', () => {
  test('DatabaseMetadata and DiscardUnreadable are exported types', () => {
    const src = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/export type \{[^}]*\bDatabaseMetadata\b[^}]*\}/);
    expect(src).toMatch(/export type \{[^}]*\bDiscardUnreadable\b[^}]*\}/);
  });
});
