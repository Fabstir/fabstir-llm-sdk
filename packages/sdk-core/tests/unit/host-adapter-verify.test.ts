// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * HostAdapter Verification Tests for RAG Integration
 * Sub-phase 3.3: Verify HostAdapter works without changes for RAG pipeline
 * Focus: Integration readiness, not comprehensive testing (see tests/embeddings/host.test.ts)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter.js';
import { EmbeddingProvider } from '../../src/embeddings/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('HostAdapter Verification for RAG Integration', () => {
  let hostAdapter: HostAdapter;
  const hostUrl = 'http://localhost:8080';

  beforeEach(() => {
    hostAdapter = new HostAdapter({
      hostUrl,
      chainId: 84532,
      maxRetries: 1,
      timeout: 5000
    });
    mockFetch.mockReset();
  });

  describe('embedText() produces 384-D embeddings', () => {
    it('should return 384-dimensional vector for single text', async () => {
      const text = 'Document chunk for RAG processing';
      const mockEmbedding = new Array(384).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{
            embedding: mockEmbedding,
            text,
            tokenCount: 7
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 7,
          cost: 0.0
        })
      });

      const result = await hostAdapter.embedText(text);

      // Verify embedding dimension (critical for RAG)
      expect(result.embedding).toHaveLength(384);
      expect(result.embedding).toEqual(mockEmbedding);
    });

    it('should include metadata (text, model, cost) for tracking', async () => {
      const text = 'Sample document text';
      const mockEmbedding = new Array(384).fill(0.5);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{
            embedding: mockEmbedding,
            text,
            tokenCount: 5
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 5,
          cost: 0.0
        })
      });

      const result = await hostAdapter.embedText(text);

      // Verify metadata presence
      expect(result.text).toBe(text);
      expect(result.tokenCount).toBe(5);
    });
  });

  describe('embedBatch() handles document chunks', () => {
    it('should embed multiple document chunks with correct dimensions', async () => {
      const chunks = [
        'First document chunk',
        'Second document chunk',
        'Third document chunk'
      ];
      const mockEmbeddings = chunks.map(() => new Array(384).fill(0.5));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: chunks.map((text, i) => ({
            embedding: mockEmbeddings[i],
            text,
            tokenCount: 3
          })),
          model: 'all-MiniLM-L6-v2',
          provider: 'host',
          totalTokens: 9,
          cost: 0.0
        })
      });

      const response = await hostAdapter.embedBatch(chunks);

      // Verify batch response structure
      expect(response.embeddings).toHaveLength(3);
      expect(response.provider).toBe(EmbeddingProvider.Host);
      expect(response.cost).toBe(0.0);

      // Verify all embeddings are 384-D
      response.embeddings.forEach(embedding => {
        expect(embedding.embedding).toHaveLength(384);
      });
    });

    it('should respect 96-text batch size limit for efficiency', async () => {
      const largeBatch = new Array(97).fill('Text chunk');

      // Should throw before even calling fetch
      await expect(hostAdapter.embedBatch(largeBatch))
        .rejects.toThrow(/batch size.*96/i);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Error handling for RAG context', () => {
    it('should handle network errors gracefully', async () => {
      const text = 'Document text';

      mockFetch.mockRejectedValueOnce(new Error('Network error: ECONNREFUSED'));

      // Should throw an error (verification test doesn't check exact error message)
      await expect(hostAdapter.embedText(text))
        .rejects.toThrow();
    });

    it('should throw on dimension mismatch (expects 384-D)', async () => {
      const text = 'Document text';
      const wrongDimensionEmbedding = new Array(512).fill(0.5);  // Wrong!

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{
            embedding: wrongDimensionEmbedding,
            text,
            tokenCount: 3
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 3,
          cost: 0.0
        })
      });

      await expect(hostAdapter.embedText(text))
        .rejects.toThrow(/512.*expected 384/i);
    });
  });

  describe('Integration readiness', () => {
    it('should work with DocumentManager pipeline', async () => {
      // Simulate DocumentManager calling embedBatch()
      const documentChunks = [
        'Chunk 1 from document',
        'Chunk 2 from document'
      ];
      const mockEmbeddings = documentChunks.map(() => new Array(384).fill(0.7));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: documentChunks.map((text, i) => ({
            embedding: mockEmbeddings[i],
            text,
            tokenCount: 5
          })),
          model: 'all-MiniLM-L6-v2',
          provider: 'host',
          totalTokens: 10,
          cost: 0.0
        })
      });

      const response = await hostAdapter.embedBatch(documentChunks);

      // Verify DocumentManager can extract embeddings
      expect(response.embeddings).toHaveLength(2);
      const embeddings = response.embeddings.map(e => e.embedding);
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(384);
      expect(embeddings[1]).toHaveLength(384);
    });

    it('should produce vectors ready for SessionManager.uploadVectors()', async () => {
      const text = 'Document chunk';
      const mockEmbedding = new Array(384).fill(0.8);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embeddings: [{
            embedding: mockEmbedding,
            text,
            tokenCount: 3
          }],
          model: 'all-MiniLM-L6-v2',
          totalTokens: 3,
          cost: 0.0
        })
      });

      const result = await hostAdapter.embedText(text);

      // Verify vector format matches SessionManager.uploadVectors() expectations
      // SessionManager expects VectorRecord: { id, vector, metadata }
      const vectorRecord = {
        id: 'chunk-1',
        vector: result.embedding,  // 384-D array
        metadata: {
          text: result.text,
          documentId: 'doc-123'
        }
      };

      expect(vectorRecord.vector).toHaveLength(384);
      expect(vectorRecord.vector).toBeInstanceOf(Array);
      expect(typeof vectorRecord.metadata.text).toBe('string');
    });
  });
});
