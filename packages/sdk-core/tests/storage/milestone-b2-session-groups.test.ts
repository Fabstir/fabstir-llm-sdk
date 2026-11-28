// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Milestone B2 §4 answer 4 — session groups are sealed under opaque paths (1.39.24).
 *
 * New layout: `home/session-groups/v2/{deriveId('group', id)}`, sealed `{kind:'cbor', value: group}` under
 * `group/v1/{opaqueId}`. The legacy `home/session-groups/{address}/{id}.json` (EncryptionManager-encrypted) is still
 * read, and moved to the new layout on first touch.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';
import { isSealedBytes } from '../../src/storage/sealed/StorageSealer';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, sealer, encryptionManager as em } from '../helpers/sealed-fixtures';
import type { SessionGroup } from '../../src/types/session-groups.types';

/** One directory per identity on the seed (1.39.24 review): `v2/{deriveId('owner','storage')}/{deriveId('group', id)}`. */
const V2 = `home/session-groups/v2/${sealer().deriveId('owner', 'storage')}`;
const legacyPath = (id: string) => `home/session-groups/${ADDR}/${id}.json`;
const opaque = (id: string) => sealer().deriveId('group', id);
const v2Path = (id: string) => `${V2}/${opaque(id)}`;
const FAST = { waitForNetwork: true, verifyRetries: 1, verifyRetryDelayMs: 1 };

function group(id: string, name = `Group ${id}`): SessionGroup {
  return {
    id, name, description: 'secret plans', createdAt: new Date('2026-01-02T03:04:05Z'), updatedAt: new Date('2026-01-02T03:04:05Z'),
    owner: ADDR, linkedDatabases: ['db-1'], chatSessions: [], metadata: { color: 'blue' }, deleted: false,
  };
}

function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

let net: FakeS5Network;
let tab: FakeS5Tab;
let storage: SessionGroupStorage;

function fresh(): SessionGroupStorage {
  return new SessionGroupStorage(tab, SEED, ADDR, em(), sm(tab));
}

async function writeLegacy(g: SessionGroup): Promise<void> {
  const enc = em();
  await tab.fs.put(legacyPath(g.id), await enc.encryptForStorage(enc.getPublicKey(), g));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  net = new FakeS5Network();
  tab = net.tab();
  storage = fresh();
});

describe('save — the new layout', () => {
  test('the path holds no address and no group id', async () => {
    await storage.save(group('sg-alpha'), FAST);
    const files = net.filePaths();
    expect(files).toEqual([v2Path('sg-alpha')]);
    for (const p of files) {
      expect(p.toLowerCase()).not.toContain(ADDR.toLowerCase());
      expect(p).not.toContain('sg-alpha');
      expect(p).toMatch(/^home\/session-groups\/v2\/[0-9a-f]{32}\/[0-9a-f]{32}$/);
    }
  });

  test('the bytes on S5 are sealed under group/v1/{opaqueId}, octet-stream, and carry nothing in the clear', async () => {
    await storage.save(group('sg-alpha', 'Quarterly Board Pack'), FAST);
    const writes = net.writes.filter((w) => w.path.startsWith('home/session-groups'));
    expect(writes.length).toBeGreaterThan(0);
    const text = new TextDecoder('latin1');
    for (const w of writes) {
      expect(isSealedBytes(w.bytes)).toBe(true);
      const s = text.decode(w.bytes);
      for (const leak of ['sg-alpha', 'Quarterly Board Pack', 'secret plans', ADDR, ADDR.toLowerCase()]) expect(s).not.toContain(leak);
    }
    const meta = await tab.fs.getMetadata(v2Path('sg-alpha'));
    expect(meta).toMatchObject({ mediaType: 'application/octet-stream' });
    const opened = sealer().open(writes[0].bytes, `group/v1/${opaque('sg-alpha')}`);
    expect(opened).toMatchObject({ kind: 'cbor', value: { id: 'sg-alpha', name: 'Quarterly Board Pack' } });
  });

  test('a write that names nothing in the legacy directory: no legacy file is ever written', async () => {
    await storage.save(group('sg-1'), FAST);
    expect(net.writes.some((w) => w.path.includes(ADDR))).toBe(false);
  });
});

describe('load / loadAll find v2 groups', () => {
  test('load (not cached) opens the sealed v2 file', async () => {
    await storage.save(group('sg-1'), FAST);
    const loaded = await fresh().load('sg-1');
    expect(loaded).toMatchObject({ id: 'sg-1', name: 'Group sg-1', linkedDatabases: ['db-1'] });
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded.createdAt.getTime()).toBe(new Date('2026-01-02T03:04:05Z').getTime());
  });

  test('loadAll lists v2 and opens each file', async () => {
    await storage.save(group('sg-1'), FAST);
    await storage.save(group('sg-2'), FAST);
    const all = await fresh().loadAll();
    expect(all.map((g) => g.id).sort()).toEqual(['sg-1', 'sg-2']);
  });

  test('a missing group is still "Session group not found"', async () => {
    await expect(storage.load('nope')).rejects.toThrow('Session group not found: nope');
  });

  test('a v2 file under another group id (swapped) fails to open: SEALED_OPEN_FAILED, not the other group', async () => {
    await storage.save(group('sg-1'), FAST);
    const bytes = net.writes.find((w) => w.path === v2Path('sg-1'))!.bytes;
    await tab.fs.put(v2Path('sg-2'), bytes, { mediaType: 'application/octet-stream' });
    await expect(fresh().load('sg-2')).rejects.toMatchObject({ code: 'SEALED_OPEN_FAILED' });
  });
});

describe('legacy groups are read, migrated, and their legacy file deleted', () => {
  test('load: legacy → sealed v2 (read back), legacy file gone', async () => {
    await writeLegacy(group('sg-old', 'Old Group'));
    const loaded = await storage.load('sg-old');
    expect(loaded).toMatchObject({ id: 'sg-old', name: 'Old Group' });
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(net.filePaths()).toEqual([v2Path('sg-old')]);
    const bytes = new Uint8Array(net.blobs.get([...net.dirs.get(V2)!.values()].map((e: any) => e.hash)[0])!);
    expect(isSealedBytes(bytes)).toBe(true);
    // and a new instance reads it from v2 alone
    expect(await fresh().load('sg-old')).toMatchObject({ id: 'sg-old', name: 'Old Group' });
  });

  test('loadAll migrates every legacy group', async () => {
    await writeLegacy(group('sg-a'));
    await writeLegacy(group('sg-b'));
    const all = await storage.loadAll();
    expect(all.map((g) => g.id).sort()).toEqual(['sg-a', 'sg-b']);
    expect(net.filePaths().sort()).toEqual([v2Path('sg-a'), v2Path('sg-b')].sort());
  });

  test('a legacy group that cannot be decrypted is not deleted, and is reported (console.error), not silently dropped', async () => {
    await tab.fs.put(legacyPath('sg-bad'), { payload: { ciphertextHex: 'zz' }, storedAt: 'x', conversationId: 'y' });
    const err = vi.spyOn(console, 'error');
    const all = await storage.loadAll();
    expect(all).toEqual([]);
    expect(net.filePaths()).toEqual([legacyPath('sg-bad')]);
    expect(err.mock.calls.some((c) => String(c[0]).includes('sg-bad'))).toBe(true);
  });
});

describe('the union is de-duplicated by group id, v2 winning', () => {
  test('a group in both layouts: the v2 copy is returned once, and the legacy leftover is removed', async () => {
    await storage.save(group('sg-1', 'New Name'), FAST);
    await writeLegacy(group('sg-1', 'Old Name'));
    await writeLegacy(group('sg-2', 'Only Legacy'));
    const all = await fresh().loadAll();
    expect(all.map((g) => [g.id, g.name]).sort()).toEqual([['sg-1', 'New Name'], ['sg-2', 'Only Legacy']]);
    expect(net.filePaths().sort()).toEqual([v2Path('sg-1'), v2Path('sg-2')].sort());
  });

  test('load of a group in both layouts returns v2', async () => {
    await storage.save(group('sg-1', 'New Name'), FAST);
    await writeLegacy(group('sg-1', 'Old Name'));
    expect((await fresh().load('sg-1')).name).toBe('New Name');
  });
});

describe('review fixes (1.39.24): identities on one seed, and moves that race', () => {
  const at = (g: SessionGroup, iso: string) => ({ ...g, updatedAt: new Date(iso) });

  test('two identities on one S5 seed see only their own groups, and log no error for the other\'s', async () => {
    const { storageSealerFromSeed } = await import('../../src/storage/sealed/StorageSealer');
    const OTHER = '0x' + 'c'.repeat(40);
    const other = new StorageManager();
    Object.assign(other as any, { initialized: true, s5Client: tab, userAddress: OTHER, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, OTHER) });
    const theirs = new SessionGroupStorage(tab, SEED, OTHER, em(), other);
    await storage.save(group('sg-mine'), FAST);
    await theirs.save(group('sg-theirs'), FAST);
    const err = vi.spyOn(console, 'error');
    err.mockClear();
    expect((await fresh().loadAll()).map((g) => g.id)).toEqual(['sg-mine']);
    expect((await new SessionGroupStorage(tab, SEED, OTHER, em(), other).loadAll()).map((g) => g.id)).toEqual(['sg-theirs']);
    expect(err).not.toHaveBeenCalled();
  });

  test('loadAll: a legacy copy newer than the sealed one (an older SDK edited it after the move) is adopted, not deleted', async () => {
    await storage.save(at(group('sg-1', 'Moved'), '2026-03-01T00:00:00Z'), FAST);
    await writeLegacy(at(group('sg-1', 'Edited on an old SDK'), '2026-04-01T00:00:00Z'));
    const all = await fresh().loadAll();
    expect(all.map((g) => g.name)).toEqual(['Edited on an old SDK']);
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);
    expect((await fresh().load('sg-1')).name).toBe('Edited on an old SDK');
  });

  test('load: the newer legacy copy is adopted too', async () => {
    await storage.save(at(group('sg-1', 'Moved'), '2026-03-01T00:00:00Z'), FAST);
    await writeLegacy(at(group('sg-1', 'Edited on an old SDK'), '2026-04-01T00:00:00Z'));
    // The sealed copy opens, but load still looks for a newer legacy copy before answering
    expect((await fresh().load('sg-1')).name).toBe('Edited on an old SDK');
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);
  });

  test('a move that races another device: the sealed copy it wrote (and edited) is not overwritten by the older legacy one', async () => {
    await writeLegacy(at(group('sg-1', 'Legacy'), '2026-03-01T00:00:00Z'));
    const s = sm(tab);
    const racer = new SessionGroupStorage(net.tab(), SEED, ADDR, em(), sm(net.tab()));
    const real = s.getWithRetry.bind(s);
    let raced = false;
    vi.spyOn(s, 'getWithRetry').mockImplementation(async (path: string, ...rest: any[]) => {
      const v = await (real as any)(path, ...rest);
      if (!raced && path === legacyPath('sg-1')) {   // another device (no shared lock) moves it and edits it, between our reads
        raced = true;
        await (racer as any).saveUnlocked(at(group('sg-1', 'Edited in the other tab'), '2026-05-01T00:00:00Z'), FAST);
      }
      return v;
    });
    const loaded = await new SessionGroupStorage(tab, SEED, ADDR, em(), s).load('sg-1');
    expect(raced).toBe(true);
    expect(loaded.name).toBe('Edited in the other tab');
    expect((await fresh().load('sg-1')).name).toBe('Edited in the other tab');
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);
  });

  test('a legacy file an older SDK rewrites during the move (newer than what moved) is left, and adopted on the next load', async () => {
    await writeLegacy(at(group('sg-1', 'Legacy'), '2026-03-01T00:00:00Z'));
    const s = sm(tab);
    const real = s.getWithRetry.bind(s);
    let legacyReads = 0;
    vi.spyOn(s, 'getWithRetry').mockImplementation(async (path: string, ...rest: any[]) => {
      if (path === legacyPath('sg-1') && ++legacyReads === 2) {   // just before the delete: an old-SDK tab edits it
        await writeLegacy(at(group('sg-1', 'Edited on an old SDK'), '2026-06-01T00:00:00Z'));
      }
      return (real as any)(path, ...rest);
    });
    expect((await new SessionGroupStorage(tab, SEED, ADDR, em(), s).load('sg-1')).name).toBe('Legacy');
    expect(net.filePaths().sort()).toEqual([legacyPath('sg-1'), v2Path('sg-1')].sort());
    expect((await fresh().load('sg-1')).name).toBe('Edited on an old SDK');
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);
  });

  test('two tabs moving the same legacy group take turns: the second finds it moved and does not write (round 2)', async () => {
    await writeLegacy(at(group('sg-1', 'Legacy'), '2026-03-01T00:00:00Z'));
    const shared = sm(tab);   // one coherence (in-process lock) for both "tabs"
    const a = new SessionGroupStorage(tab, SEED, ADDR, em(), shared);
    const b = new SessionGroupStorage(net.tab(), SEED, ADDR, em(), shared);
    const before = net.writes.length;
    const [ga, gb] = await Promise.all([a.load('sg-1'), b.load('sg-1')]);
    expect([ga.name, gb.name]).toEqual(['Legacy', 'Legacy']);
    expect(net.writes.slice(before).filter((w) => w.path === v2Path('sg-1'))).toHaveLength(1);
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);
  });

  test('a save waits for a move of the same group: the move cannot write the older legacy copy over it (round 3)', async () => {
    await writeLegacy(at(group('sg-1', 'Legacy'), '2026-03-01T00:00:00Z'));
    const shared = sm(tab);
    const mover = new SessionGroupStorage(tab, SEED, ADDR, em(), shared);
    const editor = new SessionGroupStorage(tab, SEED, ADDR, em(), shared);
    const real = shared.getWithRetry.bind(shared);
    let edit: Promise<void> | undefined;
    vi.spyOn(shared, 'getWithRetry').mockImplementation(async (path: string, ...rest: any[]) => {
      try {
        return await (real as any)(path, ...rest);
      } finally {
        // just after the move's fresh sealed re-read (it found none), another tab saves an edit
        if (!edit && path === v2Path('sg-1') && rest[0]?.fresh) {
          edit = editor.save(at(group('sg-1', 'Edited'), '2026-06-01T00:00:00Z'), FAST);
          await new Promise((r) => setTimeout(r, 20));   // without the lock, the edit lands before the move writes
        }
      }
    });
    await mover.load('sg-1');
    await edit;
    expect((await fresh().load('sg-1')).name).toBe('Edited');
  });
});

describe('delete and exists cover both layouts', () => {
  test('exists: v2, legacy, neither', async () => {
    await storage.save(group('sg-new'), FAST);
    await writeLegacy(group('sg-old'));
    const s = fresh();
    expect(await s.exists('sg-new')).toBe(true);
    expect(await s.exists('sg-old')).toBe(true);
    expect(await s.exists('sg-none')).toBe(false);
  });

  test('delete removes the legacy copy first: a failed second delete cannot bring the group back (round 2)', async () => {
    await storage.save(group('sg-1'), FAST);
    await writeLegacy(group('sg-1'));
    const s = sm(tab);
    const real = s.deleteWithRetry.bind(s);
    vi.spyOn(s, 'deleteWithRetry').mockImplementation(async (path: string) => {
      if (path === v2Path('sg-1')) throw new Error('network');
      return real(path);
    });
    await expect(new SessionGroupStorage(tab, SEED, ADDR, em(), s).delete('sg-1')).rejects.toThrow('network');
    expect(net.filePaths()).toEqual([v2Path('sg-1')]);   // the legacy copy is gone; a retry finishes the delete
  });

  test('delete removes the group at both paths', async () => {
    await storage.save(group('sg-1'), FAST);
    await writeLegacy(group('sg-1'));
    await writeLegacy(group('sg-2'));
    await storage.delete('sg-1');
    expect(net.filePaths()).toEqual([legacyPath('sg-2')]);
    await storage.delete('sg-2');
    expect(net.filePaths()).toEqual([]);
    expect(await storage.exists('sg-1')).toBe(false);
    await expect(fresh().load('sg-1')).rejects.toThrow('Session group not found');
  });
});

describe('the sealer comes from the StorageManager', () => {
  test('no StorageManager: save, load and loadAll throw STORAGE_SEALER_MISSING', async () => {
    const bare = new SessionGroupStorage(tab, SEED, ADDR, em());
    await expect(bare.save(group('sg-1'), FAST)).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    await expect(bare.load('sg-1')).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    await expect(bare.loadAll()).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    expect(net.writes).toEqual([]);
  });

  test('a StorageManager without a sealer: STORAGE_SEALER_MISSING', async () => {
    const s = sm(tab);
    (s as any).sealer = undefined;
    await expect(new SessionGroupStorage(tab, SEED, ADDR, em(), s).save(group('sg-1'), FAST)).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
  });

  test('capability flag sealedSessionGroups', () => {
    expect((SDK_CAPABILITIES as any).sealedSessionGroups).toBe(true);
  });
});
