// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 6 — the conversation log, sealed at `_saveConversationInternal` (plan D19, D20, D25, D30b; review M7).
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// No network in unit tests: S5.create fails at once, so initialize() returns early — after setting the sealer.
vi.mock('@julesl23/s5js', () => ({ isS5RegistryUnavailableError: () => false, // beta.56's root export (plan §19 Z1)
  S5: { create: async () => { throw new Error('S5 offline in unit test'); } } }));
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { StorageManager } from '../../src/managers/StorageManager';
import { SEED, ADDR, sealer } from '../helpers/sealed-fixtures';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const RAG_CONTEXT = 'Context: the custody hearing moved to Friday';
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;

function sm(tab: FakeS5Tab, withSealer = true): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected' });
  if (withSealer) Object.assign(s as any, { sealer: sealer() });
  return s;
}

const conversation = (id: string, messages: any[] = []) => ({
  id, messages, metadata: { model: 'm', jobId: '7', status: 'active' }, createdAt: 1, updatedAt: 1,
});
const msg = (role: 'user' | 'assistant', content: string) => ({ role, content, timestamp: 1 });

beforeEach(() => __resetInProcessCoherenceForTests());

describe('every writer seals (D19)', () => {
  test('saveConversation writes a sealed envelope at conversation.json; loadConversation opens it', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('41', [msg('user', `${RAG_CONTEXT}\nQuestion: when?`)]) as any);
    expect(net.writes).toHaveLength(1);
    expect(net.writes[0].path).toBe(logPath('41'));
    expect(sealer().isSealed(net.writes[0].bytes)).toBe(true);
    expect(Buffer.from(net.writes[0].bytes).toString('latin1')).not.toContain('custody');
    const back = await sm(net.tab()).loadConversation('41');
    expect(back?.messages[0].content).toContain('custody hearing');
  });

  test('appendMessage seals every write and keeps the order', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('41') as any);
    await s.appendMessage('41', msg('user', 'q1') as any);
    await s.appendMessage('41', msg('assistant', 'a1') as any);
    expect(net.writes.every((w) => sealer().isSealed(w.bytes))).toBe(true);
    expect((await s.loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['q1', 'a1']);
  });

  test('without a sealer nothing is written: STORAGE_SEALER_MISSING (fail closed)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab(), false);
    await expect(s.saveConversation(conversation('41') as any)).rejects.toMatchObject({ code: 'STORAGE_SEALER_MISSING' });
    await expect(s.appendMessage('41', msg('user', 'q') as any)).rejects.toThrow();
    expect(net.writes).toHaveLength(0);
  });

  test('initialize() derives the sealer from the seed it is given (same key as the SDK\'s EncryptionManager)', async () => {
    const s = new StorageManager();
    await s.initialize(SEED, ADDR).catch(() => undefined); // S5 may be unreachable here; the sealer is set first
    const theirs = (s as any).sealer;
    expect(theirs).toBeDefined();
    expect(sealer().open(theirs.seal({ kind: 'text', value: 'x' }, 'c'), 'c').value).toBe('x');
  });

  test('sdk.loadConversation returns the sealed log, never a stale plaintext wrapper beside it (D30b)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    await s.saveConversation(conversation('9', [msg('user', 'current')]) as any);
    await net.tab().fs.put(`home/sessions/${ADDR}/9/conversation-plaintext.json`, { encrypted: false, conversation: conversation('9', [msg('user', 'stale')]) });
    const loaded = await (FabstirSDKCore.prototype as any).loadConversation.call({ getStorageManager: () => s }, '9');
    expect(loaded.messages[0].content).toBe('current');
  });

  test('sdk.saveConversation / sdk.loadConversation go through the sealed log (D30b)', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    const fake = { getStorageManager: () => s };
    await (FabstirSDKCore.prototype as any).saveConversation.call(fake, conversation('9', [msg('user', 'hi')]));
    expect(sealer().isSealed(net.writes[0].bytes)).toBe(true);
    expect((await (FabstirSDKCore.prototype as any).loadConversation.call(fake, '9')).messages[0].content).toBe('hi');
  });
});

describe('legacy logs and outdated tabs', () => {
  test('a legacy plaintext log still loads, and the next append re-saves it sealed', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put(logPath('41'), conversation('41', [msg('user', 'old')]));
    const s = sm(net.tab());
    expect((await s.loadConversation('41'))?.messages[0].content).toBe('old');
    await s.appendMessage('41', msg('assistant', 'new') as any);
    const last = net.writes[net.writes.length - 1];
    expect(sealer().isSealed(last.bytes)).toBe(true);
    expect((await s.loadConversation('41'))?.messages.map((m: any) => m.content)).toEqual(['old', 'new']);
  });

  test('an outdated SDK\'s append on a sealed log fails instead of writing a plaintext copy', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).saveConversation(conversation('41', [msg('user', 'secret')]) as any);
    const writes = net.writes.length;
    // What 1.38.x's appendMessage does: get(), then conversation.messages.push(...), then put().
    const old = net.tab();
    const loaded: any = await old.fs.get(logPath('41'));
    expect(loaded).toBeInstanceOf(Uint8Array);
    expect(() => loaded.messages.push(msg('user', 'x'))).toThrow(TypeError);
    expect(net.writes.length).toBe(writes);
  });

  test('a never-written session loads as null (s5js "does not exist"); a transient 404 throws', async () => {
    const net = new FakeS5Network();
    const s = sm(net.tab());
    expect(await s.loadConversation('never')).toBeNull();
    await s.saveConversation(conversation('41') as any);
    net.fail('get', logPath('41'), 'dir404');
    await expect(s.loadConversation('41')).rejects.toThrow();
  });
});

describe('updateConversationMetadata (D20) and cross-tab appends (M7)', () => {
  test('patches metadata under the conversation lock — a concurrent append is not lost', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 2;
    const s = sm(net.tab());
    await s.saveConversation(conversation('41') as any);
    await Promise.all([
      s.appendMessage('41', msg('user', 'in flight') as any),
      s.updateConversationMetadata('41', { status: 'ended', endTime: 5 }),
    ]);
    const c = await s.loadConversation('41');
    expect(c?.messages.map((m: any) => m.content)).toEqual(['in flight']);
    expect(c?.metadata).toMatchObject({ status: 'ended', endTime: 5 });
  });

  test('updateConversationMetadata on a session with no log writes nothing', async () => {
    const net = new FakeS5Network();
    await sm(net.tab()).updateConversationMetadata('none', { status: 'ended' });
    expect(net.writes).toHaveLength(0);
  });

  test('two tabs appending to one conversation concurrently lose neither message', async () => {
    const net = new FakeS5Network();
    net.latencyMs = 2;
    const a = sm(net.tab());
    const b = sm(net.tab());
    await a.saveConversation(conversation('41') as any);
    await Promise.all([a.appendMessage('41', msg('user', 'from a') as any), b.appendMessage('41', msg('user', 'from b') as any)]);
    expect((await sm(net.tab()).loadConversation('41'))?.messages.map((m: any) => m.content).sort()).toEqual(['from a', 'from b']);
  });
});

describe('migrateLegacyConversationLogs (D25)', () => {
  async function legacyLogs(tab: FakeS5Tab) {
    await tab.fs.put(logPath('1'), conversation('1', [msg('user', `${RAG_CONTEXT} one`)]));
    await tab.fs.put(logPath('2'), conversation('2', [msg('user', `${RAG_CONTEXT} two`)]));
    await tab.fs.put(`home/sessions/${ADDR}/2/conversation-plaintext.json`, { encrypted: false, conversation: conversation('2') });
    await tab.fs.put(`home/sessions/${ADDR}/2/summary.json`, { count: 1 });
    await tab.fs.put(`home/sessions/${ADDR}/2/exchanges/1-a.json`, { prompt: 'x' });
    await tab.fs.put(`home/sessions/${ADDR}/research/hierarchy.json`, { folders: ['/secret-folder'] });
  }

  test('seals every plaintext log, purges plaintext siblings, and leaves nothing readable', async () => {
    const net = new FakeS5Network();
    await legacyLogs(net.tab());
    const s = sm(net.tab());
    await s.saveConversation(conversation('3') as any); // already sealed
    const events: any[] = [];
    const report = await s.migrateLegacyConversationLogs({ onProgress: (e) => events.push(e) });
    expect(report).toMatchObject({ sealed: 2, alreadySealed: 1, failed: [] });
    expect(report.purged.sort()).toEqual([
      `home/sessions/${ADDR}/2/conversation-plaintext.json`, `home/sessions/${ADDR}/2/exchanges`,
      `home/sessions/${ADDR}/2/summary.json`, `home/sessions/${ADDR}/research/hierarchy.json`,
      `home/sessions/${ADDR}/research`, // the directory the purge emptied (named after a database) goes too — §14 S8
    ].sort());
    for (const p of net.filePaths()) {
      const e: any = net.dirs.get(p.split('/').slice(0, -1).join('/'))!.get(p.split('/').pop()!);
      expect(sealer().isSealed(net.blobs.get(e.hash)!)).toBe(true);
    }
    expect((await sm(net.tab()).loadConversation('2'))?.messages[0].content).toContain('two');
    expect(events.at(-1)).toMatchObject({ phase: 'logs', done: 4, total: 4 });
  });

  test('idempotent: a second run seals nothing and writes nothing', async () => {
    const net = new FakeS5Network();
    await legacyLogs(net.tab());
    await sm(net.tab()).migrateLegacyConversationLogs();
    const writes = net.writes.length;
    const report = await sm(net.tab()).migrateLegacyConversationLogs();
    expect(report).toMatchObject({ sealed: 0, alreadySealed: 2, purged: [] });
    expect(net.writes.length).toBe(writes);
  });

  test('a read failure is reported and leaves that log as it was', async () => {
    const net = new FakeS5Network();
    await legacyLogs(net.tab());
    net.fail('get', logPath('1'), 'dir404', 1);
    const report = await sm(net.tab()).migrateLegacyConversationLogs();
    expect(report.failed.map((f) => f.id)).toEqual(['1']);
    expect(await net.tab().fs.get(logPath('1'))).toMatchObject({ id: '1' });
  });

  test('an outdated tab\'s plaintext write landing while a log is sealed is resealed by the next run, its message kept', async () => {
    const net = new FakeS5Network();
    await legacyLogs(net.tab());
    const tab = net.tab();
    const put = tab.fs.put;
    let raced = false;
    tab.fs.put = async (path: string, data: any, o?: any) => {
      await put(path, data, o);
      if (!raced && path === logPath('1')) { raced = true; await net.tab().fs.put(logPath('1'), conversation('1', [msg('user', 'old tab')])); }
    };
    const s = new StorageManager();
    Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
    // The outdated write lands after this run sealed the log; the run does not look for it (§16). The next run does,
    // and reseals it (S2).
    await s.migrateLegacyConversationLogs();
    await s.migrateLegacyConversationLogs();
    const bytes = await net.tab().fs.get(logPath('1'));
    expect(bytes instanceof Uint8Array && sealer().isSealed(bytes)).toBe(true);
    expect((await sm(net.tab()).loadConversation('1'))?.messages.map((m: any) => m.content)).toContain('old tab');
  });

  test('a log appended by another tab while it is being sealed keeps the new message', async () => {
    const net = new FakeS5Network();
    await legacyLogs(net.tab());
    net.latencyMs = 2;
    const migrator = sm(net.tab());
    const appender = sm(net.tab());
    await Promise.all([migrator.migrateLegacyConversationLogs(), appender.appendMessage('1', msg('assistant', 'late') as any)]);
    expect((await sm(net.tab()).loadConversation('1'))?.messages.map((m: any) => m.content)).toEqual([`${RAG_CONTEXT} one`, 'late']);
  });
});
