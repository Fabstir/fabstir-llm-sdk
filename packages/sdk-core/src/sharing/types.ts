/**
 * Sharing Types
 * Type definitions for sharing and collaboration system
 */

import type { PermissionRole } from '../database/types.js';

/**
 * Invitation status
 */
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'revoked';

/**
 * Share invitation
 */
export interface ShareInvitation {
  /** Unique invitation ID */
  id: string;

  /** Database being shared */
  databaseName: string;

  /** Address of user creating invitation */
  inviterAddress: string;

  /** Address of user being invited */
  inviteeAddress: string;

  /** Role being granted */
  role: PermissionRole;

  /** Current invitation status */
  status: InvitationStatus;

  /** When invitation was created */
  createdAt: number;

  /** When invitation was accepted (if applicable) */
  acceptedAt?: number;

  /** When invitation expires (optional) */
  expiresAt?: number;

  /** When invitation was revoked (if applicable) */
  revokedAt?: number;
}

/**
 * Options for creating invitation
 */
export interface CreateInvitationOptions {
  databaseName: string;
  inviterAddress: string;
  inviteeAddress: string;
  role: PermissionRole;
  expiresAt?: number;
}

/**
 * Access token
 */
export interface AccessToken {
  /** Unique token ID */
  id: string;

  /** The actual token string */
  token: string;

  /** Database this token grants access to */
  databaseName: string;

  /** Address of user who issued token */
  issuerAddress: string;

  /** Role granted by token */
  role: PermissionRole;

  /** Whether token is active */
  active: boolean;

  /** When token was created */
  createdAt: number;

  /** When token expires */
  expiresAt: number;

  /** When token was revoked (if applicable) */
  revokedAt?: number;

  /** Number of times token has been used */
  usageCount: number;

  /** Maximum uses allowed (optional) */
  maxUses?: number;

  /** List of users who have used this token */
  usedBy: string[];
}

/**
 * Options for generating token
 */
export interface GenerateTokenOptions {
  databaseName: string;
  issuerAddress: string;
  role: PermissionRole;
  expiresAt: number;
  maxUses?: number;
}

/**
 * Result of using a token
 */
export interface UseTokenResult {
  granted: boolean;
  role: PermissionRole;
  databaseName: string;
}

/**
 * Options for listing tokens
 */
export interface ListTokenOptions {
  activeOnly?: boolean;
}

/**
 * Notification type
 */
export type NotificationType =
  | 'invitation_received'
  | 'invitation_accepted'
  | 'invitation_rejected'
  | 'invitation_revoked'
  | 'token_used'
  | 'token_revoked'
  | 'access_revoked';

/**
 * Notification
 */
export interface Notification {
  /** Unique notification ID */
  id: string;

  /** User this notification is for */
  userAddress: string;

  /** Type of notification */
  type: NotificationType;

  /** Notification message */
  message: string;

  /** Additional data */
  data: Record<string, any>;

  /** When notification was created */
  createdAt: number;

  /** Whether notification has been read */
  read: boolean;

  /** When notification was read (if applicable) */
  readAt?: number;
}
