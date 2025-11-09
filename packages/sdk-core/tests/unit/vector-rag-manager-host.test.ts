// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for simplified VectorRAGManager (host-side delegation)
 * Tests WebSocket delegation to SessionManager instead of native bindings
 * Part of Phase 3, Sub-phase 3.1: Simplify VectorRAGManager (Remove Native Bindings)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager';
import { SessionManager } from '../../src/managers/SessionManager';
import type { VectorRecord, SearchResult, UploadVectorsResult } from '../../src/types';

// Helper function to create test vectors
function createTestVectors(count: number): VectorRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(0.5 + (i * 0.01)),
    metadata: {
      text: `Document ${i} content`,
      source: 'test'
    }
  }));
}

// Helper function to create mock search results
function createMockSearchResults(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(0.5),
    metadata: { text: `Document ${i}`, index: i },
    score: 0.9 - (i * 0.1)
  }));
}

describe('VectorRAGManager (Simplified - Host Delegation)', () => {
  let vectorRAGManager: VectorRAGManager;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    // Create mock SessionManager with WebSocket delegation methods
    mockSessionManager = {
      uploadVectors: vi.fn(),
      searchVectors: vi.fn(),
    } as unknown as SessionManager;

    vectorRAGManager = new VectorRAGManager(mockSessionManager);
  });

  describe('Constructor', () => {
    it('should create VectorRAGManager with SessionManager dependency', () => {
      const manager = new VectorRAGManager(mockSessionManager);
      expect(manager).toBeInstanceOf(VectorRAGManager);
      expect(manager).toBeDefined();
    });

    it('should throw error if SessionManager is null or undefined', () => {
      expect(() => new VectorRAGManager(null as any))
        .toThrow(/SessionManager.*required/i);

      expect(() => new VectorRAGManager(undefined as any))
        .toThrow(/SessionManager.*required/i);
    });

    it('should not require seedPhrase, storageManager, or S5 config', () => {
      // Constructor should only accept SessionManager
      const manager = new VectorRAGManager(mockSessionManager);

      // Verify no S5-related properties exist
      expect((manager as any).seedPhrase).toBeUndefined();
      expect((manager as any).storageManager).toBeUndefined();
      expect((manager as any).s5Client).toBeUndefined();
    });
  });

  describe('search() delegation', () => {
    it('should delegate to sessionManager.searchVectors() with correct parameters', async () => {
      const sessionId = 'test-session-1';
      const queryVector = new Array(384).fill(0.5);
      const k = 10;
      const threshold = 0.8;

      const mockResults = createMockSearchResults(5);
      (mockSessionManager.searchVectors as any).mockResolvedValue(mockResults);

      const results = await vectorRAGManager.search(sessionId, queryVector, k, threshold);

      // Verify delegation
      expect(mockSessionManager.searchVectors).toHaveBeenCalledWith(
        sessionId,
        queryVector,
        k,
        threshold
      );
      expect(mockSessionManager.searchVectors).toHaveBeenCalledTimes(1);
      expect(results).toEqual(mockResults);
    });

    it('should return SearchResult[] from SessionManager unchanged', async () => {
      const sessionId = 'test-session-2';
      const queryVector = new Array(384).fill(0.7);
      const mockResults = createMockSearchResults(3);

      (mockSessionManager.searchVectors as any).mockResolvedValue(mockResults);

      const results = await vectorRAGManager.search(sessionId, queryVector);

      // Results should be passed through unchanged
      expect(results).toBe(mockResults);
      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
    });

    it('should handle search errors gracefully (pass through exceptions)', async () => {
      const sessionId = 'test-session-3';
      const queryVector = new Array(384).fill(0.5);
      const error = new Error('Vector store not initialized');

      (mockSessionManager.searchVectors as any).mockRejectedValue(error);

      // Should propagate error from SessionManager
      await expect(vectorRAGManager.search(sessionId, queryVector))
        .rejects.toThrow('Vector store not initialized');
    });
  });

  describe('addVectors() delegation', () => {
    it('should delegate to sessionManager.uploadVectors() with correct parameters', async () => {
      const sessionId = 'test-session-4';
      const vectors = createTestVectors(5);
      const replace = false;

      const mockResult: UploadVectorsResult = {
        uploaded: 5,
        rejected: 0,
        errors: []
      };
      (mockSessionManager.uploadVectors as any).mockResolvedValue(mockResult);

      const result = await vectorRAGManager.addVectors(sessionId, vectors, replace);

      // Verify delegation
      expect(mockSessionManager.uploadVectors).toHaveBeenCalledWith(
        sessionId,
        vectors,
        replace
      );
      expect(mockSessionManager.uploadVectors).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    it('should validate vector dimensions before delegating (384 dimensions)', async () => {
      const sessionId = 'test-session-5';
      const invalidVectors: VectorRecord[] = [{
        id: 'vec_invalid',
        vector: new Array(512).fill(0.5), // Wrong dimension!
        metadata: {}
      }];

      // Should reject before calling SessionManager
      await expect(vectorRAGManager.addVectors(sessionId, invalidVectors))
        .rejects.toThrow(/Invalid vector dimensions.*expected 384.*got 512/i);

      // SessionManager should not be called
      expect(mockSessionManager.uploadVectors).not.toHaveBeenCalled();
    });

    it('should return UploadVectorsResult with uploaded/rejected counts', async () => {
      const sessionId = 'test-session-6';
      const vectors = createTestVectors(10);

      const mockResult: UploadVectorsResult = {
        uploaded: 8,
        rejected: 2,
        errors: ['vec_7: duplicate ID', 'vec_9: invalid metadata']
      };
      (mockSessionManager.uploadVectors as any).mockResolvedValue(mockResult);

      const result = await vectorRAGManager.addVectors(sessionId, vectors);

      expect(result.uploaded).toBe(8);
      expect(result.rejected).toBe(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('deleteByMetadata() soft delete', () => {
    it('should search for vectors matching metadata filter', async () => {
      const sessionId = 'test-session-7';
      const filter = { source: 'test', type: 'document' };

      // Mock search to return 3 matching vectors WITH THE FILTER FIELDS
      const mockSearchResults: SearchResult[] = [
        {
          id: 'vec_0',
          vector: new Array(384).fill(0.5),
          metadata: { text: 'Document 0', source: 'test', type: 'document' },
          score: 0.9
        },
        {
          id: 'vec_1',
          vector: new Array(384).fill(0.5),
          metadata: { text: 'Document 1', source: 'test', type: 'document' },
          score: 0.8
        },
        {
          id: 'vec_2',
          vector: new Array(384).fill(0.5),
          metadata: { text: 'Document 2', source: 'test', type: 'document' },
          score: 0.7
        }
      ];
      (mockSessionManager.searchVectors as any).mockResolvedValue(mockSearchResults);

      // Mock uploadVectors for marking as deleted
      (mockSessionManager.uploadVectors as any).mockResolvedValue({
        uploaded: 3,
        rejected: 0,
        errors: []
      });

      const deletedCount = await vectorRAGManager.deleteByMetadata(sessionId, filter);

      // Should search first to find matching vectors
      // (Implementation detail: may use searchVectors or maintain metadata index)
      expect(deletedCount).toBe(3);
    });

    it('should mark matching vectors as deleted (metadata: { deleted: true })', async () => {
      const sessionId = 'test-session-8';
      const filter = { category: 'obsolete' };

      const mockSearchResults: SearchResult[] = [
        {
          id: 'vec_1',
          vector: new Array(384).fill(0.5),
          metadata: { category: 'obsolete', text: 'Old document' },
          score: 0.95
        },
        {
          id: 'vec_2',
          vector: new Array(384).fill(0.6),
          metadata: { category: 'obsolete', text: 'Another old doc' },
          score: 0.92
        }
      ];
      (mockSessionManager.searchVectors as any).mockResolvedValue(mockSearchResults);

      // Capture the vectors being uploaded (with deleted flag)
      let updatedVectors: VectorRecord[] = [];
      (mockSessionManager.uploadVectors as any).mockImplementation(
        (sessionId: string, vectors: VectorRecord[]) => {
          updatedVectors = vectors;
          return Promise.resolve({
            uploaded: vectors.length,
            rejected: 0,
            errors: []
          });
        }
      );

      await vectorRAGManager.deleteByMetadata(sessionId, filter);

      // Verify vectors were marked as deleted
      expect(updatedVectors).toHaveLength(2);
      expect(updatedVectors[0].metadata.deleted).toBe(true);
      expect(updatedVectors[1].metadata.deleted).toBe(true);

      // Original metadata should be preserved
      expect(updatedVectors[0].metadata.category).toBe('obsolete');
      expect(updatedVectors[1].metadata.category).toBe('obsolete');
    });

    it('should handle empty search results (no vectors to delete)', async () => {
      const sessionId = 'test-session-9';
      const filter = { nonexistent: 'field' };

      // Mock search returns empty array
      (mockSessionManager.searchVectors as any).mockResolvedValue([]);

      const deletedCount = await vectorRAGManager.deleteByMetadata(sessionId, filter);

      // Should return 0 (no vectors deleted)
      expect(deletedCount).toBe(0);

      // uploadVectors should not be called if no vectors to delete
      expect(mockSessionManager.uploadVectors).not.toHaveBeenCalled();
    });
  });
});
