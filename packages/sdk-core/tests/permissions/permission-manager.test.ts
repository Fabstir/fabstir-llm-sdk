/**
 * Permission Manager Tests
 * Tests for high-level permission management with audit logging
 * Max 250 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import type { DatabaseMetadata } from '../../src/database/types.js';

describe('PermissionManager', () => {
  let manager: PermissionManager;
  let permissionService: PermissionService;
  let auditLogger: AuditLogger;
  const testDatabase = 'test-db';
  const owner = 'owner-0x123';
  const user1 = 'user1-0x456';
  const user2 = 'user2-0x789';

  // Mock metadata
  const createMetadata = (dbName: string, ownerAddr: string, isPublic = false): DatabaseMetadata => ({
    databaseName: dbName,
    type: 'vector',
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    owner: ownerAddr,
    vectorCount: 0,
    storageSizeBytes: 0,
    isPublic
  });

  beforeEach(() => {
    permissionService = new PermissionService();
    auditLogger = new AuditLogger();
    manager = new PermissionManager(permissionService, auditLogger);
  });

  describe('Grant Permissions with Audit Logging', () => {
    it('should grant permission and log action', () => {
      manager.grant(testDatabase, user1, 'writer');

      // Verify permission granted
      const role = permissionService.getRole(testDatabase, user1);
      expect(role).toBe('writer');

      // Verify audit log
      const logs = auditLogger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('grant');
      expect(logs[0].userAddress).toBe(user1);
      expect(logs[0].role).toBe('writer');
    });

    it('should grant multiple permissions', () => {
      manager.grant(testDatabase, user1, 'writer');
      manager.grant(testDatabase, user2, 'reader');

      expect(permissionService.getRole(testDatabase, user1)).toBe('writer');
      expect(permissionService.getRole(testDatabase, user2)).toBe('reader');

      const logs = auditLogger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(2);
    });
  });

  describe('Revoke Permissions with Audit Logging', () => {
    it('should revoke permission and log action', () => {
      manager.grant(testDatabase, user1, 'writer');
      manager.revoke(testDatabase, user1);

      // Verify permission revoked
      const role = permissionService.getRole(testDatabase, user1);
      expect(role).toBeNull();

      // Verify audit log
      const logs = auditLogger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(2); // grant + revoke
      expect(logs[1].action).toBe('revoke');
    });
  });

  describe('Check Permissions on Private Databases', () => {
    const privateMetadata = createMetadata(testDatabase, owner, false);

    it('should allow owner to read private database', () => {
      const canRead = manager.canAccess(privateMetadata, owner, 'read');
      expect(canRead).toBe(true);
    });

    it('should allow owner to write private database', () => {
      const canWrite = manager.canAccess(privateMetadata, owner, 'write');
      expect(canWrite).toBe(true);
    });

    it('should allow owner to admin private database', () => {
      const canAdmin = manager.canAccess(privateMetadata, owner, 'admin');
      expect(canAdmin).toBe(true);
    });

    it('should allow writer to read and write private database', () => {
      manager.grant(testDatabase, user1, 'writer');

      expect(manager.canAccess(privateMetadata, user1, 'read')).toBe(true);
      expect(manager.canAccess(privateMetadata, user1, 'write')).toBe(true);
    });

    it('should deny writer admin access to private database', () => {
      manager.grant(testDatabase, user1, 'writer');

      const canAdmin = manager.canAccess(privateMetadata, user1, 'admin');
      expect(canAdmin).toBe(false);
    });

    it('should allow reader to read but not write private database', () => {
      manager.grant(testDatabase, user1, 'reader');

      expect(manager.canAccess(privateMetadata, user1, 'read')).toBe(true);
      expect(manager.canAccess(privateMetadata, user1, 'write')).toBe(false);
      expect(manager.canAccess(privateMetadata, user1, 'admin')).toBe(false);
    });

    it('should deny access to user without permission on private database', () => {
      expect(manager.canAccess(privateMetadata, user1, 'read')).toBe(false);
      expect(manager.canAccess(privateMetadata, user1, 'write')).toBe(false);
      expect(manager.canAccess(privateMetadata, user1, 'admin')).toBe(false);
    });
  });

  describe('Check Permissions on Public Databases', () => {
    const publicMetadata = createMetadata(testDatabase, owner, true);

    it('should allow anyone to read public database', () => {
      expect(manager.canAccess(publicMetadata, user1, 'read')).toBe(true);
      expect(manager.canAccess(publicMetadata, user2, 'read')).toBe(true);
    });

    it('should deny write access to non-permitted users on public database', () => {
      expect(manager.canAccess(publicMetadata, user1, 'write')).toBe(false);
      expect(manager.canAccess(publicMetadata, user1, 'admin')).toBe(false);
    });

    it('should allow owner to write and admin public database', () => {
      expect(manager.canAccess(publicMetadata, owner, 'write')).toBe(true);
      expect(manager.canAccess(publicMetadata, owner, 'admin')).toBe(true);
    });

    it('should allow granted users to write public database', () => {
      manager.grant(testDatabase, user1, 'writer');

      expect(manager.canAccess(publicMetadata, user1, 'read')).toBe(true);
      expect(manager.canAccess(publicMetadata, user1, 'write')).toBe(true);
    });
  });

  describe('Check and Log Access', () => {
    const privateMetadata = createMetadata(testDatabase, owner, false);

    it('should log successful access attempt', () => {
      manager.grant(testDatabase, user1, 'reader');

      const canRead = manager.checkAndLog(privateMetadata, user1, 'read');
      expect(canRead).toBe(true);

      const logs = auditLogger.getUserLogs(user1);
      const accessLogs = logs.filter(l => l.action === 'access');
      expect(accessLogs).toHaveLength(1);
      expect(accessLogs[0].result).toBe('success');
      expect(accessLogs[0].accessAction).toBe('read');
    });

    it('should log denied access attempt', () => {
      const canWrite = manager.checkAndLog(privateMetadata, user1, 'write');
      expect(canWrite).toBe(false);

      const logs = auditLogger.getUserLogs(user1);
      const accessLogs = logs.filter(l => l.action === 'access');
      expect(accessLogs).toHaveLength(1);
      expect(accessLogs[0].result).toBe('denied');
      expect(accessLogs[0].accessAction).toBe('write');
    });

    it('should log multiple access attempts', () => {
      manager.grant(testDatabase, user1, 'reader');

      manager.checkAndLog(privateMetadata, user1, 'read');
      manager.checkAndLog(privateMetadata, user1, 'write');
      manager.checkAndLog(privateMetadata, user1, 'read');

      const logs = auditLogger.getUserLogs(user1);
      const accessLogs = logs.filter(l => l.action === 'access');
      expect(accessLogs).toHaveLength(3);
    });
  });

  describe('List Permissions', () => {
    it('should list all permissions for a database', () => {
      manager.grant(testDatabase, user1, 'writer');
      manager.grant(testDatabase, user2, 'reader');

      const permissions = manager.listPermissions(testDatabase);
      expect(permissions).toHaveLength(2);
    });

    it('should return empty list for database with no permissions', () => {
      const permissions = manager.listPermissions('non-existent');
      expect(permissions).toHaveLength(0);
    });
  });

  describe('Get Role', () => {
    it('should return user role', () => {
      manager.grant(testDatabase, user1, 'writer');

      const role = manager.getRole(testDatabase, user1);
      expect(role).toBe('writer');
    });

    it('should return null for user without permission', () => {
      const role = manager.getRole(testDatabase, user1);
      expect(role).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle owner implicit permissions', () => {
      const metadata = createMetadata(testDatabase, owner, false);

      // Owner has all permissions without explicit grant
      expect(manager.canAccess(metadata, owner, 'read')).toBe(true);
      expect(manager.canAccess(metadata, owner, 'write')).toBe(true);
      expect(manager.canAccess(metadata, owner, 'admin')).toBe(true);
    });

    it('should handle isPublic=undefined as private', () => {
      const metadata: DatabaseMetadata = {
        databaseName: testDatabase,
        type: 'vector',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        owner: owner,
        vectorCount: 0,
        storageSizeBytes: 0
        // isPublic: undefined
      };

      // Should behave as private
      expect(manager.canAccess(metadata, user1, 'read')).toBe(false);
    });

    it('should handle permission changes (upgrade/downgrade)', () => {
      manager.grant(testDatabase, user1, 'reader');
      expect(permissionService.getRole(testDatabase, user1)).toBe('reader');

      manager.grant(testDatabase, user1, 'writer');
      expect(permissionService.getRole(testDatabase, user1)).toBe('writer');

      const logs = auditLogger.getUserLogs(user1);
      const grantLogs = logs.filter(l => l.action === 'grant');
      expect(grantLogs).toHaveLength(2);
    });
  });
});
