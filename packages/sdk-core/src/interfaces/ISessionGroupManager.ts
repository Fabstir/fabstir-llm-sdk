// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type {
  SessionGroup,
  ChatSession,
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
   * Called by the SDK when this manager's identity is forgotten — a sign-out, the next sign-in (plan §26 GG1). Every
   * other member then refuses `SESSION_GROUP_MANAGER_DISPOSED`: get the current manager from the SDK.
   */
  dispose(): void;

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
   * List all session groups for a user: reads storage, then returns the groups as memory holds them.
   *
   * A stored copy never replaces a group memory already holds unless its `updatedAt` is strictly later (1.39.25), so a
   * read that predates one of this manager's own saves changes nothing. Each call returns a new object per group,
   * with new `chatSessions` and `chatSessionsData` containers (the chats inside are the manager's own objects). Groups
   * only memory holds — a create whose save has not landed or failed — follow the stored ones.
   *
   * @param owner - Wallet address of owner
   * @returns Array of session groups (excludes deleted)
   */
  listSessionGroups(owner: string): Promise<SessionGroup[]>;

  /**
   * The owner's groups as memory holds them now, without reading storage (1.39.25): empty until `listSessionGroups` or
   * `getSessionGroup` has loaded something. Synchronous. The objects are the manager's own; the array is new each call.
   *
   * @param owner - Wallet address of owner
   * @returns Array of session groups (excludes deleted)
   * @throws {SDKError} SESSION_GROUP_MANAGER_DISPOSED on a signed-out identity's manager (thrown, not rejected)
   */
  getCachedSessionGroups(owner: string): SessionGroup[];

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
   * Update a session group. A chat passed in `chatSessionsData` as an object the manager has never held (a copy) gets
   * a new `revision` (1.39.26); one it has held before — the group's own object, or an older one you kept — is taken
   * as passed but not stamped. Change a chat in place through `updateChatSession`.
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
   * Soft-delete a session group (sets deleted: true). If the save fails it rejects and the group is not deleted
   * (1.39.26): call again to retry.
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
   * @throws {Error} If group or session not found — also when the chat was deleted while this call waited (1.39.25)
   */
  addMessage(
    groupId: string,
    sessionId: string,
    message: { role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }
  ): Promise<void>;

  /**
   * Change a stored chat under the group's lock (1.39.25): `mutate` runs on the chat as it is when this call's turn
   * comes — after every `addMessage` queued before it, so not at the call — and the group is then stamped and saved.
   * The chat's own `updated` is left to `mutate` (set it when the change should count as activity).
   *
   * What `mutate` changed stays in memory if the save fails, if `mutate` throws, or if it is refused after running;
   * the next save of the group writes it. To save again after a failure, call with a no-op `mutate`.
   *
   * @param groupId - Session group ID
   * @param sessionId - Chat session ID
   * @param requestor - Wallet address of requestor
   * @param mutate - Synchronous function that changes the chat in place. An `async` function is refused before it
   *   runs; any other function that returns a promise is refused after its synchronous part ran.
   * @returns The changed chat (the manager's own object)
   * @throws {SDKError} INVALID_MUTATOR if `mutate` is not a synchronous function
   * @throws {Error} If the group or chat is not found, the requestor is not owner, or the save fails
   */
  updateChatSession(
    groupId: string,
    sessionId: string,
    requestor: string,
    mutate: (session: ChatSession) => void
  ): Promise<ChatSession>;
}
