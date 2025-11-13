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
  ChatMessage,
  CreateSessionGroupInput,
  UpdateSessionGroupInput,
  VectorDatabaseMetadata
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
        // Note: In real SDK, chatSessions is string[] (just IDs)
        // Mock data fixtures still use ChatSessionSummary for backward compatibility
        const sessionMetas = group.chatSessions as any;
        if (Array.isArray(sessionMetas) && sessionMetas.length > 0 && typeof sessionMetas[0] === 'object') {
          sessionMetas.forEach((sessionMeta: any) => {
            const fullSession: ChatSession = {
              sessionId: sessionMeta.sessionId,
              groupId: group.id,
              title: sessionMeta.title,
              messages: generateMockChatMessages(sessionMeta.title),
              metadata: {
                model: 'llama-3',
                hostUrl: 'http://localhost:8080',
                databasesUsed: group.linkedDatabases
              },
              created: sessionMeta.timestamp,
              updated: sessionMeta.timestamp
            };
            this.chatStorage.set(sessionMeta.sessionId, fullSession);
          });
        }
      });
    }
  }

  async createSessionGroup(
    input: CreateSessionGroupInput
  ): Promise<SessionGroup> {
    await this.delay(500); // Simulate network delay

    const group: SessionGroup = {
      id: this.generateId('group'),
      name: input.name,
      description: input.description,           // REQUIRED
      createdAt: new Date(),                    // Date object
      updatedAt: new Date(),                    // Date object
      owner: input.owner,
      linkedDatabases: [],                      // Renamed from databases
      defaultDatabase: undefined,               // OPTIONAL - Renamed from defaultDatabaseId
      chatSessions: [],                         // Just IDs (string[])
      metadata: input.metadata || {},           // Custom metadata
      deleted: false                            // Soft-delete flag
    };

    this.storage.set(group.id, group);
    console.log('[Mock] Created session group:', input.name);

    return group;
  }

  async listSessionGroups(owner: string): Promise<SessionGroup[]> {
    await this.delay(200);

    const groups = this.storage.getAll() as SessionGroup[];

    // Filter by owner and exclude deleted groups
    const filtered = groups.filter(g => g.owner === owner && !g.deleted);

    // Sort by updatedAt (newest first)
    // Handle cases where updatedAt might be undefined or not a Date object
    return filtered.sort((a, b) => {
      const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
      const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
      return bTime - aTime;
    });
  }

  async getSessionGroup(groupId: string, requestor: string): Promise<SessionGroup> {
    await this.delay(150);

    const group = this.storage.get<SessionGroup>(groupId);
    if (!group) {
      throw new Error(`[Mock] Session group not found: ${groupId}`);
    }

    if (group.deleted) {
      throw new Error(`[Mock] Session group has been deleted: ${groupId}`);
    }

    // In real SDK, this would check permissions (requestor can access if owner or has permission)
    // For mock, we just allow access if requestor is owner
    if (group.owner !== requestor) {
      throw new Error(`[Mock] Access denied: ${requestor} cannot access group ${groupId}`);
    }

    return group;
  }

  async deleteSessionGroup(groupId: string, requestor: string): Promise<void> {
    await this.delay(300);

    // Get the group (this also checks permissions)
    const group = await this.getSessionGroup(groupId, requestor);

    // Soft delete (mark as deleted instead of removing)
    group.deleted = true;
    group.updatedAt = new Date();

    this.storage.set(groupId, group);
    console.log('[Mock] Soft-deleted session group:', groupId);
  }

  async updateSessionGroup(
    groupId: string,
    requestor: string,
    updates: UpdateSessionGroupInput
  ): Promise<SessionGroup> {
    await this.delay(250);

    const group = await this.getSessionGroup(groupId, requestor);

    // Apply allowed updates (only name, description, metadata)
    if (updates.name !== undefined) group.name = updates.name;
    if (updates.description !== undefined) group.description = updates.description;
    if (updates.metadata !== undefined) {
      group.metadata = { ...group.metadata, ...updates.metadata };
    }

    group.updatedAt = new Date();

    this.storage.set(groupId, group);
    return group;
  }

  async linkVectorDatabase(groupId: string, requestor: string, databaseId: string): Promise<SessionGroup> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId, requestor);

    if (!group.linkedDatabases.includes(databaseId)) {
      group.linkedDatabases.push(databaseId);
      group.updatedAt = new Date();
      this.storage.set(groupId, group);
    }

    console.log('[Mock] Linked vector database to group:', databaseId);
    return group;
  }

  async unlinkVectorDatabase(groupId: string, requestor: string, databaseId: string): Promise<SessionGroup> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId, requestor);

    group.linkedDatabases = group.linkedDatabases.filter(db => db !== databaseId);

    // Clear default database if it was the unlinked one
    if (group.defaultDatabase === databaseId) {
      group.defaultDatabase = undefined;
    }

    group.updatedAt = new Date();
    this.storage.set(groupId, group);

    console.log('[Mock] Unlinked vector database from group:', databaseId);
    return group;
  }

  async setDefaultDatabase(groupId: string, requestor: string, databaseId?: string): Promise<SessionGroup> {
    await this.delay(100);

    const group = await this.getSessionGroup(groupId, requestor);

    // If databaseId provided, verify it's linked
    if (databaseId && !group.linkedDatabases.includes(databaseId)) {
      throw new Error(`[Mock] Database ${databaseId} is not linked to group ${groupId}`);
    }

    group.defaultDatabase = databaseId;
    group.updatedAt = new Date();
    this.storage.set(groupId, group);

    console.log('[Mock] Set default database:', databaseId || 'none');
    return group;
  }

  async listLinkedDatabases(groupId: string, requestor: string): Promise<VectorDatabaseMetadata[]> {
    await this.delay(150);

    const group = await this.getSessionGroup(groupId, requestor);

    // Mock: Return metadata for linked databases
    // In real SDK, this would query the actual vector database metadata
    return group.linkedDatabases.map(dbId => ({
      id: dbId,
      name: dbId,
      dimensions: 384,
      vectorCount: Math.floor(Math.random() * 10000),
      storageSizeBytes: Math.floor(Math.random() * 5000000),
      owner: group.owner,
      created: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
      lastAccessed: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
      description: `Mock vector database: ${dbId}`,
      folderStructure: true
    }));
  }

  async handleDatabaseDeletion(databaseId: string): Promise<void> {
    await this.delay(200);

    // Remove database from all groups that link to it
    const allGroups = this.storage.getAll() as SessionGroup[];

    for (const group of allGroups) {
      let updated = false;

      if (group.linkedDatabases.includes(databaseId)) {
        group.linkedDatabases = group.linkedDatabases.filter(db => db !== databaseId);
        updated = true;
      }

      if (group.defaultDatabase === databaseId) {
        group.defaultDatabase = undefined;
        updated = true;
      }

      if (updated) {
        group.updatedAt = new Date();
        this.storage.set(group.id, group);
      }
    }

    console.log('[Mock] Handled database deletion:', databaseId);
  }

  // Group Document Methods

  async addGroupDocument(groupId: string, document: { id: string; name: string; size: number; uploaded: number; contentType?: string }): Promise<void> {
    await this.delay(150);

    const group = this.storage.get<SessionGroup>(groupId);
    if (!group) {
      throw new Error(`[Mock] Session group not found: ${groupId}`);
    }

    // Initialize groupDocuments array if it doesn't exist
    if (!group.groupDocuments) {
      group.groupDocuments = [];
    }

    // Add document to the group
    group.groupDocuments.push(document);
    group.updatedAt = new Date();
    this.storage.set(groupId, group);

    console.log('[Mock] Added document to group:', document.name);
  }

  async removeGroupDocument(groupId: string, documentId: string): Promise<void> {
    await this.delay(150);

    const group = this.storage.get<SessionGroup>(groupId);
    if (!group) {
      throw new Error(`[Mock] Session group not found: ${groupId}`);
    }

    // Remove document from the group
    if (group.groupDocuments) {
      group.groupDocuments = group.groupDocuments.filter(doc => doc.id !== documentId);
      group.updatedAt = new Date();
      this.storage.set(groupId, group);
    }

    console.log('[Mock] Removed document from group:', documentId);
  }

  // Chat Session Methods (UPDATED - Real SDK only has addChatSession and listChatSessions)

  async addChatSession(groupId: string, requestor: string, sessionId: string): Promise<SessionGroup> {
    await this.delay(200);

    const group = await this.getSessionGroup(groupId, requestor);

    // Add session ID to group
    if (!group.chatSessions.includes(sessionId)) {
      group.chatSessions.push(sessionId);
      group.updatedAt = new Date();
      this.storage.set(groupId, group);
    }

    console.log('[Mock] Added chat session to group:', sessionId);
    return group;
  }

  async listChatSessions(groupId: string, requestor: string): Promise<string[]> {
    await this.delay(150);

    const group = await this.getSessionGroup(groupId, requestor);
    return group.chatSessions;
  }

  // DEPRECATED METHODS REMOVED:
  // - startChatSession (use SessionManager in real SDK)
  // - getChatSession (use SessionManager in real SDK)
  // - continueChatSession (use SessionManager in real SDK)
  // - addMessage (use SessionManager in real SDK)
  // - generateSessionTitle (use SessionManager in real SDK)
  // - deleteChatSession (use SessionManager in real SDK)
  // - searchChatSessions (use SessionManager in real SDK)
  // - addGroupDocument (use DocumentManager in real SDK)
  // - removeGroupDocument (use DocumentManager in real SDK)
  // - listGroupDocuments (use DocumentManager in real SDK)
  // - shareGroup (use PermissionManager in real SDK)
  // - unshareGroup (use PermissionManager in real SDK)
  // - listSharedGroups (use PermissionManager in real SDK)
  // - getGroupPermissions (use PermissionManager in real SDK)

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
