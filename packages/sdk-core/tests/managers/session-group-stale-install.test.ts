// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * 1.39.25 — a stored copy of a session group never replaces newer memory, and no older group object is saved after a
 * newer one (docs/development/IMPLEMENTATION-LISTSESSIONGROUPS-STALE-INSTALL.md). The storage double hands back what
 * the test gives it and can hold saves open, so each ordering is driven exactly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import type { SessionGroup, ChatSession } from '../../src/types/session-groups.types';

const OWNER = 'owner-a';
const msg = (content: string) => ({ role: 'user' as const, content, timestamp: Date.now() });
const tick = () => new Promise((r) => setTimeout(r, 0));
/** A group as storage would hand it back: a separate deep copy (Dates stay Dates). */
const copyOf = (group: SessionGroup): SessionGroup => structuredClone(group);
const contents = (session: ChatSession | null | undefined) => session?.messages.map((m) => m.content);

function makeStorage() {
  const saved: SessionGroup[] = [];
  let gates: Array<() => void> = [];
  let holding = false;
  return {
    /** What each save wrote, in order (a copy taken when the save ran). */
    saved,
    hold() { holding = true; },
    release() { holding = false; gates.forEach((open) => open()); gates = []; },
    save: vi.fn(async (group: SessionGroup) => {
      saved.push(copyOf(group));
      if (holding) await new Promise<void>((open) => gates.push(open));
    }),
    loadAll: vi.fn(async (): Promise<SessionGroup[]> => []),
    load: vi.fn(async (id: string): Promise<SessionGroup> => { throw new Error(`Session group not found: ${id}`); }),
  };
}

async function setup() {
  const storage = makeStorage();
  const manager = new SessionGroupManager(storage as any);
  const group = await manager.createSessionGroup({ name: 'G', owner: OWNER });
  const a = (await manager.startChatSession(group.id, 'A')).sessionId;
  const b = (await manager.startChatSession(group.id, 'B')).sessionId;
  const live = () => manager.getSessionGroup(group.id, OWNER);
  const chat = (id: string) => manager.getChatSession(group.id, id);
  return { storage, manager, gid: group.id, a, b, live, chat };
}

beforeEach(() => {
  for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a list that read the group before a save landed', () => {
  it('T1 does not lose the saved reply: the next save of the group still carries it', async () => {
    const { storage, manager, gid, a, b, live } = await setup();
    const stale = copyOf(await live());
    storage.hold();
    const reply = manager.addMessage(gid, a, msg('the reply'));
    await tick();
    storage.loadAll.mockResolvedValueOnce([stale]);
    await manager.listSessionGroups(OWNER);
    storage.release();
    await reply;

    await manager.addMessage(gid, b, msg('another chat'));
    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['the reply']);
  });

  it('T2 does not bring a deleted group back', async () => {
    const { storage, manager, gid, live } = await setup();
    const stale = copyOf(await live());
    await manager.deleteSessionGroup(gid, OWNER);
    storage.loadAll.mockResolvedValueOnce([stale]);

    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
    expect((await live()).deleted).toBe(true);
  });

  it('T3 does not bring removed messages back', async () => {
    const { storage, manager, gid, a, b, live, chat } = await setup();
    await manager.addMessage(gid, a, msg('kept'));
    await manager.addMessage(gid, a, msg('removed'));
    const stale = copyOf(await live());
    const session = (await chat(a))!;
    session.messages.pop();
    await manager.updateSessionGroup(gid, OWNER, { chatSessionsData: { [a]: session } });
    storage.loadAll.mockResolvedValueOnce([stale]);
    await manager.listSessionGroups(OWNER);

    await manager.addMessage(gid, b, msg('another chat'));
    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['kept']);
  });

  it('T4 leaves one object per chat, and returns memory\'s state in a new group object', async () => {
    const { storage, manager, gid, a, live, chat } = await setup();
    const stale = copyOf(await live());
    await manager.addMessage(gid, a, msg('newer'));
    const before = await live();
    storage.loadAll.mockResolvedValueOnce([stale]);

    const [listed] = await manager.listSessionGroups(OWNER);
    expect(listed).not.toBe(before); // a new group object from every list, as always: consumers compare references
    expect(listed.chatSessions).not.toBe(before.chatSessions);
    expect(listed.chatSessions).toEqual(before.chatSessions);
    expect(listed.chatSessionsData).not.toBe(before.chatSessionsData);
    expect(await live()).toBe(listed);
    expect(listed.chatSessionsData![a]).toBe(await chat(a));
    expect(contents(await chat(a))).toEqual(['newer']);
  });

  it('T15 does not wait for a save that is in flight', async () => {
    const { storage, manager, gid, a, live } = await setup();
    const stale = copyOf(await live());
    storage.hold();
    const reply = manager.addMessage(gid, a, msg('in flight'));
    await tick();
    storage.loadAll.mockResolvedValueOnce([stale]);

    const first = await Promise.race([manager.listSessionGroups(OWNER), tick().then(() => 'waited')]);
    expect(first).not.toBe('waited');
    storage.release();
    await reply;
  });

  it('T9 a clock set back does not make the stored copy look newer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const { storage, manager, gid, a, b, live } = await setup();
    vi.setSystemTime(new Date('2026-11-11T12:00:10Z'));
    await manager.addMessage(gid, a, msg('one'));
    const stale = copyOf(await live());
    vi.setSystemTime(new Date('2026-11-11T11:00:00Z'));
    await manager.addMessage(gid, a, msg('two'));
    expect((await live()).updatedAt.getTime()).toBeGreaterThanOrEqual(stale.updatedAt.getTime());
    storage.loadAll.mockResolvedValueOnce([stale]);
    await manager.listSessionGroups(OWNER);

    await manager.addMessage(gid, b, msg('another chat'));
    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['one', 'two']);
  });
});

describe('stamps always move forward', () => {
  it('T9b a change after adopting a copy stamped ahead of this clock is stamped later still', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const { storage, manager, gid, a, live } = await setup();
    const ahead = copyOf(await live());
    const theirs = new Date('2026-11-11T12:10:00Z').getTime();
    ahead.updatedAt = new Date(theirs);
    storage.loadAll.mockResolvedValueOnce([ahead]);
    await manager.listSessionGroups(OWNER);

    await manager.addMessage(gid, a, msg('written here after theirs'));
    const first = (await live()).updatedAt.getTime();
    expect(first).toBeGreaterThan(theirs);
    await manager.updateSessionGroup(gid, OWNER, { name: 'Same millisecond' });
    expect((await live()).updatedAt.getTime()).toBeGreaterThan(first);
  });
});

describe('a stored copy that is strictly newer (another tab wrote it)', () => {
  it('T5 is adopted; a chat is kept only when memory\'s is strictly later; a chat it lacks leaves the group, not the chat cache', async () => {
    const { storage, manager, gid, a, b, live, chat } = await setup();
    const c = (await manager.startChatSession(gid, 'C')).sessionId;
    const d = (await manager.startChatSession(gid, 'D')).sessionId;
    const [memoryB, memoryC, memoryD] = [await chat(b), await chat(c), await chat(d)];
    const newer = copyOf(await live());
    newer.updatedAt = new Date(Date.now() + 60_000);
    newer.name = 'Renamed elsewhere';
    newer.chatSessionsData![a].messages.push(msg('from the other tab'));
    newer.chatSessionsData![a].updated += 60_000;
    newer.chatSessionsData![b].title = 'Renamed there, stamp unchanged';
    delete newer.chatSessionsData![c];
    newer.chatSessions = newer.chatSessions.filter((id) => id !== c);
    memoryD!.messages.push(msg('written here, after their copy'));
    memoryD!.updated += 5_000;
    storage.loadAll.mockResolvedValueOnce([newer]);

    const [listed] = await manager.listSessionGroups(OWNER);
    expect(listed.name).toBe('Renamed elsewhere');
    expect(await live()).toBe(listed);
    // a: later there — theirs
    expect(contents(await chat(a))).toEqual(['from the other tab']);
    expect(listed.chatSessionsData![a]).toBe(await chat(a));
    // b: same stamp — theirs (an edit made through updateSessionGroup does not move a chat's stamp)
    expect((await chat(b))!.title).toBe('Renamed there, stamp unchanged');
    expect(await chat(b)).not.toBe(memoryB);
    expect(listed.chatSessionsData![b]).toBe(await chat(b));
    // d: strictly later here — ours
    expect(await chat(d)).toBe(memoryD);
    expect(listed.chatSessionsData![d]).toBe(memoryD);
    // c: gone from their copy
    expect(listed.chatSessions).not.toContain(c);
    expect(listed.chatSessionsData![c]).toBeUndefined();
    expect(await chat(c)).toBe(memoryC);
  });

  it('T27 a chat that is strictly later here is kept on adoption even when the chat cache was emptied', async () => {
    const { storage, manager, gid, a, live } = await setup();
    const theirs = copyOf(await live());
    theirs.updatedAt = new Date(Date.now() + 60_000);
    await manager.addMessage(gid, a, msg('paid reply written here'));
    (await manager.getChatSession(gid, a))!.updated += 1000;
    (manager as any).chatStorage.clear();
    storage.loadAll.mockResolvedValueOnce([theirs]);
    await manager.listSessionGroups(OWNER);

    await manager.updateSessionGroup(gid, OWNER, { description: 'any save' });
    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['paid reply written here']);
  });

  it('T26 a chat entry that is not a chat does not stop the other groups from being listed', async () => {
    const { storage, manager, gid, a, live } = await setup();
    const newer = copyOf(await live());
    newer.updatedAt = new Date(Date.now() + 60_000);
    (newer.chatSessionsData as any)[a] = null;
    (newer.chatSessionsData as any)['sess-text'] = 'not a chat either';
    const second = { ...copyOf(await live()), id: 'sg-second', name: 'Second', chatSessions: [], chatSessionsData: {} };
    storage.loadAll.mockResolvedValueOnce([newer, second]);

    expect((await manager.listSessionGroups(OWNER)).map((g) => g.id)).toEqual([gid, 'sg-second']);
  });

  it('T5c a chat the newer copy lacks is saved with its group again once it is written to, as before', async () => {
    const { storage, manager, gid, a, b, live } = await setup();
    const newer = copyOf(await live());
    newer.updatedAt = new Date(Date.now() + 60_000);
    for (const id of [a, b]) delete newer.chatSessionsData![id];
    newer.chatSessions = [];
    storage.loadAll.mockResolvedValueOnce([newer]);
    await manager.listSessionGroups(OWNER);

    await manager.addMessage(gid, a, msg('still here'));
    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['still here']);
    await manager.updateChatSession(gid, b, OWNER, (s) => { s.title = 'Kept' });
    expect(storage.saved.at(-1)!.chatSessionsData![b].title).toBe('Kept');
  });

  it('T5b a group deleted elsewhere leaves the list and is deleted in memory', async () => {
    const { storage, manager, live } = await setup();
    const newer = copyOf(await live());
    newer.updatedAt = new Date(Date.now() + 60_000);
    newer.deleted = true;
    storage.loadAll.mockResolvedValueOnce([newer]);

    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
    expect((await live()).deleted).toBe(true);
  });
});

describe('first loads', () => {
  const stored = (id = 'sg-stored'): SessionGroup => ({
    id, name: 'Stored', owner: OWNER, createdAt: new Date(1000), updatedAt: new Date(2000),
    linkedDatabases: [], chatSessions: ['s1'], documents: [], metadata: {}, deleted: false,
    chatSessionsData: { s1: { sessionId: 's1', groupId: id, title: `S1 of ${id}`, messages: [], metadata: {}, created: 1000, updated: 2000 } },
  });

  it('T23 a group stored as deleted that memory does not hold is not taken into memory', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.loadAll.mockResolvedValueOnce([{ ...stored(), deleted: true }]);

    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
    expect(await manager.getChatSession('sg-stored', 's1')).toBeNull();
    await expect(manager.startChatSession('sg-stored', 'New')).rejects.toThrow('Session group not found');
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('T24 one chat id stored under two groups: each group saves its own chat', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const first = stored('sg-1');
    first.chatSessionsData!.s1.updated += 1000; // later than the second group's: still not the second group's chat
    storage.loadAll.mockResolvedValueOnce([first, stored('sg-2')]);
    await manager.listSessionGroups(OWNER);
    await manager.updateSessionGroup('sg-2', OWNER, { name: 'Renamed' });

    expect(storage.saved.at(-1)!.chatSessionsData!.s1.title).toBe('S1 of sg-2');

    // Whichever group's chat sits in the cache, each group's chat is found and changed as its own.
    for (const id of ['sg-1', 'sg-2', 'sg-1']) {
      const changed = await manager.updateChatSession(id, 's1', OWNER, (chat) => { chat.metadata.pinned = true; });
      expect(changed.groupId).toBe(id);
      expect(storage.saved.at(-1)!.chatSessionsData!.s1).toMatchObject({ groupId: id, title: `S1 of ${id}`, metadata: { pinned: true } });
    }
  });

  it('T6 a list fills the chat cache for the groups it installs', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.loadAll.mockResolvedValueOnce([stored()]);
    const [listed] = await manager.listSessionGroups(OWNER);

    expect(await manager.getChatSession('sg-stored', 's1')).toBe(listed.chatSessionsData!.s1);
  });

  it('T7 a group only memory holds is listed, after the stored ones', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.hold();
    const creating = manager.createSessionGroup({ name: 'Being created', owner: OWNER });
    await tick();
    storage.loadAll.mockResolvedValueOnce([stored()]);

    const first = await manager.listSessionGroups(OWNER);
    expect(first.map((g) => g.name)).toEqual(['Stored', 'Being created']);
    storage.release();
    const created = await creating;
    // It too goes out as a new object on each list, and that object is the one in memory.
    const again = (await manager.listSessionGroups(OWNER)).find((g) => g.id === created.id)!;
    expect(again).not.toBe(first[1]);
    expect(again.name).toBe('Being created');
    expect(await manager.getSessionGroup(created.id, OWNER)).toBe(again);
  });

  it('T8 a single load that returns after a list and a change does not undo the change', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    let finishLoad!: (group: SessionGroup) => void;
    storage.load.mockImplementationOnce(() => new Promise<SessionGroup>((resolve) => { finishLoad = resolve; }));
    const loading = manager.getSessionGroup('sg-stored', OWNER);
    await tick();
    storage.loadAll.mockResolvedValueOnce([stored()]);
    const [listed] = await manager.listSessionGroups(OWNER);
    await manager.addMessage('sg-stored', 's1', msg('added meanwhile'));
    finishLoad(stored());

    expect(await loading).toBe(listed);
    expect(contents(await manager.getChatSession('sg-stored', 's1'))).toEqual(['added meanwhile']);
    await manager.startChatSession('sg-stored', 'Another');
    expect(contents(storage.saved.at(-1)!.chatSessionsData!.s1)).toEqual(['added meanwhile']);
  });

  it('T18 a list in flight when the manager is disposed keeps what it read', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.loadAll.mockImplementationOnce(async () => { manager.dispose(); return [stored()]; });

    expect((await manager.listSessionGroups(OWNER)).map((g) => g.name)).toEqual(['Stored']);
  });

  it('T21 another owner\'s group in the same directory is neither listed nor taken into memory', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.loadAll.mockResolvedValueOnce([{ ...stored(), owner: 'owner-b' }]);

    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
    expect(manager.getCachedSessionGroups('owner-b')).toEqual([]);
  });

  it('T28 a group stored without a chat list (an old or damaged file) does not stop later lists', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const old = () => { const group: any = stored('sg-old'); delete group.chatSessions; return group as SessionGroup; };
    storage.loadAll.mockImplementation(async () => [old(), stored()]);
    await manager.listSessionGroups(OWNER);

    expect((await manager.listSessionGroups(OWNER)).map((g) => g.id)).toEqual(['sg-old', 'sg-stored']);
    storage.loadAll.mockImplementation(async () => []);
    expect((await manager.listSessionGroups(OWNER)).map((g) => g.id)).toEqual(['sg-old', 'sg-stored']);
  });

  it('T16 two lists at once leave one object per chat', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.loadAll.mockImplementation(async () => [stored()]);
    const [first, second] = await Promise.all([manager.listSessionGroups(OWNER), manager.listSessionGroups(OWNER)]);

    expect(first[0].chatSessionsData!.s1).toBe(second[0].chatSessionsData!.s1);
    expect(await manager.getChatSession('sg-stored', 's1')).toBe(first[0].chatSessionsData!.s1);
    expect([first[0], second[0]]).toContain(await manager.getSessionGroup('sg-stored', OWNER));
  });
});

describe('no older group object is saved or re-installed after a newer one', () => {
  const doc = { id: 'doc-1', name: 'a.txt', size: 1, uploaded: 1 };
  it.each<[string, (m: SessionGroupManager, gid: string, a: string) => Promise<unknown>]>([
    ['updateSessionGroup', (m, gid) => m.updateSessionGroup(gid, OWNER, { name: 'Renamed' })],
    ['deleteSessionGroup', (m, gid) => m.deleteSessionGroup(gid, OWNER)],
    ['linkVectorDatabase', (m, gid) => m.linkVectorDatabase(gid, OWNER, 'db-1')],
    ['unlinkVectorDatabase', (m, gid) => m.unlinkVectorDatabase(gid, OWNER, 'db-1')],
    ['setDefaultDatabase', (m, gid) => m.setDefaultDatabase(gid, OWNER, undefined)],
    ['addGroupDocument', (m, gid) => m.addGroupDocument(gid, doc)],
    ['removeGroupDocument', (m, gid) => m.removeGroupDocument(gid, 'doc-1')],
    ['startChatSession', (m, gid) => m.startChatSession(gid, 'C')],
    ['updateChatSession', (m, gid, a) => m.updateChatSession(gid, a, OWNER, (s) => { s.title = 'Renamed'; })],
  ])('T10 %s queued behind a chat delete does not save the chat back', async (_name, change) => {
    const { storage, manager, gid, a, b } = await setup();
    storage.hold();
    const sending = manager.addMessage(gid, a, msg('in flight'));
    await tick();
    const deleting = manager.deleteChatSession(gid, b);
    await tick();
    const saves = storage.save.mock.calls.length;
    const changing = change(manager, gid, a);
    storage.release();
    await Promise.all([sending, deleting, changing]);

    expect(storage.save.mock.calls.length).toBeGreaterThan(saves + 1); // the delete's save, then the change's
    const last = storage.saved.at(-1)!;
    expect(last.chatSessions).not.toContain(b);
    expect(last.chatSessionsData![b]).toBeUndefined();
  });

  /** Each change, and what shows it landed on the group that is in memory. */
  const changes: Array<[string, (m: SessionGroupManager, gid: string) => Promise<unknown>, (g: SessionGroup) => void]> = [
    ['linkVectorDatabase', (m, gid) => m.linkVectorDatabase(gid, OWNER, 'db-1'), (g) => expect(g.linkedDatabases).toContain('db-1')],
    ['unlinkVectorDatabase', (m, gid) => m.unlinkVectorDatabase(gid, OWNER, 'db-0'), (g) => expect(g.linkedDatabases).not.toContain('db-0')],
    ['setDefaultDatabase', (m, gid) => m.setDefaultDatabase(gid, OWNER, 'db-0'), (g) => expect((g as any).defaultDatabase).toBe('db-0')],
    ['addChatSession', (m, gid) => m.addChatSession(gid, OWNER, 'sess-extra'), (g) => expect(g.chatSessions).toContain('sess-extra')],
  ];

  it.each(changes)('T11 %s called right after a chat delete lands on the new group and does not undo the delete', async (_name, change, landed) => {
    const { storage, manager, gid, b, live } = await setup();
    await manager.linkVectorDatabase(gid, OWNER, 'db-0');
    await Promise.all([manager.deleteChatSession(gid, b), change(manager, gid)]);

    landed(await live());
    expect((await live()).chatSessions).not.toContain(b);
    expect((await live()).chatSessionsData![b]).toBeUndefined();
    expect(storage.saved.at(-1)!.chatSessions).not.toContain(b);
  });

  it.each(changes)('T11b %s lands on a newer copy adopted while it was reading the group', async (_name, change, landed) => {
    const { manager, gid, live } = await setup();
    await manager.linkVectorDatabase(gid, OWNER, 'db-0');
    const newer = copyOf(await live());
    newer.updatedAt = new Date(Date.now() + 60_000);
    newer.name = 'Renamed elsewhere';
    // The adoption lands in the gap between the change's read of the group and its use of it.
    const read = manager.getSessionGroup.bind(manager);
    vi.spyOn(manager, 'getSessionGroup').mockImplementationOnce(async (id, requestor) => {
      const group = await read(id, requestor);
      (manager as any).install(newer);
      return group;
    });
    await change(manager, gid);

    expect((await live()).name).toBe('Renamed elsewhere');
    landed(await live());
  });

  it('T20 deleteChatSession still puts a new group object in memory (a consumer may compare references)', async () => {
    const { manager, gid, b, live } = await setup();
    const before = await live();
    await manager.deleteChatSession(gid, b);
    expect(await live()).not.toBe(before);
  });

  it('T22 a waiting addMessage still lands when the chat cache was emptied meanwhile (the UI clears it on a route change)', async () => {
    const { storage, manager, gid, a, chat } = await setup();
    storage.hold();
    const prompt = manager.addMessage(gid, a, msg('prompt'));
    const reply = manager.addMessage(gid, a, msg('paid reply'));
    await tick();
    (manager as any).chatStorage.clear();
    storage.release();
    await Promise.all([prompt, reply]);

    expect(contents(storage.saved.at(-1)!.chatSessionsData![a])).toEqual(['prompt', 'paid reply']);
    expect(contents(await chat(a))).toEqual(['prompt', 'paid reply']);
    storage.hold();
    const sending = manager.addMessage(gid, a, msg('third'));
    const renaming = manager.updateChatSession(gid, a, OWNER, (s) => { s.title = 'Found again'; });
    await tick();
    (manager as any).chatStorage.clear();
    storage.release();
    const [, found] = await Promise.all([sending, renaming]);
    expect(found.title).toBe('Found again');
    expect(contents(found)).toEqual(['prompt', 'paid reply', 'third']);
    expect(await chat(a)).toBe(found);
  });

  it('T12a addMessage queued behind the delete of its chat is refused and re-adds nothing', async () => {
    const { storage, manager, gid, a, live, chat } = await setup();
    storage.hold();
    const first = manager.addMessage(gid, a, msg('first'));
    await tick();
    const deleting = manager.deleteChatSession(gid, a);
    const late = manager.addMessage(gid, a, msg('late'));
    const refused = expect(late).rejects.toThrow(/not found/);
    storage.release();
    await Promise.all([first, deleting, refused]);

    expect(await chat(a)).toBeNull();
    expect((await live()).chatSessionsData![a]).toBeUndefined();
    expect(storage.saved.at(-1)!.chatSessionsData![a]).toBeUndefined();
  });

  it('T12b addMessage appends to the session that is current when its turn comes', async () => {
    const { storage, manager, gid, a, chat } = await setup();
    storage.hold();
    const first = manager.addMessage(gid, a, msg('one'));
    await tick();
    const second = manager.addMessage(gid, a, msg('two'));
    await tick();
    const swapped = { ...structuredClone((await chat(a))!), title: 'Swapped' };
    const swapping = manager.updateSessionGroup(gid, OWNER, { chatSessionsData: { [a]: swapped } });
    storage.release();
    await Promise.all([first, second, swapping]);

    expect(await chat(a)).toBe(swapped);
    expect(contents(swapped)).toEqual(['one', 'two']);
    expect(storage.saved.at(-1)!.chatSessionsData![a].title).toBe('Swapped');
  });
});

describe('every change stamps the group (the stamp is what tells a stored copy from a newer memory)', () => {
  const doc = { id: 'doc-1', name: 'a.txt', size: 1, uploaded: 1 };
  it.each<[string, (m: SessionGroupManager, gid: string, a: string) => Promise<unknown>]>([
    ['updateSessionGroup', (m, gid) => m.updateSessionGroup(gid, OWNER, { name: 'Renamed' })],
    ['deleteSessionGroup', (m, gid) => m.deleteSessionGroup(gid, OWNER)],
    ['linkVectorDatabase', (m, gid) => m.linkVectorDatabase(gid, OWNER, 'db-1')],
    ['unlinkVectorDatabase', (m, gid) => m.unlinkVectorDatabase(gid, OWNER, 'db-0')],
    ['setDefaultDatabase', (m, gid) => m.setDefaultDatabase(gid, OWNER, 'db-0')],
    ['handleDatabaseDeletion', (m) => m.handleDatabaseDeletion('db-0')],
    ['addChatSession', (m, gid) => m.addChatSession(gid, OWNER, 'sess-extra')],
    ['addGroupDocument', (m, gid) => m.addGroupDocument(gid, doc)],
    ['removeGroupDocument', (m, gid) => m.removeGroupDocument(gid, 'doc-0')],
    ['startChatSession', (m, gid) => m.startChatSession(gid, 'C')],
    ['addMessage', (m, gid, a) => m.addMessage(gid, a, msg('hello'))],
    ['deleteChatSession', (m, gid, a) => m.deleteChatSession(gid, a)],
  ])('T19 %s', async (_name, change) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const { manager, gid, a, live } = await setup();
    await manager.linkVectorDatabase(gid, OWNER, 'db-0');
    await manager.addGroupDocument(gid, { ...doc, id: 'doc-0' });
    const later = new Date('2026-11-11T12:00:05Z');
    vi.setSystemTime(later);
    await change(manager, gid, a);

    expect((await live()).updatedAt.getTime()).toBe(later.getTime());
  });
});

describe('getCachedSessionGroups', () => {
  it('T13 returns the owner\'s live groups from memory, synchronously, without reading storage', async () => {
    const { storage, manager, live } = await setup();
    await manager.createSessionGroup({ name: 'Other owner', owner: 'owner-b' });
    const gone = await manager.createSessionGroup({ name: 'Deleted', owner: OWNER });
    await manager.deleteSessionGroup(gone.id, OWNER);

    const cached = manager.getCachedSessionGroups(OWNER);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toBe(await live());
    expect(storage.loadAll).not.toHaveBeenCalled();
    expect(storage.load).not.toHaveBeenCalled();
  });

  it('T13b refuses on a disposed manager', async () => {
    const { manager } = await setup();
    manager.dispose();
    expect(() => manager.getCachedSessionGroups(OWNER)).toThrow(expect.objectContaining({ code: 'SESSION_GROUP_MANAGER_DISPOSED' }));
  });
});

describe('updateChatSession', () => {
  it('T14a runs the change under the lock, after a queued addMessage, and saves once', async () => {
    const { storage, manager, gid, a, chat } = await setup();
    storage.hold();
    const sending = manager.addMessage(gid, a, msg('one'));
    await tick();
    let seen: string[] | undefined;
    const updating = manager.updateChatSession(gid, a, OWNER, (session) => {
      seen = session.messages.map((m) => m.content);
      session.metadata.customTitle = 'Tax questions';
    });
    await tick();
    expect(seen).toBeUndefined();
    const savesBefore = storage.save.mock.calls.length;
    storage.release();
    await sending;
    const session = await updating;

    expect(seen).toEqual(['one']);
    expect(session).toBe(await chat(a));
    expect(storage.save.mock.calls.length).toBe(savesBefore + 1);
    expect(storage.saved.at(-1)!.chatSessionsData![a].metadata.customTitle).toBe('Tax questions');
  });

  it('T14b stamps the group, and leaves the chat\'s `updated` to the change', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    const { manager, gid, a, live } = await setup();
    const later = new Date('2026-11-11T12:00:05Z');
    vi.setSystemTime(later);
    const created = (await manager.getChatSession(gid, a))!.updated;
    const session = await manager.updateChatSession(gid, a, OWNER, (s) => { s.title = 'Renamed'; });

    expect(session.updated).toBe(created); // a rename or a pin is not activity: `updated` is the change's to set
    expect((await live()).updatedAt.getTime()).toBe(later.getTime());
    expect((await live()).chatSessionsData![a]).toBe(session);
  });

  it('T14i a change that swaps the chat object (updateSessionGroup inside it) leaves one object in both views', async () => {
    const { storage, manager, gid, a, live, chat } = await setup();
    const replacement = { ...structuredClone((await chat(a))!), title: 'Replacement' };
    let inner!: Promise<unknown>;
    let stampedBySwap = 0;
    const returned = await manager.updateChatSession(gid, a, OWNER, () => {
      inner = manager.updateSessionGroup(gid, OWNER, { chatSessionsData: { [a]: replacement } });
      stampedBySwap = replacement.revision!;
    });
    await inner;

    expect(returned).toBe(replacement);
    expect(returned.revision).toBeGreaterThan(stampedBySwap); // the chat that is current is the one stamped
    expect(await chat(a)).toBe(replacement);
    expect((await live()).chatSessionsData![a]).toBe(replacement);
    expect(storage.saved.at(-1)!.chatSessionsData![a].title).toBe('Replacement');
  });

  it('T14c refuses another requestor, an unknown group and an unknown chat, without running the change', async () => {
    const { storage, manager, gid, a } = await setup();
    const change = vi.fn();
    let saves = storage.save.mock.calls.length;

    await expect(manager.updateChatSession(gid, a, 'owner-b', change)).rejects.toThrow('Permission denied');
    await expect(manager.updateChatSession('sg-none', a, OWNER, change)).rejects.toThrow('Session group not found');
    await expect(manager.updateChatSession(gid, 'sess-none', OWNER, change)).rejects.toThrow(/Session sess-none not found/);
    const other = await manager.createSessionGroup({ name: 'Other', owner: OWNER });
    const elsewhere = (await manager.startChatSession(other.id, 'Elsewhere')).sessionId;
    await expect(manager.updateChatSession(gid, elsewhere, OWNER, change)).rejects.toThrow(/not found in group/);
    saves += 2;
    expect(change).not.toHaveBeenCalled();
    expect(storage.save.mock.calls.length).toBe(saves);
  });

  it('T14d refuses a chat that was deleted while it waited', async () => {
    const { storage, manager, gid, a } = await setup();
    storage.hold();
    const deleting = manager.deleteChatSession(gid, a);
    await tick();
    const change = vi.fn();
    const refused = expect(manager.updateChatSession(gid, a, OWNER, change)).rejects.toThrow(/not found/);
    storage.release();
    await Promise.all([deleting, refused]);
    expect(change).not.toHaveBeenCalled();
  });

  it('T14e refuses an async change before running it, and one that returns a promise without saving', async () => {
    const { storage, manager, gid, a, chat } = await setup();
    const saves = storage.save.mock.calls.length;
    const asyncChange = async (s: ChatSession) => { s.title = 'never'; };

    await expect(manager.updateChatSession(gid, a, OWNER, asyncChange as any)).rejects.toMatchObject({ code: 'INVALID_MUTATOR' });
    expect((await chat(a))!.title).toBe('A');
    await expect(manager.updateChatSession(gid, a, OWNER, (() => Promise.resolve()) as any)).rejects.toMatchObject({ code: 'INVALID_MUTATOR' });
    await expect(manager.updateChatSession(gid, a, OWNER, 'not a function' as any)).rejects.toMatchObject({ code: 'INVALID_MUTATOR' });
    expect(storage.save.mock.calls.length).toBe(saves);
  });

  it('T14f a change that throws is not saved, and its error reaches the caller', async () => {
    const { storage, manager, gid, a } = await setup();
    const saves = storage.save.mock.calls.length;
    await expect(manager.updateChatSession(gid, a, OWNER, () => { throw new Error('bad change'); })).rejects.toThrow('bad change');
    expect(storage.save.mock.calls.length).toBe(saves);
  });

  it('T14g a failed save throws and the change stays in memory', async () => {
    const { storage, manager, gid, a, chat } = await setup();
    storage.save.mockRejectedValueOnce(new Error('S5 write failed'));
    await expect(manager.updateChatSession(gid, a, OWNER, (s) => { s.title = 'Kept in memory'; })).rejects.toThrow('S5 write failed');
    expect((await chat(a))!.title).toBe('Kept in memory');
  });

  it('T14h works without storage, and refuses on a disposed manager', async () => {
    const manager = new SessionGroupManager();
    const group = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    const { sessionId } = await manager.startChatSession(group.id, 'A');
    expect((await manager.updateChatSession(group.id, sessionId, OWNER, (s) => { s.title = 'Local'; })).title).toBe('Local');

    manager.dispose();
    await expect(manager.updateChatSession(group.id, sessionId, OWNER, () => {})).rejects.toMatchObject({ code: 'SESSION_GROUP_MANAGER_DISPOSED' });
  });
});

it('T17 capability flag sessionGroupMemoryFirst', () => {
  expect((SDK_CAPABILITIES as any).sessionGroupMemoryFirst).toBe(true);
});
