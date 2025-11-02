/**
 * Sharing Invitation Tests
 * Tests for database sharing invitation system
 * Max 250 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SharingManager } from '../../src/sharing/SharingManager.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import type { ShareInvitation, InvitationStatus } from '../../src/sharing/types.js';

describe('Sharing Invitations', () => {
  let sharingManager: SharingManager;
  let permissionManager: PermissionManager;
  const owner = 'owner-0x123';
  const invitee1 = 'user1-0x456';
  const invitee2 = 'user2-0x789';
  const dbName = 'shared-knowledge-base';

  beforeEach(() => {
    const permissionService = new PermissionService();
    const auditLogger = new AuditLogger();
    permissionManager = new PermissionManager(permissionService, auditLogger);
    sharingManager = new SharingManager(permissionManager);
  });

  describe('Create Invitations', () => {
    it('should create invitation with reader role', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      expect(invitation.id).toBeDefined();
      expect(invitation.databaseName).toBe(dbName);
      expect(invitation.inviterAddress).toBe(owner);
      expect(invitation.inviteeAddress).toBe(invitee1);
      expect(invitation.role).toBe('reader');
      expect(invitation.status).toBe('pending');
      expect(invitation.createdAt).toBeDefined();
    });

    it('should create invitation with writer role', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'writer'
      });

      expect(invitation.role).toBe('writer');
      expect(invitation.status).toBe('pending');
    });

    it('should create invitation with expiration time', () => {
      const expiresAt = Date.now() + 86400000; // 24 hours
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader',
        expiresAt
      });

      expect(invitation.expiresAt).toBe(expiresAt);
    });

    it('should generate unique invitation IDs', () => {
      const inv1 = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      const inv2 = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee2,
        role: 'reader'
      });

      expect(inv1.id).not.toBe(inv2.id);
    });
  });

  describe('Get Invitations', () => {
    it('should retrieve invitation by ID', () => {
      const created = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      const retrieved = sharingManager.getInvitation(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent invitation', () => {
      const result = sharingManager.getInvitation('non-existent-id');
      expect(result).toBeNull();
    });

    it('should list all invitations for a database', () => {
      sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee2,
        role: 'writer'
      });

      const invitations = sharingManager.listInvitations(dbName);
      expect(invitations).toHaveLength(2);
    });

    it('should list pending invitations for an invitee', () => {
      sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.createInvitation({
        databaseName: 'other-db',
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      const invitations = sharingManager.listInvitationsForUser(invitee1);
      expect(invitations).toHaveLength(2);
      expect(invitations.every(inv => inv.status === 'pending')).toBe(true);
    });
  });

  describe('Accept Invitations', () => {
    it('should accept invitation and grant permission', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.acceptInvitation(invitation.id, invitee1);

      const updated = sharingManager.getInvitation(invitation.id);
      expect(updated?.status).toBe('accepted');
      expect(updated?.acceptedAt).toBeDefined();

      // Verify permission was granted
      const role = permissionManager.getRole(dbName, invitee1);
      expect(role).toBe('reader');
    });

    it('should throw error if wrong user tries to accept', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      expect(() => {
        sharingManager.acceptInvitation(invitation.id, invitee2);
      }).toThrow('Only the invitee can accept this invitation');
    });

    it('should throw error if invitation already accepted', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.acceptInvitation(invitation.id, invitee1);

      expect(() => {
        sharingManager.acceptInvitation(invitation.id, invitee1);
      }).toThrow('Invitation is not pending');
    });

    it('should throw error if invitation expired', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader',
        expiresAt: Date.now() - 1000 // Already expired
      });

      expect(() => {
        sharingManager.acceptInvitation(invitation.id, invitee1);
      }).toThrow('Invitation has expired');
    });
  });

  describe('Reject Invitations', () => {
    it('should reject invitation', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.rejectInvitation(invitation.id, invitee1);

      const updated = sharingManager.getInvitation(invitation.id);
      expect(updated?.status).toBe('rejected');

      // Verify permission was NOT granted
      const role = permissionManager.getRole(dbName, invitee1);
      expect(role).toBeNull();
    });

    it('should throw error if wrong user tries to reject', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      expect(() => {
        sharingManager.rejectInvitation(invitation.id, invitee2);
      }).toThrow('Only the invitee can reject this invitation');
    });
  });

  describe('Revoke Invitations', () => {
    it('should revoke pending invitation', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.revokeInvitation(invitation.id, owner);

      const updated = sharingManager.getInvitation(invitation.id);
      expect(updated?.status).toBe('revoked');
    });

    it('should revoke accepted invitation and remove permission', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      sharingManager.acceptInvitation(invitation.id, invitee1);
      sharingManager.revokeInvitation(invitation.id, owner);

      const updated = sharingManager.getInvitation(invitation.id);
      expect(updated?.status).toBe('revoked');

      // Verify permission was removed
      const role = permissionManager.getRole(dbName, invitee1);
      expect(role).toBeNull();
    });

    it('should throw error if non-inviter tries to revoke', () => {
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: invitee1,
        role: 'reader'
      });

      expect(() => {
        sharingManager.revokeInvitation(invitation.id, invitee2);
      }).toThrow('Only the inviter can revoke this invitation');
    });
  });
});
