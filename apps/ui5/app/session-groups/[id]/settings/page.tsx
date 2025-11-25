'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useSessionGroups } from '@/hooks/use-session-groups';

/**
 * Session Group Settings Page
 *
 * Manage session group settings, permissions, and configuration
 */
export default function SessionGroupSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useWallet();
  const { selectedGroup, selectGroup, updateGroup, deleteGroup, isLoading } = useSessionGroups();

  const groupId = params?.id as string || '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load session group on mount
  useEffect(() => {
    if (isConnected && groupId) {
      selectGroup(groupId);
    }
  }, [isConnected, groupId, selectGroup]);

  // Update form when selectedGroup changes
  useEffect(() => {
    if (selectedGroup) {
      setName(selectedGroup.name);
      setDescription(selectedGroup.description || '');
    }
  }, [selectedGroup]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to access settings
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !selectedGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGroup(groupId, {
        name,
        description,
      });
      router.push(`/session-groups/${groupId}`);
    } catch (error) {
      console.error('Failed to update session group:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this session group? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    try {
      await deleteGroup(groupId);
      router.push('/session-groups');
    } catch (error) {
      console.error('Failed to delete session group:', error);
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={`/session-groups/${groupId}`}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to {selectedGroup.name}
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* General Settings */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">General Settings</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter group name"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter group description (optional)"
                />
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Chat Sessions</p>
                <p className="text-2xl font-bold text-gray-900">{selectedGroup.chatSessions?.length || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Linked Databases</p>
                <p className="text-2xl font-bold text-gray-900">{(selectedGroup as any).databases?.length || 0}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-6 flex justify-between items-center">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting...' : 'Delete Group'}
            </button>

            <div className="flex gap-2">
              <Link
                href={`/session-groups/${groupId}`}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
