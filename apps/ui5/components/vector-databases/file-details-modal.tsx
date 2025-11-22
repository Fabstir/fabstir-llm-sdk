'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Folder, Calendar, HardDrive, Hash } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { FileItem } from './file-browser';

interface FileDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
}

/**
 * FileDetailsModal - Display full file metadata
 *
 * Shows:
 * - File name and size
 * - Upload date
 * - Folder location
 * - Vector count
 * - File ID
 */
export function FileDetailsModal({ isOpen, onClose, file }: FileDetailsModalProps) {
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

  if (!mounted || !isOpen || !file) return null;

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
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
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full"
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
            <FileText className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">File Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* File Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">File Name</label>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
              <FileText className="h-5 w-5 text-gray-400" />
              <span className="text-gray-900 font-medium">{file.name}</span>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Size</label>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                <HardDrive className="h-5 w-5 text-gray-400" />
                <span className="text-gray-900">{formatSize(file.size)}</span>
              </div>
            </div>

            {/* Uploaded */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Uploaded</label>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                <Calendar className="h-5 w-5 text-gray-400" />
                <span className="text-gray-900">
                  {formatDistanceToNow(new Date(file.uploaded), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Folder Path */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                <Folder className="h-5 w-5 text-gray-400" />
                <span className="text-gray-900 font-mono text-sm">
                  {file.folderPath || '/'}
                </span>
              </div>
            </div>

            {/* Vector Count */}
            {file.vectorCount !== undefined && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vectors</label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                  <Hash className="h-5 w-5 text-gray-400" />
                  <span className="text-gray-900">{file.vectorCount}</span>
                </div>
              </div>
            )}

            {/* File ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">File ID</label>
              <div className="p-3 bg-gray-50 rounded-md">
                <code className="text-xs text-gray-600 break-all">{file.id}</code>
              </div>
            </div>
          </div>

          {/* Upload Date (Full) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload Date (Full)</label>
            <div className="p-3 bg-gray-50 rounded-md">
              <span className="text-gray-900">
                {new Date(file.uploaded).toLocaleString('en-US', {
                  dateStyle: 'full',
                  timeStyle: 'long',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  // Only render portal in browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
