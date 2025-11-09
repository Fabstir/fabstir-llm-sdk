/**
 * Permission Manager
 * High-level permission management with audit logging and public/private databases
 * Max 400 lines
 */

import { PermissionService } from '../database/PermissionService.js';
import { AuditLogger } from './audit-logger.js';
import { canAccessDatabase } from './roles.js';
import type { DatabaseMetadata, PermissionRole, PermissionRecord } from '../database/types.js';
import type { PermissionAction, DatabaseVisibility } from './roles.js';

/**
 * Permission Manager
 * Wraps PermissionService with audit logging and public/private database logic
 */
export class PermissionManager {
  private permissionService: PermissionService;
  private auditLogger: AuditLogger;

  /**
   * Create a new Permission Manager
   * @param permissionService - Low-level permission service
   * @param auditLogger - Audit logger for tracking permission operations
   */
  constructor(permissionService: PermissionService, auditLogger: AuditLogger) {
    this.permissionService = permissionService;
    this.auditLogger = auditLogger;
  }

  /**
   * Grant permission to a user for a database
   * Logs the grant action
   * @param databaseName - Database name
   * @param userAddress - User address
   * @param role - Permission role
   */
  grant(databaseName: string, userAddress: string, role: PermissionRole): void {
    this.permissionService.grant(databaseName, userAddress, role);
    this.auditLogger.logGrant(databaseName, userAddress, role);
  }

  /**
   * Revoke permission from a user for a database
   * Logs the revoke action
   * @param databaseName - Database name
   * @param userAddress - User address
   */
  revoke(databaseName: string, userAddress: string): void {
    this.permissionService.revoke(databaseName, userAddress);
    this.auditLogger.logRevoke(databaseName, userAddress);
  }

  /**
   * Check if user can access a database for a specific action
   * Considers database visibility (public/private) and user's role
   * @param metadata - Database metadata
   * @param userAddress - User address
   * @param action - Action to perform
   * @returns true if access allowed, false otherwise
   */
  canAccess(metadata: DatabaseMetadata, userAddress: string, action: PermissionAction): boolean {
    // Owner always has full access
    if (metadata.owner === userAddress) {
      return true;
    }

    // Get database visibility
    const visibility: DatabaseVisibility = metadata.isPublic ? 'public' : 'private';

    // Get user's role (null if no permission granted)
    const userRole = this.permissionService.getRole(metadata.databaseName, userAddress);

    // Check access using role-based logic
    return canAccessDatabase(visibility, userRole, action);
  }

  /**
   * Check access and log the attempt
   * @param metadata - Database metadata
   * @param userAddress - User address
   * @param action - Action to perform
   * @returns true if access allowed, false otherwise
   */
  checkAndLog(metadata: DatabaseMetadata, userAddress: string, action: PermissionAction): boolean {
    const allowed = this.canAccess(metadata, userAddress, action);
    this.auditLogger.logAccessAttempt(metadata.databaseName, userAddress, action, allowed);
    return allowed;
  }

  /**
   * List all permissions for a database
   * @param databaseName - Database name
   * @returns Array of permission records
   */
  listPermissions(databaseName: string): PermissionRecord[] {
    return this.permissionService.list(databaseName);
  }

  /**
   * Get role for a user on a database
   * @param databaseName - Database name
   * @param userAddress - User address
   * @returns role if user has permission, null otherwise
   */
  getRole(databaseName: string, userAddress: string): PermissionRole | null {
    return this.permissionService.getRole(databaseName, userAddress);
  }

  /**
   * Get audit logger for direct access to logs
   * @returns Audit logger instance
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  /**
   * Get permission service for direct access
   * @returns Permission service instance
   */
  getPermissionService(): PermissionService {
    return this.permissionService;
  }
}
