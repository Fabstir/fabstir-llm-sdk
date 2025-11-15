'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Database, Trash2, Eye, Folder, HardDrive } from 'lucide-react';
import type { DatabaseMetadata } from '@fabstir/sdk-core';

interface DatabaseCardProps {
  database: DatabaseMetadata;
  onDelete: (name: string) => void;
}

/**
 * Database Card Component
 * Displays a single vector database with stats and actions
 */
export function DatabaseCard({ database, onDelete }: DatabaseCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirm(`Delete database "${database.name}"? This will remove all ${database.vectorCount} vectors. This action cannot be undone.`)) {
      onDelete(database.name);
    }
  };

  // Format storage size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <Link
      href={`/vector-databases/${encodeURIComponent(database.name)}`}
      className="block bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all p-6 group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
            <Database className="h-6 w-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {database.name}
            </h3>
            {database.description && (
              <p className="text-sm text-gray-600 truncate mt-0.5">{database.description}</p>
            )}
          </div>
        </div>

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0"
          title="Delete database"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Vector Count */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded">
            <Folder className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Vectors</p>
            <p className="text-sm font-semibold text-gray-900">{database.vectorCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Storage Size */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-50 rounded">
            <HardDrive className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Storage</p>
            <p className="text-sm font-semibold text-gray-900">{formatSize(database.storageSizeBytes)}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          Updated {database.lastAccessed && database.lastAccessed > 0
            ? formatDistanceToNow(database.lastAccessed, { addSuffix: true })
            : 'just now'}
        </div>

        {/* View Button */}
        <div className="flex items-center gap-1.5 text-blue-600 text-sm font-medium group-hover:gap-2 transition-all">
          <span>View</span>
          <Eye className="h-4 w-4" />
        </div>
      </div>

      {/* Dimensions Badge */}
      <div className="absolute top-4 right-4 px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">
        {database.dimensions}D
      </div>
    </Link>
  );
}
