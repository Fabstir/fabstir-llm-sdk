'use client';

import { useState, useMemo } from 'react';
import { Search, FileText, Trash2, Info, ChevronLeft, ChevronRight, Loader2, CheckCircle, XCircle, AlertTriangle, RotateCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface FileItem {
  id: string;
  name: string;
  size: number;
  uploaded: number;
  folderPath: string;
  vectorCount?: number;
  // Sub-phase 6.1: Embedding status fields
  embeddingStatus?: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingProgress?: number; // 0-100
  embeddingError?: string;
}

interface FileBrowserProps {
  files: FileItem[];
  currentPath: string;
  onFileClick?: (file: FileItem) => void;
  onFileDelete?: (fileId: string) => void;
  onFileRetry?: (file: FileItem) => void; // Sub-phase 6.3: Retry failed embeddings
}

type SortField = 'name' | 'size' | 'uploaded';
type SortDirection = 'asc' | 'desc';

/**
 * FileBrowser - File list with search, sort, and pagination
 *
 * Features:
 * - Search files by name
 * - Sort by name, size, or date
 * - Pagination (20 items per page)
 * - File actions (view details, delete)
 */
export function FileBrowser({ files, currentPath, onFileClick, onFileDelete, onFileRetry }: FileBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('uploaded');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filter files by current path and search query
  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const matchesPath = file.folderPath === currentPath;
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesPath && matchesSearch;
    });
  }, [files, currentPath, searchQuery]);

  // Sort files
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'uploaded':
          comparison = a.uploaded - b.uploaded;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredFiles, sortField, sortDirection]);

  // Paginate files
  const totalPages = Math.ceil(sortedFiles.length / itemsPerPage);
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedFiles.slice(startIndex, endIndex);
  }, [sortedFiles, currentPage]);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  // Sub-phase 6.1: Render status badge for document embedding status
  const renderStatusBadge = (file: FileItem) => {
    if (!file.embeddingStatus || file.embeddingStatus === 'ready') {
      // Ready documents show vector count badge
      if (file.vectorCount && file.vectorCount > 0) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3" />
            {file.vectorCount} vectors
          </span>
        );
      }
      return null;
    }

    switch (file.embeddingStatus) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <AlertTriangle className="h-3 w-3" />
            Pending Embeddings
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing... {file.embeddingProgress ? `${file.embeddingProgress}%` : ''}
          </span>
        );
      case 'failed':
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 cursor-help"
            title={file.embeddingError || 'Embedding generation failed'}
          >
            <XCircle className="h-3 w-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Search (Sub-phase 7.1) */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Type to filter by filename..."
              title="Text-based filtering. Semantic search available after embeddings complete."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="text-sm text-gray-600">
            {searchQuery ? (
              <>Showing {filteredFiles.length} of {files.filter(f => f.folderPath === currentPath).length} file{filteredFiles.length !== 1 ? 's' : ''}</>
            ) : (
              <>{filteredFiles.length} file{filteredFiles.length !== 1 ? 's' : ''}</>
            )}
          </div>
        </div>
      </div>

      {/* File Table */}
      <div className="flex-1 overflow-auto">
        {paginatedFiles.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Name {getSortIcon('name')}
                </th>
                <th
                  onClick={() => handleSort('size')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Size {getSortIcon('size')}
                </th>
                <th
                  onClick={() => handleSort('uploaded')}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Uploaded {getSortIcon('uploaded')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedFiles.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-sm text-gray-900">{file.name}</span>
                        {renderStatusBadge(file)}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatSize(file.size)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatDistanceToNow(new Date(file.uploaded), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {/* Sub-phase 6.3: Retry button for failed documents */}
                      {file.embeddingStatus === 'failed' && onFileRetry && (
                        <button
                          onClick={() => onFileRetry(file)}
                          className="p-1 rounded hover:bg-yellow-50 transition-colors"
                          title={`Retry embedding generation${file.embeddingError ? ': ' + file.embeddingError : ''}`}
                        >
                          <RotateCw className="h-4 w-4 text-yellow-600" />
                        </button>
                      )}
                      {onFileClick && (
                        <button
                          onClick={() => onFileClick(file)}
                          className="p-1 rounded hover:bg-gray-200 transition-colors"
                          title="View details"
                        >
                          <Info className="h-4 w-4 text-blue-600" />
                        </button>
                      )}
                      {onFileDelete && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete ${file.name}?`)) {
                              onFileDelete(file.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-red-50 transition-colors"
                          title="Delete file"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? 'No files found' : 'No files in this folder'}
              </h3>
              <p className="text-gray-600">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'Upload files to get started'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
