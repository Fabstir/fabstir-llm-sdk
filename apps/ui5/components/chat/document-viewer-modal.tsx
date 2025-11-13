'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface DocumentSource {
  documentName: string;
  chunkText: string;
  similarityScore: number;
  filePath?: string;
  vectorId?: string;
  fullText?: string; // Full document text (if available)
}

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: DocumentSource | null;
  allSources?: DocumentSource[];
  currentIndex?: number;
  onNavigate?: (direction: 'prev' | 'next') => void;
}

/**
 * DocumentViewerModal - Full document viewer with chunk highlighting
 *
 * Features:
 * - Full document text display
 * - Highlighted chunks that were matched
 * - Navigation between multiple sources
 */
export function DocumentViewerModal({
  isOpen,
  onClose,
  source,
  allSources = [],
  currentIndex = 0,
  onNavigate,
}: DocumentViewerModalProps) {
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

  if (!mounted || !isOpen || !source) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allSources.length - 1;

  // For now, display the chunk as the "full text" since we don't have full document storage
  const displayText = source.fullText || source.chunkText;

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
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        style={{
          position: 'relative',
          zIndex: 10000,
          backgroundColor: 'white'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{source.documentName}</h2>
            <p className="text-sm text-gray-500 mt-1">
              Similarity: {(source.similarityScore * 100).toFixed(0)}%
              {source.filePath && ` • ${source.filePath}`}
            </p>
          </div>

          {/* Navigation */}
          {allSources.length > 1 && onNavigate && (
            <div className="flex items-center gap-2 mr-4">
              <button
                onClick={() => onNavigate('prev')}
                disabled={!hasPrev}
                className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-sm text-gray-600">
                {currentIndex + 1} / {allSources.length}
              </span>
              <button
                onClick={() => onNavigate('next')}
                disabled={!hasNext}
                className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-sm max-w-none">
            {/* Highlight the matched chunk */}
            <div className="bg-yellow-50 border-l-4 border-yellow-400 px-4 py-3 mb-6">
              <p className="text-sm font-medium text-yellow-900 mb-2">Matched Content</p>
              <p className="text-gray-700 whitespace-pre-wrap">{source.chunkText}</p>
            </div>

            {/* Full document text (if different from chunk) */}
            {source.fullText && source.fullText !== source.chunkText && (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-3">Full Document</p>
                <p className="text-gray-700 whitespace-pre-wrap">{source.fullText}</p>
              </div>
            )}

            {/* If no full text, just show the chunk */}
            {!source.fullText && (
              <div className="text-sm text-gray-500 italic">
                Full document text not available. Showing matched chunk only.
              </div>
            )}
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
