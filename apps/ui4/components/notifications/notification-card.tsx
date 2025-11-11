'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Database,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  Info
} from 'lucide-react';

export interface Notification {
  id: string;
  type: 'invitation' | 'activity' | 'system';
  subType?: 'share_received' | 'share_accepted' | 'share_declined' | 'new_message' | 'new_session' | 'database_linked';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  actionUrl?: string;
  metadata?: {
    groupId?: string;
    groupName?: string;
    fromAddress?: string;
    fromName?: string;
    sessionId?: string;
    databaseId?: string;
  };
}

interface NotificationCardProps {
  notification: Notification;
  onMarkAsRead: (notificationId: string) => void;
  onDelete: (notificationId: string) => void;
}

/**
 * Notification Card Component
 *
 * Displays a single notification with appropriate icon and styling
 */
export function NotificationCard({ notification, onMarkAsRead, onDelete }: NotificationCardProps) {
  const getIcon = () => {
    switch (notification.subType) {
      case 'share_received':
      case 'share_accepted':
      case 'share_declined':
        return <Users className="h-5 w-5 text-blue-600" />;
      case 'new_message':
        return <MessageSquare className="h-5 w-5 text-green-600" />;
      case 'new_session':
        return <MessageSquare className="h-5 w-5 text-purple-600" />;
      case 'database_linked':
        return <Database className="h-5 w-5 text-orange-600" />;
      default:
        return <Info className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusBadge = () => {
    if (notification.subType === 'share_accepted') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs">
          <CheckCircle2 className="h-3 w-3" />
          Accepted
        </span>
      );
    }
    if (notification.subType === 'share_declined') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">
          <XCircle className="h-3 w-3" />
          Declined
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className={`border rounded-lg p-4 transition-colors ${
        notification.read
          ? 'bg-white border-gray-200'
          : 'bg-blue-50 border-blue-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="mt-0.5">
          {getIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-gray-900">
              {notification.title}
            </h4>
            {getStatusBadge()}
          </div>

          <p className="text-sm text-gray-600 mb-2">
            {notification.message}
          </p>

          {/* Metadata */}
          {notification.metadata && (
            <div className="text-xs text-gray-500 mb-2">
              {notification.metadata.fromName && (
                <span>From: {notification.metadata.fromName}</span>
              )}
              {notification.metadata.groupName && (
                <span className="ml-3">Group: {notification.metadata.groupName}</span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
            </span>

            <div className="flex items-center gap-2">
              {!notification.read && (
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Mark as read
                </button>
              )}
              {notification.actionUrl && (
                <a
                  href={notification.actionUrl}
                  className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View
                </a>
              )}
              <button
                onClick={() => onDelete(notification.id)}
                className="text-xs text-red-600 hover:text-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
