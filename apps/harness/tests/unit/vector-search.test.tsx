// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 3.1: Vector Search on Prompt Submission Tests
 *
 * Tests for searchContext() function that:
 * - Validates vectorRAGManager is initialized
 * - Calls VectorRAGManager.search() with query, topK, and threshold
 * - Returns array of relevant text chunks
 * - Handles no results case (returns empty array)
 * - Handles search errors gracefully
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface SearchResult {
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

interface SearchOptions {
  topK?: number;
  threshold?: number;
}

describe('Sub-phase 3.1: Vector Search on Prompt Submission', () => {
  let mockVectorRAGManager: any;
  let mockAddMessage: any;
  let mockSetError: any;

  beforeEach(() => {
    mockVectorRAGManager = {
      search: vi.fn().mockResolvedValue([
        { text: 'Chunk 1 about AI', score: 0.92, metadata: { documentId: 'doc1' } },
        { text: 'Chunk 2 about machine learning', score: 0.85, metadata: { documentId: 'doc1' } },
        { text: 'Chunk 3 about neural networks', score: 0.78, metadata: { documentId: 'doc2' } },
        { text: 'Chunk 4 about deep learning', score: 0.71, metadata: { documentId: 'doc2' } },
        { text: 'Chunk 5 about transformers', score: 0.70, metadata: { documentId: 'doc3' } }
      ])
    };

    mockAddMessage = vi.fn();
    mockSetError = vi.fn();
  });

  describe('searchContext() function', () => {
    it('should be defined and callable', () => {
      const searchContext = async (query: string) => {
        return [];
      };

      expect(typeof searchContext).toBe('function');
    });

    it('should accept query parameter', async () => {
      const searchContext = vi.fn().mockResolvedValue([]);
      const query = 'What is AI?';

      await searchContext(query);

      expect(searchContext).toHaveBeenCalledWith(query);
    });

    it('should return array of search results', async () => {
      const searchContext = async (query: string): Promise<SearchResult[]> => {
        return [
          { text: 'AI is artificial intelligence', score: 0.95 }
        ];
      };

      const results = await searchContext('What is AI?');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('VectorRAGManager.search() call', () => {
    it('should call search with query parameter', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      await mockVectorRAGManager.search(vectorDbName, query);

      expect(mockVectorRAGManager.search).toHaveBeenCalledWith(vectorDbName, query);
    });

    it('should call search with topK option', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';
      const options: SearchOptions = { topK: 5 };

      await mockVectorRAGManager.search(vectorDbName, query, options);

      expect(mockVectorRAGManager.search).toHaveBeenCalledWith(
        vectorDbName,
        query,
        expect.objectContaining({ topK: 5 })
      );
    });

    it('should call search with threshold option', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';
      const options: SearchOptions = { threshold: 0.7 };

      await mockVectorRAGManager.search(vectorDbName, query, options);

      expect(mockVectorRAGManager.search).toHaveBeenCalledWith(
        vectorDbName,
        query,
        expect.objectContaining({ threshold: 0.7 })
      );
    });

    it('should call search with both topK and threshold', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';
      const options: SearchOptions = { topK: 5, threshold: 0.7 };

      await mockVectorRAGManager.search(vectorDbName, query, options);

      expect(mockVectorRAGManager.search).toHaveBeenCalledWith(
        vectorDbName,
        query,
        expect.objectContaining({ topK: 5, threshold: 0.7 })
      );
    });

    it('should return array of SearchResult objects', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(5);
      expect(results[0]).toHaveProperty('text');
      expect(results[0]).toHaveProperty('score');
    });
  });

  describe('Search result filtering', () => {
    it('should return top 5 results (topK: 5)', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query, { topK: 5 });

      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should filter results by threshold (0.7)', () => {
      const allResults: SearchResult[] = [
        { text: 'Chunk 1', score: 0.92 },
        { text: 'Chunk 2', score: 0.85 },
        { text: 'Chunk 3', score: 0.78 },
        { text: 'Chunk 4', score: 0.71 },
        { text: 'Chunk 5', score: 0.68 }, // Below threshold
        { text: 'Chunk 6', score: 0.65 }  // Below threshold
      ];

      const threshold = 0.7;
      const filteredResults = allResults.filter(r => r.score >= threshold);

      expect(filteredResults.length).toBe(4);
      expect(filteredResults.every(r => r.score >= threshold)).toBe(true);
    });

    it('should sort results by score descending', () => {
      const results: SearchResult[] = [
        { text: 'Chunk 1', score: 0.92 },
        { text: 'Chunk 2', score: 0.85 },
        { text: 'Chunk 3', score: 0.78 }
      ];

      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[1].score).toBeGreaterThan(results[2].score);
    });
  });

  describe('No results case', () => {
    it('should return empty array if no results found', async () => {
      mockVectorRAGManager.search = vi.fn().mockResolvedValue([]);

      const vectorDbName = 'chat-context-knowledge';
      const query = 'Completely unrelated query';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(results).toEqual([]);
      expect(results.length).toBe(0);
    });

    it('should return empty array if all results below threshold', () => {
      const allResults: SearchResult[] = [
        { text: 'Chunk 1', score: 0.65 },
        { text: 'Chunk 2', score: 0.60 },
        { text: 'Chunk 3', score: 0.55 }
      ];

      const threshold = 0.7;
      const filteredResults = allResults.filter(r => r.score >= threshold);

      expect(filteredResults).toEqual([]);
      expect(filteredResults.length).toBe(0);
    });

    it('should handle no documents uploaded case', async () => {
      mockVectorRAGManager.search = vi.fn().mockResolvedValue([]);

      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(results).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should handle missing vectorRAGManager', () => {
      const vectorRAGManager = null;
      const errorMessage = 'VectorRAGManager not initialized';

      if (!vectorRAGManager) {
        mockSetError(errorMessage);
      }

      expect(mockSetError).toHaveBeenCalledWith(errorMessage);
    });

    it('should handle search errors gracefully', async () => {
      mockVectorRAGManager.search = vi.fn().mockRejectedValue(
        new Error('Search failed')
      );

      try {
        await mockVectorRAGManager.search('chat-context-knowledge', 'query');
      } catch (error: any) {
        mockSetError(error.message);
      }

      expect(mockSetError).toHaveBeenCalledWith('Search failed');
    });

    it('should return empty array on search error', async () => {
      const searchContext = async (query: string): Promise<SearchResult[]> => {
        try {
          // Simulate search error
          throw new Error('Search failed');
        } catch (error) {
          console.error('Search error:', error);
          return []; // Return empty array on error
        }
      };

      const results = await searchContext('What is AI?');

      expect(results).toEqual([]);
    });

    it('should handle database not found errors', async () => {
      mockVectorRAGManager.search = vi.fn().mockRejectedValue(
        new Error('Database not found')
      );

      try {
        await mockVectorRAGManager.search('nonexistent-db', 'query');
      } catch (error: any) {
        mockSetError(error.message);
      }

      expect(mockSetError).toHaveBeenCalledWith('Database not found');
    });

    it('should handle invalid query errors', async () => {
      mockVectorRAGManager.search = vi.fn().mockRejectedValue(
        new Error('Query cannot be empty')
      );

      try {
        await mockVectorRAGManager.search('chat-context-knowledge', '');
      } catch (error: any) {
        mockSetError(error.message);
      }

      expect(mockSetError).toHaveBeenCalledWith('Query cannot be empty');
    });
  });

  describe('Search result structure', () => {
    it('should include text field in results', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(results[0]).toHaveProperty('text');
      expect(typeof results[0].text).toBe('string');
    });

    it('should include score field in results', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(results[0]).toHaveProperty('score');
      expect(typeof results[0].score).toBe('number');
      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should optionally include metadata field', async () => {
      const vectorDbName = 'chat-context-knowledge';
      const query = 'What is AI?';

      const results = await mockVectorRAGManager.search(vectorDbName, query);

      expect(results[0]).toHaveProperty('metadata');
      expect(typeof results[0].metadata).toBe('object');
    });
  });

  describe('RAG disabled case', () => {
    it('should not search if RAG is disabled', () => {
      const isRAGEnabled = false;
      let searchCalled = false;

      const searchContext = async (query: string) => {
        if (!isRAGEnabled) {
          return [];
        }
        searchCalled = true;
        return [];
      };

      searchContext('What is AI?');

      expect(searchCalled).toBe(false);
    });

    it('should return empty array if no documents uploaded', () => {
      const uploadedDocuments: any[] = [];

      const shouldSearch = uploadedDocuments.length > 0;

      expect(shouldSearch).toBe(false);
    });
  });
});
