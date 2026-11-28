// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-MILESTONE-B2 (sdk-core 1.39.24), StorageManager part: opaque conversation-log paths (D41), sealed user
 * settings (D34), no plaintext writers left (D35, store({encrypt:false})), and DocumentManager without its own S5 (§4.6).
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';

vi.mock('@julesl23/s5js', () => ({ isS5RegistryUnavailableError: () => false,
  S5: { create: async () => { throw new Error('S5 offline in unit test'); } } }));
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { StorageManager } from '../../src/managers/StorageManager';
import { DocumentManager } from '../../src/managers/DocumentManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { ADDR, sealer } from '../helpers/sealed-fixtures';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const legacyPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const opaque = (id: string) => sealer().deriveId('conv', id);
const v2Path = (id: string) => `home/sessions/v2/${sealer().deriveId('owner', 'storage')}/${opaque(id)}/log`;

function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}
const conversation = (id: string, messages: any[] = []) => ({ id, messages, metadata: { model: 'm', jobId: '7' }, createdAt: 1, updatedAt: 2 });
const msg = (content: string) => ({ role: 'user', content, timestamp: 1 });
/** A legacy sealed log, as 1.39.0–1.39.23 wrote it. */
/** Gone: no file, or no directory at all (s5js throws "does not exist" for a removed directory). */
async function absent(tab: FakeS5Tab, path: string): Promise<boolean> {
  try { return (await tab.fs.get(path, { fresh: true })) === undefined; } catch (e: any) { return /does not exist/.test(e?.message ?? ''); }
}
async function seedLegacySealed(tab: FakeS5Tab, id: string, messages: any[]) {
  const bytes = sealer().seal({ kind: 'cbor', value: { revision: 1, conversation: conversation(id, messages) } }, `conv/v1/${id}`);
  await tab.fs.put(legacyPath(id), bytes, { mediaType: 'application/octet-stream' });
}

beforeEach(() => __resetInProcessCoherenceForTests());

describe('D41: opaque conversation-log paths', () => {
  test('a saved log lands at home/sessions/v2/{opaque}/log: no address and no id in the path, sealed', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveConversation(conversation('41', [msg('custody hearing')]) as any);
    const w = net.writes.find((x) => x.path.startsWith('home/sessions/'))!;
    expect(w.path).toBe(v2Path('41'));
    expect(w.path).not.toContain(ADDR);
    expect(w.path).not.toContain('41/');
    expect(sealer().isSealed(w.bytes)).toBe(true);
    expect((await sm(net.tab()).loadConversation('41'))?.messages[0].content).toBe('custody hearing');
  });

  test('a legacy log is read; the next write moves it to v2 and removes the legacy file', async () => {
    const net = new FakeS5Network();
    const tab = net.tab();
    await seedLegacySealed(tab, '42', [msg('old')]);
    const s = sm(net.tab());
    expect((await s.loadConversation('42'))?.messages.map((m: any) => m.content)).toEqual(['old']);
    await s.appendMessage('42', msg('new') as any);
    expect((await sm(net.tab()).loadConversation('42'))?.messages.map((m: any) => m.content)).toEqual(['old', 'new']);
    expect(await absent(net.tab(), legacyPath('42'))).toBe(true);
    expect(net.writes.some((x) => x.path === v2Path('42'))).toBe(true);
  });

  test('a legacy plaintext log is read and moved sealed', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(legacyPath('43'), conversation('43', [msg('plain')]));
    const s = sm(net.tab());
    await s.appendMessage('43', msg('more') as any);
    const back = await sm(net.tab()).loadConversation('43');
    expect(back?.messages.map((m: any) => m.content)).toEqual(['plain', 'more']);
    expect(await absent(net.tab(), legacyPath('43'))).toBe(true);
  });

  test('the migration moves every legacy log to v2 (sealed or plaintext), reports `moved`, and is idempotent', async () => {
    const net = new FakeS5Network();
    await seedLegacySealed(net.tab(), '50', [msg('a')]);
    await net.tab().fs.put(legacyPath('51'), conversation('51', [msg('b')]));
    const s = sm(net.tab());
    const r1 = await s.migrateLegacyConversationLogs();
    expect(r1.failed).toEqual([]);
    expect(r1.moved).toBe(2);
    for (const [id, content] of [['50', 'a'], ['51', 'b']]) {
      expect((await sm(net.tab()).loadConversation(id))?.messages[0].content).toBe(content);
      expect(await absent(net.tab(), legacyPath(id))).toBe(true);
    }
    const r2 = await sm(net.tab()).migrateLegacyConversationLogs();
    expect(r2.moved).toBe(0);
    expect(r2.failed).toEqual([]);
  });

  test('listConversations lists sealed v2 logs and not-yet-moved legacy ones, once each (it listed no sealed log before)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('60', [msg('x')]) as any);
    await seedLegacySealed(net.tab(), '61', [msg('y')]);
    const list = await sm(net.tab()).listConversations();
    expect(list.map((c) => c.conversationId).sort()).toEqual(['60', '61']);
    expect(list.every((c) => c.isEncrypted)).toBe(true);
    const sessions = await sm(net.tab()).listSessions();
    expect(sessions.map((x) => x.id).sort()).toEqual(['60', '61']);
  });

  test('a leftover legacy copy (its delete failed) does not undo later metadata at the migration (round 2)', async () => {
    const net = new FakeS5Network();
    const old = { id: 'c1', messages: [msg('hi')], metadata: { status: 'active', title: 'old' }, createdAt: 1, updatedAt: 2 };
    await net.tab().fs.put(legacyPath('c1'), sealer().seal({ kind: 'cbor', value: { revision: 1, conversation: old } }, 'conv/v1/c1'), { mediaType: 'application/octet-stream' });
    const tab = net.tab();
    const del = tab.fs.delete.bind(tab.fs);
    let fail = true;
    (tab.fs as any).delete = async (p: string) => { if (fail && p === legacyPath('c1')) { fail = false; throw new Error('network'); } return del(p); };
    await sm(tab).updateConversationMetadata('c1', { status: 'completed', title: 'new' });
    const report = await sm(net.tab()).migrateLegacyConversationLogs();
    expect(report.failed).toEqual([]);
    expect(report.moved).toBe(0);   // moved already: the leftover is only dropped
    const back = await sm(net.tab()).loadConversation('c1');
    expect(back?.metadata).toMatchObject({ status: 'completed', title: 'new' });
    expect(back?.messages.map((m: any) => m.content)).toEqual(['hi']);
    expect(await absent(net.tab(), legacyPath('c1'))).toBe(true);
  });

  test('a legacy copy an outdated tab changed after the move only in metadata (newer) is adopted, not deleted (round 2)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation({ ...conversation('c2', [msg('hi')]), updatedAt: 10 } as any);
    // an outdated tab renames it at the legacy path, later
    await net.tab().fs.put(legacyPath('c2'), { ...conversation('c2', [msg('hi')]), metadata: { model: 'm', jobId: '7', title: 'renamed' }, updatedAt: Date.now() + 60_000 });
    await sm(net.tab()).migrateLegacyConversationLogs();
    expect((await sm(net.tab()).loadConversation('c2'))?.metadata).toMatchObject({ title: 'renamed' });
    expect(await absent(net.tab(), legacyPath('c2'))).toBe(true);
  });

  test('a legacy copy that adds a message but is the older write gives its message, not its metadata (round 2)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('c4', [msg('hi')]) as any);
    await s.updateConversationMetadata('c4', { title: 'current' });
    await net.tab().fs.put(legacyPath('c4'), { ...conversation('c4', [msg('hi'), { role: 'user', content: 'from an old tab', timestamp: 5 }]), metadata: { title: 'stale' }, updatedAt: 3 });
    await sm(net.tab()).migrateLegacyConversationLogs();
    const back = await sm(net.tab()).loadConversation('c4');
    expect(back?.messages.map((m: any) => m.content)).toEqual(['hi', 'from an old tab']);
    expect(back?.metadata).toMatchObject({ title: 'current' });
  });

  test('a message removed after the move does not come back from a leftover legacy copy (round 3)', async () => {
    const net = new FakeS5Network();
    const conv = { id: 'c5', messages: [msg('keep'), { role: 'user', content: 'secret', timestamp: 2 }], metadata: {}, createdAt: 1, updatedAt: 2 };
    await net.tab().fs.put(legacyPath('c5'), sealer().seal({ kind: 'cbor', value: { revision: 1, conversation: conv } }, 'conv/v1/c5'), { mediaType: 'application/octet-stream' });
    const tab = net.tab();
    const del = tab.fs.delete.bind(tab.fs);
    let fail = true;
    (tab.fs as any).delete = async (p: string) => { if (fail && p === legacyPath('c5')) { fail = false; throw new Error('network'); } return del(p); };
    const s = sm(tab);
    await s.updateConversationMetadata('c5', { title: 't' });   // the move; its legacy delete fails
    const cur = (await s.loadConversation('c5'))!;
    await s.saveConversation({ ...cur, messages: cur.messages.filter((m: any) => m.content !== 'secret'), updatedAt: Date.now() } as any);
    await sm(net.tab()).migrateLegacyConversationLogs();
    expect((await sm(net.tab()).loadConversation('c5'))!.messages.map((m: any) => m.content)).toEqual(['keep']);
    expect(await absent(net.tab(), legacyPath('c5'))).toBe(true);
  });

  test('a covered legacy copy that is newer is not dropped by the save-time cleanup either (round 2)', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(legacyPath('c3'), { ...conversation('c3', [msg('hi')]), metadata: { title: 'theirs' }, updatedAt: Date.now() + 60_000 });
    const s = sm(net.tab());
    const read = await (s as any)._readLog('c3');
    // the moved copy, older than what is at the legacy path: the cleanup keeps the legacy copy for the migration
    expect(await (s as any)._dropLegacyCopyIfCovered('c3', { ...read.conversation, updatedAt: 5 }, [])).toBe(false);
    expect(await absent(net.tab(), legacyPath('c3'))).toBe(false);
  });

  test('clearAll removes the v2 logs too', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('70') as any);
    await s.clearAll();
    expect(await sm(net.tab()).loadConversation('70')).toBeNull();
  });
});

const settingsAt = () => `home/user/v2/${sealer().deriveId('owner', 'storage')}/settings`;

describe('D34: sealed user settings', () => {
  const settings = { version: 2, lastUpdated: 1, selectedModel: 'llama', preferredPaymentToken: 'USDC', theme: 'dark', lastHostAddress: '0x' + '1'.repeat(40) } as any;

  test('saveUserSettings writes a sealed envelope at this identity\'s settings path; getUserSettings opens it', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveUserSettings(settings);
    const w = net.writes.find((x) => x.path === settingsAt())!;
    expect(w.path).not.toContain(ADDR);
    expect(sealer().isSealed(w.bytes)).toBe(true);
    expect(Buffer.from(w.bytes).toString('latin1')).not.toContain('1111111111');
    const back = await sm(net.tab()).getUserSettings();
    expect(back).toMatchObject({ selectedModel: 'llama', lastHostAddress: settings.lastHostAddress });
  });

  test('legacy plaintext settings are read, migrated as before, sealed at this identity\'s path, and the plaintext removed', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put('home/user/settings.json', settings);
    const s = sm(net.tab());
    expect(await s.getUserSettings()).toMatchObject({ selectedModel: 'llama' });
    const raw = await net.tab().fs.get(settingsAt(), { fresh: true });
    expect(raw instanceof Uint8Array && sealer().isSealed(raw)).toBe(true);
    expect(await net.tab().fs.get('home/user/settings.json', { fresh: true })).toBeUndefined();
  });

  test('two identities on one S5 seed keep their own settings and logs (1.39.24 review)', async () => {
    const { storageSealerFromSeed } = await import('../../src/storage/sealed/StorageSealer');
    const { SEED } = await import('../helpers/sealed-fixtures');
    const OTHER = '0x' + 'b'.repeat(40);
    const net = new FakeS5Network();
    const a = sm(net.tab());
    const b = new StorageManager();
    Object.assign(b as any, { initialized: true, s5Client: net.tab(), userAddress: OTHER, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, OTHER) });
    await a.saveConversation(conversation('A1', [msg('a')]) as any);
    await b.saveConversation(conversation('B1', [msg('b')]) as any);
    await a.saveUserSettings(settings);
    await b.saveUserSettings({ ...settings, selectedModel: 'other' });
    expect((await a.listSessions()).map((x) => x.id)).toEqual(['A1']);
    expect((await b.listSessions()).map((x) => x.id)).toEqual(['B1']);
    expect(await a.getUserSettings()).toMatchObject({ selectedModel: 'llama' });
    (b as any).settingsCache = null;
    expect(await b.getUserSettings()).toMatchObject({ selectedModel: 'other' });
    await a.clearAll();
    expect(await b.loadConversation('B1')).not.toBeNull();
  });

  const OTHER_ID = '0x' + 'b'.repeat(40);
  const smAs = async (tab: FakeS5Tab, addr: string) => {
    const { storageSealerFromSeed } = await import('../../src/storage/sealed/StorageSealer');
    const { SEED } = await import('../helpers/sealed-fixtures');
    const x = new StorageManager();
    Object.assign(x as any, { initialized: true, s5Client: tab, userAddress: addr, connectionStatus: 'connected', sealer: storageSealerFromSeed(SEED, addr) });
    return x;
  };

  test('a leftover of this identity\'s own move (its delete failed: same lastUpdated) is removed on a later read (round 2/3)', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put('home/user/settings.json', { ...settings, lastUpdated: 10 });
    const tab = net.tab();
    const del = tab.fs.delete.bind(tab.fs);
    let fail = true;
    (tab.fs as any).delete = async (p: string) => { if (fail && p === 'home/user/settings.json') { fail = false; throw new Error('network'); } return del(p); };
    expect(await sm(tab).getUserSettings()).toMatchObject({ selectedModel: 'llama' });
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(false);
    expect(await sm(net.tab()).getUserSettings()).toMatchObject({ selectedModel: 'llama' });
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(true);
  });

  test('with sealed settings, the shared plaintext file is not this identity\'s to take: neither adopted nor deleted, newer or older (round 3)', async () => {
    for (const lastUpdated of [99, 5]) {
      const net = new FakeS5Network();
      await sm(net.tab()).saveUserSettings({ ...settings, lastUpdated: 50 });
      await net.tab().fs.put('home/user/settings.json', { ...settings, selectedModel: 'B-model', lastUpdated });
      expect(await sm(net.tab()).getUserSettings()).toMatchObject({ selectedModel: 'llama' });
      // another identity on the seed, still to upgrade, keeps its settings
      expect(await (await smAs(net.tab(), OTHER_ID)).getUserSettings()).toMatchObject({ selectedModel: 'B-model' });
    }
  });

  test('a plaintext file rewritten (later) between the read and its delete is left for the next read (round 2)', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put('home/user/settings.json', { ...settings, lastUpdated: 10 });
    const tab = net.tab();
    const get = tab.fs.get.bind(tab.fs);
    let reads = 0;
    (tab.fs as any).get = async (p: string, o?: any) => {
      if (p === 'home/user/settings.json' && ++reads === 2) await net.tab().fs.put(p, { ...settings, selectedModel: 'mid', lastUpdated: 20 });
      return get(p, o);
    };
    expect(await sm(tab).getUserSettings()).toMatchObject({ selectedModel: 'llama' });
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(false);
  });

  test('clearUserSettings removes the plaintext file first when it is this identity\'s leftover: a failed cleared-record write cannot bring old settings back (round 2/4)', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveUserSettings(settings);
    await net.tab().fs.put('home/user/settings.json', settings);   // same lastUpdated: this identity's leftover
    const tab = net.tab();
    const put = tab.fs.put.bind(tab.fs);
    (tab.fs as any).put = async (p: string, ...r: any[]) => { if (p === settingsAt()) throw new Error('network'); return (put as any)(p, ...r); };
    await expect(sm(tab).clearUserSettings()).rejects.toMatchObject({ code: 'STORAGE_CLEAR_ERROR' });
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(true);
  });

  test('clearUserSettings leaves another identity\'s plaintext file (round 3)', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveUserSettings({ ...settings, lastUpdated: 50 });
    await net.tab().fs.put('home/user/settings.json', { ...settings, selectedModel: 'B-model', lastUpdated: 7 });
    await sm(net.tab()).clearUserSettings();
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(false);
  });

  test('Reset Preferences leaves a sealed cleared record: the next read adopts no shared file — another identity\'s or a stale one (round 4)', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveUserSettings({ ...settings, lastUpdated: 100 });
    await net.tab().fs.put('home/user/settings.json', { ...settings, selectedModel: 'B-model', lastUpdated: 50 });
    await sm(net.tab()).clearUserSettings();
    expect(await sm(net.tab()).getUserSettings()).toBeNull();
    expect(await (await smAs(net.tab(), OTHER_ID)).getUserSettings()).toMatchObject({ selectedModel: 'B-model' });
  });

  test('an adopted file whose delete failed is still removed after the settings were edited (round 4)', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put('home/user/settings.json', { ...settings, lastUpdated: 10 });
    const tab = net.tab();
    const del = tab.fs.delete.bind(tab.fs);
    let fails = 2;   // the adoption's delete, and the one the update's fresh read tries
    (tab.fs as any).delete = async (p: string) => { if (fails > 0 && p === 'home/user/settings.json') { fails--; throw new Error('network'); } return del(p); };
    const s = sm(tab);
    await s.getUserSettings();                                     // adopted; its delete fails
    await s.updateUserSettings({ selectedModel: 'edited' });        // lastUpdated moves on
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(false);
    expect(await sm(net.tab()).getUserSettings()).toMatchObject({ selectedModel: 'edited' });
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(true);
  });

  test('Reset Preferences works when the sealed settings do not open (round 4)', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(settingsAt(), sealer().seal({ kind: 'cbor', value: {} }, 'another/context'), { mediaType: 'application/octet-stream' });
    await net.tab().fs.put('home/user/settings.json', { ...settings, selectedModel: 'B-model', lastUpdated: 5 });
    await sm(net.tab()).clearUserSettings();
    expect(await sm(net.tab()).getUserSettings()).toBeNull();
    expect(await absent(net.tab(), 'home/user/settings.json')).toBe(false);   // not provably this identity's
  });

  test('an update reads fresh: a tab holding cached settings does not undo another tab\'s reset (round 5)', async () => {
    const net = new FakeS5Network();
    const x = sm(net.tab());
    await x.saveUserSettings({ ...settings, lastUpdated: 10 });
    await x.getUserSettings();                         // cached in tab X
    await sm(net.tab()).clearUserSettings();          // tab Y resets
    await x.updateUserSettings({ lastHostAddress: '0x' + '2'.repeat(40) } as any);
    expect(await sm(net.tab()).getUserSettings()).toMatchObject({ selectedModel: '', lastHostAddress: '0x' + '2'.repeat(40) });
  });

  test('re-initializing with another address drops the cached settings (round 5)', async () => {
    const s = new StorageManager();
    (s as any).settingsCache = { data: { selectedModel: 'A' }, timestamp: Date.now() };
    (s as any).settingsLegacyStamp = 10;
    await s.initialize('seed words', '0x' + 'c'.repeat(40)).catch(() => {});
    expect((s as any).settingsCache).toBeNull();
    expect((s as any).settingsLegacyStamp).toBeUndefined();
  });

  test('without a sealer settings are not written (fail closed)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    (s as any).sealer = undefined;
    await expect(s.saveUserSettings(settings)).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    expect(net.writes.filter((x) => x.path.startsWith('home/user/'))).toHaveLength(0);
  });
});

describe('D35: no plaintext writer remains', () => {
  test('the dead plaintext and wrapper methods are gone', () => {
    const p: any = StorageManager.prototype;
    for (const m of ['storeExchange', 'updateSessionSummary', 'getRecentExchanges', 'saveConversationPlaintext', 'loadConversationPlaintext',
      'saveConversationEncrypted', 'loadConversationEncrypted', 'loadConversationWithMetadata', 'saveHierarchy', 'loadHierarchy']) {
      expect(p[m], m).toBeUndefined();
    }
  });

  test('store({ encrypt: false }) is refused before anything is written', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await expect(s.store({ a: 1 }, { encrypt: false })).rejects.toMatchObject({ code: 'STORAGE_PLAINTEXT_REFUSED' });
    expect(net.writes).toHaveLength(0);
  });
});

describe('§4.6: DocumentManager has no S5 of its own', () => {
  test('initialize opens no S5 client and holds no sealer; uploads stay in the instance', async () => {
    const dm: any = new DocumentManager();
    await dm.initialize();
    expect(dm.s5Client).toBeUndefined();
    expect(dm.sealer).toBeUndefined();
    const file = new File(['hello world text'], 'a.txt', { type: 'text/plain' });
    const r = await dm.uploadDocument(file, 'db1');
    expect(r).not.toHaveProperty('s5Path');
    await expect(dm.extractText(r.documentId, 'db1')).resolves.toContain('hello world');
  });
});

describe('flags', () => {
  test('sealedSettings, opaqueConversationLogs', () => {
    expect((SDK_CAPABILITIES as any).sealedSettings).toBe(true);
    expect((SDK_CAPABILITIES as any).opaqueConversationLogs).toBe(true);
  });
});
