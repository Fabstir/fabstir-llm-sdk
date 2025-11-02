/**
 * Permission Service
 * Manages permissions for all database types (vector, graph, etc.)
 * Max 400 lines
 */

import type { PermissionRecord, PermissionRole } from './types.js';

/**
 * Shared permission service for all database types
 * Implements role-based access control (RBAC)
 *
 * Role Hierarchy (descending):
 * - owner: Can read and write
 * - writer: Can read and write
 * - reader: Can read only
 */
export class PermissionService {
  private permissions: Map<string, PermissionRecord[]> = new Map();

  /**
   * Grant permission to a user for a database
   * If user already has permission, updates the role and grantedAt timestamp
   */
  grant(databaseName: string, userAddress: string, role: PermissionRole): void {
    // Get or create permissions array for this database
    let dbPermissions = this.permissions.get(databaseName);
    if (!dbPermissions) {
      dbPermissions = [];
      this.permissions.set(databaseName, dbPermissions);
    }

    // Check if user already has permission
    const existingIndex = dbPermissions.findIndex(p => p.userAddress === userAddress);

    const record: PermissionRecord = {
      databaseName,
      userAddress,
      role,
      grantedAt: Date.now()
    };

    if (existingIndex >= 0) {
      // Update existing permission
      dbPermissions[existingIndex] = record;
    } else {
      // Add new permission
      dbPermissions.push(record);
    }
  }

  /**
   * Revoke permission from a user for a database
   * Throws error if permission doesn't exist
   */
  revoke(databaseName: string, userAddress: string): void {
    const dbPermissions = this.permissions.get(databaseName);
    if (!dbPermissions) {
      throw new Error('Permission not found');
    }

    const index = dbPermissions.findIndex(p => p.userAddress === userAddress);
    if (index < 0) {
      throw new Error('Permission not found');
    }

    // Remove permission
    dbPermissions.splice(index, 1);

    // Clean up empty arrays
    if (dbPermissions.length === 0) {
      this.permissions.delete(databaseName);
    }
  }

  /**
   * Check if user has permission for a specific action
   * @param action - 'read' or 'write'
   * @returns true if user has permission, false otherwise
   */
  check(databaseName: string, userAddress: string, action: 'read' | 'write'): boolean {
    const role = this.getRole(databaseName, userAddress);
    if (!role) {
      return false;
    }

    // Determine if role allows the action
    if (action === 'read') {
      // All roles can read
      return true;
    } else if (action === 'write') {
      // Only owner and writer can write
      return role === 'owner' || role === 'writer';
    }

    return false;
  }

  /**
   * List all permissions for a database
   * Returns empty array if database has no permissions
   */
  list(databaseName: string): PermissionRecord[] {
    const dbPermissions = this.permissions.get(databaseName);
    if (!dbPermissions) {
      return [];
    }

    // Return copies to prevent external mutations
    return dbPermissions.map(p => ({ ...p }));
  }

  /**
   * Get role for a user on a database
   * @returns role if user has permission, null otherwise
   */
  getRole(databaseName: string, userAddress: string): PermissionRole | null {
    const dbPermissions = this.permissions.get(databaseName);
    if (!dbPermissions) {
      return null;
    }

    const permission = dbPermissions.find(p => p.userAddress === userAddress);
    return permission ? permission.role : null;
  }
}
