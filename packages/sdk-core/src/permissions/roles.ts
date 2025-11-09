/**
 * Permission Roles and Definitions
 * Centralized role definitions and permission logic
 * Max 200 lines
 */

import type { PermissionRole } from '../database/types.js';

/**
 * Permission actions that can be performed on databases
 */
export type PermissionAction = 'read' | 'write' | 'admin';

/**
 * Database visibility settings
 * - public: Anyone can read (no permission required)
 * - private: Only users with explicit permissions can access
 */
export type DatabaseVisibility = 'public' | 'private';

/**
 * Role hierarchy (descending permission levels):
 * - owner: Full control (read, write, admin)
 * - writer: Can read and write
 * - reader: Can read only
 */
export const ROLE_HIERARCHY: Record<PermissionRole, number> = {
  owner: 3,
  writer: 2,
  reader: 1
};

/**
 * Permission matrix: maps roles to allowed actions
 */
export const ROLE_PERMISSIONS: Record<PermissionRole, Set<PermissionAction>> = {
  owner: new Set(['read', 'write', 'admin']),
  writer: new Set(['read', 'write']),
  reader: new Set(['read'])
};

/**
 * Check if a role allows a specific action
 * @param role - Permission role
 * @param action - Action to check
 * @returns true if role allows action, false otherwise
 */
export function roleAllowsAction(role: PermissionRole, action: PermissionAction): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.has(action);
}

/**
 * Check if one role is higher in the hierarchy than another
 * @param role1 - First role
 * @param role2 - Second role
 * @returns true if role1 >= role2 in hierarchy
 */
export function roleIsHigherOrEqual(role1: PermissionRole, role2: PermissionRole): boolean {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2];
}

/**
 * Get the minimum role required for an action
 * @param action - Action to check
 * @returns Minimum required role
 */
export function getMinimumRoleForAction(action: PermissionAction): PermissionRole {
  if (action === 'admin') return 'owner';
  if (action === 'write') return 'writer';
  return 'reader';
}

/**
 * Check if user can access a database given its visibility and user's role
 * @param visibility - Database visibility ('public' or 'private')
 * @param userRole - User's role (null if no permission granted)
 * @param action - Action to perform
 * @returns true if access allowed, false otherwise
 */
export function canAccessDatabase(
  visibility: DatabaseVisibility,
  userRole: PermissionRole | null,
  action: PermissionAction
): boolean {
  // Public databases allow read access to everyone
  if (visibility === 'public' && action === 'read') {
    return true;
  }

  // Private databases require explicit permission
  if (!userRole) {
    return false;
  }

  // Check if user's role allows the action
  return roleAllowsAction(userRole, action);
}
