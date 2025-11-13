'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { useVectorDatabases } from '@/hooks/use-vector-databases';
import { useSDK } from '@/hooks/use-sdk';

/**
 * Session Group Databases Management Page
 *
 * Allows users to link/unlink vector databases to session groups
 */
export default function SessionGroupDatabasesPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useWallet();
  const { selectedGroup, selectGroup, linkDatabase, unlinkDatabase, isLoading } = useSessionGroups();
  const { databases: availableDatabases, isLoading: loadingDatabases } = useVectorDatabases();
  const { managers } = useSDK();

  const groupId = params.id as string;

  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Load session group
  useEffect(() => {
    if (isConnected && groupId) {
      selectGroup(groupId);
    }
  }, [isConnected, groupId, selectGroup]);

  const handleLinkDatabase = async (databaseId: string) => {
    try {
      setActionInProgress(true);
      setError(null);
      await linkDatabase(groupId, databaseId);
    } catch (err) {
      console.error('Failed to link database:', err);
      setError(err instanceof Error ? err.message : 'Failed to link database');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleUnlinkDatabase = async (databaseId: string) => {
    try {
      setActionInProgress(true);
      setError(null);
      await unlinkDatabase(groupId, databaseId);
    } catch (err) {
      console.error('Failed to unlink database:', err);
      setError(err instanceof Error ? err.message : 'Failed to unlink database');
    } finally {
      setActionInProgress(false);
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
            Please connect your wallet to manage databases
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

  if (isLoading || loadingDatabases) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading databases...</p>
        </div>
      </div>
    );
  }

  if (!selectedGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Session Group Not Found
          </h2>
          <Link
            href="/session-groups"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Back to Session Groups
          </Link>
        </div>
      </div>
    );
  }

  // Session groups store database names, not IDs
  const linkedDatabaseNames = new Set(selectedGroup.databases || []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={`/session-groups/${groupId}`}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Session Group
            </Link>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Manage Databases
            </h1>
            <p className="text-gray-600">
              Link vector databases to <strong>{selectedGroup.name}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Linked Databases */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Linked Databases ({linkedDatabaseNames.size})
            </h3>

            {linkedDatabaseNames.size > 0 ? (
              <div className="space-y-3">
                {availableDatabases
                  .filter(db => linkedDatabaseNames.has(db.name))
                  .sort((a, b) => b.lastAccessed - a.lastAccessed)
                  .map(db => (
                    <div
                      key={db.name}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">{db.name}</h4>
                          <p className="text-sm text-gray-500">
                            {db.vectorCount} vectors
                          </p>
                        </div>
                        <button
                          onClick={() => handleUnlinkDatabase(db.name)}
                          disabled={actionInProgress}
                          className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Unlink
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        Linked database will enhance AI responses with relevant context
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-2">No databases linked yet</p>
                <p className="text-sm text-gray-500">
                  Link databases from the available list to enhance AI responses
                </p>
              </div>
            )}
          </div>

          {/* Available Databases */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Available Databases
              </h3>
              <Link
                href={`/vector-databases?returnTo=${encodeURIComponent(`/session-groups/${groupId}/databases`)}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Create New
              </Link>
            </div>

            {availableDatabases.filter(db => !linkedDatabaseNames.has(db.name)).length > 0 ? (
              <div className="space-y-3">
                {availableDatabases
                  .filter(db => !linkedDatabaseNames.has(db.name))
                  .sort((a, b) => b.lastAccessed - a.lastAccessed)
                  .map(db => (
                    <div
                      key={db.name}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">{db.name}</h4>
                          <p className="text-sm text-gray-500">
                            {db.vectorCount} vectors
                          </p>
                        </div>
                        <button
                          onClick={() => handleLinkDatabase(db.name)}
                          disabled={actionInProgress}
                          className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Link
                        </button>
                      </div>
                      <p className="text-xs text-gray-400">
                        Created {new Date(db.created).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-2">All databases are linked</p>
                <p className="text-sm text-gray-500">
                  Create a new database to link more
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="font-medium text-blue-900 mb-2">
            💡 How Database Linking Works
          </h4>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              • Linked databases provide context to AI responses via RAG (Retrieval-Augmented Generation)
            </li>
            <li>
              • When you ask questions, relevant documents are automatically retrieved
            </li>
            <li>
              • Multiple databases can be linked to a single session group
            </li>
            <li>
              • You can link/unlink databases at any time without affecting chat history
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
