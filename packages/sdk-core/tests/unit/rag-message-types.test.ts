// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for RAG WebSocket Message Types
 * Tests TypeScript type definitions for uploadVectors and searchVectors messages
 * Part of Phase 2, Sub-phase 2.1: Add WebSocket Message Type Definitions
 */

import { describe, it, expect } from 'vitest';
import type {
  Vector,
  UploadVectorsMessage,
  UploadVectorsResponse,
  SearchVectorsMessage,
  SearchVectorsResponse,
  SearchResult
} from '../../src/types/rag-websocket';

describe('RAG WebSocket Message Types', () => {
  describe('Vector type', () => {
    it('should allow valid Vector with all fields', () => {
      const vector: Vector = {
        id: 'doc_1_chunk_0',
        vector: new Array(384).fill(0.5),
        metadata: {
          documentId: 'doc_1',
          chunkIndex: 0,
          text: 'Sample text content'
        }
      };

      expect(vector.id).toBe('doc_1_chunk_0');
      expect(vector.vector).toHaveLength(384);
      expect(vector.metadata.documentId).toBe('doc_1');
    });

    it('should allow Vector with empty metadata', () => {
      const vector: Vector = {
        id: 'vector_1',
        vector: [0.1, 0.2, 0.3],
        metadata: {}
      };

      expect(vector.metadata).toEqual({});
    });

    it('should allow Vector with arbitrary metadata fields', () => {
      const vector: Vector = {
        id: 'vector_2',
        vector: [0.5],
        metadata: {
          customField: 'custom value',
          nested: {
            field: 123
          },
          array: [1, 2, 3]
        }
      };

      expect(vector.metadata.customField).toBe('custom value');
      expect(vector.metadata.nested.field).toBe(123);
    });
  });

  describe('UploadVectorsMessage type', () => {
    it('should allow valid UploadVectorsMessage with replace=false', () => {
      const message: UploadVectorsMessage = {
        type: 'uploadVectors',
        requestId: 'req_123',
        vectors: [
          {
            id: 'vec_1',
            vector: new Array(384).fill(0.5),
            metadata: { text: 'Sample' }
          }
        ],
        replace: false
      };

      expect(message.type).toBe('uploadVectors');
      expect(message.requestId).toBe('req_123');
      expect(message.vectors).toHaveLength(1);
      expect(message.replace).toBe(false);
    });

    it('should allow valid UploadVectorsMessage with replace=true', () => {
      const message: UploadVectorsMessage = {
        type: 'uploadVectors',
        requestId: 'req_456',
        vectors: [],
        replace: true
      };

      expect(message.replace).toBe(true);
      expect(message.vectors).toHaveLength(0);
    });

    it('should allow UploadVectorsMessage with multiple vectors', () => {
      const vectors: Vector[] = Array.from({ length: 100 }, (_, i) => ({
        id: `vec_${i}`,
        vector: new Array(384).fill(i / 100),
        metadata: { index: i }
      }));

      const message: UploadVectorsMessage = {
        type: 'uploadVectors',
        requestId: 'req_batch',
        vectors,
        replace: false
      };

      expect(message.vectors).toHaveLength(100);
    });
  });

  describe('UploadVectorsResponse type', () => {
    it('should allow successful UploadVectorsResponse', () => {
      const response: UploadVectorsResponse = {
        type: 'uploadVectorsResponse',
        requestId: 'req_123',
        status: 'success',
        uploaded: 100
      };

      expect(response.type).toBe('uploadVectorsResponse');
      expect(response.status).toBe('success');
      expect(response.uploaded).toBe(100);
      expect(response.error).toBeUndefined();
    });

    it('should allow UploadVectorsResponse with error', () => {
      const response: UploadVectorsResponse = {
        type: 'uploadVectorsResponse',
        requestId: 'req_456',
        status: 'error',
        uploaded: 0,
        error: 'Vector dimension mismatch: expected 384, got 512'
      };

      expect(response.status).toBe('error');
      expect(response.error).toContain('Vector dimension mismatch');
      expect(response.uploaded).toBe(0);
    });

    it('should allow UploadVectorsResponse with partial upload', () => {
      const response: UploadVectorsResponse = {
        type: 'uploadVectorsResponse',
        requestId: 'req_partial',
        status: 'success',
        uploaded: 750
      };

      expect(response.uploaded).toBe(750);
    });
  });

  describe('SearchVectorsMessage type', () => {
    it('should allow valid SearchVectorsMessage with all fields', () => {
      const message: SearchVectorsMessage = {
        type: 'searchVectors',
        requestId: 'search_123',
        queryVector: new Array(384).fill(0.5),
        k: 5,
        threshold: 0.7
      };

      expect(message.type).toBe('searchVectors');
      expect(message.queryVector).toHaveLength(384);
      expect(message.k).toBe(5);
      expect(message.threshold).toBe(0.7);
    });

    it('should allow SearchVectorsMessage without threshold', () => {
      const message: SearchVectorsMessage = {
        type: 'searchVectors',
        requestId: 'search_456',
        queryVector: [0.1, 0.2, 0.3],
        k: 10
      };

      expect(message.threshold).toBeUndefined();
      expect(message.k).toBe(10);
    });

    it('should allow SearchVectorsMessage with k=1', () => {
      const message: SearchVectorsMessage = {
        type: 'searchVectors',
        requestId: 'search_single',
        queryVector: new Array(384).fill(0.8),
        k: 1,
        threshold: 0.9
      };

      expect(message.k).toBe(1);
    });
  });

  describe('SearchResult type', () => {
    it('should allow valid SearchResult with all fields', () => {
      const result: SearchResult = {
        id: 'doc_5_chunk_3',
        vector: new Array(384).fill(0.6),
        metadata: {
          documentId: 'doc_5',
          text: 'Relevant text content',
          chunkIndex: 3
        },
        score: 0.95
      };

      expect(result.id).toBe('doc_5_chunk_3');
      expect(result.score).toBe(0.95);
      expect(result.metadata.documentId).toBe('doc_5');
    });

    it('should allow SearchResult with empty metadata', () => {
      const result: SearchResult = {
        id: 'vec_100',
        vector: [0.5],
        metadata: {},
        score: 0.75
      };

      expect(result.metadata).toEqual({});
    });

    it('should allow SearchResult with score=1.0 (perfect match)', () => {
      const result: SearchResult = {
        id: 'exact_match',
        vector: new Array(384).fill(1.0),
        metadata: { type: 'exact' },
        score: 1.0
      };

      expect(result.score).toBe(1.0);
    });
  });

  describe('SearchVectorsResponse type', () => {
    it('should allow successful SearchVectorsResponse with results', () => {
      const results: SearchResult[] = [
        {
          id: 'vec_1',
          vector: new Array(384).fill(0.8),
          metadata: { text: 'First result' },
          score: 0.95
        },
        {
          id: 'vec_2',
          vector: new Array(384).fill(0.7),
          metadata: { text: 'Second result' },
          score: 0.88
        }
      ];

      const response: SearchVectorsResponse = {
        type: 'searchVectorsResponse',
        requestId: 'search_123',
        results
      };

      expect(response.type).toBe('searchVectorsResponse');
      expect(response.results).toHaveLength(2);
      expect(response.results[0].score).toBe(0.95);
      expect(response.error).toBeUndefined();
    });

    it('should allow SearchVectorsResponse with empty results', () => {
      const response: SearchVectorsResponse = {
        type: 'searchVectorsResponse',
        requestId: 'search_no_match',
        results: []
      };

      expect(response.results).toHaveLength(0);
    });

    it('should allow SearchVectorsResponse with error', () => {
      const response: SearchVectorsResponse = {
        type: 'searchVectorsResponse',
        requestId: 'search_error',
        results: [],
        error: 'No vectors uploaded yet'
      };

      expect(response.error).toBe('No vectors uploaded yet');
      expect(response.results).toHaveLength(0);
    });

    it('should allow SearchVectorsResponse with many results', () => {
      const results: SearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        id: `vec_${i}`,
        vector: new Array(384).fill(i / 50),
        metadata: { index: i },
        score: 1.0 - (i / 50) // Decreasing scores
      }));

      const response: SearchVectorsResponse = {
        type: 'searchVectorsResponse',
        requestId: 'search_many',
        results
      };

      expect(response.results).toHaveLength(50);
      expect(response.results[0].score).toBeGreaterThan(response.results[49].score);
    });
  });

  describe('Type validation edge cases', () => {
    it('should allow Vector with numeric metadata values', () => {
      const vector: Vector = {
        id: 'vec_numeric',
        vector: [0.5],
        metadata: {
          count: 42,
          temperature: 0.7,
          isValid: true
        }
      };

      expect(vector.metadata.count).toBe(42);
      expect(vector.metadata.isValid).toBe(true);
    });

    it('should allow UploadVectorsMessage with zero vectors (clear operation)', () => {
      const message: UploadVectorsMessage = {
        type: 'uploadVectors',
        requestId: 'clear_all',
        vectors: [],
        replace: true
      };

      expect(message.vectors).toHaveLength(0);
      expect(message.replace).toBe(true);
    });

    it('should allow SearchVectorsMessage with high k value', () => {
      const message: SearchVectorsMessage = {
        type: 'searchVectors',
        requestId: 'search_all',
        queryVector: new Array(384).fill(0.5),
        k: 1000
      };

      expect(message.k).toBe(1000);
    });

    it('should allow SearchResult with score=0 (no similarity)', () => {
      const result: SearchResult = {
        id: 'no_match',
        vector: [0.0],
        metadata: {},
        score: 0.0
      };

      expect(result.score).toBe(0.0);
    });
  });
});
