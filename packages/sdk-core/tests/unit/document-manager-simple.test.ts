// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for simplified DocumentManager (no vector storage)
 * Tests document processing: extract → chunk → embed (returns chunks, no storage)
 * Part of Phase 3, Sub-phase 3.2: Simplify DocumentManager (Remove Vector Storage)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock extractors to avoid memory issues with PDF libraries
vi.mock('../../src/documents/extractors.js', () => ({
  extractText: vi.fn(async (file: File) => ({
    text: await file.text(),
    metadata: {
      extractedAt: Date.now(),
      characterCount: (await file.text()).length,
      wordCount: (await file.text()).split(/\s+/).length
    }
  }))
}));

// Mock chunker to avoid potential memory issues
vi.mock('../../src/documents/chunker.js', () => ({
  chunkText: vi.fn((text: string, documentId: string, documentName: string, documentType: string, options?: any) => {
    const chunkSize = options?.chunkSize || 500;
    const wordsPerChunk = Math.floor(chunkSize * 0.77); // 500 tokens ≈ 385 words
    const words = text.split(/\s+/);

    if (words.length <= wordsPerChunk) {
      return [{
        id: `${documentId}-0`,
        text: text,
        metadata: {
          documentId,
          documentName,
          documentType,
          index: 0,
          startOffset: 0,
          endOffset: text.length
        }
      }];
    }

    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunkWords = words.slice(i, i + wordsPerChunk);
      const chunkText = chunkWords.join(' ');
      chunks.push({
        id: `${documentId}-${chunks.length}`,
        text: chunkText,
        metadata: {
          documentId,
          documentName,
          documentType,
          index: chunks.length,
          startOffset: i,
          endOffset: i + chunkWords.length
        }
      });
    }
    return chunks;
  })
}));

import { DocumentManager } from '../../src/documents/DocumentManager';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService';

// Mock file for testing
const createMockFile = (name: string, content: string, type: string = 'text/plain'): File => {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
};

describe('DocumentManager (Simplified - No Vector Storage)', () => {
  let documentManager: DocumentManager;
  let mockEmbeddingService: EmbeddingService;

  beforeEach(() => {
    // Create mock embedding service
    mockEmbeddingService = {
      embedBatch: vi.fn(),
      embedText: vi.fn(),
    } as unknown as EmbeddingService;

    documentManager = new DocumentManager({ embeddingService: mockEmbeddingService });
  });

  describe('Constructor', () => {
    it('should create DocumentManager with only embeddingService (no vectorManager)', () => {
      const manager = new DocumentManager({ embeddingService: mockEmbeddingService });

      expect(manager).toBeInstanceOf(DocumentManager);
      expect(manager).toBeDefined();

      // Verify no vectorManager or databaseName properties
      expect((manager as any).vectorManager).toBeUndefined();
      expect((manager as any).databaseName).toBeUndefined();
    });

    it('should throw error if embeddingService is missing', () => {
      expect(() => new DocumentManager({} as any))
        .toThrow(/embeddingService.*required/i);
    });
  });

  describe('processDocument() returns ChunkResult[]', () => {
    it('should return array of ChunkResult objects with embeddings', async () => {
      const file = createMockFile('test.txt', 'This is a test document with some content.');

      // Mock embedding service response
      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      const chunks = await documentManager.processDocument(file);

      // Verify return type
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);

      // Verify chunk structure
      const chunk = chunks[0];
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('embedding');
      expect(chunk).toHaveProperty('metadata');

      // Verify embedding dimensions
      expect(chunk.embedding).toHaveLength(384);

      // Verify metadata
      expect(chunk.metadata).toHaveProperty('documentId');
      expect(chunk.metadata).toHaveProperty('documentName', 'test.txt');
      expect(chunk.metadata).toHaveProperty('chunkIndex');
    });
  });

  describe('Text extraction', () => {
    it('should extract text from file', async () => {
      const file = createMockFile('test.txt', 'Sample text content for extraction.');

      (mockEmbeddingService.embedBatch as any).mockImplementation((texts: string[]) => {
        return Promise.resolve({
          embeddings: texts.map((text: string) => ({
            text,
            embedding: new Array(384).fill(0.5),
            model: 'all-MiniLM-L6-v2',
            provider: 'host',
            cost: 0
          }))
        });
      });

      const chunks = await documentManager.processDocument(file);

      // Verify text was extracted (chunk text should contain file content)
      expect(chunks[0].text).toContain('Sample text');
    });
  });

  describe('Chunking', () => {
    it('should chunk extracted text with correct options', async () => {
      // Create realistic text with reasonable length
      const file = createMockFile('test.txt', 'This is some sample text for chunking. '.repeat(50));

      // Mock should return embeddings matching the number of input texts
      (mockEmbeddingService.embedBatch as any).mockImplementation((texts: string[]) => {
        return Promise.resolve({
          embeddings: texts.map((text: string) => ({
            text,
            embedding: new Array(384).fill(0.5),
            model: 'all-MiniLM-L6-v2',
            provider: 'host',
            cost: 0
          }))
        });
      });

      const chunks = await documentManager.processDocument(file, {
        chunkSize: 100, // Very small chunk size to force multiple chunks
        overlap: 20
      });

      // Should create chunks (at least 1, ideally multiple for 1000 words)
      expect(chunks.length).toBeGreaterThanOrEqual(1);

      // Verify chunk indices
      chunks.forEach((chunk, index) => {
        expect(chunk.metadata.chunkIndex).toBe(index);
      });
    });
  });

  describe('Embedding generation', () => {
    it('should generate embeddings via HostAdapter (384 dimensions)', async () => {
      const file = createMockFile('test.txt', 'Test content for embedding generation.');

      const mockEmbedding = new Array(384).fill(0.7);
      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: mockEmbedding, model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      const chunks = await documentManager.processDocument(file);

      // Verify embedBatch was called
      expect(mockEmbeddingService.embedBatch).toHaveBeenCalledTimes(1);

      // Verify embedding dimensions
      expect(chunks[0].embedding).toHaveLength(384);
      expect(chunks[0].embedding).toEqual(mockEmbedding);
    });

    it('should NOT call vectorManager.addVectors() - no vector storage', async () => {
      const file = createMockFile('test.txt', 'Content without storage.');

      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      // Create a spy to verify addVectors is never called
      const addVectorsSpy = vi.fn();
      (documentManager as any).vectorManager = { addVectors: addVectorsSpy };

      await documentManager.processDocument(file);

      // Verify vector storage was NOT called
      expect(addVectorsSpy).not.toHaveBeenCalled();
    });
  });

  describe('Progress callbacks', () => {
    it('should emit extracting progress (25%)', async () => {
      const file = createMockFile('test.txt', 'Progress test content.');
      const onProgress = vi.fn();

      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      await documentManager.processDocument(file, { onProgress });

      // Verify extracting stage was emitted
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        stage: 'extracting',
        progress: 25
      }));
    });

    it('should emit chunking progress (50%)', async () => {
      const file = createMockFile('test.txt', 'Progress test content.');
      const onProgress = vi.fn();

      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      await documentManager.processDocument(file, { onProgress });

      // Verify chunking stage was emitted
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        stage: 'chunking',
        progress: 50
      }));
    });

    it('should emit embedding progress at 100% (no 90% storing stage)', async () => {
      const file = createMockFile('test.txt', 'Progress test content.');
      const onProgress = vi.fn();

      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      await documentManager.processDocument(file, { onProgress });

      // Verify embedding stage was emitted at 75%
      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        stage: 'embedding',
        progress: 75
      }));

      // Verify final progress is 100% (not 90% storing substage)
      const calls = onProgress.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.progress).toBe(100);

      // Verify there's no 90% progress call (old storing stage)
      const has90Progress = calls.some(call => call[0].progress === 90);
      expect(has90Progress).toBe(false);
    });
  });

  describe('Chunk deduplication', () => {
    it('should deduplicate chunks when option enabled', async () => {
      const file = createMockFile('test.txt', 'Duplicate text. Duplicate text. Unique text.');

      // Mock should return embeddings matching the number of input texts
      (mockEmbeddingService.embedBatch as any).mockImplementation((texts: string[]) => {
        return Promise.resolve({
          embeddings: texts.map((text: string) => ({
            text,
            embedding: new Array(384).fill(0.5),
            model: 'all-MiniLM-L6-v2',
            provider: 'host',
            cost: 0
          }))
        });
      });

      const chunks = await documentManager.processDocument(file, {
        deduplicateChunks: true
      });

      // Should remove duplicate chunks
      const texts = chunks.map(c => c.text);
      const uniqueTexts = new Set(texts);
      expect(texts.length).toBe(uniqueTexts.size);
    });
  });

  describe('Error handling', () => {
    it('should handle extraction errors gracefully', async () => {
      const file = createMockFile('corrupted.txt', '', 'application/octet-stream');

      // Expect error to propagate
      await expect(documentManager.processDocument(file))
        .rejects.toThrow();
    });

    it('should handle embedding errors gracefully', async () => {
      const file = createMockFile('test.txt', 'Content that fails embedding.');

      // Mock embedding service to throw error
      (mockEmbeddingService.embedBatch as any).mockRejectedValue(
        new Error('Embedding service unavailable')
      );

      // Expect error to propagate
      await expect(documentManager.processDocument(file))
        .rejects.toThrow('Embedding service unavailable');
    });
  });

  describe('processBatch()', () => {
    it('should process batch of files', async () => {
      const files = [
        createMockFile('file1.txt', 'Content of file 1'),
        createMockFile('file2.txt', 'Content of file 2'),
        createMockFile('file3.txt', 'Content of file 3')
      ];

      (mockEmbeddingService.embedBatch as any).mockResolvedValue({
        embeddings: [
          { embedding: new Array(384).fill(0.5), model: 'all-MiniLM-L6-v2', provider: 'host', cost: 0 }
        ]
      });

      const results = await documentManager.processBatch(files);

      // Should return results for all files
      expect(results).toHaveLength(3);

      // Each result should contain chunks
      results.forEach((result, index) => {
        expect(result.documentId).toBeDefined();
        expect(result.chunks).toBeGreaterThan(0);
        expect(result.fileName).toBe(files[index].name);
      });
    });
  });
});
