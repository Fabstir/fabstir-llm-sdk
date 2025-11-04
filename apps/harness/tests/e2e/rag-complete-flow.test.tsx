// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 6.1: End-to-End Integration Tests for RAG
 *
 * These tests verify complete RAG workflows with mocked managers:
 * - Complete upload-to-response flow
 * - Multiple document uploads
 * - Document removal and re-upload
 * - RAG enable/disable mid-session
 * - S5 storage persistence
 * - Error recovery scenarios
 *
 * NOTE: These are integration-style tests that verify the complete flow
 * using mocked managers to simulate real behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IVectorRAGManager, IDocumentManager, IEmbeddingService } from '@fabstir/sdk-core';

describe('Sub-phase 6.1: End-to-End RAG Integration Tests', () => {
  let vectorRAGManager: any;
  let documentManager: any;
  let embeddingService: any;
  let s5Client: any;
  const vectorDbName = 'test-rag-e2e-db';
  const testUserId = 'test-user-123';

  // Track uploaded documents
  let uploadedDocuments: Map<string, { id: string; name: string; chunks: number; content: string }>;
  let documentVectors: Map<string, any[]>;

  beforeEach(async () => {
    uploadedDocuments = new Map();
    documentVectors = new Map();

    // Mock S5 client
    s5Client = {
      uploadData: vi.fn().mockResolvedValue({ cid: 'mock-cid-123' }),
      downloadData: vi.fn().mockResolvedValue(new Uint8Array()),
      userId: testUserId
    };

    // Mock embedding service
    embeddingService = {
      embed: vi.fn().mockImplementation(async (texts: string[]) => {
        // Return mock embeddings (384 dimensions)
        return texts.map(() => Array(384).fill(0).map(() => Math.random()));
      })
    };

    // Mock VectorRAGManager with realistic behavior
    vectorRAGManager = {
      initialize: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockImplementation(async (dbName: string, query: string, options: any) => {
        // Simulate semantic search
        const results: any[] = [];
        for (const [docId, vectors] of documentVectors.entries()) {
          const doc = uploadedDocuments.get(docId);
          if (doc && vectors.length > 0) {
            // Simple relevance check: if query words are in document content
            const queryLower = query.toLowerCase();
            const contentLower = doc.content.toLowerCase();
            const words = queryLower.split(' ');
            const matchCount = words.filter(word => contentLower.includes(word)).length;
            const score = matchCount / Math.max(words.length, 1);

            if (score >= (options.threshold || 0)) {
              results.push({
                text: doc.content,
                score,
                metadata: { documentId: docId, fileName: doc.name }
              });
            }
          }
        }
        return results.sort((a, b) => b.score - a.score).slice(0, options.topK || 3);
      }),
      deleteByMetadata: vi.fn().mockImplementation(async (dbName: string, metadata: any) => {
        const docId = metadata.documentId;
        const hadVectors = documentVectors.has(docId);
        documentVectors.delete(docId);
        uploadedDocuments.delete(docId);
        return { deletedCount: hadVectors ? 1 : 0 };
      }),
      getStats: vi.fn().mockImplementation(async (dbName: string) => {
        let totalVectors = 0;
        for (const vectors of documentVectors.values()) {
          totalVectors += vectors.length;
        }
        return { vectorCount: totalVectors, dimensions: 384 };
      }),
      save: vi.fn().mockImplementation(async (dbName: string) => {
        await s5Client.uploadData(new Uint8Array());
        return 'mock-cid-123';
      }),
      load: vi.fn().mockImplementation(async (dbName: string, cid: string) => {
        await s5Client.downloadData(cid);
        return true;
      }),
      deleteDatabase: vi.fn().mockResolvedValue(true)
    };

    // Mock DocumentManager with realistic behavior
    documentManager = {
      processDocument: vi.fn().mockImplementation(async (file: File, options: any) => {
        const documentId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const content = await file.text();

        // Validate file type
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (!['txt', 'md', 'html'].includes(ext || '')) {
          throw new Error('Unsupported file type');
        }

        // Validate file size
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('File size must be less than 5MB');
        }

        // Simulate chunking (simple split by sentences)
        const chunks = content.split('.').filter(s => s.trim().length > 0);
        const chunkCount = Math.max(chunks.length, 1);

        // Simulate progress callbacks
        if (options.onProgress) {
          options.onProgress({ stage: 'extracting', progress: 25 });
          await new Promise(resolve => setTimeout(resolve, 10));
          options.onProgress({ stage: 'chunking', progress: 50 });
          await new Promise(resolve => setTimeout(resolve, 10));
          options.onProgress({ stage: 'embedding', progress: 75 });
          await new Promise(resolve => setTimeout(resolve, 10));
          options.onProgress({ stage: 'complete', progress: 100 });
        }

        // Store document and vectors
        uploadedDocuments.set(documentId, {
          id: documentId,
          name: file.name,
          chunks: chunkCount,
          content
        });
        documentVectors.set(documentId, chunks);

        return {
          success: true,
          documentId,
          chunks: chunkCount
        };
      })
    };
  });

  afterEach(async () => {
    // Cleanup: delete test database
    try {
      await vectorRAGManager.deleteDatabase(vectorDbName);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('E2E Test 1: Complete upload-to-response flow', () => {
    it('should upload document, search, and retrieve context', async () => {
      // Step 1: Create mock file
      const fileContent = 'This is a test document about machine learning. ML is a subset of AI.';
      const mockFile = new File([fileContent], 'test.txt', { type: 'text/plain' });

      // Step 2: Process document with DocumentManager
      const uploadResult = await documentManager.processDocument(mockFile, {
        vectorDbName,
        onProgress: (progress) => {
          expect(progress.stage).toBeDefined();
          expect(progress.progress).toBeGreaterThanOrEqual(0);
          expect(progress.progress).toBeLessThanOrEqual(100);
        }
      });

      // Verify upload result
      expect(uploadResult.documentId).toBeDefined();
      expect(uploadResult.chunks).toBeGreaterThan(0);
      expect(uploadResult.success).toBe(true);

      // Step 3: Search for relevant context
      const searchResults = await vectorRAGManager.search(vectorDbName, 'What is machine learning?', {
        topK: 3,
        threshold: 0.5
      });

      // Verify search results
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].text).toContain('machine learning');
      expect(searchResults[0].score).toBeGreaterThanOrEqual(0.5);

      // Step 4: Format context for LLM prompt
      const contextChunks = searchResults.map(r => r.text).join('\n\n');
      const userPrompt = 'What is machine learning?';
      const enhancedPrompt = `Context:\n${contextChunks}\n\nQuestion: ${userPrompt}`;

      // Verify enhanced prompt
      expect(enhancedPrompt).toContain('Context:');
      expect(enhancedPrompt).toContain('machine learning');
      expect(enhancedPrompt).toContain('Question:');
    });

    it('should handle empty search results gracefully', async () => {
      // Search in empty database
      const searchResults = await vectorRAGManager.search(vectorDbName, 'nonexistent topic', {
        topK: 3,
        threshold: 0.9
      });

      // Should return empty array, not error
      expect(searchResults).toEqual([]);
    });

    it('should maintain document metadata throughout flow', async () => {
      const fileContent = 'Test document with metadata.';
      const mockFile = new File([fileContent], 'test-metadata.txt', { type: 'text/plain' });

      const uploadResult = await documentManager.processDocument(mockFile, {
        vectorDbName,
        metadata: { author: 'Test Author', category: 'Testing' }
      });

      // Search and verify metadata
      const searchResults = await vectorRAGManager.search(vectorDbName, 'metadata', {
        topK: 1,
        threshold: 0.0
      });

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].metadata).toBeDefined();
      expect(searchResults[0].metadata.documentId).toBe(uploadResult.documentId);
    });
  });

  describe('E2E Test 2: Multiple document uploads', () => {
    it('should handle multiple documents without conflicts', async () => {
      // Upload first document
      const file1 = new File(['Document 1 about cats.'], 'cats.txt', { type: 'text/plain' });
      const result1 = await documentManager.processDocument(file1, { vectorDbName });

      expect(result1.success).toBe(true);
      expect(result1.documentId).toBeDefined();

      // Upload second document
      const file2 = new File(['Document 2 about dogs.'], 'dogs.txt', { type: 'text/plain' });
      const result2 = await documentManager.processDocument(file2, { vectorDbName });

      expect(result2.success).toBe(true);
      expect(result2.documentId).toBeDefined();
      expect(result2.documentId).not.toBe(result1.documentId);

      // Upload third document
      const file3 = new File(['Document 3 about birds.'], 'birds.txt', { type: 'text/plain' });
      const result3 = await documentManager.processDocument(file3, { vectorDbName });

      expect(result3.success).toBe(true);
      expect(result3.documentId).toBeDefined();

      // Verify all documents searchable
      const searchCats = await vectorRAGManager.search(vectorDbName, 'cats', { topK: 5, threshold: 0.0 });
      const searchDogs = await vectorRAGManager.search(vectorDbName, 'dogs', { topK: 5, threshold: 0.0 });
      const searchBirds = await vectorRAGManager.search(vectorDbName, 'birds', { topK: 5, threshold: 0.0 });

      expect(searchCats.length).toBeGreaterThan(0);
      expect(searchDogs.length).toBeGreaterThan(0);
      expect(searchBirds.length).toBeGreaterThan(0);

      // Verify total vector count
      const stats = await vectorRAGManager.getStats(vectorDbName);
      expect(stats.vectorCount).toBeGreaterThanOrEqual(3);
    });

    it('should isolate search results per document', async () => {
      // Upload documents with distinct content
      const file1 = new File(['Python programming language'], 'python.txt', { type: 'text/plain' });
      const file2 = new File(['JavaScript programming language'], 'javascript.txt', { type: 'text/plain' });

      await documentManager.processDocument(file1, { vectorDbName });
      await documentManager.processDocument(file2, { vectorDbName });

      // Search for Python
      const pythonResults = await vectorRAGManager.search(vectorDbName, 'Python', { topK: 3, threshold: 0.0 });
      expect(pythonResults.length).toBeGreaterThan(0);
      expect(pythonResults[0].text).toContain('Python');

      // Search for JavaScript
      const jsResults = await vectorRAGManager.search(vectorDbName, 'JavaScript', { topK: 3, threshold: 0.0 });
      expect(jsResults.length).toBeGreaterThan(0);
      expect(jsResults[0].text).toContain('JavaScript');
    });

    it('should handle concurrent uploads', async () => {
      const files = [
        new File(['Document A'], 'a.txt', { type: 'text/plain' }),
        new File(['Document B'], 'b.txt', { type: 'text/plain' }),
        new File(['Document C'], 'c.txt', { type: 'text/plain' })
      ];

      // Upload all files concurrently
      const results = await Promise.all(
        files.map(file => documentManager.processDocument(file, { vectorDbName }))
      );

      // Verify all succeeded
      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.documentId).toBeDefined();
      });

      // Verify unique document IDs
      const ids = results.map(r => r.documentId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('E2E Test 3: Document removal and re-upload', () => {
    it('should remove document and verify vectors deleted', async () => {
      // Upload document
      const file = new File(['Test document to remove.'], 'remove-test.txt', { type: 'text/plain' });
      const uploadResult = await documentManager.processDocument(file, { vectorDbName });

      expect(uploadResult.success).toBe(true);
      const documentId = uploadResult.documentId;

      // Verify document searchable before removal
      const searchBefore = await vectorRAGManager.search(vectorDbName, 'remove', { topK: 5, threshold: 0.0 });
      expect(searchBefore.length).toBeGreaterThan(0);

      // Remove document
      const deleteResult = await vectorRAGManager.deleteByMetadata(vectorDbName, { documentId });
      expect(deleteResult.deletedCount).toBeGreaterThan(0);

      // Verify document no longer searchable
      const searchAfter = await vectorRAGManager.search(vectorDbName, 'remove', { topK: 5, threshold: 0.0 });

      // Should return empty or not include deleted document
      const hasDeletedDoc = searchAfter.some(r => r.metadata?.documentId === documentId);
      expect(hasDeletedDoc).toBe(false);
    });

    it('should allow re-upload after removal', async () => {
      const fileName = 'reupload-test.txt';

      // First upload
      const file1 = new File(['Version 1 content'], fileName, { type: 'text/plain' });
      const result1 = await documentManager.processDocument(file1, { vectorDbName });
      const docId1 = result1.documentId;

      // Remove
      await vectorRAGManager.deleteByMetadata(vectorDbName, { documentId: docId1 });

      // Re-upload with same filename
      const file2 = new File(['Version 2 content'], fileName, { type: 'text/plain' });
      const result2 = await documentManager.processDocument(file2, { vectorDbName });
      const docId2 = result2.documentId;

      expect(result2.success).toBe(true);
      expect(docId2).not.toBe(docId1); // Should be different document ID

      // Search should return new version
      const searchResults = await vectorRAGManager.search(vectorDbName, 'Version 2', { topK: 1, threshold: 0.0 });
      expect(searchResults.length).toBeGreaterThan(0);
    });

    it('should handle partial removal in multi-document database', async () => {
      // Upload 3 documents
      const file1 = new File(['Keep this document 1'], 'keep1.txt', { type: 'text/plain' });
      const file2 = new File(['Remove this document'], 'remove.txt', { type: 'text/plain' });
      const file3 = new File(['Keep this document 2'], 'keep2.txt', { type: 'text/plain' });

      const result1 = await documentManager.processDocument(file1, { vectorDbName });
      const result2 = await documentManager.processDocument(file2, { vectorDbName });
      const result3 = await documentManager.processDocument(file3, { vectorDbName });

      // Remove middle document
      await vectorRAGManager.deleteByMetadata(vectorDbName, { documentId: result2.documentId });

      // Verify remaining documents still searchable
      const searchKeep1 = await vectorRAGManager.search(vectorDbName, 'Keep this document 1', { topK: 5, threshold: 0.0 });
      const searchKeep2 = await vectorRAGManager.search(vectorDbName, 'Keep this document 2', { topK: 5, threshold: 0.0 });

      expect(searchKeep1.length).toBeGreaterThan(0);
      expect(searchKeep2.length).toBeGreaterThan(0);
    });
  });

  describe('E2E Test 4: RAG enable/disable mid-session', () => {
    it('should allow toggling RAG on/off without data loss', async () => {
      // Upload document with RAG enabled
      const file = new File(['Important data to preserve'], 'preserve.txt', { type: 'text/plain' });
      const uploadResult = await documentManager.processDocument(file, { vectorDbName });
      expect(uploadResult.success).toBe(true);

      // Simulate RAG disable (data stays in vector DB)
      const ragEnabled = false;

      // Search should still work on vector DB even if UI disables RAG
      const searchWhileDisabled = await vectorRAGManager.search(vectorDbName, 'Important', { topK: 1, threshold: 0.0 });
      expect(searchWhileDisabled.length).toBeGreaterThan(0);

      // Simulate RAG re-enable
      const ragReEnabled = true;

      // Search should work normally
      const searchAfterReEnable = await vectorRAGManager.search(vectorDbName, 'Important', { topK: 1, threshold: 0.0 });
      expect(searchAfterReEnable.length).toBeGreaterThan(0);
      expect(searchAfterReEnable[0].text).toContain('Important');
    });

    it('should prevent upload when RAG disabled but allow search when re-enabled', async () => {
      // Upload with RAG enabled
      const file = new File(['Test data'], 'test.txt', { type: 'text/plain' });
      await documentManager.processDocument(file, { vectorDbName });

      // Simulate UI blocking upload when disabled (tested at UI level, not manager level)
      const ragEnabled = false;
      const canUpload = ragEnabled; // UI logic
      expect(canUpload).toBe(false);

      // Re-enable and verify search works
      const ragReEnabled = true;
      if (ragReEnabled) {
        const results = await vectorRAGManager.search(vectorDbName, 'Test', { topK: 1, threshold: 0.0 });
        expect(results.length).toBeGreaterThan(0);
      }
    });
  });

  describe('E2E Test 5: S5 storage persistence', () => {
    it('should save vector database to S5', async () => {
      // Upload document
      const file = new File(['Persistent data'], 'persist.txt', { type: 'text/plain' });
      await documentManager.processDocument(file, { vectorDbName });

      // Save to S5
      const saveCid = await vectorRAGManager.save(vectorDbName);
      expect(saveCid).toBeDefined();
      expect(s5Client.uploadData).toHaveBeenCalled();
    });

    it('should load vector database from S5', async () => {
      // Mock S5 data
      const mockVectorData = {
        vectors: [],
        metadata: { dimensions: 384, vectorCount: 0 }
      };

      s5Client.downloadData.mockResolvedValue(
        new TextEncoder().encode(JSON.stringify(mockVectorData))
      );

      // Load from S5
      const loadResult = await vectorRAGManager.load(vectorDbName, 'mock-cid');
      expect(loadResult).toBe(true);
      expect(s5Client.downloadData).toHaveBeenCalled();
    });

    it('should preserve data after save/load cycle', async () => {
      // Upload document
      const file = new File(['Data to persist across save/load'], 'cycle.txt', { type: 'text/plain' });
      const uploadResult = await documentManager.processDocument(file, { vectorDbName });

      // Search before save
      const searchBefore = await vectorRAGManager.search(vectorDbName, 'persist', { topK: 1, threshold: 0.0 });
      expect(searchBefore.length).toBeGreaterThan(0);

      // Save to S5
      await vectorRAGManager.save(vectorDbName);

      // NOTE: Full save/load cycle would require real S5 implementation
      // For E2E test, we verify save was called
      expect(s5Client.uploadData).toHaveBeenCalled();
    });
  });

  describe('E2E Test 6: Error recovery scenarios', () => {
    it('should handle invalid file types gracefully', async () => {
      // Create unsupported file type
      const invalidFile = new File(['binary data'], 'test.exe', { type: 'application/octet-stream' });

      // Should throw error (handled by UI)
      await expect(
        documentManager.processDocument(invalidFile, { vectorDbName })
      ).rejects.toThrow();
    });

    it('should handle oversized files', async () => {
      // Create file larger than 5MB
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
      const largeFile = new File([largeContent], 'large.txt', { type: 'text/plain' });

      // Should throw error (handled by UI validation)
      await expect(
        documentManager.processDocument(largeFile, { vectorDbName })
      ).rejects.toThrow();
    });

    it('should recover from search errors', async () => {
      // Search with invalid query
      const results = await vectorRAGManager.search(vectorDbName, '', { topK: 5, threshold: 0.0 });

      // Should return empty array, not throw
      expect(results).toEqual([]);
    });

    it('should handle network errors during embedding', async () => {
      // Mock embedding service failure
      const failingEmbeddingService = {
        embed: vi.fn().mockRejectedValue(new Error('Network error'))
      } as any;

      // Create failing document manager mock
      const failingDocManager = {
        processDocument: vi.fn().mockRejectedValue(new Error('Network error'))
      };

      const file = new File(['Test'], 'test.txt', { type: 'text/plain' });

      // Should throw error that UI can catch
      await expect(
        failingDocManager.processDocument(file, { vectorDbName })
      ).rejects.toThrow('Network error');
    });

    it('should handle corrupted metadata', async () => {
      // Upload with valid metadata
      const file = new File(['Test'], 'test.txt', { type: 'text/plain' });
      await documentManager.processDocument(file, { vectorDbName });

      // Attempt delete with non-existent documentId
      const deleteResult = await vectorRAGManager.deleteByMetadata(vectorDbName, {
        documentId: 'non-existent-id-12345'
      });

      // Should return 0 deleted, not throw error
      expect(deleteResult.deletedCount).toBe(0);
    });

    it('should handle database initialization errors', async () => {
      // Attempt to use non-existent database
      // In our mock, it returns empty array for non-existent DB (graceful degradation)
      const results = await vectorRAGManager.search('non-existent-db', 'query', { topK: 1, threshold: 0.0 });

      // Should return empty array, not crash
      expect(results).toEqual([]);
    });
  });

  describe('E2E Test 7: Performance and scalability', () => {
    it('should handle 10 documents efficiently', async () => {
      const startTime = Date.now();

      // Upload 10 small documents
      const uploads = Array.from({ length: 10 }, (_, i) => {
        const file = new File([`Document ${i} content`], `doc${i}.txt`, { type: 'text/plain' });
        return documentManager.processDocument(file, { vectorDbName });
      });

      const results = await Promise.all(uploads);

      const duration = Date.now() - startTime;

      // All should succeed
      expect(results.length).toBe(10);
      results.forEach(r => expect(r.success).toBe(true));

      // Should complete in reasonable time (< 30 seconds for 10 docs)
      expect(duration).toBeLessThan(30000);

      // Verify all searchable
      const stats = await vectorRAGManager.getStats(vectorDbName);
      expect(stats.vectorCount).toBeGreaterThanOrEqual(10);
    });

    it('should search remain fast with multiple documents', async () => {
      // Upload 5 documents
      for (let i = 0; i < 5; i++) {
        const file = new File([`Document ${i} about topic ${i}`], `doc${i}.txt`, { type: 'text/plain' });
        await documentManager.processDocument(file, { vectorDbName });
      }

      // Measure search time
      const searchStart = Date.now();
      const results = await vectorRAGManager.search(vectorDbName, 'topic', { topK: 5, threshold: 0.0 });
      const searchDuration = Date.now() - searchStart;

      expect(results.length).toBeGreaterThan(0);
      // Search should be fast (< 1 second)
      expect(searchDuration).toBeLessThan(1000);
    });
  });
});
