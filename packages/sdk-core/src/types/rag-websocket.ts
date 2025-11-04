// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * RAG WebSocket Message Type Definitions
 *
 * TypeScript types for RAG-related WebSocket messages between client and host node.
 * These messages enable client-side document chunking with host-side vector storage and search.
 *
 * Part of Phase 2, Sub-phase 2.1: Add WebSocket Message Type Definitions
 */

/**
 * Vector data structure for RAG operations
 *
 * @property id - Unique identifier for the vector (e.g., "doc_1_chunk_0")
 * @property vector - Embedding vector (384 dimensions for all-MiniLM-L6-v2)
 * @property metadata - Arbitrary metadata attached to the vector (document ID, chunk text, etc.)
 */
export interface Vector {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
}

/**
 * Client → Host: Upload vectors to session memory
 *
 * Sends a batch of vectors to the host node for storage in session memory.
 * Vectors are automatically cleaned up when the WebSocket session ends.
 *
 * @property type - Message type identifier ("uploadVectors")
 * @property requestId - Unique request ID for tracking responses
 * @property vectors - Array of Vector objects to upload (max 1000 per batch)
 * @property replace - If true, replace all existing vectors; if false, append to existing vectors
 */
export interface UploadVectorsMessage {
  type: 'uploadVectors';
  requestId: string;
  vectors: Vector[];
  replace: boolean;
}

/**
 * Host → Client: Upload vectors response
 *
 * Confirms successful upload or reports errors.
 *
 * @property type - Message type identifier ("uploadVectorsResponse")
 * @property requestId - Matches the request ID from UploadVectorsMessage
 * @property status - "success" or "error"
 * @property uploaded - Number of vectors successfully uploaded
 * @property error - Optional error message if status is "error"
 */
export interface UploadVectorsResponse {
  type: 'uploadVectorsResponse';
  requestId: string;
  status: 'success' | 'error';
  uploaded: number;
  error?: string;
}

/**
 * Result from uploadVectors() operation
 *
 * Aggregates results from potentially multiple batches (auto-split at 1000 vectors).
 *
 * @property uploaded - Total number of vectors successfully uploaded across all batches
 * @property rejected - Total number of vectors that failed validation
 * @property errors - Array of error messages for rejected vectors
 */
export interface UploadVectorsResult {
  uploaded: number;
  rejected: number;
  errors: string[];
}

/**
 * Client → Host: Search vectors by similarity
 *
 * Performs cosine similarity search against stored vectors in session memory.
 *
 * @property type - Message type identifier ("searchVectors")
 * @property requestId - Unique request ID for tracking responses
 * @property queryVector - Query embedding vector (384 dimensions)
 * @property k - Number of top results to return
 * @property threshold - Optional minimum similarity score (0.0 to 1.0)
 */
export interface SearchVectorsMessage {
  type: 'searchVectors';
  requestId: string;
  queryVector: number[];
  k: number;
  threshold?: number;
}

/**
 * Search result with similarity score
 *
 * @property id - Vector ID from the stored vector
 * @property vector - The matching vector (384 dimensions)
 * @property metadata - Metadata from the stored vector (document ID, text, etc.)
 * @property score - Cosine similarity score (0.0 to 1.0, higher is more similar)
 */
export interface SearchResult {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
  score: number;
}

/**
 * Host → Client: Search vectors response
 *
 * Returns top-K most similar vectors sorted by descending similarity score.
 *
 * @property type - Message type identifier ("searchVectorsResponse")
 * @property requestId - Matches the request ID from SearchVectorsMessage
 * @property results - Array of SearchResult objects sorted by descending score
 * @property error - Optional error message if search failed
 */
export interface SearchVectorsResponse {
  type: 'searchVectorsResponse';
  requestId: string;
  results: SearchResult[];
  error?: string;
}
