// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Document Manager (Simplified - No Vector Storage)
 * Orchestrates document processing: extraction → chunking → embedding → return chunks
 * Part of Phase 3, Sub-phase 3.2: Simplify DocumentManager (Remove Vector Storage)
 */

import { extractText } from './extractors.js';
import { chunkText } from './chunker.js';
import type {
  DocumentType,
  ChunkingOptions,
  UploadOptions,
  UploadProgress,
  BatchOptions
} from './types.js';
import type { EmbeddingService } from '../embeddings/EmbeddingService.js';
import type {
  IDocumentManager,
  ChunkResult,
  BatchResult,
  CostEstimate
} from './interfaces/IDocumentManager.js';

// Re-export types for backward compatibility
export type { ChunkResult, BatchResult, CostEstimate } from './interfaces/IDocumentManager.js';

/**
 * Document Manager options (simplified)
 */
export interface DocumentManagerOptions {
  embeddingService: EmbeddingService;
}

/**
 * Document Manager (Simplified)
 *
 * **Architecture Change (Phase 3, Sub-phase 3.2)**:
 * - Removed vector storage logic (no longer calls VectorRAGManager.addVectors)
 * - Returns ChunkResult[] instead of ProcessResult
 * - Removed tracking of processed documents
 * - Removed dependency on VectorRAGManager and databaseName
 *
 * **Workflow**:
 * 1. Extract text from file
 * 2. Chunk text into smaller pieces
 * 3. Generate embeddings for each chunk
 * 4. Return chunks with embeddings (caller decides what to do with them)
 */
export class DocumentManager implements IDocumentManager {
  private embeddingService: EmbeddingService;

  constructor(options: DocumentManagerOptions) {
    if (!options.embeddingService) {
      throw new Error('embeddingService is required');
    }
    this.embeddingService = options.embeddingService;
  }

  /**
   * Process a document: extract → chunk → embed → return
   *
   * @param file - File to process
   * @param options - Chunking and progress options
   * @returns Array of ChunkResult objects with embeddings
   */
  async processDocument(
    file: File,
    options?: ChunkingOptions & UploadOptions & { deduplicateChunks?: boolean }
  ): Promise<ChunkResult[]> {
    const documentId = this.generateDocumentId();
    const documentType = this.getDocumentType(file.name);

    try {
      // Stage 1: Extract text (25%)
      this.emitProgress(options, { stage: 'extracting', progress: 25 });
      const { text } = await extractText(file, documentType);

      // Stage 2: Chunk text (50%)
      this.emitProgress(options, { stage: 'chunking', progress: 50 });
      const chunks = chunkText(text, documentId, file.name, documentType, options);

      // Deduplicate if requested
      const uniqueChunks = options?.deduplicateChunks
        ? this.deduplicateChunks(chunks)
        : chunks;

      // Stage 3: Generate embeddings (75%)
      this.emitProgress(options, { stage: 'embedding', progress: 75 });
      const texts = uniqueChunks.map(chunk => chunk.text);
      const embeddingResponse = await this.embeddingService.embedBatch(texts);

      // Stage 4: Build results (100%)
      this.emitProgress(options, { stage: 'embedding', progress: 100 });

      const results: ChunkResult[] = embeddingResponse.embeddings.map((embedding, index) => ({
        id: `${documentId}-chunk-${uniqueChunks[index].metadata.index}`,
        text: embedding.text,
        embedding: embedding.embedding,
        metadata: {
          documentId,
          documentName: file.name,
          documentType,
          chunkIndex: uniqueChunks[index].metadata.index,
          startOffset: uniqueChunks[index].metadata.startOffset,
          endOffset: uniqueChunks[index].metadata.endOffset
        }
      }));

      return results;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process multiple documents
   *
   * @param files - Files to process
   * @param options - Chunking and batch options
   * @returns Array of BatchResult objects
   */
  async processBatch(
    files: File[],
    options?: ChunkingOptions & BatchOptions
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const concurrency = options?.concurrency || 3;

    // Process in batches
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      // Extract chunking options without batch progress callback
      const docOptions = options ? {
        chunkSize: options.chunkSize,
        overlap: options.overlap
      } : undefined;
      const batchResults = await Promise.allSettled(
        batch.map(file => this.processDocument(file, docOptions))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const file = batch[j];

        if (result.status === 'fulfilled') {
          const chunks = result.value;
          results.push({
            success: true,
            documentId: chunks.length > 0 ? chunks[0].metadata.documentId : 'unknown',
            fileName: file.name,
            chunks: chunks.length
          });
        } else {
          if (!options?.continueOnError) {
            throw result.reason;
          }
          results.push({
            success: false,
            fileName: file.name,
            error: result.reason.message
          });
        }
      }

      // Emit batch progress
      if (options?.onProgress) {
        options.onProgress({
          completed: i + batch.length,
          total: files.length,
          currentFile: batch[batch.length - 1].name
        });
      }
    }

    return results;
  }

  /**
   * Estimate processing cost
   *
   * @param file - File to estimate
   * @param options - Chunking options
   * @returns Cost estimate
   */
  async estimateCost(
    file: File,
    options?: ChunkingOptions
  ): Promise<CostEstimate> {
    const documentType = this.getDocumentType(file.name);
    const { text } = await extractText(file, documentType);

    const documentId = 'estimate';
    const chunks = chunkText(text, documentId, file.name, documentType, options);

    // Estimate tokens (rough: 1 word ≈ 1.3 tokens)
    const totalTokens = chunks.reduce((sum, chunk) => {
      const wordCount = chunk.text.split(/\s+/).length;
      return sum + Math.ceil(wordCount * 1.3);
    }, 0);

    // Get cost per 1M tokens from embedding service
    const costPer1MTokens = (this.embeddingService as any).model?.includes('openai') ? 0.02 : 0.10;
    const estimatedCost = (totalTokens / 1_000_000) * costPer1MTokens;

    return {
      chunkCount: chunks.length,
      totalTokens,
      estimatedCost
    };
  }

  /**
   * Generate unique document ID
   * @private
   */
  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get document type from filename
   * @private
   */
  private getDocumentType(filename: string): DocumentType {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt':
        return 'txt';
      case 'md':
        return 'md';
      case 'html':
      case 'htm':
        return 'html';
      case 'pdf':
        return 'pdf';
      case 'docx':
        return 'docx';
      default:
        return 'txt';
    }
  }

  /**
   * Deduplicate chunks by text content
   * @private
   */
  private deduplicateChunks(chunks: any[]): any[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      if (seen.has(chunk.text)) {
        return false;
      }
      seen.add(chunk.text);
      return true;
    });
  }

  /**
   * Emit progress update
   * @private
   */
  private emitProgress(options: any, progress: UploadProgress): void {
    if (options?.onProgress) {
      options.onProgress(progress);
    }
  }
}
