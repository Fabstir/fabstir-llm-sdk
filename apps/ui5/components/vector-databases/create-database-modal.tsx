'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Database, Plus } from 'lucide-react';

interface CreateDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, options: { dimensions?: number; folderStructure?: boolean; description?: string }) => Promise<void>;
}

/**
 * Create Database Modal
 * Form to create a new vector database
 */
export function CreateDatabaseModal({ isOpen, onClose, onCreate }: CreateDatabaseModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dimensions, setDimensions] = useState(384);
  const [folderStructure, setFolderStructure] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Handle mounting for SSR
  useEffect(() => {
    console.log('[CreateDatabaseModal] Component mounted, setting mounted=true');
    setMounted(true);
  }, []);

  // Log whenever props change
  useEffect(() => {
    console.log('[CreateDatabaseModal] Render - isOpen:', isOpen, 'mounted:', mounted);
  }, [isOpen, mounted]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen && mounted) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, mounted]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setDimensions(384);
      setFolderStructure(true);
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[CreateDatabaseModal] handleSubmit() called');

    // Validation
    if (!name.trim()) {
      console.log('[CreateDatabaseModal] Validation failed: name is required');
      setError('Database name is required');
      return;
    }

    if (name.length > 50) {
      console.log('[CreateDatabaseModal] Validation failed: name too long');
      setError('Database name must be 50 characters or less');
      return;
    }

    if (!/^[a-zA-Z0-9-_ ]+$/.test(name)) {
      console.log('[CreateDatabaseModal] Validation failed: invalid characters');
      setError('Database name can only contain letters, numbers, spaces, hyphens, and underscores');
      return;
    }

    console.log('[CreateDatabaseModal] Validation passed');
    setIsCreating(true);
    setError(null);

    try {
      console.log('[CreateDatabaseModal] About to call onCreate() with:', {
        name: name.trim(),
        dimensions,
        folderStructure,
        description: description.trim() || undefined
      });
      await onCreate(name.trim(), {
        dimensions,
        folderStructure,
        description: description.trim() || undefined
      });
      console.log('[CreateDatabaseModal] ✅ onCreate() completed successfully');
      onClose();
    } catch (err) {
      console.error('[CreateDatabaseModal] ❌ onCreate() failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create database');
    } finally {
      setIsCreating(false);
      console.log('[CreateDatabaseModal] handleSubmit() finished (isCreating set to false)');
    }
  };

  const modalContent = (
    <div
      data-testid="create-vector-db-modal"
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
        className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
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
            <Database className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Create Vector Database</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            disabled={isCreating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Database Name *
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-documents"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                maxLength={50}
                disabled={isCreating}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">{name.length}/50 characters</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description of what this database contains"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                maxLength={200}
                disabled={isCreating}
              />
              <p className="text-xs text-gray-500 mt-1">{description.length}/200 characters</p>
            </div>

            {/* Dimensions */}
            <div>
              <label htmlFor="dimensions" className="block text-sm font-medium text-gray-700 mb-2">
                Vector Dimensions
              </label>
              <select
                id="dimensions"
                value={dimensions}
                onChange={(e) => setDimensions(Number(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={isCreating}
              >
                <option value={384}>384 (all-MiniLM-L6-v2)</option>
                <option value={768}>768 (OpenAI ada-002)</option>
                <option value={1536}>1536 (OpenAI text-embedding-3-small)</option>
                <option value={3072}>3072 (OpenAI text-embedding-3-large)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Must match the embedding model you'll use
              </p>
            </div>

            {/* Folder Structure Toggle */}
            <div className="flex items-start gap-3">
              <input
                id="folderStructure"
                type="checkbox"
                checked={folderStructure}
                onChange={(e) => setFolderStructure(e.target.checked)}
                className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-2 focus:ring-purple-500"
                disabled={isCreating}
              />
              <div>
                <label htmlFor="folderStructure" className="text-sm font-medium text-gray-700 cursor-pointer">
                  Enable Folder Structure
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Organize vectors into folders for better management
                </p>
              </div>
            </div>

            {/* Info Box */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900">
              <p className="font-medium mb-1">About Vector Databases</p>
              <p className="text-xs text-blue-700">
                Vector databases store document embeddings for RAG (Retrieval-Augmented Generation).
                Upload documents to convert them into searchable vectors that enhance your AI conversations.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3 bg-gray-50 -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !name.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Create Database
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Render modal directly (not using portal for now to debug)
  return modalContent;
}
