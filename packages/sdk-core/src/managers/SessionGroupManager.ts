// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { ISessionGroupManager } from '../interfaces/ISessionGroupManager';
import type {
  SessionGroup,
  CreateSessionGroupInput,
  UpdateSessionGroupInput,
  VectorDatabaseMetadata,
  ChatSession,
  ChatMessage,
} from '../types/session-groups.types';
import { SessionGroupStorage } from '../storage/SessionGroupStorage';

/**
 * Session Group Manager
 *
 * Manages Session Groups (Claude Projects-style organization).
 * Groups organize related chat sessions and vector databases.
 *
 * Storage: S5-backed with in-memory caching for performance
 */
export class SessionGroupManager implements ISessionGroupManager {
  private groups: Map<string, SessionGroup> = new Map();
  // Mock database registry for testing (Phase 1 in-memory only)
  // In production, this would be replaced with VectorDatabaseManager
  private mockDatabases: Map<string, VectorDatabaseMetadata> = new Map();
  // Chat session storage (for UI testing - production uses SessionManager)
  private chatStorage: Map<string, ChatSession> = new Map();
  // S5 storage for persistence
  private storage: SessionGroupStorage | null = null;
  private storageInitialized: boolean = false;

  constructor(storage?: SessionGroupStorage) {
    this.storage = storage || null;
    this.storageInitialized = !!storage;
  }

  /**
   * Mock method to register a database for testing
   * In production, this would be handled by VectorDatabaseManager
   */
  private registerMockDatabase(db: VectorDatabaseMetadata): void {
    this.mockDatabases.set(db.id, db);
  }

  /**
   * Check if a database exists
   * In production, this would query VectorDatabaseManager
   */
  private async databaseExists(databaseId: string): Promise<boolean> {
    // Phase 1.2: In-memory stub - accept any database ID
    // TODO Phase 1.3+: Check VectorRAGManager for actual database existence
    return true;
  }

  /**
   * Get database metadata
   * In production, this would query VectorDatabaseManager
   */
  private async getDatabaseMetadata(databaseId: string): Promise<VectorDatabaseMetadata> {
    const db = this.mockDatabases.get(databaseId);
    if (!db) {
      throw new Error(`Database ${databaseId} not found in registry`);
    }
    return db;
  }

  /**
   * Create a new session group
   */
  async createSessionGroup(input: CreateSessionGroupInput): Promise<SessionGroup> {
    // Validate required fields
    if (!input.name || input.name.trim() === '') {
      throw new Error('name is required');
    }

    // Description is optional, but validate it's a string if provided
    if (input.description !== undefined && typeof input.description !== 'string') {
      throw new Error('description must be a string');
    }

    // Validate metadata if provided
    if (input.metadata !== undefined && typeof input.metadata !== 'object') {
      throw new Error('metadata must be an object');
    }

    // Generate unique ID
    const id = this.generateId();
    const now = new Date();

    const group: SessionGroup = {
      id,
      name: input.name,
      description: input.description,
      createdAt: now,
      updatedAt: now,
      owner: input.owner,
      linkedDatabases: [],
      chatSessions: [],
      documents: [],
      metadata: input.metadata || {},
      deleted: false,
    };

    // Store in memory cache
    this.groups.set(id, group);

    // Persist to S5 storage if available
    if (this.storage) {
      try {
        await this.storage.save(group);
      } catch (err) {
        console.error('[SessionGroupManager.createSessionGroup] Failed to save to S5 storage:', err);
        // Don't throw - allow operation to continue with in-memory only
        // This allows testing without full S5 setup
      }
    }

    return group;
  }

  /**
   * List all session groups for a user
   */
  async listSessionGroups(owner: string): Promise<SessionGroup[]> {
    // If S5 storage is available, load from S5
    if (this.storage) {
      try {
        const allGroups = await this.storage.loadAll();

        // Filter by owner and non-deleted
        const userGroups = allGroups.filter(g => g.owner === owner && !g.deleted);

        // Update in-memory cache
        userGroups.forEach(g => this.groups.set(g.id, g));
        return userGroups;
      } catch (err) {
        console.error('[SessionGroupManager.listSessionGroups] Failed to load from S5 storage:', err);
        // Fall back to in-memory cache
      }
    }

    // Fallback: use in-memory cache only
    const result: SessionGroup[] = [];
    for (const group of this.groups.values()) {
      if (group.owner === owner && !group.deleted) {
        result.push(group);
      }
    }

    return result;
  }

  /**
   * Get a specific session group by ID
   */
  async getSessionGroup(groupId: string, requestor: string): Promise<SessionGroup> {
    // Validate group ID
    if (!groupId || groupId.trim() === '') {
      throw new Error('Invalid group ID');
    }

    // Check in-memory cache first
    let group = this.groups.get(groupId);

    // If not in cache and S5 storage is available, try loading from S5
    if (!group && this.storage) {
      try {
        group = await this.storage.load(groupId);
        if (group) {
          // Update in-memory cache
          this.groups.set(groupId, group);
        }
      } catch (err) {
        console.error('[SessionGroupManager.getSessionGroup] Failed to load from S5 storage:', err);
        // Continue with cache-only check below
      }
    }

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    return group;
  }

  /**
   * Update a session group
   */
  async updateSessionGroup(
    groupId: string,
    requestor: string,
    updates: UpdateSessionGroupInput
  ): Promise<SessionGroup> {
    // Validate group ID
    if (!groupId || groupId.trim() === '') {
      throw new Error('Invalid group ID');
    }

    const group = this.groups.get(groupId);

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    // Apply updates
    if (updates.name !== undefined) {
      group.name = updates.name;
    }

    if (updates.description !== undefined) {
      group.description = updates.description;
    }

    if (updates.metadata !== undefined) {
      // Merge metadata
      group.metadata = { ...group.metadata, ...updates.metadata };
    }

    group.updatedAt = new Date();

    this.groups.set(groupId, group);
    return group;
  }

  /**
   * Soft-delete a session group (sets deleted: true)
   */
  async deleteSessionGroup(groupId: string, requestor: string): Promise<void> {
    const group = this.groups.get(groupId);

    if (!group) {
      throw new Error('Session group not found');
    }

    // Check permissions
    if (group.owner !== requestor) {
      throw new Error('Permission denied');
    }

    // Soft delete
    group.deleted = true;
    group.updatedAt = new Date();

    this.groups.set(groupId, group);

    // Persist to S5 storage
    if (this.storage) {
      await this.storage.save(group);
    }
  }

  /**
   * Link a vector database to a session group
   */
  async linkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup> {
    const group = await this.getSessionGroup(groupId, requestor);

    // Validate database exists
    const exists = await this.databaseExists(databaseId);
    if (!exists) {
      throw new Error('Vector database not found');
    }

    // Add database if not already linked (avoid duplicates)
    if (!group.linkedDatabases.includes(databaseId)) {
      group.linkedDatabases.push(databaseId);
      group.updatedAt = new Date();
      this.groups.set(groupId, group);

      // Persist to S5 storage
      if (this.storage) {
        await this.storage.save(group);
      }
    }

    return group;
  }

  /**
   * Unlink a vector database from a session group
   */
  async unlinkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup> {
    const group = await this.getSessionGroup(groupId, requestor);

    // Remove database from linked list
    group.linkedDatabases = group.linkedDatabases.filter((id) => id !== databaseId);

    // Clear default database if it was the unlinked one
    if (group.defaultDatabase === databaseId) {
      group.defaultDatabase = undefined;
    }

    group.updatedAt = new Date();
    this.groups.set(groupId, group);

    // Persist to S5 storage
    if (this.storage) {
      await this.storage.save(group);
    }

    return group;
  }

  /**
   * Set the default vector database for new document uploads
   */
  async setDefaultDatabase(
    groupId: string,
    requestor: string,
    databaseId?: string
  ): Promise<SessionGroup> {
    const group = await this.getSessionGroup(groupId, requestor);

    // If setting a database (not clearing)
    if (databaseId !== undefined) {
      // Validate database is linked to group
      if (!group.linkedDatabases.includes(databaseId)) {
        throw new Error('Database must be linked to group first');
      }
    }

    group.defaultDatabase = databaseId;
    group.updatedAt = new Date();
    this.groups.set(groupId, group);

    return group;
  }

  /**
   * List all linked vector databases with metadata
   */
  async listLinkedDatabases(
    groupId: string,
    requestor: string
  ): Promise<VectorDatabaseMetadata[]> {
    const group = await this.getSessionGroup(groupId, requestor);

    // Map database IDs to metadata
    const databases: VectorDatabaseMetadata[] = [];
    for (const dbId of group.linkedDatabases) {
      try {
        const metadata = await this.getDatabaseMetadata(dbId);
        databases.push(metadata);
      } catch (error) {
        // Skip databases that no longer exist
        console.warn(`Database ${dbId} not found in registry, skipping`);
      }
    }

    return databases;
  }

  /**
   * Handle database deletion by removing from all groups
   */
  async handleDatabaseDeletion(databaseId: string): Promise<void> {
    // Iterate through all groups
    for (const group of this.groups.values()) {
      let modified = false;

      // Remove from linkedDatabases
      const originalLength = group.linkedDatabases.length;
      group.linkedDatabases = group.linkedDatabases.filter((id) => id !== databaseId);
      if (group.linkedDatabases.length !== originalLength) {
        modified = true;
      }

      // Clear default database if it was the deleted one
      if (group.defaultDatabase === databaseId) {
        group.defaultDatabase = undefined;
        modified = true;
      }

      // Save if modified
      if (modified) {
        group.updatedAt = new Date();
        this.groups.set(group.id, group);
      }
    }

    // Remove from mock database registry
    this.mockDatabases.delete(databaseId);
  }

  /**
   * Add a chat session to a session group
   */
  async addChatSession(
    groupId: string,
    requestor: string,
    sessionId: string
  ): Promise<SessionGroup> {
    const group = await this.getSessionGroup(groupId, requestor);

    // Add session if not already in list (avoid duplicates)
    if (!group.chatSessions.includes(sessionId)) {
      group.chatSessions.push(sessionId);
      group.updatedAt = new Date();
      this.groups.set(groupId, group);
    }

    return group;
  }

  /**
   * List all chat sessions in a session group
   */
  async listChatSessions(groupId: string, requestor: string): Promise<string[]> {
    const group = await this.getSessionGroup(groupId, requestor);
    return [...group.chatSessions]; // Return copy
  }

  /**
   * Add a document to a session group
   */
  async addGroupDocument(
    groupId: string,
    document: import('../types/session-groups.types').GroupDocumentMetadata
  ): Promise<import('../types/session-groups.types').SessionGroup> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    // Initialize documents array if not exists
    if (!group.documents) {
      group.documents = [];
    }

    // Add document
    group.documents.push(document);
    group.updatedAt = new Date();
    this.groups.set(groupId, group);

    // Persist to S5 storage
    if (this.storage) {
      await this.storage.save(group);
    }

    return { ...group }; // Return copy
  }

  /**
   * Remove a document from a session group
   */
  async removeGroupDocument(
    groupId: string,
    documentId: string
  ): Promise<import('../types/session-groups.types').SessionGroup> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    // Remove document
    if (group.documents) {
      group.documents = group.documents.filter(doc => doc.id !== documentId);
      group.updatedAt = new Date();
      this.groups.set(groupId, group);

      // Persist to S5 storage
      if (this.storage) {
        await this.storage.save(group);
      }
    }

    return { ...group }; // Return copy
  }

  /**
   * Start a chat session (for UI compatibility - real implementation uses SessionManager)
   *
   * NOTE: This is a minimal implementation for UI testing compatibility with mock SDK.
   * In production, the actual LLM session is created via SessionManager.startSession() in the page component.
   * This method only creates the metadata tracking structure.
   */
  async startChatSession(groupId: string, initialMessage?: string): Promise<ChatSession> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // Create minimal chat session metadata
    const session: ChatSession = {
      sessionId,
      groupId,
      title: initialMessage || 'New Chat',
      messages: [],
      metadata: {
        databasesUsed: group.linkedDatabases
      },
      created: now,
      updated: now
    };

    // Store chat session
    this.chatStorage.set(sessionId, session);

    // Add session ID to group
    if (!group.chatSessions.includes(sessionId)) {
      group.chatSessions.push(sessionId);
      group.updatedAt = new Date();
      this.groups.set(groupId, group);
    }

    return session;
  }

  /**
   * Get a chat session by ID
   *
   * NOTE: This is a minimal implementation for UI testing compatibility with mock SDK.
   */
  async getChatSession(groupId: string, sessionId: string): Promise<ChatSession | null> {
    const session = this.chatStorage.get(sessionId);
    if (!session) {
      return null;
    }

    if (session.groupId !== groupId) {
      throw new Error(`Session ${sessionId} does not belong to group ${groupId}`);
    }

    return session;
  }

  /**
   * Generate unique ID for session group
   */
  private generateId(): string {
    return `sg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
