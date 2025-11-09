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
import type { PermissionStorage } from '../storage/PermissionStorage';

/**
 * Permission Manager
 *
 * Manages granular access control for session groups and vector databases.
 * Enables users to share resources with collaborators at different permission levels.
 *
 * Storage: S5 persistence with PermissionStorage (falls back to in-memory if not provided)
 */
export class PermissionManager implements IPermissionManager {
  private storage?: PermissionStorage;
  private permissions: Map<string, Permission> = new Map();
  private resourceOwners: Map<string, string> = new Map();
  private databaseLinks: Map<string, string[]> = new Map();

  constructor(storage?: PermissionStorage) {
    this.storage = storage;
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
    let existing: Permission | null = null;
    if (this.storage) {
      existing = await this.storage.load(resourceId, grantedTo);
    } else {
      const existingKey = this.getPermissionKey(resourceId, grantedTo);
      existing = this.permissions.get(existingKey) || null;
    }

    if (existing && !existing.deleted) {
      // Update existing permission
      existing.level = level;
      existing.grantedAt = new Date();

      if (this.storage) {
        await this.storage.save(existing);
      } else {
        const existingKey = this.getPermissionKey(resourceId, grantedTo);
        this.permissions.set(existingKey, existing);
      }

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

    if (this.storage) {
      await this.storage.save(permission);
    } else {
      const existingKey = this.getPermissionKey(resourceId, grantedTo);
      this.permissions.set(existingKey, permission);
    }

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
    let permission: Permission | null = null;
    if (this.storage) {
      permission = await this.storage.load(resourceId, grantedTo);
    } else {
      const key = this.getPermissionKey(resourceId, grantedTo);
      permission = this.permissions.get(key) || null;
    }

    if (!permission || permission.deleted) {
      throw new Error('Permission not found');
    }

    // Soft delete
    permission.deleted = true;
    if (this.storage) {
      await this.storage.save(permission);
    } else {
      const key = this.getPermissionKey(resourceId, grantedTo);
      this.permissions.set(key, permission);
    }

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

    if (this.storage) {
      // Use storage to load all permissions for resource
      return await this.storage.loadAll(resourceId);
    } else {
      // In-memory fallback
      const result: Permission[] = [];
      for (const permission of Array.from(this.permissions.values())) {
        if (permission.resourceId === resourceId && !permission.deleted) {
          result.push(permission);
        }
      }
      return result;
    }
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

    let permission: Permission | null = null;
    if (this.storage) {
      permission = await this.storage.load(resourceId, userAddress);
    } else {
      const key = this.getPermissionKey(resourceId, userAddress);
      permission = this.permissions.get(key) || null;
    }

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

    let permissions: Permission[];
    if (this.storage) {
      permissions = await this.storage.loadAll(resourceId);
    } else {
      permissions = Array.from(this.permissions.values()).filter(
        p => p.resourceId === resourceId && !p.deleted
      );
    }

    for (const permission of permissions) {
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
        let dbPermission: Permission | null = null;
        if (this.storage) {
          dbPermission = await this.storage.load(dbId, userAddress);
        } else {
          const dbKey = this.getPermissionKey(dbId, userAddress);
          dbPermission = this.permissions.get(dbKey) || null;
        }

        if (dbPermission && !dbPermission.deleted) {
          dbPermission.deleted = true;
          if (this.storage) {
            await this.storage.save(dbPermission);
          } else {
            const dbKey = this.getPermissionKey(dbId, userAddress);
            this.permissions.set(dbKey, dbPermission);
          }
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

        if (this.storage) {
          await this.storage.save(dbPermission);
        } else {
          const dbKey = this.getPermissionKey(dbId, userAddress);
          this.permissions.set(dbKey, dbPermission);
        }
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
