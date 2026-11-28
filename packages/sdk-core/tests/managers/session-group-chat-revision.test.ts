// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * 1.39.26 — a per-chat `revision` the manager stamps decides which copy of a chat is later when another tab's group is
 * adopted; `deleteSessionGroup` restores the group when its save fails; the class is exported
 * (docs/development/IMPLEMENTATION-SESSION-GROUP-CHAT-REVISION.md). Two real managers share one stub store, as two
 * tabs share S5.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import type { SessionGroup, ChatSession } from '../../src/types/session-groups.types';

const OWNER = 'owner-a';
const msg = (content: string) => ({ role: 'user' as const, content, timestamp: Date.now() });

/** One store for every manager given it: deep copies in and out, and saves that can be made to fail. */
function makeStore() {
  const files = new Map<string, SessionGroup>();
  let failing = 0;
  let landing = false;
  return {
    files,
    /** The next `count` saves throw; with `landed` the write is in the store all the same (a failed verification). */
    failSaves(count: number, landed = false) { failing = count; landing = landed; },
    save: vi.fn(async (group: SessionGroup) => {
      if (failing > 0) {
        failing--;
        if (landing) files.set(group.id, structuredClone(group));
        throw new Error('S5 write failed');
      }
      files.set(group.id, structuredClone(group));
    }),
    loadAll: vi.fn(async () => [...files.values()].map((group) => structuredClone(group))),
    load: vi.fn(async (id: string) => {
      const group = files.get(id);
      if (!group) throw new Error(`Session group not found: ${id}`);
      return structuredClone(group);
    }),
  };
}

let clock: number;
/** Move the (faked) clock on, so each step has its own stamp. */
const later = (ms = 1000) => { clock += ms; vi.setSystemTime(clock); };

/** Tab A creates a group with chats X and Y; tab B then loads it. */
async function twoTabs() {
  const store = makeStore();
  const a = new SessionGroupManager(store as any);
  const b = new SessionGroupManager(store as any);
  const gid = (await a.createSessionGroup({ name: 'G', owner: OWNER })).id;
  later();
  const x = (await a.startChatSession(gid, 'X')).sessionId;
  later();
  const y = (await a.startChatSession(gid, 'Y')).sessionId;
  later();
  await b.listSessionGroups(OWNER);
  later();
  const chat = (tab: SessionGroupManager, id: string) => tab.getChatSession(gid, id) as Promise<ChatSession>;
  return { store, a, b, gid, x, y, chat };
}

beforeEach(() => {
  for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = new Date('2026-11-11T12:00:00Z').getTime();
  vi.setSystemTime(clock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a chat changed here without moving `updated`, then another tab saves its older copy of the group', () => {
  it('R1 a paid session recorded the way the UI\'s older writers do it survives the next list, and is saved back', async () => {
    const { store, a, b, gid, x, y, chat } = await twoTabs();
    const live = await a.getSessionGroup(gid, OWNER);
    const before = await chat(a, x);
    const copy = { ...before, metadata: { ...before.metadata, sessionType: 'ai', blockchainSessionId: '42' } };
    (a as any).chatStorage.set(x, copy);
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { ...live.chatSessionsData, [x]: copy } });
    expect(copy.updated).toBe(before.updated);
    later();
    await b.updateSessionGroup(gid, OWNER, { name: 'Renamed in the other tab' });
    expect(store.files.get(gid)!.chatSessionsData![x].metadata.blockchainSessionId).toBeUndefined();
    later();

    const [listed] = await a.listSessionGroups(OWNER);
    expect(listed.name).toBe('Renamed in the other tab');
    expect((await chat(a, x)).metadata.blockchainSessionId).toBe('42');
    expect(listed.chatSessionsData![x]).toBe(await chat(a, x));
    later();
    await a.addMessage(gid, y, msg('another chat'));
    expect(store.files.get(gid)!.chatSessionsData![x].metadata.blockchainSessionId).toBe('42');
  });

  it('R2 a rename through updateChatSession survives it too, and still does not move `updated`', async () => {
    const { a, b, gid, x, chat } = await twoTabs();
    const updated = (await chat(a, x)).updated;
    await a.updateChatSession(gid, x, OWNER, (session) => { session.metadata.customTitle = 'Tax questions'; });
    later();
    await b.updateSessionGroup(gid, OWNER, { name: 'Renamed in the other tab' });
    later();
    await a.listSessionGroups(OWNER);

    expect((await chat(a, x)).metadata.customTitle).toBe('Tax questions');
    expect((await chat(a, x)).updated).toBe(updated);
  });

  it('R3 and the other way round still holds: a tab with an older copy takes the other tab\'s rename', async () => {
    const { a, b, gid, x, y, chat } = await twoTabs();
    await a.updateChatSession(gid, x, OWNER, (session) => { session.metadata.customTitle = 'Tax questions'; });
    const copy = { ...(await chat(a, y)), title: 'Ended' };
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { [y]: copy } });
    later();
    await b.listSessionGroups(OWNER);

    expect((await chat(b, x)).metadata.customTitle).toBe('Tax questions');
    expect((await chat(b, y)).title).toBe('Ended');
  });
});

describe('the manager stamps `revision` on every change it makes to a chat', () => {
  it('R4 start, addMessage and updateChatSession each move it forward; nothing the clock or the caller does moves it back', async () => {
    const { store, a, gid, x, chat } = await twoTabs();
    const started = (await chat(a, x)).revision!;
    expect(started).toBe((await chat(a, x)).created);
    later();
    await a.addMessage(gid, x, msg('hello'));
    const afterMessage = (await chat(a, x)).revision!;
    expect(afterMessage).toBe(clock);

    later(-3_600_000); // the clock is set back an hour
    await a.updateChatSession(gid, x, OWNER, (session) => { session.title = 'Renamed'; });
    const afterRename = (await chat(a, x)).revision!;
    expect(afterRename).toBeGreaterThan(afterMessage);

    await a.updateChatSession(gid, x, OWNER, (session) => { session.updated = afterRename + 7_200_000; });
    expect((await chat(a, x)).revision).toBeGreaterThan(afterRename + 7_200_000);
    expect(store.files.get(gid)!.chatSessionsData![x].revision).toBe((await chat(a, x)).revision);
  });

  it('R5 updateSessionGroup stamps a chat passed as a new object, and leaves alone one that is the group\'s own object', async () => {
    const { a, gid, x, y, chat } = await twoTabs();
    const live = await a.getSessionGroup(gid, OWNER);
    const [revisionX, revisionY] = [(await chat(a, x)).revision!, (await chat(a, y)).revision!];
    const copy = { ...(await chat(a, x)), title: 'Copied and changed' };
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { ...live.chatSessionsData, [x]: copy } });

    const stamped = (await chat(a, x)).revision!;
    expect(stamped).toBeGreaterThan(revisionX);
    expect((await chat(a, y)).revision).toBe(revisionY);
    // Passed again it is an object the manager already holds: not a new change.
    later();
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { ...live.chatSessionsData, [x]: copy } });
    expect((await chat(a, x)).revision).toBe(stamped);
    // A copy the caller put into the live record itself is still a new object to the manager.
    const inPlace = { ...copy, title: 'Set into the record in place' };
    live.chatSessionsData![x] = inPlace;
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: live.chatSessionsData });
    expect((await chat(a, x)).revision).toBeGreaterThan(stamped);
    // An entry that is not a chat is taken as it always was, not stamped.
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { 'sess-none': null as any, 'sess-text': 'not a chat' as any } });
  });
});

describe('a record built from an older copy of the group', () => {
  it('R8 its old chat objects are not stamped as changes: the other tab\'s reply to another chat comes back', async () => {
    const { store, a, b, gid, x, y, chat } = await twoTabs();
    const [state] = await a.listSessionGroups(OWNER); // what a page keeps in its state
    later();
    await b.addMessage(gid, y, msg('paid reply written in tab B'));
    later();
    await a.listSessionGroups(OWNER); // another mount: tab A now holds B's chat Y as a new object
    later();
    const copy = { ...(await chat(a, x)), metadata: { sessionType: 'ai' } };
    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { ...state.chatSessionsData, [x]: copy } });
    later();
    await b.listSessionGroups(OWNER);
    later();
    await b.updateSessionGroup(gid, OWNER, { name: 'Any save in tab B' });

    expect((await chat(b, y)).messages).toHaveLength(1);
    expect(store.files.get(gid)!.chatSessionsData![y].messages).toHaveLength(1);
    expect(store.files.get(gid)!.chatSessionsData![x].metadata.sessionType).toBe('ai');
  });

  it('R8b the same when the old objects came from storage (the tab that did not create the chats)', async () => {
    const { store, a, b, gid, x, y, chat } = await twoTabs();
    const [state] = await b.listSessionGroups(OWNER);
    later();
    await a.addMessage(gid, y, msg('paid reply written in tab A'));
    later();
    await b.listSessionGroups(OWNER);
    later();
    const copy = { ...(await chat(b, x)), metadata: { sessionType: 'ai' } };
    await b.updateSessionGroup(gid, OWNER, { chatSessionsData: { ...state.chatSessionsData, [x]: copy } });
    later();
    await a.listSessionGroups(OWNER);
    later();
    await a.updateSessionGroup(gid, OWNER, { name: 'Any save in tab A' });

    expect((await chat(a, y)).messages).toHaveLength(1);
    expect(store.files.get(gid)!.chatSessionsData![y].messages).toHaveLength(1);
  });

  it('R10 an older object the caller changed in place and passed is still taken, without a stamp', async () => {
    const { a, b, gid, x, chat } = await twoTabs();
    const old = await chat(b, x);
    later();
    await a.addMessage(gid, x, msg('added in tab A'));
    later();
    await b.listSessionGroups(OWNER); // tab B now holds a newer object for X
    expect(await chat(b, x)).not.toBe(old);
    const revision = old.revision;
    old.title = 'Changed in place on the object the page still held';
    await b.updateSessionGroup(gid, OWNER, { chatSessionsData: { [x]: old } });

    expect(await chat(b, x)).toBe(old);
    expect(old.revision).toBe(revision);
  });

  it('R9 a copy made from an older object is still stamped later than the chat it replaces', async () => {
    const { store, a, gid, x, chat } = await twoTabs();
    const stale = await chat(a, x);
    const ahead = structuredClone(store.files.get(gid)!); // written by a device whose clock is ten minutes ahead
    ahead.updatedAt = new Date(clock + 600_000);
    ahead.chatSessionsData![x].revision = clock + 600_000;
    store.files.set(gid, ahead);
    await a.listSessionGroups(OWNER);
    expect((await chat(a, x)).revision).toBe(clock + 600_000);

    await a.updateSessionGroup(gid, OWNER, { chatSessionsData: { [x]: { ...stale, title: 'Changed here' } } });
    expect((await chat(a, x)).revision).toBeGreaterThan(clock + 600_000);
  });
});

describe('chats and tabs from before 1.39.26', () => {
  /** A group as an older SDK stored it: its chats carry no `revision`. */
  const old = (stamp: number, titles: Record<string, string>): SessionGroup => ({
    id: 'sg-old', name: 'Old', owner: OWNER, createdAt: new Date(1000), updatedAt: new Date(stamp),
    linkedDatabases: [], chatSessions: Object.keys(titles), documents: [], metadata: {}, deleted: false,
    chatSessionsData: Object.fromEntries(Object.entries(titles).map(([id, title]) =>
      [id, { sessionId: id, groupId: 'sg-old', title, messages: [], metadata: {}, created: 1000, updated: 2000 }])),
  });

  it('R6 without a revision the chats compare by `updated`, as in 1.39.25', async () => {
    const store = makeStore();
    const a = new SessionGroupManager(store as any);
    store.files.set('sg-old', old(clock, { s1: 'here', s2: 'here' }));
    await a.listSessionGroups(OWNER);
    (await a.getChatSession('sg-old', 's1'))!.updated += 5000; // changed here in place, later than their copy
    store.files.set('sg-old', old(clock + 60_000, { s1: 'there', s2: 'there' }));
    await a.listSessionGroups(OWNER);

    expect((await a.getChatSession('sg-old', 's1'))!.title).toBe('here');
    expect((await a.getChatSession('sg-old', 's2'))!.title).toBe('there');
  });

  it('R7 a message added later by a tab on an older SDK (it moves `updated` only) is taken over an earlier rename here', async () => {
    const store = makeStore();
    const a = new SessionGroupManager(store as any);
    store.files.set('sg-old', old(clock, { s1: 'here' }));
    await a.listSessionGroups(OWNER);
    later();
    await a.updateChatSession('sg-old', 's1', OWNER, (session) => { session.title = 'renamed here'; });
    const theirs = old(clock + 60_000, { s1: 'theirs' });
    theirs.chatSessionsData!.s1.updated = clock + 30_000;
    theirs.chatSessionsData!.s1.messages.push(msg('added there, later'));
    store.files.set('sg-old', theirs);
    await a.listSessionGroups(OWNER);

    expect((await a.getChatSession('sg-old', 's1'))!.messages).toHaveLength(1);
  });
});

describe('deleteSessionGroup restores the group when its save fails', () => {
  it('D1 it rejects, the group is not deleted and is listed, and a deleted copy that landed does not win the next list', async () => {
    const { store, a, gid } = await twoTabs();
    store.failSaves(1, true);
    await expect(a.deleteSessionGroup(gid, OWNER)).rejects.toThrow('S5 write failed');
    expect(store.files.get(gid)!.deleted).toBe(true); // the write landed before the throw

    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(false);
    // Stamped again: memory is a later version than the deleted copy that landed, not the same one.
    expect((await a.getSessionGroup(gid, OWNER)).updatedAt.getTime()).toBeGreaterThan(store.files.get(gid)!.updatedAt.getTime());
    expect((await a.listSessionGroups(OWNER)).map((group) => group.id)).toEqual([gid]);
    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(false);
    later();
    await a.updateSessionGroup(gid, OWNER, { name: 'Still here' });
    expect(store.files.get(gid)).toMatchObject({ deleted: false, name: 'Still here' });
  });

  it('D2 a second delete called while the first is failing deletes the group', async () => {
    const { store, a, gid } = await twoTabs();
    store.failSaves(1);
    const first = a.deleteSessionGroup(gid, OWNER);
    const second = a.deleteSessionGroup(gid, OWNER);
    await expect(first).rejects.toThrow('S5 write failed');
    await second;

    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(true);
    expect(store.files.get(gid)!.deleted).toBe(true);
    expect(await a.listSessionGroups(OWNER)).toEqual([]);
  });

  it('D3 a rename queued behind a failing delete saves the group not deleted', async () => {
    const { store, a, gid } = await twoTabs();
    store.failSaves(1);
    const deleting = a.deleteSessionGroup(gid, OWNER);
    const renaming = a.updateSessionGroup(gid, OWNER, { name: 'Renamed' });
    await expect(deleting).rejects.toThrow('S5 write failed');
    await renaming;

    expect(store.files.get(gid)).toMatchObject({ deleted: false, name: 'Renamed' });
  });

  it('D6 a failing delete of a group that is already deleted leaves it deleted', async () => {
    const { store, a, gid } = await twoTabs();
    await a.deleteSessionGroup(gid, OWNER);
    store.failSaves(1);
    await expect(a.deleteSessionGroup(gid, OWNER)).rejects.toThrow('S5 write failed');

    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(true);
    expect(await a.listSessionGroups(OWNER)).toEqual([]);
  });

  it('D5 a list that ran during the failing save does not leave the group deleted', async () => {
    const { store, a, gid } = await twoTabs();
    store.save.mockImplementationOnce(async () => {
      await a.listSessionGroups(OWNER); // puts a new group object in memory while the save is in flight
      throw new Error('S5 write failed');
    });
    await expect(a.deleteSessionGroup(gid, OWNER)).rejects.toThrow('S5 write failed');

    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(false);
    expect(a.getCachedSessionGroups(OWNER).map((group) => group.id)).toEqual([gid]);
  });

  it('D4 a delete that saves is as before, and so are its refusals', async () => {
    const { store, a, gid } = await twoTabs();
    await expect(a.deleteSessionGroup('sg-none', OWNER)).rejects.toThrow('Session group not found');
    await expect(a.deleteSessionGroup(gid, 'owner-b')).rejects.toThrow('Permission denied');
    expect((await a.getSessionGroup(gid, OWNER)).deleted).toBe(false);

    const deleting = a.deleteSessionGroup(gid, OWNER);
    expect(a.getCachedSessionGroups(OWNER)).toEqual([]); // hidden at once when nothing is ahead of it
    await deleting;
    expect(store.files.get(gid)!.deleted).toBe(true);
    expect(await a.listSessionGroups(OWNER)).toEqual([]);
  });
});

describe('package surface', () => {
  it('E1 SessionGroupManager is exported from the package root and works without storage', async () => {
    const root = await import('../../src/index');
    expect(root.SessionGroupManager).toBe(SessionGroupManager);
    const manager = new root.SessionGroupManager();
    const group = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    expect(manager.getCachedSessionGroups(OWNER)).toEqual([group]);
  }, 60_000);

  it('E2 capability flags', () => {
    expect((SDK_CAPABILITIES as any).sessionGroupChatRevision).toBe(true);
    expect((SDK_CAPABILITIES as any).sessionGroupDeleteRestores).toBe(true);
  });
});
