/**
 * Document Manager
 * Orchestrates document processing: extraction → chunking → embedding → vector storage
 * Max 300 lines
 */

import { extractText } from './extractors.js';
import { chunkText } from './chunker.js';
import type {
  DocumentType,
  ChunkingOptions,
  UploadOptions,
  UploadProgress,
  BatchOptions,
  BatchResult
} from './types.js';
import type { EmbeddingService } from '../embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../managers/VectorRAGManager.js';
import type { VectorRecord } from '../rag/types.js';

/**
 * Document processing result
 */
export interface ProcessResult {
  documentId: string;
  chunks: number;
  embeddingsGenerated: boolean;
  vectorsStored: boolean;
  totalTokens?: number;
  cost?: number;
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
 * Document info
 */
export interface DocumentInfo {
  documentId: string;
  name: string;
  type: DocumentType;
  chunks: number;
  processedAt: number;
}

/**
 * Document Manager options
 */
export interface DocumentManagerOptions {
  embeddingService: EmbeddingService;
  vectorManager: VectorRAGManager;
  databaseName: string;
}

/**
 * Document Manager
 * High-level API for document processing and RAG ingestion
 */
export class DocumentManager {
  private embeddingService: EmbeddingService;
  private vectorManager: VectorRAGManager;
  private databaseName: string;
  private processedDocuments: Map<string, DocumentInfo> = new Map();

  constructor(options: DocumentManagerOptions) {
    this.embeddingService = options.embeddingService;
    this.vectorManager = options.vectorManager;
    this.databaseName = options.databaseName;
  }

  /**
   * Process a document: extract → chunk → embed → store
   */
  async processDocument(
    file: File,
    options?: ChunkingOptions & UploadOptions & { deduplicateChunks?: boolean }
  ): Promise<ProcessResult> {
    const documentId = this.generateDocumentId();
    const documentType = this.getDocumentType(file.name);

    try {
      // Stage 1: Extract text
      this.emitProgress(options, { stage: 'extracting', progress: 25 });
      const { text } = await extractText(file, documentType);

      // Stage 2: Chunk text
      this.emitProgress(options, { stage: 'chunking', progress: 50 });
      const chunks = chunkText(text, documentId, file.name, documentType, options);

      // Deduplicate if requested
      const uniqueChunks = options?.deduplicateChunks
        ? this.deduplicateChunks(chunks)
        : chunks;

      // Stage 3: Generate embeddings
      this.emitProgress(options, { stage: 'embedding', progress: 75 });
      const texts = uniqueChunks.map(chunk => chunk.text);
      const embeddingResponse = await this.embeddingService.embedBatch(texts);

      // Stage 4: Store in vector DB
      this.emitProgress(options, { stage: 'embedding', progress: 90 });

      const vectors: VectorRecord[] = embeddingResponse.embeddings.map((embedding, index) => ({
        id: `${documentId}-chunk-${uniqueChunks[index].metadata.index}`,
        values: embedding.embedding,
        metadata: {
          ...uniqueChunks[index].metadata,
          documentId,
          documentName: file.name,
          documentType,
          chunkIndex: uniqueChunks[index].metadata.index,
          text: embedding.text
        }
      }));

      await this.vectorManager.addVectors(this.databaseName, vectors);

      // Stage 5: Complete
      this.emitProgress(options, { stage: 'complete', progress: 100 });

      // Track processed document
      this.processedDocuments.set(documentId, {
        documentId,
        name: file.name,
        type: documentType,
        chunks: uniqueChunks.length,
        processedAt: Date.now()
      });

      return {
        documentId,
        chunks: uniqueChunks.length,
        embeddingsGenerated: true,
        vectorsStored: true,
        totalTokens: embeddingResponse.totalTokens,
        cost: embeddingResponse.cost
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process multiple documents
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
      const batchResults = await Promise.allSettled(
        batch.map(file => this.processDocument(file, options))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push({
            success: true,
            documentId: result.value.documentId,
            metadata: this.processedDocuments.get(result.value.documentId)
          });
        } else {
          if (!options?.continueOnError) {
            throw result.reason;
          }
          results.push({
            success: false,
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
    const costPer1MTokens = this.embeddingService['model']?.includes('openai') ? 0.02 : 0.10;
    const estimatedCost = (totalTokens / 1_000_000) * costPer1MTokens;

    return {
      chunkCount: chunks.length,
      totalTokens,
      estimatedCost
    };
  }

  /**
   * List processed documents
   */
  async listDocuments(): Promise<DocumentInfo[]> {
    return Array.from(this.processedDocuments.values());
  }

  /**
   * Delete document and its vectors
   */
  async deleteDocument(documentId: string): Promise<void> {
    // Delete from vector DB
    if (this.vectorManager.deleteByMetadata) {
      await this.vectorManager.deleteByMetadata(this.databaseName, { documentId });
    }

    // Remove from tracking
    this.processedDocuments.delete(documentId);
  }

  /**
   * Generate unique document ID
   */
  private generateDocumentId(): string {
    return `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get document type from filename
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
   */
  private emitProgress(options: any, progress: UploadProgress): void {
    if (options?.onProgress) {
      options.onProgress(progress);
    }
  }
}
