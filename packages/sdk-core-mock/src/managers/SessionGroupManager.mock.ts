/**
 * SessionGroupManagerMock
 *
 * Mock implementation of ISessionGroupManager for UI development
 * Stores data in localStorage with realistic delays
 */

import type {
  ISessionGroupManager,
  SessionGroup,
  ChatSession,
  ChatMessage
} from '../types';
import { MockStorage } from '../storage/MockStorage';
import { generateMockSessionGroups, generateMockChatMessages } from '../fixtures/mockData';

export class SessionGroupManagerMock implements ISessionGroupManager {
  private storage: MockStorage;
  private chatStorage: MockStorage;
  private userAddress: string;

  constructor(userAddress: string) {
    this.userAddress = userAddress;
    this.storage = new MockStorage(`session-groups-${userAddress}`);
    this.chatStorage = new MockStorage(`chat-sessions-${userAddress}`);

    // Initialize with mock data if empty
    if (this.storage.size() === 0) {
      console.log('[Mock] Initializing session groups with mock data');
      generateMockSessionGroups().forEach(group => {
        this.storage.set(group.id, group);

        // Initialize chat sessions for this group
        group.chatSessions.forEach(sessionMeta => {
          const fullSession: ChatSession = {
            sessionId: sessionMeta.sessionId,
            groupId: group.id,
            title: sessionMeta.title,
            messages: generateMockChatMessages(sessionMeta.title),
            metadata: {
              model: 'llama-3',
              hostUrl: 'http://localhost:8080',
              databasesUsed: group.databases
            },
            created: sessionMeta.timestamp,
            updated: sessionMeta.timestamp
          };
          this.chatStorage.set(sessionMeta.sessionId, fullSession);
        });
      });
    }
  }

  async createSessionGroup(
    name: string,
    options?: { description?: string; databases?: string[] }
  ): Promise<SessionGroup> {
    await this.delay(500); // Simulate network delay

    const group: SessionGroup = {
      id: this.generateId('group'),
      name,
      description: options?.description,
      databases: options?.databases || [],
      defaultDatabaseId: this.generateId('default-db'),
      chatSessions: [],
      owner: this.userAddress,
      created: Date.now(),
      updated: Date.now(),
      permissions: {
        readers: [],
        writers: []
      }
    };

    this.storage.set(group.id, group);
    console.log('[Mock] Created session group:', name);

    return group;
  }

  async listSessionGroups(): Promise<SessionGroup[]> {
    await this.delay(200);

    const groups = this.storage.getAll() as SessionGroup[];

    // Sort by updated (newest first)
    return groups.sort((a, b) => b.updated - a.updated);
  }

  async getSessionGroup(groupId: string): Promise<SessionGroup> {
    await this.delay(150);

    const group = this.storage.get<SessionGroup>(groupId);
    if (!group) {
      throw new Error(`[Mock] Session group not found: ${groupId}`);
    }

    return group;
  }

  async deleteSessionGroup(groupId: string): Promise<void> {
    await this.delay(300);

    // Delete the group
    const group = await this.getSessionGroup(groupId);

    // Delete all associated chat sessions
    group.chatSessions.forEach(sessionMeta => {
      this.chatStorage.delete(sessionMeta.sessionId);
    });

    this.storage.delete(groupId);
    console.log('[Mock] Deleted session group:', groupId);
  }

  async updateSessionGroup(
    groupId: string,
    updates: Partial<SessionGroup>
  ): Promise<SessionGroup> {
    await this.delay(250);

    const group = await this.getSessionGroup(groupId);
    const updated = {
      ...group,
      ...updates,
      id: group.id, // Preserve ID
      owner: group.owner, // Preserve owner
      created: group.created, // Preserve created time
      updated: Date.now()
    };

    this.storage.set(groupId, updated);
    return updated;
  }

  async linkDatabase(groupId: string, databaseName: string): Promise<void> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    if (!group.databases.includes(databaseName)) {
      group.databases.push(databaseName);
      group.updated = Date.now();
      this.storage.set(groupId, group);
    }

    console.log('[Mock] Linked database to group:', databaseName);
  }

  async unlinkDatabase(groupId: string, databaseName: string): Promise<void> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    group.databases = group.databases.filter(db => db !== databaseName);
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Unlinked database from group:', databaseName);
  }

  async getDefaultDatabase(groupId: string): Promise<string> {
    await this.delay(100);

    const group = await this.getSessionGroup(groupId);
    return group.defaultDatabaseId;
  }

  // Chat Session Methods

  async startChatSession(
    groupId: string,
    initialMessage?: string
  ): Promise<ChatSession> {
    await this.delay(400);

    const group = await this.getSessionGroup(groupId);

    const session: ChatSession = {
      sessionId: this.generateId('sess'),
      groupId,
      title: initialMessage
        ? this.generateTitle(initialMessage)
        : 'New conversation',
      messages: initialMessage ? [{
        role: 'user',
        content: initialMessage,
        timestamp: Date.now()
      }] : [],
      metadata: {
        model: 'llama-3',
        hostUrl: 'http://localhost:8080',
        databasesUsed: group.databases
      },
      created: Date.now(),
      updated: Date.now()
    };

    // Store session
    this.chatStorage.set(session.sessionId, session);

    // Add to group's session list
    group.chatSessions.push({
      sessionId: session.sessionId,
      title: session.title,
      timestamp: session.created,
      messageCount: session.messages.length,
      active: true,
      lastMessage: initialMessage
    });
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Started chat session:', session.sessionId);
    return session;
  }

  async getChatSession(groupId: string, sessionId: string): Promise<ChatSession> {
    await this.delay(150);

    const session = this.chatStorage.get<ChatSession>(sessionId);
    if (!session || session.groupId !== groupId) {
      throw new Error(`[Mock] Chat session not found: ${sessionId}`);
    }

    return session;
  }

  async listChatSessions(
    groupId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ChatSession[]> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId);
    const sessionIds = group.chatSessions.map(s => s.sessionId);

    const sessions: ChatSession[] = [];
    for (const sessionId of sessionIds) {
      const session = this.chatStorage.get<ChatSession>(sessionId);
      if (session) sessions.push(session);
    }

    // Sort by updated (newest first)
    sessions.sort((a, b) => b.updated - a.updated);

    // Apply pagination
    const { limit = 50, offset = 0 } = options || {};
    return sessions.slice(offset, offset + limit);
  }

  async continueChatSession(groupId: string, sessionId: string): Promise<ChatSession> {
    await this.delay(200);

    const session = await this.getChatSession(groupId, sessionId);

    // Update group's session list to mark as active
    const group = await this.getSessionGroup(groupId);
    const sessionMeta = group.chatSessions.find(s => s.sessionId === sessionId);
    if (sessionMeta) {
      sessionMeta.active = true;
      group.updated = Date.now();
      this.storage.set(groupId, group);
    }

    return session;
  }

  async addMessage(
    groupId: string,
    sessionId: string,
    message: ChatMessage
  ): Promise<void> {
    await this.delay(100);

    const session = await this.getChatSession(groupId, sessionId);
    session.messages.push(message);
    session.updated = Date.now();
    this.chatStorage.set(sessionId, session);

    // Update group's session metadata
    const group = await this.getSessionGroup(groupId);
    const sessionMeta = group.chatSessions.find(s => s.sessionId === sessionId);
    if (sessionMeta) {
      sessionMeta.messageCount = session.messages.length;
      sessionMeta.lastMessage = message.content.substring(0, 100);
      sessionMeta.timestamp = message.timestamp;
      group.updated = Date.now();
      this.storage.set(groupId, group);
    }
  }

  async generateSessionTitle(messages: ChatMessage[]): Promise<string> {
    await this.delay(100);

    // Use first user message as title
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
      return this.generateTitle(firstUserMessage.content);
    }

    return 'New conversation';
  }

  async deleteChatSession(groupId: string, sessionId: string): Promise<void> {
    await this.delay(300);

    // Remove session data
    this.chatStorage.delete(sessionId);

    // Remove from group's session list
    const group = await this.getSessionGroup(groupId);
    group.chatSessions = group.chatSessions.filter(s => s.sessionId !== sessionId);
    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Deleted chat session:', sessionId);
  }

  async searchChatSessions(groupId: string, query: string): Promise<ChatSession[]> {
    await this.delay(300);

    const sessions = await this.listChatSessions(groupId);

    // Simple search: check if query appears in title or messages
    const queryLower = query.toLowerCase();
    return sessions.filter(session => {
      if (session.title.toLowerCase().includes(queryLower)) {
        return true;
      }

      return session.messages.some(msg =>
        msg.content.toLowerCase().includes(queryLower)
      );
    });
  }

  // Sharing Methods

  async shareGroup(
    groupId: string,
    userAddress: string,
    role: 'reader' | 'writer'
  ): Promise<void> {
    await this.delay(300);

    const group = await this.getSessionGroup(groupId);

    if (role === 'reader' && !group.permissions?.readers?.includes(userAddress)) {
      group.permissions = group.permissions || { readers: [], writers: [] };
      group.permissions.readers!.push(userAddress);
    } else if (role === 'writer' && !group.permissions?.writers?.includes(userAddress)) {
      group.permissions = group.permissions || { readers: [], writers: [] };
      group.permissions.writers!.push(userAddress);
    }

    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Shared group with:', userAddress, role);
  }

  async unshareGroup(groupId: string, userAddress: string): Promise<void> {
    await this.delay(250);

    const group = await this.getSessionGroup(groupId);

    if (group.permissions) {
      group.permissions.readers = group.permissions.readers?.filter(a => a !== userAddress);
      group.permissions.writers = group.permissions.writers?.filter(a => a !== userAddress);
    }

    group.updated = Date.now();
    this.storage.set(groupId, group);

    console.log('[Mock] Unshared group with:', userAddress);
  }

  async listSharedGroups(): Promise<SessionGroup[]> {
    await this.delay(200);

    // Mock: Return groups owned by others where current user has permissions
    const allGroups = this.storage.getAll() as SessionGroup[];

    return allGroups.filter(g =>
      g.owner !== this.userAddress &&
      (g.permissions?.readers?.includes(this.userAddress) ||
       g.permissions?.writers?.includes(this.userAddress))
    );
  }

  async getGroupPermissions(groupId: string): Promise<{
    readers: string[];
    writers: string[];
  }> {
    await this.delay(100);

    const group = await this.getSessionGroup(groupId);
    return group.permissions || { readers: [], writers: [] };
  }

  // Helper Methods

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateTitle(message: string): string {
    // Take first 50 chars of message as title
    return message.substring(0, 50) + (message.length > 50 ? '...' : '');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
