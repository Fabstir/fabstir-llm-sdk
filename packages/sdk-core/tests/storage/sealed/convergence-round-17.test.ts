// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 17 — storage-level pin (plan §30 KK3): JJ1's unreadable-sealed delete.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em, sealer } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { HEAD_TRUST_MS, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const sealedDir = (name: string) => `home/rag/v1/${sealer().deriveId('db', name)}`;
const legacyManifest = (name: string, docIds: string[]) => ({
  name, owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});
const store = (tab: FakeS5Tab, coherence: RagCoherence) =>
  new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence } as any);

beforeEach(() => __resetInProcessCoherenceForTests());

describe('KK3 — JJ1 for a sealed database whose manifest will not open', () => {
  test('deleted; an outdated tab rewrites the legacy manifest after the window: still deleted, purged by the migration', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await store(net.tab(), origin()).createDatabase({ name: 'R', owner: ADDR });
    const unopenable = sealer().seal({ kind: 'cbor', value: { name: 'R' } }, 'rag/v1/another-context/manifest');
    await net.tab().fs.put(`${sealedDir('R')}/manifest`, unopenable, { mediaType: 'application/octet-stream' });
    await store(net.tab(), origin()).deleteDatabase('R');
    net.advance(HEAD_TRUST_MS + 1_000);
    await net.tab().fs.put(`${legacyDir('R')}/manifest.json`, legacyManifest('R', ['d1'])); // a ≤ 1.38.9 tab's cache
    const t = store(net.tab(), origin());
    expect((await t.listDatabases()).map((d) => d.databaseName)).toEqual([]);
    expect((await t.migrateLegacyStorage()).databases.map((d) => [d.name, d.status])).toEqual([['R', 'purged-after-delete']]);
  });
});
