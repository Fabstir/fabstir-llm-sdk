// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * 1.39.31: a creation whose save fails is not a creation (docs/development/IMPLEMENTATION-SESSION-GROUP-CREATE-SAVE.md
 * S1–S5). createSessionGroup and startChatSession rethrow the save's error and leave nothing behind in memory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { SDKError } from '../../src/types';
import type { SessionGroup } from '../../src/types/session-groups.types';

const OWNER = 'owner-a';
const offline = () => new SDKError('S5 is not connected: the reconnect attempt did not succeed', 'STORAGE_OFFLINE', { retryable: true });

function makeStorage() {
  return {
    save: vi.fn(async (_group: SessionGroup) => {}),
    loadAll: vi.fn(async (): Promise<SessionGroup[]> => []),
    load: vi.fn(async (id: string): Promise<SessionGroup> => { throw new Error(`Session group not found: ${id}`); }),
  };
}

describe('createSessionGroup: a failed save fails the creation (S1)', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('rejects with the save\'s own error, and memory does not know the group', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const err = offline();
    storage.save.mockRejectedValueOnce(err);
    await expect(manager.createSessionGroup({ name: 'G', owner: OWNER })).rejects.toBe(err);
    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
    const id = storage.save.mock.calls[0][0].id;
    await expect(manager.getSessionGroup(id, OWNER)).rejects.toThrow(/not found/i);
  });

  it('a retry after the failure creates exactly one group', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.save.mockRejectedValueOnce(offline());
    await manager.createSessionGroup({ name: 'G', owner: OWNER }).catch(() => {});
    const created = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    expect((await manager.listSessionGroups(OWNER)).map((g) => g.id)).toEqual([created.id]);
  });

  it('a disposal still surfaces as itself', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const disposed = new SDKError('disposed', 'STORAGE_MANAGER_DISPOSED');
    storage.save.mockRejectedValueOnce(disposed);
    await expect(manager.createSessionGroup({ name: 'G', owner: OWNER })).rejects.toBe(disposed);
  });

  it('review MAJOR: a failure that may come after the write keeps the group, and still reaches the caller', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const unverified = new Error('Session group "G" saved locally but network persistence could not be verified.');
    storage.save.mockRejectedValueOnce(unverified);
    await expect(manager.createSessionGroup({ name: 'G', owner: OWNER })).rejects.toBe(unverified);
    const id = storage.save.mock.calls[0][0].id;
    expect((await manager.listSessionGroups(OWNER)).map((g) => g.id)).toEqual([id]);
  });

  it('STORAGE_CLEANUP (also refused before s5js) rolls back like STORAGE_OFFLINE', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    storage.save.mockRejectedValueOnce(new SDKError('cleaned up', 'STORAGE_CLEANUP', { retryable: false }));
    await expect(manager.createSessionGroup({ name: 'G', owner: OWNER })).rejects.toMatchObject({ code: 'STORAGE_CLEANUP' });
    expect(await manager.listSessionGroups(OWNER)).toEqual([]);
  });

  it('with no storage the group is created in memory, as before (S4)', async () => {
    const manager = new SessionGroupManager();
    const g = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    expect((await manager.getSessionGroup(g.id, OWNER)).name).toBe('G');
  });

  it('a successful save is unchanged', async () => {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const g = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect((await manager.listSessionGroups(OWNER)).map((x) => x.id)).toEqual([g.id]);
  });
});

describe('startChatSession: a failed save fails the new chat (S2)', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  async function withChat() {
    const storage = makeStorage();
    const manager = new SessionGroupManager(storage as any);
    const group = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    const kept = await manager.startChatSession(group.id, 'Kept');
    return { storage, manager, group, kept };
  }

  it('rejects with the save\'s own error; the group holds no trace of the chat; other chats are untouched', async () => {
    const { storage, manager, group, kept } = await withChat();
    const err = offline();
    let failedId = '';
    storage.save.mockImplementationOnce(async (g: SessionGroup) => {
      failedId = g.chatSessions.find((id) => id !== kept.sessionId)!;   // read as the save saw it
      throw err;
    });
    await expect(manager.startChatSession(group.id, 'Lost')).rejects.toBe(err);
    expect(failedId).toMatch(/^sess-/);
    const now = await manager.getSessionGroup(group.id, OWNER);
    expect(now.chatSessions).toEqual([kept.sessionId]);
    expect(Object.keys(now.chatSessionsData ?? {})).toEqual([kept.sessionId]);
    expect(await manager.getChatSession(group.id, failedId)).toBeNull();
    expect((await manager.getChatSession(group.id, kept.sessionId))?.title).toBe('Kept');
  });

  it('the next save does not carry the failed chat', async () => {
    const { storage, manager, group, kept } = await withChat();
    storage.save.mockRejectedValueOnce(offline());
    await manager.startChatSession(group.id, 'Lost').catch(() => {});
    const again = await manager.startChatSession(group.id, 'Again');
    const last = storage.save.mock.calls.at(-1)![0];
    expect(last.chatSessions).toEqual([kept.sessionId, again.sessionId]);
    expect(Object.keys(last.chatSessionsData ?? {}).sort()).toEqual([kept.sessionId, again.sessionId].sort());
  });

  it('S5: a list during the failing save hands out a new group object; the rollback reaches the one memory holds', async () => {
    const { storage, manager, group, kept } = await withChat();
    let fail!: (e: unknown) => void;
    storage.save.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    const starting = manager.startChatSession(group.id, 'Lost').catch((e) => e);
    await new Promise((r) => setTimeout(r, 0));
    const [listed] = await manager.listSessionGroups(OWNER);          // a new object, now the one in memory
    expect(listed).not.toBe(group);
    fail(offline());
    expect((await starting).code).toBe('STORAGE_OFFLINE');
    const now = await manager.getSessionGroup(group.id, OWNER);
    expect(now.chatSessions).toEqual([kept.sessionId]);
    expect(Object.keys(now.chatSessionsData ?? {})).toEqual([kept.sessionId]);
    // review MINOR 2: the object handed out before the list is cleaned too
    expect(group.chatSessions).toEqual([kept.sessionId]);
    expect(Object.keys(group.chatSessionsData ?? {})).toEqual([kept.sessionId]);
  });

  it('review MAJOR: a failure that may come after the write keeps the chat, and still reaches the caller', async () => {
    const { storage, manager, group, kept } = await withChat();
    const timeout = new Error('S5 put operation timed out after 15000ms');
    storage.save.mockRejectedValueOnce(timeout);
    await expect(manager.startChatSession(group.id, 'Maybe')).rejects.toBe(timeout);
    const now = await manager.getSessionGroup(group.id, OWNER);
    expect(now.chatSessions).toHaveLength(2);
    expect(now.chatSessions[0]).toBe(kept.sessionId);
  });

  it('review MINOR 1: a save of the group queued behind a failing start never carries the withdrawn chat', async () => {
    const { storage, manager, group, kept } = await withChat();
    let fail!: (e: unknown) => void;
    storage.save.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    const starting = manager.startChatSession(group.id, 'Lost').catch((e) => e);
    await new Promise((r) => setTimeout(r, 0));
    const adding = manager.addMessage(group.id, kept.sessionId, { role: 'user', content: 'hi', timestamp: Date.now() });
    await new Promise((r) => setTimeout(r, 0));
    fail(offline());
    expect((await starting).code).toBe('STORAGE_OFFLINE');
    await adding;
    const last = storage.save.mock.calls.at(-1)![0];
    expect(last.chatSessions).toEqual([kept.sessionId]);
    expect(Object.keys(last.chatSessionsData ?? {})).toEqual([kept.sessionId]);
  });

  it('a disposal still surfaces as itself', async () => {
    const { storage, manager, group } = await withChat();
    const disposed = new SDKError('disposed', 'STORAGE_MANAGER_DISPOSED');
    storage.save.mockRejectedValueOnce(disposed);
    await expect(manager.startChatSession(group.id, 'X')).rejects.toBe(disposed);
  });

  it('with no storage the chat is started in memory, as before (S4)', async () => {
    const manager = new SessionGroupManager();
    const g = await manager.createSessionGroup({ name: 'G', owner: OWNER });
    const c = await manager.startChatSession(g.id, 'C');
    expect((await manager.getChatSession(g.id, c.sessionId))?.title).toBe('C');
  });
});
