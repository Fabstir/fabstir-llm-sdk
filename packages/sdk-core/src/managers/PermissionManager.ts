// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { IPermissionManager } from '../interfaces/IPermissionManager';
import type {
  Permission,
  PermissionLevel,
  ResourceType,
  PermissionQueryResult,
  PermissionSummary,
} from '../types/permissions.types';

/**
 * Permission Manager
 *
 * Manages granular access control for session groups and vector databases.
 * Enables users to share resources with collaborators at different permission levels.
 *
 * Storage: In-memory for Phase 1 (Phase 2 will add S5 persistence)
 */
export class PermissionManager implements IPermissionManager {
  private permissions: Map<string, Permission> = new Map();
  private resourceOwners: Map<string, string> = new Map();
  private databaseLinks: Map<string, string[]> = new Map();

  constructor() {
    // Future: Initialize with storage manager for S5 persistence
  }

  /**
   * Grant permission to a user for a resource
   */
  async grantPermission(
    resourceId: string,
    resourceType: ResourceType,
    grantedBy: string,
    grantedTo: string,
    level: PermissionLevel,
    cascade: boolean = false
  ): Promise<Permission> {
    // Validate inputs
    if (!resourceId || resourceId.trim() === '') {
      throw new Error('resourceId is required');
    }

    if (!grantedTo || grantedTo.trim() === '') {
      throw new Error('grantedTo is required');
    }

    // Validate wallet address format (basic check)
    if (!grantedTo.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid wallet address');
    }

    // Cannot grant to self
    if (grantedBy === grantedTo) {
      throw new Error('Cannot grant permission to self');
    }

    // Validate permission level
    const validLevels = ['reader', 'writer', 'admin'] as const;
    if (!validLevels.includes(level)) {
      throw new Error('Invalid permission level');
    }

    // Validate resource type
    const validTypes: ResourceType[] = ['session_group', 'vector_database'];
    if (!validTypes.includes(resourceType)) {
      throw new Error('Invalid resource type');
    }

    // Check if permission already exists
    const existingKey = this.getPermissionKey(resourceId, grantedTo);
    const existing = this.permissions.get(existingKey);

    if (existing && !existing.deleted) {
      // Update existing permission
      existing.level = level;
      existing.grantedAt = new Date();
      this.permissions.set(existingKey, existing);

      // Cascade if requested
      if (cascade && resourceType === 'session_group') {
        await this.cascadePermission(resourceId, grantedTo, level, false);
      }

      return existing;
    }

    // Create new permission
    const permission: Permission = {
      id: this.generateId(),
      resourceId,
      resourceType,
      grantedTo,
      level,
      grantedBy,
      grantedAt: new Date(),
      deleted: false,
    };

    this.permissions.set(existingKey, permission);

    // Cascade if requested
    if (cascade && resourceType === 'session_group') {
      await this.cascadePermission(resourceId, grantedTo, level, false);
    }

    return permission;
  }

  /**
   * Revoke permission (soft delete)
   */
  async revokePermission(
    resourceId: string,
    requestor: string,
    grantedTo: string,
    cascade: boolean = false
  ): Promise<void> {
    // Cannot revoke owner permission
    if (requestor === grantedTo) {
      throw new Error('Cannot revoke owner permission');
    }

    // Check ownership
    const owner = this.resourceOwners.get(resourceId);
    if (owner && owner !== requestor) {
      throw new Error('Permission denied');
    }

    // Find permission
    const key = this.getPermissionKey(resourceId, grantedTo);
    const permission = this.permissions.get(key);

    if (!permission || permission.deleted) {
      throw new Error('Permission not found');
    }

    // Soft delete
    permission.deleted = true;
    this.permissions.set(key, permission);

    // Cascade if requested
    if (cascade) {
      const linkedDbs = this.databaseLinks.get(resourceId) || [];
      for (const dbId of linkedDbs) {
        const dbKey = this.getPermissionKey(dbId, grantedTo);
        const dbPermission = this.permissions.get(dbKey);
        if (dbPermission && !dbPermission.deleted) {
          dbPermission.deleted = true;
          this.permissions.set(dbKey, dbPermission);
        }
      }
    }
  }

  /**
   * List all active permissions for a resource
   */
  async listPermissions(resourceId: string, requestor: string): Promise<Permission[]> {
    // Check ownership
    const owner = this.resourceOwners.get(resourceId);
    if (owner && owner !== requestor) {
      throw new Error('Permission denied');
    }

    const result: Permission[] = [];

    for (const permission of Array.from(this.permissions.values())) {
      if (permission.resourceId === resourceId && !permission.deleted) {
        result.push(permission);
      }
    }

    return result;
  }

  /**
   * Check user's permission level for a resource
   */
  async checkPermission(resourceId: string, userAddress: string): Promise<PermissionQueryResult> {
    // Owner always has admin
    const owner = this.resourceOwners.get(resourceId);
    if (owner === userAddress) {
      return 'admin' as PermissionLevel;
    }

    const key = this.getPermissionKey(resourceId, userAddress);
    const permission = this.permissions.get(key);

    if (!permission || permission.deleted) {
      return null;
    }

    return permission.level;
  }

  /**
   * Check if user can share/grant permissions
   */
  async canShare(resourceId: string, userAddress: string): Promise<boolean> {
    const level = await this.checkPermission(resourceId, userAddress);
    return level === 'admin';
  }

  /**
   * Set resource ownership
   */
  async setResourceOwner(resourceId: string, owner: string): Promise<void> {
    this.resourceOwners.set(resourceId, owner);
  }

  /**
   * Get resource owner
   */
  async getResourceOwner(resourceId: string): Promise<string | null> {
    return this.resourceOwners.get(resourceId) || null;
  }

  /**
   * Link databases to a session group
   */
  async linkDatabases(groupId: string, databaseIds: string[]): Promise<void> {
    this.databaseLinks.set(groupId, databaseIds);
  }

  /**
   * Get linked databases for a session group
   */
  async getLinkedDatabases(groupId: string): Promise<string[]> {
    return this.databaseLinks.get(groupId) || [];
  }

  /**
   * Get permission summary
   */
  async getPermissionSummary(resourceId: string): Promise<PermissionSummary> {
    let readerCount = 0;
    let writerCount = 0;
    let adminCount = 0;
    let lastGrantedAt: Date | undefined;

    for (const permission of Array.from(this.permissions.values())) {
      if (permission.resourceId === resourceId && !permission.deleted) {
        switch (permission.level) {
          case 'reader':
            readerCount++;
            break;
          case 'writer':
            writerCount++;
            break;
          case 'admin':
            adminCount++;
            break;
        }

        if (!lastGrantedAt || permission.grantedAt > lastGrantedAt) {
          lastGrantedAt = permission.grantedAt;
        }
      }
    }

    return {
      resourceId,
      totalPermissions: readerCount + writerCount + adminCount,
      readerCount,
      writerCount,
      adminCount,
      lastGrantedAt,
    };
  }

  /**
   * Cascade permissions to linked databases
   */
  private async cascadePermission(
    groupId: string,
    userAddress: string,
    level: PermissionLevel,
    isRevoke: boolean
  ): Promise<void> {
    const linkedDbs = this.databaseLinks.get(groupId) || [];

    for (const dbId of linkedDbs) {
      if (isRevoke) {
        const dbKey = this.getPermissionKey(dbId, userAddress);
        const dbPermission = this.permissions.get(dbKey);
        if (dbPermission && !dbPermission.deleted) {
          dbPermission.deleted = true;
          this.permissions.set(dbKey, dbPermission);
        }
      } else {
        // Grant permission to database
        const dbPermission: Permission = {
          id: this.generateId(),
          resourceId: dbId,
          resourceType: 'vector_database',
          grantedTo: userAddress,
          level,
          grantedBy: this.resourceOwners.get(groupId) || '',
          grantedAt: new Date(),
          deleted: false,
        };

        const dbKey = this.getPermissionKey(dbId, userAddress);
        this.permissions.set(dbKey, dbPermission);
      }
    }
  }

  /**
   * Generate unique permission key for lookup
   */
  private getPermissionKey(resourceId: string, userAddress: string): string {
    return `${resourceId}:${userAddress}`;
  }

  /**
   * Generate unique ID for permission
   */
  private generateId(): string {
    return `pm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
