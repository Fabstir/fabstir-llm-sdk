'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { useVectorDatabases } from '@/hooks/use-vector-databases';
import { DatabaseCard } from '@/components/vector-databases/database-card';
import { CreateDatabaseModal } from '@/components/vector-databases/create-database-modal';
import { AppReadyMarker } from '@/components/app-ready-marker';
import { Database, Search, Plus, ArrowUpDown } from 'lucide-react';
import type { DatabaseMetadata } from '../../../hooks/use-vector-databases';

type SortOption = 'name' | 'date' | 'size' | 'vectors';

/**
 * Vector Databases List Page
 *
 * Shows all vector databases with search, sort, and create functionality
 */
export default function VectorDatabasesPage() {
  const router = useRouter();
  const { isConnected } = useWallet();
  const { databases, isLoading, createDatabase, deleteDatabase } = useVectorDatabases();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filter and sort databases
  const filteredDatabases = useMemo(() => {
    let filtered = databases;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (db) =>
          db.databaseName?.toLowerCase().includes(query) ||
          db.description?.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.databaseName || '').localeCompare(b.databaseName || '');
        case 'date':
          return (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0); // Newest first
        case 'size':
          return (b.storageSizeBytes || 0) - (a.storageSizeBytes || 0); // Largest first
        case 'vectors':
          return (b.vectorCount || 0) - (a.vectorCount || 0); // Most vectors first
        default:
          return 0;
      }
    });

    return filtered;
  }, [databases, searchQuery, sortBy]);

  const handleCreateDatabase = async (
    name: string,
    options: { dimensions?: number; folderStructure?: boolean; description?: string }
  ) => {
    console.log('[VectorDatabasesPage] handleCreateDatabase() called with:', { name, options });
    try {
      await createDatabase(name, options);
      console.log('[VectorDatabasesPage] ✅ createDatabase() completed');
    } catch (error) {
      console.error('[VectorDatabasesPage] ❌ createDatabase() failed:', error);
      throw error; // Re-throw to propagate to modal
    }
  };

  const handleDeleteDatabase = async (name: string) => {
    await deleteDatabase(name);
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Not Connected</h2>
          <p className="text-gray-600">Please connect your wallet to manage vector databases</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Vector Databases</h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600">
            Manage your vector databases for RAG-enhanced conversations
          </p>
        </div>

        {/* Create Button */}
        <button
          onClick={() => {
            console.log('[CreateDatabaseButton] clicked - setting isCreateModalOpen to true');
            setIsCreateModalOpen(true);
            console.log('[CreateDatabaseButton] state should now be true');
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium whitespace-nowrap"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Create Database</span>
          <span className="sm:hidden">Create DB</span>
        </button>
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search databases..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-5 w-5 text-gray-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="date">Most Recent</option>
            <option value="name">Name</option>
            <option value="size">Largest</option>
            <option value="vectors">Most Vectors</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Databases</p>
          <p className="text-2xl font-bold text-gray-900">{databases.length}</p>
        </div>
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Vectors</p>
          <p className="text-2xl font-bold text-gray-900">
            {databases.reduce((sum, db) => sum + db.vectorCount, 0).toLocaleString()}
          </p>
        </div>
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total Storage</p>
          <p className="text-2xl font-bold text-gray-900">
            {(() => {
              const totalBytes = databases.reduce((sum, db) => sum + db.storageSizeBytes, 0);
              if (totalBytes === 0) return '0 B';
              const k = 1024;
              const sizes = ['B', 'KB', 'MB', 'GB'];
              const i = Math.floor(Math.log(totalBytes) / Math.log(k));
              return `${(totalBytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
            })()}
          </p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredDatabases.length === 0 && !searchQuery && (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
          <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Vector Databases Yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first vector database to start storing document embeddings
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
          >
            <Plus className="h-5 w-5" />
            Create Database
          </button>
        </div>
      )}

      {/* No Search Results */}
      {!isLoading && filteredDatabases.length === 0 && searchQuery && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No databases found</h3>
          <p className="text-gray-600">
            No databases match "{searchQuery}". Try a different search term.
          </p>
        </div>
      )}

      {/* Database Grid */}
      {!isLoading && filteredDatabases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDatabases.map((database) => (
            <DatabaseCard
              key={database.name}
              database={database}
              onDelete={handleDeleteDatabase}
            />
          ))}
        </div>
      )}

      {/* Create Database Modal */}
      <CreateDatabaseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateDatabase}
      />

      {/* App Ready Marker for E2E tests */}
      <AppReadyMarker />
    </div>
  );
}
