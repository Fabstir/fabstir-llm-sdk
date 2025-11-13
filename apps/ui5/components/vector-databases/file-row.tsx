'use client';

import { formatDistanceToNow } from 'date-fns';
import { FileText, Trash2, Eye, Folder } from 'lucide-react';
import type { Vector } from '@fabstir/sdk-core-mock';

interface FileRowProps {
  vector: Vector;
  onView: (vector: Vector) => void;
  onDelete: (vectorId: string) => void;
}

/**
 * File Row Component
 * Displays a single vector/document in a table row
 */
export function FileRow({ vector, onView, onDelete }: FileRowProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirm(`Delete "${vector.metadata?.fileName || vector.id}"? This action cannot be undone.`)) {
      onDelete(vector.id);
    }
  };

  const handleView = () => {
    onView(vector);
  };

  // Format file size
  const formatSize = (dimensions: number): string => {
    const bytes = dimensions * 4; // 4 bytes per float
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <tr
      className="border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={handleView}
    >
      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {vector.metadata?.fileName || vector.id}
            </p>
            {vector.metadata?.chunkIndex !== undefined && (
              <p className="text-xs text-gray-500">Chunk {vector.metadata.chunkIndex + 1}</p>
            )}
          </div>
        </div>
      </td>

      {/* Folder */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          {vector.metadata?.folderPath ? (
            <>
              <Folder className="h-4 w-4" />
              <span className="truncate">{vector.metadata.folderPath}</span>
            </>
          ) : (
            <span className="text-gray-400 italic">Root</span>
          )}
        </div>
      </td>

      {/* Size */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">
          {formatSize(vector.vector.length)} ({vector.vector.length}D)
        </span>
      </td>

      {/* Date */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600">
          {vector.metadata?.createdAt
            ? formatDistanceToNow(vector.metadata.createdAt, { addSuffix: true })
            : 'Unknown'}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleView();
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete vector"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
