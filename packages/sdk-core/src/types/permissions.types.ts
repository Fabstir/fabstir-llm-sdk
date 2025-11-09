// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Permission Type Definitions
 *
 * Defines types for granular access control enabling users to share
 * session groups and vector databases with collaborators.
 */

/**
 * Permission Level Enum
 *
 * Defines access levels for shared resources:
 * - READER: Can view only (read-only access)
 * - WRITER: Can view and edit (add messages, upload documents)
 * - ADMIN: Full control (can share, modify permissions, delete)
 */
export enum PermissionLevel {
  READER = 'reader',
  WRITER = 'writer',
  ADMIN = 'admin',
}

/**
 * Resource Type
 *
 * Types of resources that can have permissions:
 * - session_group: Claude Projects-style session organization
 * - vector_database: RAG vector storage
 */
export type ResourceType = 'session_group' | 'vector_database';

/**
 * Permission
 *
 * Represents a granted permission for a user to access a resource.
 * Permissions can be revoked (soft delete) without losing audit trail.
 */
export interface Permission {
  /** Unique identifier for the permission */
  id: string;

  /** Resource ID (session group ID or vector database ID) */
  resourceId: string;

  /** Type of resource being shared */
  resourceType: ResourceType;

  /** Wallet address of user receiving permission */
  grantedTo: string;

  /** Access level granted */
  level: PermissionLevel;

  /** Wallet address of user who granted the permission */
  grantedBy: string;

  /** Timestamp when permission was granted */
  grantedAt: Date;

  /** Soft delete flag (true = revoked) */
  deleted: boolean;
}

/**
 * Create Permission Input
 *
 * Input for granting a new permission.
 * Owner grants access to another user for a specific resource.
 */
export interface CreatePermissionInput {
  /** Resource ID to share */
  resourceId: string;

  /** Type of resource */
  resourceType: ResourceType;

  /** Owner wallet address (must match resource owner) */
  grantedBy: string;

  /** User wallet address receiving permission */
  grantedTo: string;

  /** Access level to grant */
  level: PermissionLevel;

  /** Whether to cascade permissions to linked resources (default: false) */
  cascade?: boolean;
}

/**
 * Update Permission Input
 *
 * Input for updating an existing permission (e.g., upgrading READER to WRITER).
 * Can only update the access level.
 */
export interface UpdatePermissionInput {
  /** New access level */
  level: PermissionLevel;

  /** Whether to cascade the update to linked resources (default: false) */
  cascade?: boolean;
}

/**
 * Resource Ownership Mapping
 *
 * Maps resource IDs to their owners for permission checks.
 * Used internally to validate ownership before granting/revoking permissions.
 */
export interface ResourceOwnership {
  /** Resource ID */
  resourceId: string;

  /** Owner wallet address */
  owner: string;

  /** Type of resource */
  resourceType: ResourceType;
}

/**
 * Database Linkage Mapping
 *
 * Maps session groups to their linked vector databases.
 * Used for cascading permissions from groups to databases.
 */
export interface DatabaseLinkage {
  /** Session group ID */
  groupId: string;

  /** Linked database IDs */
  databaseIds: string[];
}

/**
 * Permission Query Result
 *
 * Result of checking a user's permission for a resource.
 * Returns null if no permission exists.
 */
export type PermissionQueryResult = PermissionLevel | null;

/**
 * Permission Summary
 *
 * Summary statistics for a resource's permissions.
 * Useful for UI display (e.g., "3 collaborators").
 */
export interface PermissionSummary {
  /** Resource ID */
  resourceId: string;

  /** Total active permissions (excluding deleted) */
  totalPermissions: number;

  /** Breakdown by level */
  readerCount: number;
  writerCount: number;
  adminCount: number;

  /** Most recently granted permission timestamp */
  lastGrantedAt?: Date;
}
