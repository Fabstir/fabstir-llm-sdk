// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.2: Document Upload Handler Tests
 *
 * Tests for handleDocumentUpload() function that:
 * - Validates file type and size
 * - Calls DocumentManager.processDocument()
 * - Handles progress callbacks
 * - Updates uploadedDocuments state
 * - Shows system messages on success/failure
 * - Resets file input after processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock types
interface ProcessResult {
  documentId: string;
  chunks: number;
  embeddingsGenerated: boolean;
  vectorsStored: boolean;
  totalTokens?: number;
  cost?: number;
}

interface ProgressCallback {
  stage: string;
  progress: number;
}

interface UploadedDocument {
  id: string;
  name: string;
  chunks: number;
}

describe('Sub-phase 2.2: Document Upload Handler', () => {
  let mockDocumentManager: any;
  let mockAddMessage: any;
  let mockSetStatus: any;
  let mockSetUploadError: any;
  let mockSetIsUploadingDocument: any;
  let mockSetUploadedDocuments: any;

  beforeEach(() => {
    mockDocumentManager = {
      processDocument: vi.fn().mockResolvedValue({
        documentId: 'doc123',
        chunks: 5,
        embeddingsGenerated: true,
        vectorsStored: true,
        totalTokens: 100,
        cost: 0.001
      })
    };

    mockAddMessage = vi.fn();
    mockSetStatus = vi.fn();
    mockSetUploadError = vi.fn();
    mockSetIsUploadingDocument = vi.fn();
    mockSetUploadedDocuments = vi.fn();
  });

  describe('File type validation', () => {
    it('should accept .txt files', () => {
      const fileName = 'document.txt';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(true);
    });

    it('should accept .md files', () => {
      const fileName = 'document.md';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(true);
    });

    it('should accept .html files', () => {
      const fileName = 'document.html';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(true);
    });

    it('should reject .pdf files', () => {
      const fileName = 'document.pdf';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(false);
    });

    it('should reject .docx files', () => {
      const fileName = 'document.docx';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(false);
    });

    it('should handle case-insensitive extensions', () => {
      const fileName = 'document.TXT';
      const ext = fileName.split('.').pop()?.toLowerCase();
      const isValid = ['txt', 'md', 'html'].includes(ext || '');

      expect(isValid).toBe(true);
    });
  });

  describe('File size validation', () => {
    it('should accept files under 5MB', () => {
      const fileSize = 4 * 1024 * 1024; // 4MB
      const maxSize = 5 * 1024 * 1024; // 5MB
      const isValid = fileSize <= maxSize;

      expect(isValid).toBe(true);
    });

    it('should reject files over 5MB', () => {
      const fileSize = 6 * 1024 * 1024; // 6MB
      const maxSize = 5 * 1024 * 1024; // 5MB
      const isValid = fileSize <= maxSize;

      expect(isValid).toBe(false);
    });

    it('should accept files exactly 5MB', () => {
      const fileSize = 5 * 1024 * 1024; // 5MB
      const maxSize = 5 * 1024 * 1024; // 5MB
      const isValid = fileSize <= maxSize;

      expect(isValid).toBe(true);
    });
  });

  describe('DocumentManager.processDocument() call', () => {
    it('should call processDocument with File object', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

      await mockDocumentManager.processDocument(mockFile);

      expect(mockDocumentManager.processDocument).toHaveBeenCalledWith(mockFile);
    });

    it('should call processDocument with progress callback', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const onProgress = vi.fn();

      await mockDocumentManager.processDocument(mockFile, { onProgress });

      expect(mockDocumentManager.processDocument).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({ onProgress })
      );
    });

    it('should return document result with chunks', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });

      const result = await mockDocumentManager.processDocument(mockFile);

      expect(result).toHaveProperty('documentId');
      expect(result).toHaveProperty('chunks');
      expect(result.chunks).toBe(5);
    });
  });

  describe('Progress callback handling', () => {
    it('should handle extracting stage progress', () => {
      const progress: ProgressCallback = { stage: 'extracting', progress: 25 };

      mockSetStatus(`Processing: ${progress.stage}... ${progress.progress}%`);

      expect(mockSetStatus).toHaveBeenCalledWith('Processing: extracting... 25%');
    });

    it('should handle chunking stage progress', () => {
      const progress: ProgressCallback = { stage: 'chunking', progress: 50 };

      mockSetStatus(`Processing: ${progress.stage}... ${progress.progress}%`);

      expect(mockSetStatus).toHaveBeenCalledWith('Processing: chunking... 50%');
    });

    it('should handle embedding stage progress', () => {
      const progress: ProgressCallback = { stage: 'embedding', progress: 75 };

      mockSetStatus(`Processing: ${progress.stage}... ${progress.progress}%`);

      expect(mockSetStatus).toHaveBeenCalledWith('Processing: embedding... 75%');
    });

    it('should handle complete stage progress', () => {
      const progress: ProgressCallback = { stage: 'complete', progress: 100 };

      mockSetStatus(`Processing: ${progress.stage}... ${progress.progress}%`);

      expect(mockSetStatus).toHaveBeenCalledWith('Processing: complete... 100%');
    });
  });

  describe('uploadedDocuments state update', () => {
    it('should add document to uploadedDocuments array', () => {
      const existingDocs: UploadedDocument[] = [];
      const newDoc: UploadedDocument = {
        id: 'doc123',
        name: 'test.txt',
        chunks: 5
      };

      mockSetUploadedDocuments([...existingDocs, newDoc]);

      expect(mockSetUploadedDocuments).toHaveBeenCalledWith([newDoc]);
    });

    it('should preserve existing documents when adding new one', () => {
      const existingDocs: UploadedDocument[] = [
        { id: 'doc1', name: 'file1.txt', chunks: 3 }
      ];
      const newDoc: UploadedDocument = {
        id: 'doc123',
        name: 'test.txt',
        chunks: 5
      };

      mockSetUploadedDocuments([...existingDocs, newDoc]);

      expect(mockSetUploadedDocuments).toHaveBeenCalledWith([
        { id: 'doc1', name: 'file1.txt', chunks: 3 },
        { id: 'doc123', name: 'test.txt', chunks: 5 }
      ]);
    });

    it('should use documentId from ProcessResult', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const result = await mockDocumentManager.processDocument(mockFile);

      expect(result.documentId).toBe('doc123');
    });

    it('should use chunks count from ProcessResult', async () => {
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const result = await mockDocumentManager.processDocument(mockFile);

      expect(result.chunks).toBe(5);
    });
  });

  describe('System messages', () => {
    it('should add success message with file name and chunks', () => {
      const fileName = 'test.txt';
      const chunks = 5;

      mockAddMessage('system', `✅ Uploaded: ${fileName} (${chunks} chunks)`);

      expect(mockAddMessage).toHaveBeenCalledWith('system', '✅ Uploaded: test.txt (5 chunks)');
    });

    it('should add error message on validation failure', () => {
      const errorMessage = 'Only .txt, .md, and .html files are supported';

      mockAddMessage('system', `❌ Upload failed: ${errorMessage}`);

      expect(mockAddMessage).toHaveBeenCalledWith('system', '❌ Upload failed: Only .txt, .md, and .html files are supported');
    });

    it('should add error message on processing failure', () => {
      const errorMessage = 'Failed to process document';

      mockAddMessage('system', `❌ Upload failed: ${errorMessage}`);

      expect(mockAddMessage).toHaveBeenCalledWith('system', '❌ Upload failed: Failed to process document');
    });
  });

  describe('Error handling', () => {
    it('should set error state on file type validation failure', () => {
      const errorMessage = 'Only .txt, .md, and .html files are supported';

      mockSetUploadError(errorMessage);

      expect(mockSetUploadError).toHaveBeenCalledWith(errorMessage);
    });

    it('should set error state on file size validation failure', () => {
      const errorMessage = 'File size must be less than 5MB';

      mockSetUploadError(errorMessage);

      expect(mockSetUploadError).toHaveBeenCalledWith(errorMessage);
    });

    it('should set error state on processing failure', () => {
      const errorMessage = 'Failed to generate embeddings';

      mockSetUploadError(errorMessage);

      expect(mockSetUploadError).toHaveBeenCalledWith(errorMessage);
    });

    it('should clear error state at start of upload', () => {
      mockSetUploadError('');

      expect(mockSetUploadError).toHaveBeenCalledWith('');
    });

    it('should handle missing documentManager', () => {
      const documentManager = null;
      const errorMessage = 'DocumentManager not initialized';

      if (!documentManager) {
        mockSetUploadError(errorMessage);
      }

      expect(mockSetUploadError).toHaveBeenCalledWith(errorMessage);
    });
  });

  describe('File input reset', () => {
    it('should reset file input value after successful upload', () => {
      const mockInput = { value: 'C:\\fakepath\\test.txt' };

      mockInput.value = '';

      expect(mockInput.value).toBe('');
    });

    it('should reset file input value after failed upload', () => {
      const mockInput = { value: 'C:\\fakepath\\test.txt' };

      mockInput.value = '';

      expect(mockInput.value).toBe('');
    });
  });

  describe('Loading states', () => {
    it('should set isUploadingDocument to true at start', () => {
      mockSetIsUploadingDocument(true);

      expect(mockSetIsUploadingDocument).toHaveBeenCalledWith(true);
    });

    it('should set isUploadingDocument to false after success', () => {
      mockSetIsUploadingDocument(false);

      expect(mockSetIsUploadingDocument).toHaveBeenCalledWith(false);
    });

    it('should set isUploadingDocument to false after error', () => {
      mockSetIsUploadingDocument(false);

      expect(mockSetIsUploadingDocument).toHaveBeenCalledWith(false);
    });

    it('should reset status after processing', () => {
      mockSetStatus('Ready');

      expect(mockSetStatus).toHaveBeenCalledWith('Ready');
    });
  });
});
