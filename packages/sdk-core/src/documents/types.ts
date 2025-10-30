/**
 * Document Management Types
 * Type definitions for document upload, extraction, and chunking
 * Max 100 lines
 */

/**
 * Supported document types
 */
export type DocumentType = 'txt' | 'md' | 'html' | 'pdf' | 'docx';

/**
 * Document upload result
 */
export interface UploadResult {
  documentId: string;
  s5Path: string;
  metadata: DocumentMetadata;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  uploadedAt: number;
  s5Path: string;
}

/**
 * Upload options
 */
export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  timeout?: number;
  simulateError?: boolean; // For testing
}

/**
 * Upload progress
 */
export interface UploadProgress {
  stage: 'uploading' | 'extracting' | 'chunking' | 'embedding' | 'complete';
  progress: number; // 0-100
  currentStep?: string;
}

/**
 * Batch upload options
 */
export interface BatchOptions {
  continueOnError?: boolean;
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Batch upload progress
 */
export interface BatchProgress {
  completed: number;
  total: number;
  currentFile?: string;
}

/**
 * Batch upload result
 */
export interface BatchResult {
  success: boolean;
  documentId?: string;
  s5Path?: string;
  metadata?: DocumentMetadata;
  error?: string;
}

/**
 * Text extraction result
 */
export interface ExtractionResult {
  text: string;
  metadata: {
    extractedAt: number;
    characterCount: number;
    wordCount: number;
  };
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  chunkSize?: number; // Token count (default 500)
  overlap?: number; // Token count (default 50)
  splitBySentence?: boolean;
  splitByParagraph?: boolean;
}

/**
 * Document chunk
 */
export interface DocumentChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Chunk metadata
 */
export interface ChunkMetadata {
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  index: number;
  startOffset: number;
  endOffset: number;
  tokenCount?: number;
}
