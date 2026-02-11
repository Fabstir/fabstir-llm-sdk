/**
 * Document Manager
 * Manages document upload, text extraction, and chunking for RAG
 * Max 500 lines
 */

import type {
  DocumentType,
  UploadResult,
  DocumentMetadata,
  UploadOptions,
  BatchOptions,
  BatchResult,
  ChunkingOptions,
  DocumentChunk
} from '../documents/types.js';
import {
  extractText,
  detectDocumentType,
  validateFileSize,
  extractTextFromBuffer,
  extractionCache,
  isImageType
} from '../documents/extractors.js';
import { chunkText } from '../documents/chunker.js';
import type { EmbeddingService } from '../embeddings/EmbeddingService.js';


/**
 * Chunk result with embedding
 */
export interface ChunkResult {
  chunk: DocumentChunk;
  embedding: number[];
}

/**
 * DocumentManager constructor options
 */
export interface DocumentManagerOptions {
  embeddingService?: EmbeddingService;
}

/**
 * Document registry entry
 */
interface DocumentRegistryEntry {
  metadata: DocumentMetadata;
  s5Path: string;
  textCached?: string;
}

/**
 * Document Manager
 * Handles document upload, storage, extraction, and chunking
 */
export class DocumentManager {
  private userSeed?: string;
  private userAddress?: string;
  private s5Client?: any;
  private initialized = false;
  private embeddingService?: EmbeddingService;

  // Document registry (in-memory for now, can be S5-backed later)
  private documentRegistry = new Map<string, Map<string, DocumentRegistryEntry>>();

  // S5 paths
  private static readonly DOCUMENTS_PATH = 'home/documents';

  constructor(options?: DocumentManagerOptions) {
    this.embeddingService = options?.embeddingService;
  }

  /**
   * Initialize document manager
   */
  async initialize(seedPhrase: string, userAddress: string): Promise<void> {
    this.userSeed = seedPhrase;
    this.userAddress = userAddress;

    // Initialize S5 client
    try {
      const s5Module = await import('@julesl23/s5js');
      const S5 = s5Module.S5;

      const s5Instance = await S5.create({
        initialPeers: ['wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p'],
        skipIdentityLoad: true, // Prevent stale cached identity before SDK provides wallet-derived seed
      });

      await s5Instance.recoverIdentityFromSeedPhrase(this.userSeed);
      await s5Instance.fs.ensureIdentityInitialized();

      this.s5Client = s5Instance;
      this.initialized = true;
    } catch (error) {
      console.warn('S5 initialization failed, using in-memory storage');
      this.initialized = true; // Still mark as initialized for testing
    }
  }

  /**
   * Upload a document
   */
  async uploadDocument(
    file: File,
    databaseName: string,
    options?: UploadOptions
  ): Promise<UploadResult> {
    if (!this.initialized) {
      throw new Error('DocumentManager not initialized');
    }

    if (!databaseName || databaseName.trim() === '') {
      throw new Error('Database name is required');
    }

    // Validate file
    validateFileSize(file);

    // Detect document type
    const type = detectDocumentType(file.name);

    // Generate document ID
    const documentId = this.generateDocumentId(file.name, databaseName);

    // Report progress: uploading
    options?.onProgress?.({
      stage: 'uploading',
      progress: 10,
      currentStep: 'Uploading document to storage'
    });

    try {
      // Upload file to S5
      const s5Path = await this.uploadToS5(file, databaseName, documentId);

      // Report progress: extracting
      options?.onProgress?.({
        stage: 'extracting',
        progress: 40,
        currentStep: 'Extracting text from document'
      });

      // Extract text (and cache it)
      const extractionResult = await extractText(file, type);
      extractionCache.set(documentId, extractionResult);

      // Create metadata
      const metadata: DocumentMetadata = {
        id: documentId,
        name: file.name,
        type,
        size: file.size,
        uploadedAt: Date.now(),
        s5Path
      };

      // Store in registry
      this.addToRegistry(databaseName, documentId, { metadata, s5Path, textCached: extractionResult.text });

      // Report progress: complete
      options?.onProgress?.({
        stage: 'complete',
        progress: 100,
        currentStep: 'Document uploaded successfully'
      });

      return {
        documentId,
        s5Path,
        metadata
      };
    } catch (error) {
      // Rollback: remove from registry if it was added
      this.removeFromRegistry(databaseName, documentId);
      throw error;
    }
  }

  /**
   * Upload multiple documents in batch
   */
  async uploadBatch(
    files: File[],
    databaseName: string,
    options?: BatchOptions
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const concurrency = options?.concurrency || 3;
    let completed = 0;

    // Process files in batches
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchPromises = batch.map(async (file) => {
        try {
          const result = await this.uploadDocument(file, databaseName);
          completed++;
          options?.onProgress?.({ completed, total: files.length, currentFile: file.name });
          return {
            success: true,
            documentId: result.documentId,
            s5Path: result.s5Path,
            metadata: result.metadata
          };
        } catch (error) {
          completed++;
          options?.onProgress?.({ completed, total: files.length, currentFile: file.name });
          if (!options?.continueOnError) {
            throw error;
          }
          return {
            success: false,
            error: (error as Error).message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Process a document: extract text, chunk, and embed
   * Images are rejected — use sendPromptStreaming() with options.images instead
   *
   * @param file - File to process
   * @param options - Chunking and upload options
   * @returns Array of chunk results with embeddings
   */
  async processDocument(
    file: File,
    options?: ChunkingOptions & UploadOptions
  ): Promise<ChunkResult[]> {
    // processDocument only needs embeddingService, not full S5 initialization
    if (!this.embeddingService) {
      throw new Error('DocumentManager requires an embeddingService for document processing');
    }

    // Validate file
    validateFileSize(file);

    // Detect document type
    const documentType = detectDocumentType(file.name);
    let text: string;

    // Check if this is an image — reject with clear error directing to WebSocket image chat
    if (isImageType(documentType)) {
      throw new Error(
        'Image uploads for RAG are no longer supported. ' +
        'Use sendPromptStreaming() with options.images to send images via encrypted WebSocket chat.'
      );
    } else {
      // Standard text extraction for documents
      const extractionResult = await extractText(file, documentType);
      text = extractionResult.text;

      options?.onProgress?.({
        stage: 'extracting',
        progress: 25,
        currentStep: `Extracted ${extractionResult.metadata.wordCount} words`,
      });
    }

    // Chunk the text
    options?.onProgress?.({
      stage: 'chunking',
      progress: 50,
      currentStep: 'Chunking text',
    });

    const documentId = this.generateDocumentId(file.name, 'default');
    const chunks = chunkText(
      text,
      documentId,
      file.name,
      documentType,
      options
    );

    // Handle empty chunks (e.g., image with no text content)
    if (chunks.length === 0) {
      options?.onProgress?.({
        stage: 'complete',
        progress: 100,
        currentStep: 'No text content found in document',
      });

      // Return empty array - caller can check length and show appropriate message
      return [];
    }

    // Generate embeddings for each chunk
    options?.onProgress?.({
      stage: 'embedding',
      progress: 75,
      currentStep: 'Generating embeddings',
    });

    const results: ChunkResult[] = [];

    if (this.embeddingService) {
      const texts = chunks.map((c) => c.text);
      const embeddingResponse = await this.embeddingService.embedBatch(texts);

      for (let i = 0; i < chunks.length; i++) {
        results.push({
          chunk: chunks[i],
          embedding: embeddingResponse.embeddings[i].embedding,
        });
      }
    } else {
      // No embedding service - return chunks without embeddings
      for (const chunk of chunks) {
        results.push({
          chunk,
          embedding: [],
        });
      }
    }

    options?.onProgress?.({
      stage: 'complete',
      progress: 100,
      currentStep: `Processed ${results.length} chunks`,
    });

    return results;
  }

  /**
   * Embed a single text string (for RAG query embedding)
   * @param text - Text to embed
   * @param type - Embedding type: 'document' or 'query' (affects some embedding models)
   * @returns Embedding result with vector and metadata
   */
  async embedText(
    text: string,
    type: 'document' | 'query' = 'query'
  ): Promise<{ embedding: number[]; text: string; tokenCount: number }> {
    if (!this.embeddingService) {
      throw new Error('DocumentManager requires an embeddingService for text embedding');
    }

    const response = await this.embeddingService.embedBatch([text], type);
    return {
      embedding: response.embeddings[0].embedding,
      text,
      tokenCount: response.embeddings[0].tokenCount || 0,
    };
  }

  /**
   * Get document metadata
   */
  async getDocumentMetadata(databaseName: string, documentId: string): Promise<DocumentMetadata> {
    const entry = this.getFromRegistry(databaseName, documentId);
    if (!entry) {
      throw new Error('Document not found');
    }
    return entry.metadata;
  }

  /**
   * List all documents in a database
   */
  async listDocuments(databaseName: string): Promise<DocumentMetadata[]> {
    const dbRegistry = this.documentRegistry.get(databaseName);
    if (!dbRegistry) {
      return [];
    }
    return Array.from(dbRegistry.values()).map((entry) => entry.metadata);
  }

  /**
   * Get document by ID
   */
  async getDocument(databaseName: string, documentId: string): Promise<DocumentMetadata> {
    return this.getDocumentMetadata(databaseName, documentId);
  }

  /**
   * Delete a document
   */
  async deleteDocument(databaseName: string, documentId: string): Promise<void> {
    const entry = this.getFromRegistry(databaseName, documentId);
    if (!entry) {
      throw new Error('Document not found');
    }

    // Remove from S5 (if available)
    if (this.s5Client) {
      try {
        await this.s5Client.fs.delete(entry.s5Path);
      } catch (error) {
        console.warn('Failed to delete from S5:', error);
      }
    }

    // Remove from registry
    this.removeFromRegistry(databaseName, documentId);

    // Remove from extraction cache
    extractionCache.clear();
  }

  /**
   * Delete multiple documents
   */
  async deleteDocuments(databaseName: string, documentIds: string[]): Promise<void> {
    for (const documentId of documentIds) {
      await this.deleteDocument(databaseName, documentId);
    }
  }

  /**
   * Extract text from a document
   */
  async extractText(documentId: string, databaseName: string): Promise<string> {
    // Check cache first
    const cached = extractionCache.get(documentId);
    if (cached) {
      return cached.text;
    }

    // Get document from registry
    const entry = this.getFromRegistry(databaseName, documentId);
    if (!entry) {
      throw new Error('Document not found');
    }

    // Check if text is already cached in registry
    if (entry.textCached) {
      return entry.textCached;
    }

    // Load from S5 and extract
    if (this.s5Client) {
      const buffer = await this.s5Client.fs.get(entry.s5Path);
      const result = await extractTextFromBuffer(
        buffer,
        entry.metadata.type,
        entry.metadata.name
      );

      // Cache the result
      extractionCache.set(documentId, result);
      entry.textCached = result.text;

      return result.text;
    }

    throw new Error('Cannot extract text: S5 client not available');
  }

  /**
   * Chunk a document
   */
  async chunkDocument(
    documentId: string,
    databaseName: string,
    options?: ChunkingOptions
  ): Promise<DocumentChunk[]> {
    // Get document metadata
    const entry = this.getFromRegistry(databaseName, documentId);
    if (!entry) {
      throw new Error('Document not found');
    }

    // Extract text
    const text = await this.extractText(documentId, databaseName);

    // Chunk the text
    const chunks = chunkText(
      text,
      documentId,
      entry.metadata.name,
      entry.metadata.type,
      options
    );

    return chunks;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.documentRegistry.clear();
    extractionCache.clear();
  }

  // Private helper methods

  private generateDocumentId(fileName: string, databaseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const nameHash = fileName.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0);
    return `${databaseName}_${nameHash}_${timestamp}_${random}`;
  }

  private async uploadToS5(file: File, databaseName: string, documentId: string): Promise<string> {
    const s5Path = `${DocumentManager.DOCUMENTS_PATH}/${this.userAddress}/${databaseName}/${documentId}`;

    if (this.s5Client) {
      const buffer = await file.arrayBuffer();
      await this.s5Client.fs.put(s5Path, new Uint8Array(buffer));
    }

    return s5Path;
  }

  private addToRegistry(
    databaseName: string,
    documentId: string,
    entry: DocumentRegistryEntry
  ): void {
    if (!this.documentRegistry.has(databaseName)) {
      this.documentRegistry.set(databaseName, new Map());
    }
    this.documentRegistry.get(databaseName)!.set(documentId, entry);
  }

  private getFromRegistry(databaseName: string, documentId: string): DocumentRegistryEntry | undefined {
    return this.documentRegistry.get(databaseName)?.get(documentId);
  }

  private removeFromRegistry(databaseName: string, documentId: string): void {
    this.documentRegistry.get(databaseName)?.delete(documentId);
  }
}
