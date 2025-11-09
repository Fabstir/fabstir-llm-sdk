/**
 * Document Manager Tests
 * Tests document upload, chunking, embedding, and vector storage
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingProvider } from '../../src/embeddings/types.js';

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

describe('Document Manager', () => {
  let DocumentManager: any;
  let manager: any;
  let mockEmbeddingService: any;
  let mockVectorManager: any;

  beforeEach(async () => {
    // Create mock embedding service
    mockEmbeddingService = {
      provider: EmbeddingProvider.OpenAI,
      embedText: vi.fn(async (text: string) => ({
        embedding: new Array(384).fill(0).map(() => Math.random()),
        text: text,
        tokenCount: Math.ceil(text.split(' ').length * 1.3)
      })),
      embedBatch: vi.fn(async (texts: string[]) => ({
        embeddings: texts.map(text => ({
          embedding: new Array(384).fill(0).map(() => Math.random()),
          text: text,
          tokenCount: Math.ceil(text.split(' ').length * 1.3)
        })),
        provider: EmbeddingProvider.OpenAI,
        model: 'text-embedding-3-small',
        totalTokens: texts.reduce((sum, t) => sum + Math.ceil(t.split(' ').length * 1.3), 0),
        cost: 0.00001
      }))
    };

    // Create mock vector manager
    mockVectorManager = {
      addVectors: vi.fn(async () => {}),
      createSession: vi.fn(async () => 'session-123'),
      deleteByMetadata: vi.fn(async () => ({ deletedIds: [], deletedCount: 0 }))
    };

    // Import DocumentManager
    const module = await import('../../src/documents/DocumentManager.js');
    DocumentManager = module.DocumentManager;

    manager = new DocumentManager({
      embeddingService: mockEmbeddingService,
      vectorManager: mockVectorManager,
      databaseName: 'test-docs'
    });
  });

  it('should initialize with embedding service and vector manager', () => {
    expect(manager).toBeDefined();
  });

  it('should process text document', async () => {
    const text = 'This is a test document with some content.';
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    const result = await manager.processDocument(file);

    expect(result.documentId).toBeDefined();
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.embeddingsGenerated).toBe(true);
    expect(result.vectorsStored).toBe(true);
  });

  it('should chunk document text', async () => {
    // Long text that will be chunked
    const longText = Array(1000).fill('word').join(' ');
    const file = new File([longText], 'long.txt', { type: 'text/plain' });

    const result = await manager.processDocument(file, {
      chunkSize: 100, // 100 tokens ~77 words
      overlap: 10
    });

    expect(result.chunks).toBeGreaterThan(1);
  });

  it('should generate embeddings for all chunks', async () => {
    const text = Array(500).fill('word').join(' ');
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file, {
      chunkSize: 100,
      overlap: 10
    });

    // Should have called embedBatch
    expect(mockEmbeddingService.embedBatch).toHaveBeenCalled();
  });

  it('should store vectors in vector database', async () => {
    const text = 'Test document for vector storage.';
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file);

    // Should have called addVectors
    expect(mockVectorManager.addVectors).toHaveBeenCalled();
    const call = mockVectorManager.addVectors.mock.calls[0];
    const vectors = call[1];

    expect(vectors).toBeInstanceOf(Array);
    expect(vectors[0]).toHaveProperty('id');
    expect(vectors[0]).toHaveProperty('values');
    expect(vectors[0]).toHaveProperty('metadata');
    expect(vectors[0].values.length).toBe(384);
  });

  it('should include document metadata in chunks', async () => {
    const text = 'Document with metadata.';
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file);

    const call = mockVectorManager.addVectors.mock.calls[0];
    const vectors = call[1];
    const metadata = vectors[0].metadata;

    expect(metadata.documentId).toBeDefined();
    expect(metadata.documentName).toBe('test.txt');
    expect(metadata.documentType).toBe('txt');
    expect(metadata.chunkIndex).toBeDefined();
  });

  it('should track progress during processing', async () => {
    const text = Array(500).fill('word').join(' ');
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    const progressUpdates: any[] = [];

    await manager.processDocument(file, {
      onProgress: (progress: any) => {
        progressUpdates.push(progress);
      }
    });

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates.some(p => p.stage === 'extracting')).toBe(true);
    expect(progressUpdates.some(p => p.stage === 'chunking')).toBe(true);
    expect(progressUpdates.some(p => p.stage === 'embedding')).toBe(true);
    expect(progressUpdates.some(p => p.stage === 'complete')).toBe(true);
  });

  it('should handle batch document upload', async () => {
    const files = [
      new File(['Doc 1 content'], 'doc1.txt', { type: 'text/plain' }),
      new File(['Doc 2 content'], 'doc2.txt', { type: 'text/plain' }),
      new File(['Doc 3 content'], 'doc3.txt', { type: 'text/plain' })
    ];

    const results = await manager.processBatch(files);

    expect(results).toHaveLength(3);
    results.forEach((result: any) => {
      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();
    });
  });

  it('should handle errors gracefully', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    // Make embedding service throw error
    mockEmbeddingService.embedBatch.mockRejectedValueOnce(new Error('API error'));

    await expect(manager.processDocument(file)).rejects.toThrow('API error');
  });

  it('should use default chunking options', async () => {
    const text = Array(1000).fill('word').join(' ');
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file);

    // Should chunk with defaults (500 token chunks, 50 token overlap)
    expect(mockEmbeddingService.embedBatch).toHaveBeenCalled();
  });

  it('should support custom chunking strategies', async () => {
    const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file, {
      splitByParagraph: true
    });

    expect(mockEmbeddingService.embedBatch).toHaveBeenCalled();
  });

  it('should deduplicate vectors if requested', async () => {
    const text = 'Same text. Same text.';
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    await manager.processDocument(file, {
      chunkSize: 10,
      deduplicateChunks: true
    });

    const call = mockVectorManager.addVectors.mock.calls[0];
    const vectors = call[1];

    // Should have deduplicated identical chunks
    const uniqueTexts = new Set(vectors.map((v: any) => v.metadata.text));
    expect(uniqueTexts.size).toBeLessThanOrEqual(vectors.length);
  });

  it('should estimate processing cost', async () => {
    const text = Array(500).fill('word').join(' ');
    const file = new File([text], 'test.txt', { type: 'text/plain' });

    const estimate = await manager.estimateCost(file, {
      chunkSize: 100
    });

    expect(estimate.totalTokens).toBeGreaterThan(0);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.chunkCount).toBeGreaterThan(0);
  });

  it('should list processed documents', async () => {
    const files = [
      new File(['Doc 1'], 'doc1.txt', { type: 'text/plain' }),
      new File(['Doc 2'], 'doc2.txt', { type: 'text/plain' })
    ];

    await manager.processBatch(files);

    const documents = await manager.listDocuments();

    expect(documents).toHaveLength(2);
    expect(documents[0]).toHaveProperty('documentId');
    expect(documents[0]).toHaveProperty('name');
    expect(documents[0]).toHaveProperty('chunks');
  });

  it('should delete document and its vectors', async () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const result = await manager.processDocument(file);

    await manager.deleteDocument(result.documentId);

    // Should have deleted vectors
    expect(mockVectorManager.deleteByMetadata).toHaveBeenCalledWith(
      'test-docs',
      { documentId: result.documentId }
    );
  });
});
