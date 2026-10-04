// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 16 — storage-level class (plan §29 JJ1): a deleted legacy database stays deleted.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { FakeS5Network, FakeS5Tab } from '../../helpers/fake-s5';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';
import { browserOrigin } from '../../helpers/fake-locks';
import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { HEAD_TRUST_MS, __resetInProcessCoherenceForTests, type RagCoherence } from '../../../src/storage/sealed/rag-coherence';

const legacyDir = (name: string) => `home/vector-databases/${ADDR}/${name}`;
const legacyManifest = (name: string, docIds: string[]) => ({
  name, owner: ADDR, vectorCount: 0, storageSizeBytes: 0, created: 1, lastAccessed: 1, updated: 1,
  chunks: [], chunkCount: 0, folderPaths: [], pendingDocuments: docIds.map((id) => ({ id })),
});

function store(tab: FakeS5Tab, coherence: RagCoherence) {
  return new S5VectorStore({ s5Client: tab as any, userAddress: ADDR, encryptionManager: em(), pathToHash: tab.pathToHash, coherence } as any);
}

async function seedLegacy(net: FakeS5Network, name: string) {
  const t = net.tab();
  await t.fs.put(`${legacyDir(name)}/manifest.json`, legacyManifest(name, ['d1']));
  await t.fs.put(`${legacyDir(name)}/documents/d1.txt`, 'private notes');
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('JJ1 — a deleted legacy database stays deleted, whatever its tombstone’s age', () => {
  test('an outdated tab rewrites its cached manifest after the trust window: not listed, not opened, purged by the migration', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net, 'R');
    await store(net.tab(), origin()).deleteDatabase('R');
    net.advance(HEAD_TRUST_MS + 1_000);
    await net.tab().fs.put(`${legacyDir('R')}/manifest.json`, legacyManifest('R', ['d1'])); // a ≤ 1.38.9 tab's cache
    const t = store(net.tab(), origin());
    expect((await t.listDatabases()).map((d) => d.databaseName)).toEqual([]);
    expect(await t.getDatabase('R')).toBeNull();
    expect((await t.migrateLegacyStorage()).databases[0]).toMatchObject({ name: 'R', status: 'purged-after-delete' });
    expect(net.filePaths().filter((p) => p.startsWith(legacyDir('R')))).toEqual([]);
  });

  test('a database re-created under that name is a new one: listed and usable, inside and after the window', async () => {
    const net = new FakeS5Network();
    const origin = browserOrigin({ now: () => net.now });
    await seedLegacy(net, 'R');
    await store(net.tab(), origin()).deleteDatabase('R');
    await store(net.tab(), origin()).createDatabase({ name: 'R', owner: ADDR });
    expect((await store(net.tab(), origin()).listDatabases()).map((d) => d.databaseName)).toEqual(['R']);
    net.advance(HEAD_TRUST_MS + 1_000);
    const t = store(net.tab(), origin());
    expect((await t.listDatabases()).map((d) => d.databaseName)).toEqual(['R']);
    await t.addPendingDocument('R', { id: 'd2' });
    expect(await store(net.tab(), origin()).getDatabase('R')).not.toBeNull();
  });

  test('re-created on ANOTHER device, while this one keeps its tombstone: listed and opened here too', async () => {
    const net = new FakeS5Network();
    const here = browserOrigin({ now: () => net.now });
    const there = browserOrigin({ now: () => net.now });               // another device: its own heads
    await seedLegacy(net, 'R');
    await store(net.tab(), here()).deleteDatabase('R');
    await store(net.tab(), there()).createDatabase({ name: 'R', owner: ADDR });
    net.advance(HEAD_TRUST_MS + 1_000);
    const t = store(net.tab(), here());
    expect((await t.listDatabases()).map((d) => d.databaseName)).toEqual(['R']);
    expect(await t.getDatabase('R')).not.toBeNull();
  });
});
