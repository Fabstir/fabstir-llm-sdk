// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session Groups Type Definitions
 *
 * Defines types for Session Groups (Claude Projects-style organization).
 * Groups organize related chat sessions and vector databases.
 */

/**
 * Session Group - Organizes related chat sessions and vector databases
 *
 * Similar to Claude Projects, allows users to:
 * - Group related conversations
 * - Link relevant vector databases
 * - Set default database for new uploads
 * - Share with collaborators (Phase 5)
 */
export interface SessionGroup {
  /** Unique identifier for the session group */
  id: string;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description: string;

  /** Creation timestamp */
  createdAt: Date;

  /** Last modification timestamp */
  updatedAt: Date;

  /** Owner wallet address */
  owner: string;

  /** Linked vector database IDs */
  linkedDatabases: string[];

  /** Default database for new document uploads (must be in linkedDatabases) */
  defaultDatabase?: string;

  /** Chat session IDs belonging to this group */
  chatSessions: string[];

  /** User-defined metadata */
  metadata: Record<string, any>;

  /** Soft delete flag */
  deleted: boolean;
}

/**
 * Input for creating a new session group
 */
export interface CreateSessionGroupInput {
  /** Human-readable name (required, min 1 char) */
  name: string;

  /** Optional description */
  description: string;

  /** Owner wallet address */
  owner: string;

  /** Optional initial metadata */
  metadata?: Record<string, any>;
}

/**
 * Input for updating an existing session group
 */
export interface UpdateSessionGroupInput {
  /** New name (optional) */
  name?: string;

  /** New description (optional) */
  description?: string;

  /** New metadata (optional, will merge with existing) */
  metadata?: Record<string, any>;
}

/**
 * Session Group with additional metadata for UI display
 */
export interface SessionGroupWithStats extends SessionGroup {
  /** Number of chat sessions */
  sessionCount: number;

  /** Number of linked databases */
  databaseCount: number;

  /** Total vectors across all linked databases */
  totalVectors?: number;

  /** Total storage size across all databases (bytes) */
  totalStorageSize?: number;
}
