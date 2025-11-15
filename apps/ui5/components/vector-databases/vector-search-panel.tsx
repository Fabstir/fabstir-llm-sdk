'use client';

import { useState } from 'react';
import { Search, Loader2, FileText, AlertCircle } from 'lucide-react';

export interface SearchResult {
  id: string;
  score: number;
  metadata?: {
    fileName?: string;
    text?: string;
    chunkIndex?: number;
    [key: string]: any;
  };
}

interface VectorSearchPanelProps {
  databaseName: string;
  dimensions: number;
  onSearch: (queryVector: number[], k?: number, threshold?: number) => Promise<SearchResult[]>;
}

/**
 * Vector Search Panel Component
 *
 * Allows users to search vector databases using natural language queries
 */
export function VectorSearchPanel({ databaseName, dimensions, onSearch }: VectorSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [threshold, setThreshold] = useState(0.7);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Mock text-to-vector conversion
  const textToVector = (text: string): number[] => {
    const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const seed = hash % 10000;
    const vector: number[] = [];

    for (let i = 0; i < dimensions; i++) {
      const x = Math.sin(seed + i) * 10000;
      vector.push((x - Math.floor(x)) * 2 - 1);
    }

    return vector;
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);
      setHasSearched(true);

      const queryVector = textToVector(query);
      const searchResults = await onSearch(queryVector, topK, threshold);

      setResults(searchResults);
    } catch (err) {
      console.error('[VectorSearch] Search failed:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="bg-white rounded-lg border">
      {/* Search Input Section */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Vector Search</h2>

        <div className="space-y-4">
          {/* Query Input */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about your documents..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSearching}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Advanced Options */}
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-600 hover:text-gray-900">Advanced Options</summary>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Top K Results</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Similarity Threshold (0-1)</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.7)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Results Section */}
      <div className="p-6">
        {!hasSearched ? (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Search Your Documents</h3>
            <p className="text-gray-600">
              Enter a question or keyword to find relevant content in your vector database.
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
            <p className="text-gray-600">
              No documents matched your search query. Try adjusting your search terms or lowering the similarity threshold.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">
                Found {results.length} result{results.length !== 1 ? 's' : ''}
              </h3>
            </div>

            {results.map((result) => (
              <div
                key={result.id}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                {/* Result Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    <h4 className="text-sm font-medium text-gray-900">
                      {result.metadata?.fileName || `Document ${result.id.substring(0, 8)}`}
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Relevance:</span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                      {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Result Content */}
                {result.metadata?.text && (
                  <p className="text-sm text-gray-700 mb-2">
                    {result.metadata.text}
                  </p>
                )}

                {/* Result Metadata */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>ID: {result.id.substring(0, 12)}...</span>
                  {result.metadata?.chunkIndex !== undefined && (
                    <span>Chunk: {result.metadata.chunkIndex + 1}</span>
                  )}
                  {result.metadata?.folderPath && result.metadata.folderPath !== '/' && (
                    <span>Folder: {result.metadata.folderPath}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
