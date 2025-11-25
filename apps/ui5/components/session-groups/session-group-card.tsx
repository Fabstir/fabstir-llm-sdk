'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SessionGroup } from '@fabstir/sdk-core';
import { GroupSettingsModal } from './group-settings-modal';
import { ShareModal } from './share-modal';

interface SessionGroupCardProps {
  group: SessionGroup;
  isShared?: boolean;
  onDelete?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
  onUpdate?: (groupId: string, updates: Partial<SessionGroup>) => Promise<void>;
  onShare?: (groupId: string, userAddress: string, role: 'reader' | 'writer') => Promise<void>;
  onUnshare?: (groupId: string, userAddress: string) => Promise<void>;
  availableDatabases?: Array<{ id: string; name: string }>;
}

/**
 * Session Group Card Component
 *
 * Displays a session group in card format with:
 * - Group name and metadata
 * - Linked databases
 * - Chat session count
 * - Last message preview
 * - Action buttons
 */
export function SessionGroupCard({
  group,
  isShared = false,
  onDelete,
  onLeave,
  onUpdate,
  onShare,
  onUnshare,
  availableDatabases = []
}: SessionGroupCardProps) {
  const router = useRouter();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Safely format date - handle invalid dates from mock SDK
  const lastUpdate = group.updatedAt && !isNaN(new Date(group.updatedAt).getTime())
    ? formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true })
    : 'recently';

  const lastSession = group.chatSessions?.[0]; // Most recent session (safe access)

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete && confirm(`Delete "${group.name}"? This will delete all chat sessions in this group.`)) {
      onDelete(group.id);
    }
  };

  const handleSave = async (updates: Partial<SessionGroup>) => {
    if (onUpdate) {
      await onUpdate(group.id, updates);
    }
  };

  const handleDeleteFromModal = async (groupId: string) => {
    if (onDelete) {
      await onDelete(groupId);
    }
  };

  const handleShare = async (userAddress: string, role: 'reader' | 'writer') => {
    if (onShare) {
      await onShare(group.id, userAddress, role);
    }
  };

  const handleUnshare = async (userAddress: string) => {
    if (onUnshare) {
      await onUnshare(group.id, userAddress);
    }
  };

  return (
    <Link
      href={`/session-groups/${group.id}`}
      className="block border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow bg-white"
    >
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {group.name}
        </h3>
        {isShared && (
          <p className="text-sm text-gray-500">
            Shared by {group.owner.substring(0, 8)}...{group.owner.substring(group.owner.length - 6)}
          </p>
        )}
        <p className="text-sm text-gray-500">Updated {lastUpdate}</p>
      </div>

      {/* Description */}
      {group.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{group.description}</p>
      )}

      {/* Stats */}
      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-600">
          💬 {group.chatSessions?.length || 0} chat {(group.chatSessions?.length || 0) === 1 ? 'session' : 'sessions'}
        </p>

        {(() => {
          const sharedUserCount = ((group as any).permissions?.readers?.length || 0) + ((group as any).permissions?.writers?.length || 0);
          if (sharedUserCount > 0) {
            return (
              <p className="text-sm text-gray-600">
                👥 Shared with {sharedUserCount} {sharedUserCount === 1 ? 'user' : 'users'}
              </p>
            );
          }
          return null;
        })()}

        {group.linkedDatabases && group.linkedDatabases.length > 0 ? (
          <div>
            <p className="text-sm text-gray-600 mb-1">
              📚 {group.linkedDatabases.length} database{group.linkedDatabases.length > 1 ? 's' : ''} linked:
            </p>
            <ul className="ml-4 space-y-0.5">
              {group.linkedDatabases.slice(0, 3).map((db) => (
                <li key={db} className="text-sm text-gray-500">
                  • {db}
                </li>
              ))}
              {group.linkedDatabases.length > 3 && (
                <li className="text-sm text-gray-400">
                  • +{group.linkedDatabases.length - 3} more
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">📚 No databases linked</p>
        )}

        {lastSession && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Last message:</p>
            <p className="text-sm text-gray-700 line-clamp-2">
              &quot;{(lastSession as any).lastMessage || (lastSession as any).title || lastSession}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-gray-100">
        <button
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/session-groups/${group.id}`;
          }}
        >
          Open
        </button>
        <button
          className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowSettingsModal(true);
          }}
        >
          Settings
        </button>
        {!isShared && (
          <>
            <button
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowShareModal(true);
              }}
            >
              Share
            </button>
            <button
              className="ml-auto px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              onClick={handleDelete}
            >
              Delete
            </button>
          </>
        )}
        {isShared && (
          <button
            className="ml-auto px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onLeave) {
                if (confirm(`Leave "${group.name}"? You will no longer have access to this group.`)) {
                  onLeave(group.id);
                }
              }
            }}
          >
            Leave Group
          </button>
        )}
      </div>

      {/* Settings Modal */}
      <GroupSettingsModal
        group={group}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={handleSave}
        onDelete={handleDeleteFromModal}
        availableDatabases={availableDatabases}
      />

      {/* Share Modal */}
      <ShareModal
        group={group}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onShare={handleShare}
        onUnshare={handleUnshare}
      />
    </Link>
  );
}
