'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FolderPlus, Edit2, Trash2 } from 'lucide-react';
import { FolderNode } from './folder-tree';

interface FolderActionsProps {
  isOpen: boolean;
  onClose: () => void;
  action: 'create' | 'rename' | 'delete';
  folder?: FolderNode | null;
  parentPath?: string;
  onConfirm: (folderName: string, parentPath?: string) => void;
}

/**
 * FolderActions - Modal for folder CRUD operations
 *
 * Handles:
 * - Create new folder
 * - Rename existing folder
 * - Delete folder (with confirmation)
 */
export function FolderActions({
  isOpen,
  onClose,
  action,
  folder,
  parentPath,
  onConfirm,
}: FolderActionsProps) {
  const [folderName, setFolderName] = useState(folder?.name || '');
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Handle mounting for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen && mounted) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, mounted]);

  if (!mounted || !isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (action === 'delete') {
      onConfirm('', folder?.path);
      onClose();
      return;
    }

    // Validate folder name
    if (!folderName.trim()) {
      setError('Folder name is required');
      return;
    }

    if (!/^[a-zA-Z0-9-_\s]+$/.test(folderName)) {
      setError('Folder name can only contain letters, numbers, spaces, dashes, and underscores');
      return;
    }

    // Create or rename
    if (action === 'create') {
      onConfirm(folderName.trim(), parentPath || folder?.path || '/');
    } else if (action === 'rename') {
      onConfirm(folderName.trim(), folder?.path);
    }

    setFolderName('');
    setError('');
    onClose();
  };

  const getTitle = () => {
    switch (action) {
      case 'create':
        return 'Create New Folder';
      case 'rename':
        return 'Rename Folder';
      case 'delete':
        return 'Delete Folder';
    }
  };

  const getIcon = () => {
    switch (action) {
      case 'create':
        return <FolderPlus className="h-6 w-6 text-blue-600" />;
      case 'rename':
        return <Edit2 className="h-6 w-6 text-blue-600" />;
      case 'delete':
        return <Trash2 className="h-6 w-6 text-red-600" />;
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        style={{
          position: 'relative',
          zIndex: 10000,
          backgroundColor: 'white'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            {getIcon()}
            <h2 className="text-xl font-semibold text-gray-900">{getTitle()}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4">
            {action === 'delete' ? (
              <div>
                <p className="text-gray-700 mb-2">
                  Are you sure you want to delete <span className="font-semibold">{folder?.name}</span>?
                </p>
                <p className="text-sm text-gray-600">
                  This will delete the folder and all files inside it. This action cannot be undone.
                </p>
                {folder && folder.fileCount > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      ⚠️ This folder contains {folder.fileCount} file(s) that will also be deleted.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Folder Name
                </label>
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => {
                    setFolderName(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter folder name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-sm text-red-600">{error}</p>
                )}
                {action === 'create' && (
                  <p className="mt-2 text-sm text-gray-500">
                    Location: {parentPath || folder?.path || '/'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors ${
                action === 'delete'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {action === 'delete' ? 'Delete' : action === 'create' ? 'Create' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Only render portal in browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
