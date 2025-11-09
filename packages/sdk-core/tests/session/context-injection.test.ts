/**
 * Context Injection Tests
 * Tests for context retrieval and formatting from vector databases
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextBuilder } from '../../src/session/context-builder.js';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { SearchResult } from '../../src/rag/types.js';
import type { ContextRetrievalOptions } from '../../src/session/rag-config.js';

describe('Context Injection', () => {
  let mockEmbeddingService: EmbeddingService;
  let mockVectorRAGManager: VectorRAGManager;
  let contextBuilder: ContextBuilder;

  const mockEmbedding = Array(384).fill(0).map(() => Math.random());
  const vectorDbSessionId = 'session-123';

  beforeEach(() => {
    // Mock EmbeddingService
    mockEmbeddingService = {
      embedText: vi.fn().mockResolvedValue({
        embedding: mockEmbedding,
        text: 'test prompt',
        tokenCount: 10
      })
    } as any;

    // Mock VectorRAGManager
    mockVectorRAGManager = {
      searchVectors: vi.fn().mockResolvedValue([])
    } as any;

    contextBuilder = new ContextBuilder(
      mockEmbeddingService,
      mockVectorRAGManager,
      vectorDbSessionId
    );
  });

  describe('Context Retrieval', () => {
    it('should embed prompt and search vectors', async () => {
      const options: ContextRetrievalOptions = {
        prompt: 'What are the key features?',
        topK: 5,
        threshold: 0.7
      };

      await contextBuilder.retrieveContext(options);

      expect(mockEmbeddingService.embedText).toHaveBeenCalledWith(options.prompt);
      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        mockEmbedding,
        5,
        { threshold: 0.7, filter: undefined }
      );
    });

    it('should return empty context when no results', async () => {
      const options: ContextRetrievalOptions = {
        prompt: 'test',
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).toBe('');
      expect(result.results).toEqual([]);
      expect(result.metrics.resultsFound).toBe(0);
    });

    it('should format context from search results', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1-chunk1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: 'This is the first relevant document.',
            documentName: 'doc1.txt'
          }
        },
        {
          id: 'doc2-chunk1',
          vector: mockEmbedding,
          score: 0.85,
          metadata: {
            text: 'This is the second relevant document.',
            documentName: 'doc2.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).toContain('first relevant document');
      expect(result.context).toContain('second relevant document');
      expect(result.results).toEqual(mockResults);
      expect(result.metrics.resultsFound).toBe(2);
    });

    it('should apply context template', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: 'Important information here.',
            documentName: 'doc1.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        template: 'Based on your docs:\n{context}\n\nFrom: {sources}',
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).toContain('Based on your docs:');
      expect(result.context).toContain('Important information here');
    });

    it('should include sources when requested', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: 'Content 1',
            documentName: 'doc1.txt'
          }
        },
        {
          id: 'doc2',
          vector: mockEmbedding,
          score: 0.85,
          metadata: {
            text: 'Content 2',
            documentName: 'doc2.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        includeSources: true,
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).toContain('Sources:');
      expect(result.context).toContain('doc1.txt');
      expect(result.context).toContain('doc2.txt');
    });

    it('should exclude sources when requested', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: 'Content 1',
            documentName: 'doc1.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        includeSources: false,
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).not.toContain('Sources:');
    });

    it('should pass metadata filter to search', async () => {
      const filter = { category: 'technical', year: 2024 };
      const options: ContextRetrievalOptions = {
        prompt: 'test',
        filter,
        topK: 5
      };

      await contextBuilder.retrieveContext(options);

      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        mockEmbedding,
        5,
        { threshold: undefined, filter }
      );
    });
  });

  describe('Context Truncation', () => {
    it('should truncate long context to token limit', async () => {
      const longText = 'word '.repeat(1000); // ~1000 words ≈ 1333 tokens
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: longText,
            documentName: 'doc1.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        maxTokens: 500, // Limit to 500 tokens
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).toContain('[...truncated]');
      expect(result.metrics.contextTokens).toBeLessThanOrEqual(600); // Allow some overhead
    });

    it('should not truncate short context', async () => {
      const shortText = 'This is a short piece of text.';
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: {
            text: shortText,
            documentName: 'doc1.txt'
          }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const options: ContextRetrievalOptions = {
        prompt: 'test',
        maxTokens: 2000,
        topK: 5
      };

      const result = await contextBuilder.retrieveContext(options);

      expect(result.context).not.toContain('[...truncated]');
      expect(result.context).toContain(shortText);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track retrieval metrics', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: { text: 'Content', documentName: 'doc1.txt' }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      const result = await contextBuilder.retrieveContext({ prompt: 'test', topK: 5 });

      expect(result.metrics.retrievalTimeMs).toBeGreaterThan(0);
      expect(result.metrics.embeddingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.searchTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.formatTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.resultsFound).toBe(1);
      expect(result.metrics.averageSimilarity).toBe(0.9);
    });

    it('should update running metrics', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.8,
          metadata: { text: 'Content', documentName: 'doc1.txt' }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      await contextBuilder.retrieveContext({ prompt: 'test1', topK: 5 });
      await contextBuilder.retrieveContext({ prompt: 'test2', topK: 5 });

      const metrics = contextBuilder.getMetrics();

      expect(metrics.totalRetrievals).toBe(2);
      expect(metrics.averageSimilarity).toBe(0.8);
      expect(metrics.emptyRetrievals).toBe(0);
    });

    it('should track empty retrievals', async () => {
      (mockVectorRAGManager.searchVectors as any).mockResolvedValue([]);

      await contextBuilder.retrieveContext({ prompt: 'test', topK: 5 });

      const metrics = contextBuilder.getMetrics();

      expect(metrics.totalRetrievals).toBe(1);
      expect(metrics.emptyRetrievals).toBe(1);
    });

    it('should reset metrics', async () => {
      const mockResults: SearchResult[] = [
        {
          id: 'doc1',
          vector: mockEmbedding,
          score: 0.9,
          metadata: { text: 'Content', documentName: 'doc1.txt' }
        }
      ];

      (mockVectorRAGManager.searchVectors as any).mockResolvedValue(mockResults);

      await contextBuilder.retrieveContext({ prompt: 'test', topK: 5 });

      contextBuilder.resetMetrics();

      const metrics = contextBuilder.getMetrics();

      expect(metrics.totalRetrievals).toBe(0);
      expect(metrics.averageSimilarity).toBe(0);
      expect(metrics.totalContextTokens).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle embedding errors gracefully', async () => {
      (mockEmbeddingService.embedText as any).mockRejectedValue(new Error('Embedding failed'));

      const result = await contextBuilder.retrieveContext({ prompt: 'test', topK: 5 });

      expect(result.context).toBe('');
      expect(result.results).toEqual([]);
      expect(result.metrics.resultsFound).toBe(0);
    });

    it('should handle search errors gracefully', async () => {
      (mockVectorRAGManager.searchVectors as any).mockRejectedValue(new Error('Search failed'));

      const result = await contextBuilder.retrieveContext({ prompt: 'test', topK: 5 });

      expect(result.context).toBe('');
      expect(result.results).toEqual([]);
    });
  });
});
