'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { useToast } from '@/contexts/toast-context';
import { NotificationCard, type Notification } from '@/components/notifications/notification-card';
import { InvitationCard, type ShareInvitation } from '@/components/notifications/invitation-card';
import { Bell, CheckCheck, Filter } from 'lucide-react';

type FilterType = 'all' | 'unread' | 'invitations' | 'activity';

/**
 * Notifications Page
 *
 * Displays all notifications and share invitations
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { sessionGroups, shareGroup } = useSessionGroups();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [invitations, setInvitations] = useState<ShareInvitation[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  // Load notifications and invitations from localStorage
  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Load notifications
      const notificationsKey = `notifications_${address}`;
      const storedNotifications = localStorage.getItem(notificationsKey);
      if (storedNotifications) {
        setNotifications(JSON.parse(storedNotifications));
      } else {
        // Generate sample notifications for demo
        const sampleNotifications: Notification[] = [
          {
            id: 'notif-1',
            type: 'activity',
            subType: 'new_message',
            title: 'New message in Engineering Project',
            message: 'You received a new message in your chat session',
            timestamp: Date.now() - 3600000,
            read: false,
            actionUrl: '/session-groups/group-1762820648302-cs0ubq4',
          },
          {
            id: 'notif-2',
            type: 'activity',
            subType: 'database_linked',
            title: 'Database linked to group',
            message: 'API Documentation was linked to Engineering Project',
            timestamp: Date.now() - 7200000,
            read: false,
            metadata: {
              groupName: 'Engineering Project',
              databaseId: 'db-api-docs',
            },
          },
          {
            id: 'notif-3',
            type: 'system',
            title: 'Welcome to Fabstir UI5',
            message: 'Thanks for trying out the notification system!',
            timestamp: Date.now() - 86400000,
            read: true,
          },
        ];
        setNotifications(sampleNotifications);
        localStorage.setItem(notificationsKey, JSON.stringify(sampleNotifications));
      }

      // Load invitations
      const invitationsKey = `invitations_${address}`;
      const storedInvitations = localStorage.getItem(invitationsKey);
      if (storedInvitations) {
        setInvitations(JSON.parse(storedInvitations));
      } else {
        // Generate sample invitations for demo
        const sampleInvitations: ShareInvitation[] = [
          {
            id: 'inv-1',
            groupId: 'group-sample-1',
            groupName: 'Marketing Campaign',
            groupDescription: 'All marketing materials and strategy',
            fromAddress: '0x1234567890123456789012345678901234567890',
            fromName: 'Alice',
            role: 'writer',
            timestamp: Date.now() - 1800000,
            status: 'pending',
            linkedDatabases: 3,
          },
          {
            id: 'inv-2',
            groupId: 'group-sample-2',
            groupName: 'Product Roadmap',
            groupDescription: 'Product planning and feature discussions',
            fromAddress: '0x0987654321098765432109876543210987654321',
            fromName: 'Bob',
            role: 'reader',
            timestamp: Date.now() - 3600000,
            status: 'pending',
            linkedDatabases: 1,
          },
        ];
        setInvitations(sampleInvitations);
        localStorage.setItem(invitationsKey, JSON.stringify(sampleInvitations));
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [isConnected, address]);

  // Filter notifications based on selected filter
  const filteredNotifications = notifications.filter((notif) => {
    if (filter === 'unread') return !notif.read;
    if (filter === 'activity') return notif.type === 'activity';
    if (filter === 'invitations') return notif.type === 'invitation';
    return true; // 'all'
  });

  const filteredInvitations = filter === 'all' || filter === 'invitations'
    ? invitations.filter(inv => inv.status === 'pending')
    : [];

  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingInvitationsCount = invitations.filter(inv => inv.status === 'pending').length;

  const handleMarkAsRead = (notificationId: string) => {
    const updated = notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    setNotifications(updated);
    if (address) {
      localStorage.setItem(`notifications_${address}`, JSON.stringify(updated));
    }
    toast.success('Marked as read');
  };

  const handleMarkAllAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    if (address) {
      localStorage.setItem(`notifications_${address}`, JSON.stringify(updated));
    }
    const count = notifications.filter(n => !n.read).length;
    toast.success(`Marked ${count} notification${count !== 1 ? 's' : ''} as read`);
  };

  const handleDeleteNotification = (notificationId: string) => {
    const updated = notifications.filter(n => n.id !== notificationId);
    setNotifications(updated);
    if (address) {
      localStorage.setItem(`notifications_${address}`, JSON.stringify(updated));
    }
    toast.success('Notification deleted');
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    const invitation = invitations.find(inv => inv.id === invitationId);
    if (!invitation || !address) return;

    try {
      // Update invitation status
      const updatedInvitations = invitations.map(inv =>
        inv.id === invitationId ? { ...inv, status: 'accepted' as const } : inv
      );
      setInvitations(updatedInvitations);
      localStorage.setItem(`invitations_${address}`, JSON.stringify(updatedInvitations));

      // Add notification about acceptance
      const newNotification: Notification = {
        id: `notif-accept-${Date.now()}`,
        type: 'invitation',
        subType: 'share_accepted',
        title: 'Invitation Accepted',
        message: `You accepted the invitation to "${invitation.groupName}"`,
        timestamp: Date.now(),
        read: false,
        actionUrl: `/session-groups/${invitation.groupId}`,
        metadata: {
          groupId: invitation.groupId,
          groupName: invitation.groupName,
        },
      };
      const updatedNotifications = [newNotification, ...notifications];
      setNotifications(updatedNotifications);
      localStorage.setItem(`notifications_${address}`, JSON.stringify(updatedNotifications));

      toast.success('Invitation accepted', `Navigating to ${invitation.groupName}...`);

      // Navigate to the group
      setTimeout(() => {
        router.push(`/session-groups/${invitation.groupId}`);
      }, 1000);
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      toast.error('Failed to accept invitation', 'Please try again');
      throw error;
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    const invitation = invitations.find(inv => inv.id === invitationId);
    if (!invitation || !address) return;

    try {
      // Update invitation status
      const updatedInvitations = invitations.map(inv =>
        inv.id === invitationId ? { ...inv, status: 'declined' as const } : inv
      );
      setInvitations(updatedInvitations);
      localStorage.setItem(`invitations_${address}`, JSON.stringify(updatedInvitations));

      // Add notification about decline
      const newNotification: Notification = {
        id: `notif-decline-${Date.now()}`,
        type: 'invitation',
        subType: 'share_declined',
        title: 'Invitation Declined',
        message: `You declined the invitation to "${invitation.groupName}"`,
        timestamp: Date.now(),
        read: false,
        metadata: {
          groupId: invitation.groupId,
          groupName: invitation.groupName,
        },
      };
      const updatedNotifications = [newNotification, ...notifications];
      setNotifications(updatedNotifications);
      localStorage.setItem(`notifications_${address}`, JSON.stringify(updatedNotifications));

      toast.info('Invitation declined');
    } catch (error) {
      console.error('Failed to decline invitation:', error);
      toast.error('Failed to decline invitation', 'Please try again');
      throw error;
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to view notifications
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Notifications
              </h1>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                <CheckCheck className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Mark all as read</span>
                <span className="sm:hidden">Mark all</span>
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <span>
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </span>
            <span>
              {pendingInvitationsCount} pending invitation{pendingInvitationsCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <span className="text-sm text-gray-600 mr-2">Filter:</span>
            <div className="flex gap-2">
              {(['all', 'unread', 'invitations', 'activity'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    filter === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {f === 'all' && 'All'}
                  {f === 'unread' && `Unread (${unreadCount})`}
                  {f === 'invitations' && `Invitations (${pendingInvitationsCount})`}
                  {f === 'activity' && 'Activity'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Invitations Section */}
        {filteredInvitations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pending Invitations ({filteredInvitations.length})
            </h2>
            <div className="space-y-4">
              {filteredInvitations.map((invitation) => (
                <InvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  onAccept={handleAcceptInvitation}
                  onDecline={handleDeclineInvitation}
                />
              ))}
            </div>
          </div>
        )}

        {/* Notifications Section */}
        {filteredNotifications.length > 0 ? (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {filter === 'unread' ? 'Unread Notifications' : 'All Notifications'}
              {' '}({filteredNotifications.length})
            </h2>
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={handleDeleteNotification}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </h3>
            <p className="text-gray-600">
              {filter === 'unread'
                ? "You're all caught up!"
                : 'New notifications will appear here'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
