// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type {
  SessionGroup,
  CreateSessionGroupInput,
  UpdateSessionGroupInput,
  VectorDatabaseMetadata,
  GroupDocumentMetadata,
} from '../types/session-groups.types';

/**
 * Session Group Manager Interface
 *
 * Manages CRUD operations for Session Groups (Claude Projects-style organization).
 * Groups organize related chat sessions and vector databases.
 */
export interface ISessionGroupManager {
  /**
   * Create a new session group
   *
   * @param input - Group creation parameters
   * @returns Created session group
   * @throws {Error} If name or description is empty
   * @throws {Error} If metadata is not an object
   */
  createSessionGroup(input: CreateSessionGroupInput): Promise<SessionGroup>;

  /**
   * List all session groups for a user
   *
   * @param owner - Wallet address of owner
   * @returns Array of session groups (excludes deleted)
   */
  listSessionGroups(owner: string): Promise<SessionGroup[]>;

  /**
   * Get a specific session group by ID
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @returns Session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor lacks permission
   */
  getSessionGroup(groupId: string, requestor: string): Promise<SessionGroup>;

  /**
   * Update a session group
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @param updates - Fields to update
   * @returns Updated session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   */
  updateSessionGroup(
    groupId: string,
    requestor: string,
    updates: UpdateSessionGroupInput
  ): Promise<SessionGroup>;

  /**
   * Soft-delete a session group (sets deleted: true)
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   */
  deleteSessionGroup(groupId: string, requestor: string): Promise<void>;

  /**
   * Link a vector database to a session group
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @param databaseId - Vector database ID to link
   * @returns Updated session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   */
  linkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup>;

  /**
   * Unlink a vector database from a session group
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @param databaseId - Vector database ID to unlink
   * @returns Updated session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   */
  unlinkVectorDatabase(
    groupId: string,
    requestor: string,
    databaseId: string
  ): Promise<SessionGroup>;

  /**
   * Set the default vector database for new document uploads
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @param databaseId - Database ID to set as default (undefined to clear)
   * @returns Updated session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   * @throws {Error} If database is not linked to group
   */
  setDefaultDatabase(
    groupId: string,
    requestor: string,
    databaseId?: string
  ): Promise<SessionGroup>;

  /**
   * List all linked vector databases with metadata
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @returns Array of database metadata
   * @throws {Error} If group not found
   * @throws {Error} If requestor lacks permission
   */
  listLinkedDatabases(
    groupId: string,
    requestor: string
  ): Promise<VectorDatabaseMetadata[]>;

  /**
   * Handle database deletion by removing from all groups
   *
   * Internal method called when a vector database is deleted.
   * Removes the database from all session groups that linked it.
   *
   * @param databaseId - Database ID that was deleted
   */
  handleDatabaseDeletion(databaseId: string): Promise<void>;

  /**
   * Add a chat session to a session group
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @param sessionId - Chat session ID to add
   * @returns Updated session group
   * @throws {Error} If group not found
   * @throws {Error} If requestor is not owner
   */
  addChatSession(
    groupId: string,
    requestor: string,
    sessionId: string
  ): Promise<SessionGroup>;

  /**
   * List all chat sessions in a session group
   *
   * @param groupId - Session group ID
   * @param requestor - Wallet address of requestor
   * @returns Array of session IDs
   * @throws {Error} If group not found
   * @throws {Error} If requestor lacks permission
   */
  listChatSessions(groupId: string, requestor: string): Promise<string[]>;

  /**
   * Delete a chat session from a group
   *
   * Removes the session from both memory and S5 storage.
   * Updates the group's session list and persists changes to S5.
   *
   * @param groupId - Session group ID
   * @param sessionId - Chat session ID to delete
   * @returns Promise that resolves when deletion is complete
   * @throws {Error} If session or group not found
   */
  deleteChatSession(groupId: string, sessionId: string): Promise<void>;

  /**
   * Add a document to a session group
   *
   * @param groupId - Session group ID
   * @param document - Document metadata to add
   * @returns Updated session group
   * @throws {Error} If group not found
   */
  addGroupDocument(
    groupId: string,
    document: GroupDocumentMetadata
  ): Promise<SessionGroup>;

  /**
   * Remove a document from a session group
   *
   * @param groupId - Session group ID
   * @param documentId - Document ID to remove
   * @returns Updated session group
   * @throws {Error} If group not found
   */
  removeGroupDocument(
    groupId: string,
    documentId: string
  ): Promise<SessionGroup>;

  /**
   * Add a message to a chat session
   *
   * @param groupId - Session group ID
   * @param sessionId - Chat session ID
   * @param message - Message to add
   * @throws {Error} If group or session not found
   */
  addMessage(
    groupId: string,
    sessionId: string,
    message: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }
  ): Promise<void>;
}
