// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SessionGroupManager.getChatSessionsBulk — added in 1.20.0.
 * Validates that bulk lookups use a SINGLE S5 manifest fetch (via the
 * underlying getSessionGroup path) rather than N parallel per-session
 * fetches, and that the API is order-preserving + missing-tolerant.
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import type { SessionGroup, ChatSession } from '../../src/types/session-groups.types';

const REQUESTOR = '0xowner';
const GROUP_ID = 'g1';

function makeChatSession(id: string, groupId = GROUP_ID): ChatSession {
  return {
    id,
    groupId,
    title: `Session ${id}`,
    sessionId: id,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as ChatSession;
}

function makeGroupWithSessions(sessionIds: string[]): SessionGroup {
  const chatSessionsData: Record<string, ChatSession> = {};
  for (const id of sessionIds) chatSessionsData[id] = makeChatSession(id);
  return {
    id: GROUP_ID,
    name: 'g1',
    owner: REQUESTOR,
    chatSessions: sessionIds,
    chatSessionsData,
    documents: [],
    sharedWith: [],
    permissions: {},
    deleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as unknown as SessionGroup;
}

function makeStorage(group: SessionGroup) {
  return {
    load: vi.fn().mockResolvedValue(group),
    save: vi.fn(),
    loadAll: vi.fn().mockResolvedValue([group]),
    delete: vi.fn(),
  };
}

describe('SessionGroupManager.getChatSessionsBulk', () => {
  it('returns sessions in input order; missing IDs come back as null', async () => {
    const group = makeGroupWithSessions(['s1', 's2', 's3']);
    const storage = makeStorage(group);
    const mgr = new SessionGroupManager(storage as any);

    const result = await mgr.getChatSessionsBulk(GROUP_ID, ['s2', 's1', 'absent', 's3'], REQUESTOR);

    expect(result.map((s) => s?.id ?? null)).toEqual(['s2', 's1', null, 's3']);
  });

  it('cold path triggers exactly ONE S5 group load, not N parallel per-session loads', async () => {
    const group = makeGroupWithSessions(['s1', 's2', 's3', 's4', 's5']);
    const storage = makeStorage(group);
    const mgr = new SessionGroupManager(storage as any);

    await mgr.getChatSessionsBulk(GROUP_ID, ['s1', 's2', 's3', 's4', 's5'], REQUESTOR);

    // Single manifest load — the optimization the bulk method exists to provide.
    expect(storage.load).toHaveBeenCalledTimes(1);
  });

  it('warm path skips the S5 fetch entirely when all requested sessions are cached', async () => {
    const group = makeGroupWithSessions(['s1', 's2']);
    const storage = makeStorage(group);
    const mgr = new SessionGroupManager(storage as any);

    // Prime the cache with one full lookup
    await mgr.getChatSessionsBulk(GROUP_ID, ['s1', 's2'], REQUESTOR);
    storage.load.mockClear();

    // Second bulk lookup over the same IDs — should NOT touch S5
    const result = await mgr.getChatSessionsBulk(GROUP_ID, ['s1', 's2'], REQUESTOR);
    expect(storage.load).not.toHaveBeenCalled();
    expect(result.map((s) => s?.id)).toEqual(['s1', 's2']);
  });

  it('throws if any returned session disagrees with the requested groupId', async () => {
    const wrongGroupSession = makeChatSession('rogue', 'g-other');
    const group = makeGroupWithSessions(['s1']);
    // Inject a session whose groupId mismatches into storage; bulk loads it via cache after S5 load
    (group.chatSessionsData as any)['rogue'] = wrongGroupSession;
    group.chatSessions = ['s1', 'rogue'];
    const storage = makeStorage(group);
    const mgr = new SessionGroupManager(storage as any);

    await expect(mgr.getChatSessionsBulk(GROUP_ID, ['rogue'], REQUESTOR)).rejects.toThrow(
      /does not belong to group/,
    );
  });

  it('returns array of nulls (no throw) when group fetch fails entirely', async () => {
    const storage = {
      load: vi.fn().mockRejectedValue(new Error('S5 read failed')),
      save: vi.fn(),
      loadAll: vi.fn().mockRejectedValue(new Error('S5 read failed')),
      delete: vi.fn(),
    };
    const mgr = new SessionGroupManager(storage as any);

    const result = await mgr.getChatSessionsBulk(GROUP_ID, ['s1', 's2'], REQUESTOR);
    expect(result).toEqual([null, null]);
  });

  it('returns empty array for empty input without touching storage', async () => {
    const group = makeGroupWithSessions(['s1']);
    const storage = makeStorage(group);
    const mgr = new SessionGroupManager(storage as any);

    const result = await mgr.getChatSessionsBulk(GROUP_ID, [], REQUESTOR);
    expect(result).toEqual([]);
    expect(storage.load).not.toHaveBeenCalled();
  });
});
