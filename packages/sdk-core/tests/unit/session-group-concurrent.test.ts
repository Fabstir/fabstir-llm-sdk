// Copyright (c) 2025 Fabstir  SPDX-License-Identifier: BUSL-1.1
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';

describe('SessionGroupManager concurrent writes', () => {
  let saveTimestamps: { start: number; end: number }[] = [];
  let saveDelay = 50;
  const mockStorage = {
    save: vi.fn(async () => {
      const start = Date.now();
      await new Promise(r => setTimeout(r, saveDelay));
      saveTimestamps.push({ start, end: Date.now() });
    }),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadById: vi.fn().mockResolvedValue(null),
    loadAll: vi.fn().mockResolvedValue([]),
  };

  function makeGroup(id: string, sessionId: string) {
    const session = {
      sessionId, groupId: id, title: 'Test', messages: [] as any[],
      metadata: {}, created: Date.now(), updated: Date.now(),
    };
    const group = {
      id, name: 'Test', createdAt: new Date(), updatedAt: new Date(),
      owner: 'test-owner', linkedDatabases: [] as string[],
      chatSessions: [sessionId],
      chatSessionsData: { [sessionId]: session } as Record<string, any>,
      documents: [] as any[], metadata: {}, deleted: false,
    };
    return { group, session };
  }

  function setupManager(): SessionGroupManager {
    const manager = new SessionGroupManager(mockStorage as any);
    const { group, session } = makeGroup('group-1', 'session-1');
    (manager as any).groups.set('group-1', group);
    (manager as any).chatStorage.set('session-1', session);
    return manager;
  }

  const msg = (content: string) => ({ role: 'user' as const, content, timestamp: Date.now() });

  beforeEach(() => {
    saveTimestamps = [];
    saveDelay = 50;
    mockStorage.save.mockClear();
    mockStorage.load.mockClear();
  });

  it('should serialize addMessage calls to the same group', async () => {
    const manager = setupManager();
    await Promise.all([
      manager.addMessage('group-1', 'session-1', msg('msg-1')),
      manager.addMessage('group-1', 'session-1', msg('msg-2')),
      manager.addMessage('group-1', 'session-1', msg('msg-3')),
    ]);
    expect(saveTimestamps.length).toBe(3);
    for (let i = 1; i < saveTimestamps.length; i++) {
      expect(saveTimestamps[i].start).toBeGreaterThanOrEqual(saveTimestamps[i - 1].end);
    }
  });

  it('should serialize startChatSession and addMessage on same group', async () => {
    const manager = setupManager();
    await Promise.all([
      manager.startChatSession('group-1', 'New chat'),
      manager.addMessage('group-1', 'session-1', msg('concurrent')),
    ]);
    expect(saveTimestamps.length).toBe(2);
    expect(saveTimestamps[1].start).toBeGreaterThanOrEqual(saveTimestamps[0].end);
  });

  it('should allow concurrent writes to different groups', async () => {
    const manager = setupManager();
    const { group: g2, session: s2 } = makeGroup('group-2', 'session-2');
    (manager as any).groups.set('group-2', g2);
    (manager as any).chatStorage.set('session-2', s2);

    saveDelay = 50;
    const t0 = Date.now();
    await Promise.all([
      manager.addMessage('group-1', 'session-1', msg('g1')),
      manager.addMessage('group-2', 'session-2', msg('g2')),
    ]);
    expect(Date.now() - t0).toBeLessThan(100);
  });

  it('should preserve all messages after concurrent addMessage calls', async () => {
    const manager = setupManager();
    saveDelay = 10;
    await Promise.all([
      manager.addMessage('group-1', 'session-1', msg('alpha')),
      manager.addMessage('group-1', 'session-1', msg('beta')),
      manager.addMessage('group-1', 'session-1', msg('gamma')),
    ]);
    const group = (manager as any).groups.get('group-1');
    const messages = group.chatSessionsData['session-1'].messages;
    const contents = messages.map((m: any) => m.content);
    expect(contents).toContain('alpha');
    expect(contents).toContain('beta');
    expect(contents).toContain('gamma');
    expect(messages).toHaveLength(3);
  });

  it('should not block subsequent operations after save failure', async () => {
    const manager = setupManager();
    saveDelay = 5;
    mockStorage.save
      .mockRejectedValueOnce(new Error('S5 write failed'))
      .mockImplementation(async () => {
        const start = Date.now();
        await new Promise(r => setTimeout(r, saveDelay));
        saveTimestamps.push({ start, end: Date.now() });
      });
    await manager.addMessage('group-1', 'session-1', msg('first'));
    await manager.addMessage('group-1', 'session-1', msg('second'));
    expect(mockStorage.save).toHaveBeenCalledTimes(2);
  });
});
