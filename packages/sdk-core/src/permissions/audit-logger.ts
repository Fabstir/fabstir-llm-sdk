/**
 * Audit Logger
 * Logs all permission-related operations
 * Max 200 lines
 */

import type { PermissionRole } from '../database/types.js';
import type { PermissionAction } from './roles.js';

/**
 * Audit action types
 */
export type AuditAction = 'grant' | 'revoke' | 'access';

/**
 * Audit log result
 */
export type AuditResult = 'success' | 'denied';

/**
 * Audit log entry
 */
export interface AuditLog {
  /** Timestamp of the action */
  timestamp: number;

  /** Type of action performed */
  action: AuditAction;

  /** Database name */
  databaseName: string;

  /** User address */
  userAddress: string;

  /** Result of the action */
  result: AuditResult;

  /** Role (for grant actions) */
  role?: PermissionRole;

  /** Access action (for access attempts) */
  accessAction?: PermissionAction;
}

/**
 * Audit logger for tracking permission operations
 */
export class AuditLogger {
  private logs: AuditLog[] = [];
  private databaseLogs: Map<string, AuditLog[]> = new Map();
  private userLogs: Map<string, AuditLog[]> = new Map();

  /**
   * Log a permission grant
   */
  logGrant(databaseName: string, userAddress: string, role: PermissionRole): void {
    const log: AuditLog = {
      timestamp: Date.now(),
      action: 'grant',
      databaseName,
      userAddress,
      result: 'success',
      role
    };

    this.addLog(log);
  }

  /**
   * Log a permission revoke
   */
  logRevoke(databaseName: string, userAddress: string): void {
    const log: AuditLog = {
      timestamp: Date.now(),
      action: 'revoke',
      databaseName,
      userAddress,
      result: 'success'
    };

    this.addLog(log);
  }

  /**
   * Log an access attempt
   * @param databaseName - Database being accessed
   * @param userAddress - User attempting access
   * @param accessAction - Action being attempted
   * @param allowed - Whether access was allowed
   */
  logAccessAttempt(
    databaseName: string,
    userAddress: string,
    accessAction: PermissionAction,
    allowed: boolean
  ): void {
    const log: AuditLog = {
      timestamp: Date.now(),
      action: 'access',
      databaseName,
      userAddress,
      result: allowed ? 'success' : 'denied',
      accessAction
    };

    this.addLog(log);
  }

  /**
   * Get all logs for a database
   * @param databaseName - Database name
   * @returns Array of logs in chronological order
   */
  getDatabaseLogs(databaseName: string): AuditLog[] {
    const logs = this.databaseLogs.get(databaseName);
    if (!logs) {
      return [];
    }

    // Return copies to prevent external mutations
    return logs.map(log => ({ ...log }));
  }

  /**
   * Get all logs for a user
   * @param userAddress - User address
   * @returns Array of logs in chronological order
   */
  getUserLogs(userAddress: string): AuditLog[] {
    const logs = this.userLogs.get(userAddress);
    if (!logs) {
      return [];
    }

    // Return copies to prevent external mutations
    return logs.map(log => ({ ...log }));
  }

  /**
   * Get all logs across all databases and users
   * @returns Array of all logs in chronological order
   */
  getAllLogs(): AuditLog[] {
    // Return copies to prevent external mutations
    return this.logs.map(log => ({ ...log }));
  }

  /**
   * Add a log entry to all storage locations
   * @private
   */
  private addLog(log: AuditLog): void {
    // Add to main log
    this.logs.push(log);

    // Add to database-specific logs
    let dbLogs = this.databaseLogs.get(log.databaseName);
    if (!dbLogs) {
      dbLogs = [];
      this.databaseLogs.set(log.databaseName, dbLogs);
    }
    dbLogs.push(log);

    // Add to user-specific logs
    let usrLogs = this.userLogs.get(log.userAddress);
    if (!usrLogs) {
      usrLogs = [];
      this.userLogs.set(log.userAddress, usrLogs);
    }
    usrLogs.push(log);
  }
}
