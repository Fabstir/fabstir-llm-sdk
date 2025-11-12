'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { useSDK } from '@/hooks/use-sdk';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { useVectorDatabases } from '@/hooks/use-vector-databases';
import { SessionGroupCard } from '@/components/session-groups/session-group-card';
import type { SessionGroup } from '@fabstir/sdk-core-mock';

/**
 * Session Groups List Page
 *
 * Displays all session groups (owned and shared) with search, sort, and filter
 */
export default function SessionGroupsPage() {
  const router = useRouter();
  const { isConnected, address } = useWallet();
  const { managers, isInitialized, isInitializing } = useSDK();
  const { sessionGroups, isLoading, error, deleteGroup, updateGroup, shareGroup, unshareGroup, refresh } = useSessionGroups();
  const { databases } = useVectorDatabases();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'sessions'>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter groups by search query
  const filteredGroups = sessionGroups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort groups
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        // Handle cases where updatedAt might be undefined or not a Date object
        const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
        const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
        return bTime - aTime;
      case 'name':
        return a.name.localeCompare(b.name);
      case 'sessions':
        return b.chatSessions.length - a.chatSessions.length;
      default:
        return 0;
    }
  });

  // Separate owned and shared groups
  // Groups are "owned" if the current user is the owner
  // Groups are "shared" if the current user is NOT the owner (but has access)
  const ownedGroups = sortedGroups.filter((g) =>
    address && g.owner.toLowerCase() === address.toLowerCase()
  );
  const sharedGroups = sortedGroups.filter((g) =>
    address && g.owner.toLowerCase() !== address.toLowerCase()
  );

  const handleDelete = async (groupId: string) => {
    try {
      await deleteGroup(groupId);
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleLeave = async (groupId: string) => {
    try {
      // For shared groups, leaving is the same as removing from user's view
      await deleteGroup(groupId);
    } catch (err) {
      console.error('Failed to leave group:', err);
    }
  };

  const handleUpdate = async (groupId: string, updates: Partial<SessionGroup>) => {
    try {
      await updateGroup(groupId, updates);
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };

  const handleShare = async (groupId: string, userAddress: string, role: 'reader' | 'writer') => {
    try {
      await shareGroup(groupId, userAddress, role);
    } catch (err) {
      console.error('Failed to share group:', err);
    }
  };

  const handleUnshare = async (groupId: string, userAddress: string) => {
    try {
      await unshareGroup(groupId, userAddress);
    } catch (err) {
      console.error('Failed to unshare group:', err);
    }
  };

  // Convert databases to format expected by SessionGroupCard
  const availableDatabases = databases.map(db => ({ id: db.name, name: db.name }));

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to access session groups
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              🗂️ Session Groups
            </h1>
            <Link
              href="/session-groups/new"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-center whitespace-nowrap"
            >
              + New Group
            </Link>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Search session groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white px-4 py-3 rounded-lg border border-gray-200">
          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="flex-1 sm:flex-none px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="recent">Most Recent</option>
              <option value="name">Name</option>
              <option value="sessions">Session Count</option>
            </select>
          </div>

          {/* View Mode */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 whitespace-nowrap">View:</span>
            <div className="flex gap-1 border border-gray-300 rounded-md p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {(isInitializing || isLoading) ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">
              {isInitializing ? 'Initializing SDK...' : 'Loading session groups...'}
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchQuery ? 'No matching session groups' : 'No session groups yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery
                ? 'Try a different search query'
                : 'Create your first session group to organize your conversations'}
            </p>
            {!searchQuery && (
              <Link
                href="/session-groups/new"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                + Create Session Group
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Owned Groups */}
            {ownedGroups.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  My Session Groups ({ownedGroups.length})
                </h2>
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                      : 'space-y-4'
                  }
                >
                  {ownedGroups.map((group) => (
                    <SessionGroupCard
                      key={group.id}
                      group={group}
                      isShared={false}
                      onDelete={handleDelete}
                      onUpdate={handleUpdate}
                      onShare={handleShare}
                      onUnshare={handleUnshare}
                      availableDatabases={availableDatabases}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Shared Groups */}
            {sharedGroups.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Shared With Me ({sharedGroups.length})
                </h2>
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                      : 'space-y-4'
                  }
                >
                  {sharedGroups.map((group) => (
                    <SessionGroupCard
                      key={group.id}
                      group={group}
                      isShared={true}
                      onDelete={handleDelete}
                      onLeave={handleLeave}
                      onUpdate={handleUpdate}
                      onShare={handleShare}
                      onUnshare={handleUnshare}
                      availableDatabases={availableDatabases}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
