/**
 * Sharing Manager
 * Main manager for database sharing and collaboration
 * Max 400 lines
 */

import { PermissionManager } from '../permissions/PermissionManager.js';
import { NotificationManager } from './notifications.js';
import { generateSecureToken, generateUniqueId } from './token-generator.js';
import type {
  ShareInvitation,
  CreateInvitationOptions,
  AccessToken,
  GenerateTokenOptions,
  UseTokenResult,
  ListTokenOptions
} from './types.js';

/**
 * Sharing Manager
 * Manages invitations, tokens, and collaboration
 */
export class SharingManager {
  private permissionManager: PermissionManager;
  private notificationManager: NotificationManager;
  private invitations: Map<string, ShareInvitation> = new Map();
  private tokens: Map<string, AccessToken> = new Map();
  private tokenLookup: Map<string, string> = new Map(); // token string -> token id

  /**
   * Create a new Sharing Manager
   * @param permissionManager Permission manager to integrate with
   */
  constructor(permissionManager: PermissionManager) {
    this.permissionManager = permissionManager;
    this.notificationManager = new NotificationManager();
  }

  /**
   * Create a sharing invitation
   * @param options Invitation options
   * @returns Created invitation
   */
  createInvitation(options: CreateInvitationOptions): ShareInvitation {
    const invitation: ShareInvitation = {
      id: generateUniqueId('inv'),
      databaseName: options.databaseName,
      inviterAddress: options.inviterAddress,
      inviteeAddress: options.inviteeAddress,
      role: options.role,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: options.expiresAt
    };

    this.invitations.set(invitation.id, invitation);

    // Notify invitee
    this.notificationManager.notifyInvitationReceived(
      options.inviteeAddress,
      options.inviterAddress,
      options.databaseName,
      options.role
    );

    return invitation;
  }

  /**
   * Get invitation by ID
   * @param id Invitation ID
   * @returns Invitation or null
   */
  getInvitation(id: string): ShareInvitation | null {
    return this.invitations.get(id) || null;
  }

  /**
   * List invitations for a database
   * @param databaseName Database name
   * @returns Array of invitations
   */
  listInvitations(databaseName: string): ShareInvitation[] {
    return Array.from(this.invitations.values())
      .filter(inv => inv.databaseName === databaseName);
  }

  /**
   * List invitations for a user
   * @param userAddress User address
   * @returns Array of invitations where user is invitee
   */
  listInvitationsForUser(userAddress: string): ShareInvitation[] {
    return Array.from(this.invitations.values())
      .filter(inv => inv.inviteeAddress === userAddress && inv.status === 'pending');
  }

  /**
   * Accept an invitation
   * @param id Invitation ID
   * @param userAddress User accepting (must be invitee)
   */
  acceptInvitation(id: string, userAddress: string): void {
    const invitation = this.invitations.get(id);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.inviteeAddress !== userAddress) {
      throw new Error('Only the invitee can accept this invitation');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    // Check expiration
    if (invitation.expiresAt && invitation.expiresAt < Date.now()) {
      throw new Error('Invitation has expired');
    }

    // Grant permission
    this.permissionManager.grant(
      invitation.databaseName,
      invitation.inviteeAddress,
      invitation.role
    );

    // Update invitation status
    invitation.status = 'accepted';
    invitation.acceptedAt = Date.now();

    // Notify inviter
    this.notificationManager.notifyInvitationAccepted(
      invitation.inviterAddress,
      invitation.inviteeAddress,
      invitation.databaseName
    );
  }

  /**
   * Reject an invitation
   * @param id Invitation ID
   * @param userAddress User rejecting (must be invitee)
   */
  rejectInvitation(id: string, userAddress: string): void {
    const invitation = this.invitations.get(id);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.inviteeAddress !== userAddress) {
      throw new Error('Only the invitee can reject this invitation');
    }

    if (invitation.status !== 'pending') {
      throw new Error('Invitation is not pending');
    }

    invitation.status = 'rejected';
  }

  /**
   * Revoke an invitation
   * @param id Invitation ID
   * @param userAddress User revoking (must be inviter)
   */
  revokeInvitation(id: string, userAddress: string): void {
    const invitation = this.invitations.get(id);
    if (!invitation) {
      throw new Error('Invitation not found');
    }

    if (invitation.inviterAddress !== userAddress) {
      throw new Error('Only the inviter can revoke this invitation');
    }

    // If invitation was accepted, remove permission
    if (invitation.status === 'accepted') {
      this.permissionManager.revoke(
        invitation.databaseName,
        invitation.inviteeAddress
      );

      // Notify user that access was revoked
      this.notificationManager.notifyAccessRevoked(
        invitation.inviteeAddress,
        invitation.databaseName,
        'Invitation revoked by owner'
      );
    }

    invitation.status = 'revoked';
    invitation.revokedAt = Date.now();
  }

  /**
   * Generate an access token
   * @param options Token options
   * @returns Generated token
   */
  generateToken(options: GenerateTokenOptions): AccessToken {
    const tokenString = generateSecureToken();
    const token: AccessToken = {
      id: generateUniqueId('tok'),
      token: tokenString,
      databaseName: options.databaseName,
      issuerAddress: options.issuerAddress,
      role: options.role,
      active: true,
      createdAt: Date.now(),
      expiresAt: options.expiresAt,
      usageCount: 0,
      maxUses: options.maxUses,
      usedBy: []
    };

    this.tokens.set(token.id, token);
    this.tokenLookup.set(tokenString, token.id);

    return token;
  }

  /**
   * Get token by ID
   * @param id Token ID
   * @returns Token or null
   */
  getTokenById(id: string): AccessToken | null {
    return this.tokens.get(id) || null;
  }

  /**
   * Get token by token string
   * @param tokenString Token string
   * @returns Token or null
   */
  private getTokenByString(tokenString: string): AccessToken | null {
    const id = this.tokenLookup.get(tokenString);
    if (!id) return null;
    return this.tokens.get(id) || null;
  }

  /**
   * Validate a token
   * @param tokenString Token string
   * @returns true if token is valid
   */
  validateToken(tokenString: string): boolean {
    const token = this.getTokenByString(tokenString);
    if (!token) return false;
    if (!token.active) return false;
    if (token.expiresAt < Date.now()) return false;
    if (token.maxUses && token.usageCount >= token.maxUses) return false;

    return true;
  }

  /**
   * Use a token to grant access
   * @param tokenString Token string
   * @param userAddress User using the token
   * @returns Use result
   */
  useToken(tokenString: string, userAddress: string): UseTokenResult {
    if (!this.validateToken(tokenString)) {
      throw new Error('Token is not valid');
    }

    const token = this.getTokenByString(tokenString);
    if (!token) {
      throw new Error('Token not found');
    }

    // Grant permission
    this.permissionManager.grant(
      token.databaseName,
      userAddress,
      token.role
    );

    // Update token usage
    token.usageCount++;
    if (!token.usedBy.includes(userAddress)) {
      token.usedBy.push(userAddress);
    }

    return {
      granted: true,
      role: token.role,
      databaseName: token.databaseName
    };
  }

  /**
   * Revoke a token
   * @param id Token ID
   * @param userAddress User revoking (must be issuer)
   */
  revokeToken(id: string, userAddress: string): void {
    const token = this.tokens.get(id);
    if (!token) {
      throw new Error('Token not found');
    }

    if (token.issuerAddress !== userAddress) {
      throw new Error('Only the issuer can revoke this token');
    }

    // Remove permissions from all users who used this token
    for (const user of token.usedBy) {
      this.permissionManager.revoke(token.databaseName, user);
      this.notificationManager.notifyAccessRevoked(
        user,
        token.databaseName,
        'Access token revoked by owner'
      );
    }

    token.active = false;
    token.revokedAt = Date.now();
  }

  /**
   * List tokens for a database
   * @param databaseName Database name
   * @param options List options
   * @returns Array of tokens
   */
  listTokens(databaseName: string, options?: ListTokenOptions): AccessToken[] {
    let tokens = Array.from(this.tokens.values())
      .filter(tok => tok.databaseName === databaseName);

    if (options?.activeOnly) {
      tokens = tokens.filter(tok => tok.active && tok.expiresAt > Date.now());
    }

    return tokens;
  }

  /**
   * Get notification manager
   * @returns Notification manager instance
   */
  getNotificationManager(): NotificationManager {
    return this.notificationManager;
  }
}
