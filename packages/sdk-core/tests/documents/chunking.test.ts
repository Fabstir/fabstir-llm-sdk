/**
 * Document Chunking Tests
 * Tests smart chunking with overlap for RAG processing
 * NOTE: Simplified structure to avoid vitest worker hanging issues
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

describe('Document Chunking', () => {
  let DocumentManager: any;
  let documentManager: any;

  beforeEach(async () => {
    const module = await import('../../src/managers/DocumentManager.js');
    DocumentManager = module.DocumentManager;

    documentManager = new DocumentManager();
    await documentManager.initialize(
      process.env.S5_SEED_PHRASE!,
      process.env.TEST_USER_1_ADDRESS!
    );
  });

  afterEach(async () => {
    if (documentManager) {
      await documentManager.cleanup();
    }
  });

  it('should handle short documents without chunking', async () => {
    const content = 'This is a short document.';
    const file = new File([content], 'short.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(content);
  });

  it('should split longer text into chunks', async () => {
    const content = 'Word '.repeat(100);
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    expect(chunks).toBeDefined();
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should include chunk index in metadata', async () => {
    const content = 'Word '.repeat(50);
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    chunks.forEach((chunk, index) => {
      expect(chunk.metadata.index).toBe(index);
    });
  });

  it('should include document ID in chunk metadata', async () => {
    const content = 'Document content here.';
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    chunks.forEach((chunk) => {
      expect(chunk.metadata.documentId).toBe(result.documentId);
    });
  });

  it('should include chunk boundaries in metadata', async () => {
    const content = 'Word '.repeat(50);
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    chunks.forEach((chunk) => {
      expect(chunk.metadata.startOffset).toBeDefined();
      expect(chunk.metadata.endOffset).toBeDefined();
      expect(chunk.metadata.endOffset).toBeGreaterThan(chunk.metadata.startOffset);
    });
  });

  it('should include original document metadata in chunks', async () => {
    const content = 'Document content.';
    const file = new File([content], 'original.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    chunks.forEach((chunk) => {
      expect(chunk.metadata.documentName).toBe('original.txt');
      expect(chunk.metadata.documentType).toBe('txt');
    });
  });

  it('should generate unique IDs for each chunk', async () => {
    const content = 'Word '.repeat(50);
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    const chunkIds = chunks.map((c) => c.id);
    const uniqueIds = new Set(chunkIds);

    expect(chunkIds.length).toBe(uniqueIds.size);
  });

  it('should format chunks for vector storage', async () => {
    const content = 'Document content for vector embedding.';
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');
    const chunks = await documentManager.chunkDocument(result.documentId, 'test-db');

    chunks.forEach((chunk) => {
      expect(chunk).toHaveProperty('id');
      expect(chunk).toHaveProperty('text');
      expect(chunk).toHaveProperty('metadata');
    });
  });

  it('should fail with non-existent document', async () => {
    await expect(
      documentManager.chunkDocument('non-existent-id', 'test-db')
    ).rejects.toThrow('Document not found');
  });

  it('should fail with invalid chunk size', async () => {
    const content = 'Document content.';
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');

    await expect(
      documentManager.chunkDocument(result.documentId, 'test-db', { chunkSize: 0 })
    ).rejects.toThrow('Invalid chunk size');
  });

  it('should fail with invalid overlap size', async () => {
    const content = 'Document content.';
    const file = new File([content], 'test.txt', { type: 'text/plain' });

    const result = await documentManager.uploadDocument(file, 'test-db');

    await expect(
      documentManager.chunkDocument(result.documentId, 'test-db', {
        chunkSize: 500,
        overlap: 600
      })
    ).rejects.toThrow('Overlap cannot exceed chunk size');
  });
});
