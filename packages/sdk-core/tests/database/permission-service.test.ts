/**
 * Permission Service Tests
 * Tests for shared permission management across all database types
 * Max 300 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionService } from '../../src/database/PermissionService.js';
import type { PermissionRole } from '../../src/database/types.js';

describe('PermissionService', () => {
  let service: PermissionService;
  const testDatabase = 'test-db';
  const owner = 'owner-0x123';
  const user1 = 'user1-0x456';
  const user2 = 'user2-0x789';

  beforeEach(() => {
    service = new PermissionService();
  });

  describe('Grant Permissions', () => {
    it('should grant owner permission', () => {
      const beforeGrant = Date.now();

      service.grant(testDatabase, owner, 'owner');

      const role = service.getRole(testDatabase, owner);
      expect(role).toBe('owner');

      const permissions = service.list(testDatabase);
      expect(permissions).toHaveLength(1);
      expect(permissions[0].userAddress).toBe(owner);
      expect(permissions[0].role).toBe('owner');
      expect(permissions[0].grantedAt).toBeGreaterThanOrEqual(beforeGrant);
    });

    it('should grant writer permission', () => {
      service.grant(testDatabase, user1, 'writer');

      const role = service.getRole(testDatabase, user1);
      expect(role).toBe('writer');
    });

    it('should grant reader permission', () => {
      service.grant(testDatabase, user1, 'reader');

      const role = service.getRole(testDatabase, user1);
      expect(role).toBe('reader');
    });

    it('should allow granting different roles to different users', () => {
      service.grant(testDatabase, owner, 'owner');
      service.grant(testDatabase, user1, 'writer');
      service.grant(testDatabase, user2, 'reader');

      expect(service.getRole(testDatabase, owner)).toBe('owner');
      expect(service.getRole(testDatabase, user1)).toBe('writer');
      expect(service.getRole(testDatabase, user2)).toBe('reader');
    });

    it('should allow upgrading role by re-granting', () => {
      service.grant(testDatabase, user1, 'reader');
      expect(service.getRole(testDatabase, user1)).toBe('reader');

      service.grant(testDatabase, user1, 'writer');
      expect(service.getRole(testDatabase, user1)).toBe('writer');

      service.grant(testDatabase, user1, 'owner');
      expect(service.getRole(testDatabase, user1)).toBe('owner');
    });

    it('should allow downgrading role by re-granting', () => {
      service.grant(testDatabase, user1, 'owner');
      expect(service.getRole(testDatabase, user1)).toBe('owner');

      service.grant(testDatabase, user1, 'writer');
      expect(service.getRole(testDatabase, user1)).toBe('writer');

      service.grant(testDatabase, user1, 'reader');
      expect(service.getRole(testDatabase, user1)).toBe('reader');
    });

    it('should handle permissions for multiple databases', () => {
      service.grant('db-1', user1, 'owner');
      service.grant('db-2', user1, 'reader');

      expect(service.getRole('db-1', user1)).toBe('owner');
      expect(service.getRole('db-2', user1)).toBe('reader');
    });
  });

  describe('Check Permissions', () => {
    it('should allow owner to read', () => {
      service.grant(testDatabase, owner, 'owner');

      const canRead = service.check(testDatabase, owner, 'read');
      expect(canRead).toBe(true);
    });

    it('should allow owner to write', () => {
      service.grant(testDatabase, owner, 'owner');

      const canWrite = service.check(testDatabase, owner, 'write');
      expect(canWrite).toBe(true);
    });

    it('should allow writer to read', () => {
      service.grant(testDatabase, user1, 'writer');

      const canRead = service.check(testDatabase, user1, 'read');
      expect(canRead).toBe(true);
    });

    it('should allow writer to write', () => {
      service.grant(testDatabase, user1, 'writer');

      const canWrite = service.check(testDatabase, user1, 'write');
      expect(canWrite).toBe(true);
    });

    it('should allow reader to read', () => {
      service.grant(testDatabase, user1, 'reader');

      const canRead = service.check(testDatabase, user1, 'read');
      expect(canRead).toBe(true);
    });

    it('should deny reader write access', () => {
      service.grant(testDatabase, user1, 'reader');

      const canWrite = service.check(testDatabase, user1, 'write');
      expect(canWrite).toBe(false);
    });

    it('should deny access to user without permissions', () => {
      service.grant(testDatabase, owner, 'owner');

      expect(service.check(testDatabase, user1, 'read')).toBe(false);
      expect(service.check(testDatabase, user1, 'write')).toBe(false);
    });

    it('should deny access to non-existent database', () => {
      expect(service.check('non-existent', user1, 'read')).toBe(false);
      expect(service.check('non-existent', user1, 'write')).toBe(false);
    });
  });

  describe('Revoke Permissions', () => {
    it('should revoke user permission', () => {
      service.grant(testDatabase, user1, 'writer');
      expect(service.getRole(testDatabase, user1)).toBe('writer');

      service.revoke(testDatabase, user1);
      expect(service.getRole(testDatabase, user1)).toBeNull();
    });

    it('should revoke owner permission', () => {
      service.grant(testDatabase, owner, 'owner');
      expect(service.getRole(testDatabase, owner)).toBe('owner');

      service.revoke(testDatabase, owner);
      expect(service.getRole(testDatabase, owner)).toBeNull();
    });

    it('should not affect other users when revoking', () => {
      service.grant(testDatabase, user1, 'writer');
      service.grant(testDatabase, user2, 'reader');

      service.revoke(testDatabase, user1);

      expect(service.getRole(testDatabase, user1)).toBeNull();
      expect(service.getRole(testDatabase, user2)).toBe('reader');
    });

    it('should throw error when revoking non-existent permission', () => {
      expect(() => {
        service.revoke(testDatabase, user1);
      }).toThrow('Permission not found');
    });

    it('should allow re-granting after revocation', () => {
      service.grant(testDatabase, user1, 'writer');
      service.revoke(testDatabase, user1);

      service.grant(testDatabase, user1, 'reader');
      expect(service.getRole(testDatabase, user1)).toBe('reader');
    });
  });

  describe('List Permissions', () => {
    it('should return empty list for database without permissions', () => {
      const permissions = service.list(testDatabase);
      expect(permissions).toHaveLength(0);
    });

    it('should list all permissions for a database', () => {
      service.grant(testDatabase, owner, 'owner');
      service.grant(testDatabase, user1, 'writer');
      service.grant(testDatabase, user2, 'reader');

      const permissions = service.list(testDatabase);
      expect(permissions).toHaveLength(3);

      const addresses = permissions.map(p => p.userAddress).sort();
      expect(addresses).toEqual([owner, user1, user2].sort());
    });

    it('should include all permission fields', () => {
      service.grant(testDatabase, user1, 'writer');

      const permissions = service.list(testDatabase);
      const perm = permissions[0];

      expect(perm).toHaveProperty('databaseName');
      expect(perm).toHaveProperty('userAddress');
      expect(perm).toHaveProperty('role');
      expect(perm).toHaveProperty('grantedAt');
    });

    it('should handle permissions for multiple databases independently', () => {
      service.grant('db-1', user1, 'owner');
      service.grant('db-1', user2, 'reader');
      service.grant('db-2', user1, 'reader');

      const perms1 = service.list('db-1');
      const perms2 = service.list('db-2');

      expect(perms1).toHaveLength(2);
      expect(perms2).toHaveLength(1);
    });
  });

  describe('Get Role', () => {
    it('should return null for user without permission', () => {
      const role = service.getRole(testDatabase, user1);
      expect(role).toBeNull();
    });

    it('should return correct role for user', () => {
      service.grant(testDatabase, user1, 'writer');

      const role = service.getRole(testDatabase, user1);
      expect(role).toBe('writer');
    });

    it('should return null after revocation', () => {
      service.grant(testDatabase, user1, 'writer');
      service.revoke(testDatabase, user1);

      const role = service.getRole(testDatabase, user1);
      expect(role).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle same user having permissions on different databases', () => {
      service.grant('db-1', user1, 'owner');
      service.grant('db-2', user1, 'writer');
      service.grant('db-3', user1, 'reader');

      expect(service.getRole('db-1', user1)).toBe('owner');
      expect(service.getRole('db-2', user1)).toBe('writer');
      expect(service.getRole('db-3', user1)).toBe('reader');
    });

    it('should handle permissions for 10+ users on same database', () => {
      for (let i = 0; i < 12; i++) {
        service.grant(testDatabase, `user-${i}`, 'reader');
      }

      const permissions = service.list(testDatabase);
      expect(permissions).toHaveLength(12);
    });

    it('should update grantedAt when re-granting permission', () => {
      service.grant(testDatabase, user1, 'reader');
      const perms1 = service.list(testDatabase);
      const firstGrantedAt = perms1[0].grantedAt;

      // Small delay
      setTimeout(() => {
        service.grant(testDatabase, user1, 'writer');
        const perms2 = service.list(testDatabase);
        const secondGrantedAt = perms2[0].grantedAt;

        expect(secondGrantedAt).toBeGreaterThan(firstGrantedAt);
      }, 10);
    });
  });
});
