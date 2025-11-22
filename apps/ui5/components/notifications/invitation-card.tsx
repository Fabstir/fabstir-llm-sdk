'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Users, CheckCircle2, XCircle } from 'lucide-react';

export interface ShareInvitation {
  id: string;
  groupId: string;
  groupName: string;
  groupDescription?: string;
  fromAddress: string;
  fromName?: string;
  role: 'reader' | 'writer';
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
  linkedDatabases?: number;
}

interface InvitationCardProps {
  invitation: ShareInvitation;
  onAccept: (invitationId: string) => Promise<void>;
  onDecline: (invitationId: string) => Promise<void>;
}

/**
 * Invitation Card Component
 *
 * Displays a share invitation with Accept/Decline buttons
 */
export function InvitationCard({ invitation, onAccept, onDecline }: InvitationCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      await onAccept(invitation.id);
    } catch (err) {
      console.error('Failed to accept invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to accept invitation');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      await onDecline(invitation.id);
    } catch (err) {
      console.error('Failed to decline invitation:', err);
      setError(err instanceof Error ? err.message : 'Failed to decline invitation');
    } finally {
      setIsProcessing(false);
    }
  };

  const getRoleBadge = () => {
    if (invitation.role === 'writer') {
      return (
        <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
          Writer
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
        Reader
      </span>
    );
  };

  const getStatusBadge = () => {
    if (invitation.status === 'accepted') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Accepted
        </span>
      );
    }
    if (invitation.status === 'declined') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm">
          <XCircle className="h-4 w-4" />
          Declined
        </span>
      );
    }
    return null;
  };

  const isPending = invitation.status === 'pending';

  return (
    <div className="border border-blue-200 rounded-lg p-5 bg-gradient-to-br from-blue-50 to-white">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="mt-1">
          <div className="p-2 rounded-full bg-blue-100">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="font-semibold text-gray-900 text-lg mb-1">
                New Share Invitation
              </h3>
              <p className="text-sm text-gray-600">
                {invitation.fromName || `${invitation.fromAddress.substring(0, 8)}...${invitation.fromAddress.substring(invitation.fromAddress.length - 6)}`}
                {' '}invited you to collaborate
              </p>
            </div>
            {getStatusBadge()}
          </div>

          {/* Group Details */}
          <div className="bg-white border border-gray-200 rounded-md p-3 mb-3">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-gray-900">{invitation.groupName}</h4>
              {getRoleBadge()}
            </div>
            {invitation.groupDescription && (
              <p className="text-sm text-gray-600 mb-2">{invitation.groupDescription}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {invitation.linkedDatabases !== undefined && (
                <span>📚 {invitation.linkedDatabases} database{invitation.linkedDatabases !== 1 ? 's' : ''} linked</span>
              )}
              <span>
                {formatDistanceToNow(new Date(invitation.timestamp), { addSuffix: true })}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Actions */}
          {isPending ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleAccept}
                disabled={isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Accepting...' : 'Accept Invitation'}
              </button>
              <button
                onClick={handleDecline}
                disabled={isProcessing}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Declining...' : 'Decline'}
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-600">
              You {invitation.status} this invitation
            </div>
          )}

          {/* Role Description */}
          {isPending && (
            <div className="mt-3 p-3 bg-gray-50 rounded-md text-xs text-gray-600">
              <strong>As a {invitation.role}:</strong>
              {' '}
              {invitation.role === 'writer'
                ? 'You can view sessions, add new sessions, and search linked databases.'
                : 'You can view sessions and search linked databases (read-only).'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
