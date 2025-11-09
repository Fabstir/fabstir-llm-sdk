// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { ISessionGroupManager } from '../interfaces/ISessionGroupManager';
import type {
  SessionGroup,
  CreateSessionGroupInput,
  UpdateSessionGroupInput,
  VectorDatabaseMetadata,
} from '../types/session-groups.types';

/**
 * Session Group Manager
 *
 * Manages Session Groups (Claude Projects-style organization).
 * Groups organize related chat sessions and vector databases.
 *
 * Storage: In-memory for now (Phase 1.2 will add S5 persistence)
 */
export class SessionGroupManager implements ISessionGroupManager {
  private groups: Map<string, SessionGroup> = new Map();
  // Mock database registry for testing (Phase 1 in-memory only)
  // In production, this would be replaced with VectorDatabaseManager
  private mockDatabases: Map<string, VectorDatabaseMetadata> = new Map();

  constructor() {
    // Future: Initialize with storage manager for S5 persistence
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
    // For testing: check mock registry and auto-create if ID matches pattern
    if (this.mockDatabases.has(databaseId)) {
      return true;
    }

    // Auto-create mock databases for test IDs
    // Patterns: db-1, db-2, db-shared, db-main, db-research-papers-2024, etc.
    if (databaseId.startsWith('db-')) {
      const now = new Date();
      this.registerMockDatabase({
        id: databaseId,
        name: `Database ${databaseId}`,
        description: `Mock database ${databaseId}`,
        createdAt: now,
        updatedAt: now,
        owner: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', // Test owner
        vectorCount: 0,
        storageSize: 0,
      });
      return true;
    }

    return false;
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

    if (!input.description || input.description.trim() === '') {
      throw new Error('description is required');
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
      metadata: input.metadata || {},
      deleted: false,
    };

    this.groups.set(id, group);
    return group;
  }

  /**
   * List all session groups for a user
   */
  async listSessionGroups(owner: string): Promise<SessionGroup[]> {
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

    const group = this.groups.get(groupId);

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
   * Generate unique ID for session group
   */
  private generateId(): string {
    return `sg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
