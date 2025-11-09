// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionManager } from '../../src/managers/PermissionManager';
import type { Permission, PermissionLevel } from '../../src/types/permissions.types';

describe('PermissionManager', () => {
  let manager: PermissionManager;
  const testOwner = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
  const testUser1 = '0x1234567890123456789012345678901234567890';
  const testUser2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const testResourceId = 'sg-12345';

  beforeEach(() => {
    manager = new PermissionManager();
  });

  describe('grantPermission()', () => {
    it('should grant READER permission to user', async () => {
      const permission = await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      expect(permission.id).toBeDefined();
      expect(permission.resourceId).toBe(testResourceId);
      expect(permission.resourceType).toBe('session_group');
      expect(permission.grantedTo).toBe(testUser1);
      expect(permission.level).toBe('reader');
      expect(permission.grantedBy).toBe(testOwner);
      expect(permission.grantedAt).toBeInstanceOf(Date);
      expect(permission.deleted).toBe(false);
    });

    it('should grant WRITER permission to user', async () => {
      const permission = await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'writer' as PermissionLevel
      );

      expect(permission.level).toBe('writer');
      expect(permission.grantedTo).toBe(testUser1);
    });

    it('should grant ADMIN permission to user', async () => {
      const permission = await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'admin' as PermissionLevel
      );

      expect(permission.level).toBe('admin');
      expect(permission.grantedTo).toBe(testUser1);
    });

    it('should throw error if granting to self', async () => {
      await expect(
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          testOwner, // Same as granter
          'reader' as PermissionLevel
        )
      ).rejects.toThrow('Cannot grant permission to self');
    });

    it('should throw error if invalid wallet address', async () => {
      await expect(
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          'invalid-address',
          'reader' as PermissionLevel
        )
      ).rejects.toThrow('Invalid wallet address');
    });

    it('should throw error if invalid permission level', async () => {
      await expect(
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          testUser1,
          'superuser' as any // Invalid level
        )
      ).rejects.toThrow('Invalid permission level');
    });

    it('should update existing permission if already granted', async () => {
      // Grant READER
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      // Upgrade to WRITER
      const updated = await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'writer' as PermissionLevel
      );

      expect(updated.level).toBe('writer');

      // Should only have one permission
      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions.length).toBe(1);
    });
  });

  describe('revokePermission()', () => {
    it('should revoke permission (soft delete)', async () => {
      // Grant permission first
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      // Revoke it
      await manager.revokePermission(testResourceId, testOwner, testUser1);

      // Check permission should return null
      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBeNull();

      // List should not include revoked
      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions.length).toBe(0);
    });

    it('should throw error if permission not found', async () => {
      await expect(
        manager.revokePermission(testResourceId, testOwner, testUser1)
      ).rejects.toThrow('Permission not found');
    });

    it('should throw error if requestor is not owner', async () => {
      // Set resource ownership
      await manager.setResourceOwner(testResourceId, testOwner);

      // Grant permission
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      // Try to revoke as different user
      await expect(
        manager.revokePermission(testResourceId, testUser2, testUser1)
      ).rejects.toThrow('Permission denied');
    });

    it('should throw error if trying to revoke owner permission', async () => {
      await expect(
        manager.revokePermission(testResourceId, testOwner, testOwner)
      ).rejects.toThrow('Cannot revoke owner permission');
    });
  });

  describe('listPermissions()', () => {
    it('should return all permissions for resource', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser2,
        'writer' as PermissionLevel
      );

      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions.length).toBe(2);
      expect(permissions[0].grantedTo).toBe(testUser1);
      expect(permissions[1].grantedTo).toBe(testUser2);
    });

    it('should return empty array if no permissions', async () => {
      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions).toEqual([]);
    });

    it('should exclude deleted permissions', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser2,
        'writer' as PermissionLevel
      );

      // Revoke one
      await manager.revokePermission(testResourceId, testOwner, testUser1);

      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions.length).toBe(1);
      expect(permissions[0].grantedTo).toBe(testUser2);
    });

    it('should only return permissions for requested resource', async () => {
      const resource1 = 'sg-111';
      const resource2 = 'sg-222';

      await manager.grantPermission(
        resource1,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );
      await manager.grantPermission(
        resource2,
        'session_group',
        testOwner,
        testUser2,
        'reader' as PermissionLevel
      );

      const permissions1 = await manager.listPermissions(resource1, testOwner);
      expect(permissions1.length).toBe(1);
      expect(permissions1[0].resourceId).toBe(resource1);

      const permissions2 = await manager.listPermissions(resource2, testOwner);
      expect(permissions2.length).toBe(1);
      expect(permissions2[0].resourceId).toBe(resource2);
    });

    it('should throw error if requestor is not owner', async () => {
      // Set resource ownership
      await manager.setResourceOwner(testResourceId, testOwner);

      await expect(
        manager.listPermissions(testResourceId, testUser1)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('checkPermission()', () => {
    it('should return permission level if user has access', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBe('reader');
    });

    it('should return null if user has no access', async () => {
      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBeNull();
    });

    it('should return null for revoked permission', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      await manager.revokePermission(testResourceId, testOwner, testUser1);

      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBeNull();
    });

    it('should return admin for owner', async () => {
      // Set resource ownership
      await manager.setResourceOwner(testResourceId, testOwner);

      const level = await manager.checkPermission(testResourceId, testOwner);
      expect(level).toBe('admin');
    });
  });

  describe('Permission levels', () => {
    it('should enforce READER can only view', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBe('reader');

      // Reader cannot grant permissions
      const canShare = await manager.canShare(testResourceId, testUser1);
      expect(canShare).toBe(false);
    });

    it('should enforce WRITER can edit but not share', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'writer' as PermissionLevel
      );

      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBe('writer');

      // Writer cannot grant permissions
      const canShare = await manager.canShare(testResourceId, testUser1);
      expect(canShare).toBe(false);
    });

    it('should enforce ADMIN can share and delete', async () => {
      await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'admin' as PermissionLevel
      );

      const level = await manager.checkPermission(testResourceId, testUser1);
      expect(level).toBe('admin');

      // Admin can grant permissions
      const canShare = await manager.canShare(testResourceId, testUser1);
      expect(canShare).toBe(true);
    });
  });

  describe('Owner access', () => {
    it('should always return admin for owner', async () => {
      // Set resource ownership
      await manager.setResourceOwner(testResourceId, testOwner);

      const level = await manager.checkPermission(testResourceId, testOwner);
      expect(level).toBe('admin');
    });

    it('should not allow revoking owner permission', async () => {
      await expect(
        manager.revokePermission(testResourceId, testOwner, testOwner)
      ).rejects.toThrow('Cannot revoke owner permission');
    });

    it('should allow owner to grant permissions', async () => {
      const permission = await manager.grantPermission(
        testResourceId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel
      );

      expect(permission.grantedBy).toBe(testOwner);
    });

    it('should track resource ownership', async () => {
      // Set resource ownership
      await manager.setResourceOwner(testResourceId, testOwner);

      const owner = await manager.getResourceOwner(testResourceId);
      expect(owner).toBe(testOwner);
    });
  });

  describe('Cascade permissions', () => {
    it('should cascade group permissions to linked databases', async () => {
      const groupId = 'sg-123';
      const dbId1 = 'db-456';
      const dbId2 = 'db-789';

      // Link databases to group
      await manager.linkDatabases(groupId, [dbId1, dbId2]);

      // Grant permission to group
      await manager.grantPermission(
        groupId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel,
        true // cascade
      );

      // Check user has permission to both databases
      const db1Level = await manager.checkPermission(dbId1, testUser1);
      const db2Level = await manager.checkPermission(dbId2, testUser1);

      expect(db1Level).toBe('reader');
      expect(db2Level).toBe('reader');
    });

    it('should revoke cascaded permissions when group permission revoked', async () => {
      const groupId = 'sg-123';
      const dbId = 'db-456';

      await manager.linkDatabases(groupId, [dbId]);

      // Grant with cascade
      await manager.grantPermission(
        groupId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel,
        true
      );

      // Revoke group permission
      await manager.revokePermission(groupId, testOwner, testUser1, true); // cascade

      // Database permission should also be revoked
      const dbLevel = await manager.checkPermission(dbId, testUser1);
      expect(dbLevel).toBeNull();
    });

    it('should not cascade if cascade=false', async () => {
      const groupId = 'sg-123';
      const dbId = 'db-456';

      await manager.linkDatabases(groupId, [dbId]);

      // Grant WITHOUT cascade
      await manager.grantPermission(
        groupId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel,
        false // no cascade
      );

      // Database should NOT have permission
      const dbLevel = await manager.checkPermission(dbId, testUser1);
      expect(dbLevel).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should throw error if resourceId is empty', async () => {
      await expect(
        manager.grantPermission(
          '',
          'session_group',
          testOwner,
          testUser1,
          'reader' as PermissionLevel
        )
      ).rejects.toThrow('resourceId is required');
    });

    it('should throw error if grantedTo is empty', async () => {
      await expect(
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          '',
          'reader' as PermissionLevel
        )
      ).rejects.toThrow('grantedTo is required');
    });

    it('should throw error if invalid resource type', async () => {
      await expect(
        manager.grantPermission(
          testResourceId,
          'invalid_type' as any,
          testOwner,
          testUser1,
          'reader' as PermissionLevel
        )
      ).rejects.toThrow('Invalid resource type');
    });

    it('should handle concurrent permission grants', async () => {
      const promises = [
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          testUser1,
          'reader' as PermissionLevel
        ),
        manager.grantPermission(
          testResourceId,
          'session_group',
          testOwner,
          testUser2,
          'writer' as PermissionLevel
        ),
      ];

      const results = await Promise.all(promises);
      expect(results.length).toBe(2);

      const permissions = await manager.listPermissions(testResourceId, testOwner);
      expect(permissions.length).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle permission for non-existent resource', async () => {
      const level = await manager.checkPermission('non-existent-resource', testUser1);
      expect(level).toBeNull();
    });

    it('should handle listing permissions for non-existent resource', async () => {
      const permissions = await manager.listPermissions('non-existent', testOwner);
      expect(permissions).toEqual([]);
    });

    it('should handle multiple cascades', async () => {
      const groupId = 'sg-123';
      const dbIds = ['db-1', 'db-2', 'db-3', 'db-4', 'db-5'];

      await manager.linkDatabases(groupId, dbIds);

      await manager.grantPermission(
        groupId,
        'session_group',
        testOwner,
        testUser1,
        'reader' as PermissionLevel,
        true
      );

      // All databases should have permission
      for (const dbId of dbIds) {
        const level = await manager.checkPermission(dbId, testUser1);
        expect(level).toBe('reader');
      }
    });

    it('should handle revoking non-existent permission gracefully', async () => {
      await expect(
        manager.revokePermission(testResourceId, testOwner, testUser1)
      ).rejects.toThrow('Permission not found');
    });
  });
});
