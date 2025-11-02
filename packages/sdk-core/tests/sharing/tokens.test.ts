/**
 * Access Token Tests
 * Tests for time-limited access tokens
 * Max 250 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SharingManager } from '../../src/sharing/SharingManager.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import type { AccessToken } from '../../src/sharing/types.js';

describe('Access Tokens', () => {
  let sharingManager: SharingManager;
  let permissionManager: PermissionManager;
  const owner = 'owner-0x123';
  const user1 = 'user1-0x456';
  const user2 = 'user2-0x789';
  const dbName = 'token-protected-db';

  beforeEach(() => {
    const permissionService = new PermissionService();
    const auditLogger = new AuditLogger();
    permissionManager = new PermissionManager(permissionService, auditLogger);
    sharingManager = new SharingManager(permissionManager);
  });

  describe('Generate Tokens', () => {
    it('should generate access token with reader role', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000 // 1 hour
      });

      expect(token.id).toBeDefined();
      expect(token.token).toBeDefined();
      expect(token.token.length).toBeGreaterThan(32); // Secure token
      expect(token.databaseName).toBe(dbName);
      expect(token.issuerAddress).toBe(owner);
      expect(token.role).toBe('reader');
      expect(token.active).toBe(true);
      expect(token.usageCount).toBe(0);
      expect(token.createdAt).toBeDefined();
    });

    it('should generate token with writer role', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'writer',
        expiresAt: Date.now() + 3600000
      });

      expect(token.role).toBe('writer');
    });

    it('should generate tokens with usage limits', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000,
        maxUses: 10
      });

      expect(token.maxUses).toBe(10);
      expect(token.usageCount).toBe(0);
    });

    it('should generate unique tokens', () => {
      const token1 = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      const token2 = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      expect(token1.token).not.toBe(token2.token);
    });
  });

  describe('Validate Tokens', () => {
    it('should validate active token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      const isValid = sharingManager.validateToken(token.token);
      expect(isValid).toBe(true);
    });

    it('should reject expired token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() - 1000 // Already expired
      });

      const isValid = sharingManager.validateToken(token.token);
      expect(isValid).toBe(false);
    });

    it('should reject revoked token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      sharingManager.revokeToken(token.id, owner);

      const isValid = sharingManager.validateToken(token.token);
      expect(isValid).toBe(false);
    });

    it('should reject token that exceeded usage limit', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000,
        maxUses: 2
      });

      // Use token twice
      sharingManager.useToken(token.token, user1);
      sharingManager.useToken(token.token, user1);

      // Third use should fail
      const isValid = sharingManager.validateToken(token.token);
      expect(isValid).toBe(false);
    });

    it('should reject non-existent token', () => {
      const isValid = sharingManager.validateToken('non-existent-token');
      expect(isValid).toBe(false);
    });
  });

  describe('Use Tokens', () => {
    it('should grant temporary access when using token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      const result = sharingManager.useToken(token.token, user1);

      expect(result.granted).toBe(true);
      expect(result.role).toBe('reader');
      expect(result.databaseName).toBe(dbName);

      // Verify permission was granted
      const role = permissionManager.getRole(dbName, user1);
      expect(role).toBe('reader');
    });

    it('should increment usage count', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      sharingManager.useToken(token.token, user1);
      sharingManager.useToken(token.token, user2);

      const tokenData = sharingManager.getTokenById(token.id);
      expect(tokenData?.usageCount).toBe(2);
    });

    it('should throw error when using expired token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() - 1000
      });

      expect(() => {
        sharingManager.useToken(token.token, user1);
      }).toThrow('Token is not valid');
    });

    it('should throw error when exceeding usage limit', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000,
        maxUses: 1
      });

      sharingManager.useToken(token.token, user1);

      expect(() => {
        sharingManager.useToken(token.token, user2);
      }).toThrow('Token is not valid');
    });
  });

  describe('Revoke Tokens', () => {
    it('should revoke token by issuer', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      sharingManager.revokeToken(token.id, owner);

      const tokenData = sharingManager.getTokenById(token.id);
      expect(tokenData?.active).toBe(false);
      expect(tokenData?.revokedAt).toBeDefined();
    });

    it('should remove permissions when revoking token', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      // Use token to grant permission
      sharingManager.useToken(token.token, user1);

      // Revoke token
      sharingManager.revokeToken(token.id, owner);

      // Verify permission was removed
      const role = permissionManager.getRole(dbName, user1);
      expect(role).toBeNull();
    });

    it('should throw error if non-issuer tries to revoke', () => {
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      expect(() => {
        sharingManager.revokeToken(token.id, user1);
      }).toThrow('Only the issuer can revoke this token');
    });
  });

  describe('List Tokens', () => {
    it('should list all tokens for a database', () => {
      sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'writer',
        expiresAt: Date.now() + 3600000
      });

      const tokens = sharingManager.listTokens(dbName);
      expect(tokens).toHaveLength(2);
    });

    it('should list only active tokens when filtered', () => {
      const token1 = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      // Revoke first token
      sharingManager.revokeToken(token1.id, owner);

      const activeTokens = sharingManager.listTokens(dbName, { activeOnly: true });
      expect(activeTokens).toHaveLength(1);
    });
  });
});
