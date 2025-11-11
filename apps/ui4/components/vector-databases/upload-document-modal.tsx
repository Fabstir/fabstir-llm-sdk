'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File, CheckCircle, AlertCircle } from 'lucide-react';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  databaseName: string;
  onUpload: (files: File[], folderPath?: string) => Promise<void>;
  initialFolderPath?: string;
}

interface FileWithStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

/**
 * Upload Document Modal
 * Upload documents to a vector database
 */
export function UploadDocumentModal({ isOpen, onClose, databaseName, onUpload, initialFolderPath = '/' }: UploadDocumentModalProps) {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [folderPath, setFolderPath] = useState(initialFolderPath);
  const [isUploading, setIsUploading] = useState(false);
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

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setFolderPath(initialFolderPath);
    }
  }, [isOpen, initialFolderPath]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen && !isUploading) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isUploading, onClose]);

  if (!mounted || !isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const fileItems: FileWithStatus[] = selectedFiles.map(file => ({
      file,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...fileItems]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      // Mark all as uploading
      setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as const })));

      // Call upload handler
      await onUpload(files.map(f => f.file), folderPath);

      // Mark all as success
      setFiles(prev => prev.map(f => ({ ...f, status: 'success' as const })));

      // Close after a brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      // Mark all as error
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setFiles(prev => prev.map(f => ({ ...f, status: 'error' as const, error: errorMessage })));
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
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
      onClick={!isUploading ? onClose : undefined}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          position: 'relative',
          zIndex: 10000,
          backgroundColor: 'white'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center gap-3">
            <Upload className="h-6 w-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Upload Documents</h2>
              <p className="text-sm text-gray-600 mt-0.5">to {databaseName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            disabled={isUploading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {/* Folder Path */}
            <div>
              <label htmlFor="folderPath" className="block text-sm font-medium text-gray-700 mb-2">
                Folder Path
              </label>
              <input
                id="folderPath"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/documents"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isUploading}
              />
              <p className="text-xs text-gray-500 mt-1">Where to store these documents in the database</p>
            </div>

            {/* File Upload Area */}
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">
                Select Files
              </p>
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={isUploading}
                accept=".txt,.md,.pdf,.doc,.docx"
              />
              <label
                htmlFor="file-upload"
                className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
                style={{ pointerEvents: isUploading ? 'none' : 'auto' }}
              >
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop files here, or click to browse
                </p>
                <span className="inline-block px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm">
                  Choose Files
                </span>
                <p className="text-xs text-gray-500 mt-2">
                  Supported: TXT, MD, PDF, DOC, DOCX
                </p>
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Files ({files.length})
                </label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {files.map((fileItem, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border border-gray-200"
                    >
                      <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {fileItem.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(fileItem.file.size)}
                        </p>
                      </div>
                      {fileItem.status === 'pending' && !isUploading && (
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      {fileItem.status === 'uploading' && (
                        <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full" />
                      )}
                      {fileItem.status === 'success' && (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                      {fileItem.status === 'error' && (
                        <AlertCircle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900">
              <p className="font-medium mb-1">About Document Upload</p>
              <p className="text-xs text-blue-700">
                Documents will be processed and converted into vector embeddings that can be searched semantically during conversations.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                Upload {files.length} {files.length === 1 ? 'File' : 'Files'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Only render portal in browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
