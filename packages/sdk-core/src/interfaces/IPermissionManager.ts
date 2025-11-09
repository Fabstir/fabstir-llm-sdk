// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type {
  Permission,
  PermissionLevel,
  ResourceType,
  PermissionQueryResult,
  PermissionSummary,
} from '../types/permissions.types';

/**
 * Permission Manager Interface
 *
 * Manages granular access control for session groups and vector databases.
 * Enables sharing resources with collaborators at different permission levels.
 */
export interface IPermissionManager {
  /**
   * Grant permission to a user for a resource
   *
   * @param resourceId - Resource ID (session group or vector database)
   * @param resourceType - Type of resource being shared
   * @param grantedBy - Owner wallet address (must own the resource)
   * @param grantedTo - User wallet address receiving permission
   * @param level - Access level (reader, writer, admin)
   * @param cascade - Whether to cascade to linked resources (default: false)
   * @returns Created or updated permission
   * @throws {Error} If resourceId is empty
   * @throws {Error} If grantedTo is empty or invalid wallet address
   * @throws {Error} If grantedBy equals grantedTo (cannot grant to self)
   * @throws {Error} If invalid permission level
   * @throws {Error} If invalid resource type
   */
  grantPermission(
    resourceId: string,
    resourceType: ResourceType,
    grantedBy: string,
    grantedTo: string,
    level: PermissionLevel,
    cascade?: boolean
  ): Promise<Permission>;

  /**
   * Revoke a user's permission for a resource (soft delete)
   *
   * @param resourceId - Resource ID
   * @param requestor - Wallet address requesting revocation (must be owner)
   * @param grantedTo - User wallet address whose permission to revoke
   * @param cascade - Whether to cascade revocation to linked resources (default: false)
   * @throws {Error} If permission not found
   * @throws {Error} If requestor is not the resource owner
   * @throws {Error} If trying to revoke owner permission
   */
  revokePermission(
    resourceId: string,
    requestor: string,
    grantedTo: string,
    cascade?: boolean
  ): Promise<void>;

  /**
   * List all active permissions for a resource
   *
   * @param resourceId - Resource ID
   * @param requestor - Wallet address requesting list (must be owner)
   * @returns Array of active permissions (excludes deleted)
   * @throws {Error} If requestor is not the resource owner
   */
  listPermissions(resourceId: string, requestor: string): Promise<Permission[]>;

  /**
   * Check a user's permission level for a resource
   *
   * @param resourceId - Resource ID
   * @param userAddress - User wallet address
   * @returns Permission level or null if no access
   */
  checkPermission(resourceId: string, userAddress: string): Promise<PermissionQueryResult>;

  /**
   * Check if a user can share/grant permissions
   *
   * @param resourceId - Resource ID
   * @param userAddress - User wallet address
   * @returns True if user has admin permission
   */
  canShare(resourceId: string, userAddress: string): Promise<boolean>;

  /**
   * Set resource ownership (for permission checks)
   *
   * @param resourceId - Resource ID
   * @param owner - Owner wallet address
   */
  setResourceOwner(resourceId: string, owner: string): Promise<void>;

  /**
   * Get resource owner
   *
   * @param resourceId - Resource ID
   * @returns Owner wallet address or null if not set
   */
  getResourceOwner(resourceId: string): Promise<string | null>;

  /**
   * Link databases to a session group (for cascade permissions)
   *
   * @param groupId - Session group ID
   * @param databaseIds - Array of database IDs to link
   */
  linkDatabases(groupId: string, databaseIds: string[]): Promise<void>;

  /**
   * Get linked databases for a session group
   *
   * @param groupId - Session group ID
   * @returns Array of linked database IDs
   */
  getLinkedDatabases(groupId: string): Promise<string[]>;

  /**
   * Get permission summary for a resource
   *
   * @param resourceId - Resource ID
   * @returns Permission statistics
   */
  getPermissionSummary(resourceId: string): Promise<PermissionSummary>;
}
