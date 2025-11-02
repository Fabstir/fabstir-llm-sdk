/**
 * Notifications
 * Notification system for sharing events
 * Max 200 lines
 */

import type { Notification, NotificationType } from './types.js';
import { generateUniqueId } from './token-generator.js';

/**
 * Notification Manager
 * Manages notifications for sharing events
 */
export class NotificationManager {
  private notifications: Map<string, Notification> = new Map();
  private userNotifications: Map<string, string[]> = new Map();

  /**
   * Create a notification
   * @param userAddress User to notify
   * @param type Notification type
   * @param message Notification message
   * @param data Additional data
   * @returns Created notification
   */
  createNotification(
    userAddress: string,
    type: NotificationType,
    message: string,
    data: Record<string, any> = {}
  ): Notification {
    const notification: Notification = {
      id: generateUniqueId('notif'),
      userAddress,
      type,
      message,
      data,
      createdAt: Date.now(),
      read: false
    };

    this.notifications.set(notification.id, notification);

    // Add to user's notification list
    const userNotifs = this.userNotifications.get(userAddress) || [];
    userNotifs.push(notification.id);
    this.userNotifications.set(userAddress, userNotifs);

    return notification;
  }

  /**
   * Get notification by ID
   * @param id Notification ID
   * @returns Notification or null
   */
  getNotification(id: string): Notification | null {
    return this.notifications.get(id) || null;
  }

  /**
   * Get all notifications for a user
   * @param userAddress User address
   * @param unreadOnly Only return unread notifications
   * @returns Array of notifications
   */
  getUserNotifications(userAddress: string, unreadOnly: boolean = false): Notification[] {
    const notifIds = this.userNotifications.get(userAddress) || [];
    const notifs = notifIds
      .map(id => this.notifications.get(id))
      .filter((n): n is Notification => n !== undefined);

    if (unreadOnly) {
      return notifs.filter(n => !n.read);
    }

    return notifs;
  }

  /**
   * Mark notification as read
   * @param id Notification ID
   * @param userAddress User marking as read
   */
  markAsRead(id: string, userAddress: string): void {
    const notification = this.notifications.get(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userAddress !== userAddress) {
      throw new Error('Only the recipient can mark this notification as read');
    }

    notification.read = true;
    notification.readAt = Date.now();
  }

  /**
   * Mark all notifications as read for a user
   * @param userAddress User address
   */
  markAllAsRead(userAddress: string): void {
    const notifs = this.getUserNotifications(userAddress, true);
    for (const notif of notifs) {
      notif.read = true;
      notif.readAt = Date.now();
    }
  }

  /**
   * Delete notification
   * @param id Notification ID
   * @param userAddress User deleting notification
   */
  deleteNotification(id: string, userAddress: string): void {
    const notification = this.notifications.get(id);
    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.userAddress !== userAddress) {
      throw new Error('Only the recipient can delete this notification');
    }

    this.notifications.delete(id);

    // Remove from user's list
    const userNotifs = this.userNotifications.get(userAddress) || [];
    const index = userNotifs.indexOf(id);
    if (index > -1) {
      userNotifs.splice(index, 1);
      this.userNotifications.set(userAddress, userNotifs);
    }
  }

  /**
   * Clear all notifications for a user
   * @param userAddress User address
   */
  clearAllNotifications(userAddress: string): void {
    const notifIds = this.userNotifications.get(userAddress) || [];
    for (const id of notifIds) {
      this.notifications.delete(id);
    }
    this.userNotifications.delete(userAddress);
  }

  /**
   * Get unread count for a user
   * @param userAddress User address
   * @returns Number of unread notifications
   */
  getUnreadCount(userAddress: string): number {
    return this.getUserNotifications(userAddress, true).length;
  }

  /**
   * Helper: Notify about invitation received
   */
  notifyInvitationReceived(
    inviteeAddress: string,
    inviterAddress: string,
    databaseName: string,
    role: string
  ): Notification {
    return this.createNotification(
      inviteeAddress,
      'invitation_received',
      `${inviterAddress} invited you to collaborate on ${databaseName} as ${role}`,
      { inviterAddress, databaseName, role }
    );
  }

  /**
   * Helper: Notify about invitation accepted
   */
  notifyInvitationAccepted(
    inviterAddress: string,
    inviteeAddress: string,
    databaseName: string
  ): Notification {
    return this.createNotification(
      inviterAddress,
      'invitation_accepted',
      `${inviteeAddress} accepted your invitation to ${databaseName}`,
      { inviteeAddress, databaseName }
    );
  }

  /**
   * Helper: Notify about access revoked
   */
  notifyAccessRevoked(
    userAddress: string,
    databaseName: string,
    reason: string
  ): Notification {
    return this.createNotification(
      userAddress,
      'access_revoked',
      `Your access to ${databaseName} has been revoked: ${reason}`,
      { databaseName, reason }
    );
  }
}
