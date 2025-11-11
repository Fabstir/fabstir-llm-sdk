'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MessageSquare, Database, Clock, ArrowRight } from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'group' | 'session' | 'database';
  title: string;
  subtitle?: string;
  url: string;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Global Search Modal
 *
 * Search across session groups, chat sessions, and vector databases
 * Triggered by Cmd/Ctrl+K
 */
export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search across all data
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchQuery = query.toLowerCase();
    const allResults: SearchResult[] = [];

    // Search session groups
    const groupsData = localStorage.getItem('mock_session_groups');
    if (groupsData) {
      try {
        const groups = JSON.parse(groupsData);
        groups.forEach((group: any) => {
          if (group.name.toLowerCase().includes(searchQuery)) {
            allResults.push({
              id: group.id,
              type: 'group',
              title: group.name,
              subtitle: group.description || `${group.chatSessions?.length || 0} sessions`,
              url: `/session-groups/${group.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Failed to search groups:', err);
      }
    }

    // Search vector databases
    const dbsData = localStorage.getItem('mock_vector_databases');
    if (dbsData) {
      try {
        const databases = JSON.parse(dbsData);
        databases.forEach((db: any) => {
          if (db.name.toLowerCase().includes(searchQuery)) {
            allResults.push({
              id: db.id,
              type: 'database',
              title: db.name,
              subtitle: db.description || `${db.documentCount || 0} documents`,
              url: `/vector-databases/${db.id}`,
            });
          }
        });
      } catch (err) {
        console.error('Failed to search databases:', err);
      }
    }

    setResults(allResults.slice(0, 10)); // Limit to 10 results
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    router.push(result.url);
    onClose();
    setQuery('');
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'group':
        return <MessageSquare className="h-5 w-5 text-blue-600" />;
      case 'session':
        return <Clock className="h-5 w-5 text-purple-600" />;
      case 'database':
        return <Database className="h-5 w-5 text-green-600" />;
    }
  };

  const getTypeLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'group':
        return 'Session Group';
      case 'session':
        return 'Chat Session';
      case 'database':
        return 'Vector Database';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-50 p-4 pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search session groups, databases..."
            className="flex-1 outline-none text-gray-900 placeholder-gray-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
          <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto">
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                    index === selectedIndex
                      ? 'bg-blue-50 border-l-2 border-blue-600'
                      : 'hover:bg-gray-50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex-shrink-0">{getIcon(result.type)}</div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {result.title}
                      </span>
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {getTypeLabel(result.type)}
                      </span>
                    </div>
                    {result.subtitle && (
                      <p className="text-xs text-gray-600 truncate mt-0.5">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                  {index === selectedIndex && (
                    <ArrowRight className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : query ? (
            <div className="py-12 text-center text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No results found for "{query}"</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Search session groups and databases</p>
              <p className="text-xs mt-1">Type to start searching</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded ml-1">↓</kbd>
              {' '}to navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Enter</kbd>
              {' '}to select
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">ESC</kbd>
            {' '}to close
          </span>
        </div>
      </div>
    </div>
  );
}
