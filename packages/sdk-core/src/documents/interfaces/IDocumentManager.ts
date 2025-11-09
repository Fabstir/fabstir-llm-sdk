// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IDocumentManager Interface (Simplified - No Vector Storage)
 * Interface for document processing: extraction → chunking → embedding → return
 */

import type {
  DocumentType,
  ChunkingOptions,
  UploadOptions,
  BatchOptions
} from '../types.js';

/**
 * Chunk with embedding result
 */
export interface ChunkResult {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    documentId: string;
    documentName: string;
    documentType: DocumentType;
    chunkIndex: number;
    startOffset: number;
    endOffset: number;
  };
}

/**
 * Batch processing result
 */
export interface BatchResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  chunks?: number;
  error?: string;
}

/**
 * Cost estimate
 */
export interface CostEstimate {
  chunkCount: number;
  totalTokens: number;
  estimatedCost: number;
}

/**
 * Document Manager Interface
 *
 * **BREAKING CHANGES (Phase 3, Sub-phase 3.2)**:
 * - Removed vector storage logic (no longer calls VectorRAGManager.addVectors)
 * - Returns ChunkResult[] instead of ProcessResult
 * - Removed tracking of processed documents
 * - Removed dependency on VectorRAGManager and databaseName
 * - Removed listDocuments() and deleteDocument() methods
 *
 * **Migration Guide**:
 * - processDocument() now returns ChunkResult[] directly
 * - Caller is responsible for storing chunks (e.g., via SessionManager.uploadVectors())
 * - No document tracking - each processDocument() call is independent
 * - Use processBatch() for multiple files
 *
 * **Workflow**:
 * 1. Extract text from file
 * 2. Chunk text into smaller pieces
 * 3. Generate embeddings for each chunk
 * 4. Return chunks with embeddings (caller decides what to do with them)
 */
export interface IDocumentManager {
  /**
   * Process a document: extract → chunk → embed → return
   *
   * @param file - File to process
   * @param options - Chunking and progress options
   * @returns Array of ChunkResult objects with embeddings
   *
   * @throws Error if file type unsupported
   * @throws Error if extraction fails
   * @throws Error if embedding service fails
   */
  processDocument(
    file: File,
    options?: ChunkingOptions & UploadOptions & { deduplicateChunks?: boolean }
  ): Promise<ChunkResult[]>;

  /**
   * Process multiple documents
   *
   * @param files - Files to process
   * @param options - Chunking and batch options
   * @returns Array of BatchResult objects
   *
   * @throws Error if continueOnError is false and any file fails
   */
  processBatch(
    files: File[],
    options?: ChunkingOptions & BatchOptions
  ): Promise<BatchResult[]>;

  /**
   * Estimate processing cost
   *
   * Calculates the number of chunks, tokens, and estimated cost for embedding generation.
   * Does not perform actual embedding (dry-run).
   *
   * @param file - File to estimate
   * @param options - Chunking options
   * @returns Cost estimate
   *
   * @throws Error if file type unsupported
   * @throws Error if extraction fails
   */
  estimateCost(
    file: File,
    options?: ChunkingOptions
  ): Promise<CostEstimate>;
}
