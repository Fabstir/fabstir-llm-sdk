// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IVectorRAGManager Interface (Simplified - Host Delegation)
 * Interface for WebSocket-delegated vector operations
 */

import type {
  VectorRecord,
  SearchResult,
  UploadVectorsResult,
  MetadataFilter
} from '../../types';

/**
 * Vector RAG Manager Interface
 *
 * **BREAKING CHANGES (Phase 3, Sub-phase 3.1)**:
 * - Removed `@fabstir/vector-db-native` dependency
 * - Removed S5 persistence (saveSession/loadSession)
 * - Removed session management (createSession/closeSession)
 * - Removed statistics (getSessionStats)
 * - Delegates all operations to SessionManager WebSocket methods
 *
 * **Migration Guide**:
 * - Use `SessionManager.startSession()` instead of `createSession()`
 * - Use `SessionManager.endSession()` instead of `closeSession()`
 * - No persistence needed - host stores vectors in session memory only
 * - No statistics available - host does not expose vector store stats
 */
export interface IVectorRAGManager {
  /**
   * Add vectors to session vector store
   *
   * Delegates to `SessionManager.uploadVectors()`.
   * Host stores vectors in session memory (Rust) for WebSocket duration.
   *
   * @param sessionId - Active session ID
   * @param vectors - Vectors to upload (384 dimensions)
   * @param replace - If true, replace all existing vectors (default: false)
   * @returns Upload result with uploaded/rejected counts
   *
   * @throws Error if vector dimensions invalid (must be 384)
   * @throws Error if session not active or WebSocket not connected
   */
  addVectors(
    sessionId: string,
    vectors: VectorRecord[],
    replace?: boolean
  ): Promise<UploadVectorsResult>;

  /**
   * Search for similar vectors
   *
   * Delegates to `SessionManager.searchVectors()`.
   * Performs cosine similarity search on host side (Rust vector store).
   *
   * @param sessionId - Active session ID
   * @param queryVector - Query embedding (384 dimensions)
   * @param k - Number of results (default: 5, max: 20)
   * @param threshold - Minimum similarity score (default: 0.7, range: 0.0-1.0)
   * @returns Search results sorted by score (descending)
   *
   * @throws Error if query vector dimensions invalid
   * @throws Error if session not active or WebSocket not connected
   */
  search(
    sessionId: string,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]>;

  /**
   * Delete vectors by metadata filter (soft delete)
   *
   * Marks vectors as deleted in metadata instead of physically removing them.
   * Client filters out `{ deleted: true }` in future searches.
   *
   * @param sessionId - Active session ID
   * @param filter - Metadata filter (MongoDB-style query)
   * @returns Number of vectors marked as deleted
   */
  deleteByMetadata(
    sessionId: string,
    filter: MetadataFilter
  ): Promise<number>;

  // ===== DEPRECATED METHODS =====
  // These methods are deprecated and will throw errors if called.
  // Kept for interface compatibility during migration.

  /**
   * @deprecated Use SessionManager.startSession() instead
   * @throws Error explaining deprecation
   */
  createSession(databaseName: string): Promise<string>;

  /**
   * @deprecated Use SessionManager.endSession() instead
   * @throws Error explaining deprecation
   */
  closeSession(sessionId: string): Promise<void>;

  /**
   * @deprecated S5 persistence removed - host is stateless
   * @throws Error explaining deprecation
   */
  saveSession(sessionId: string): Promise<string>;

  /**
   * @deprecated S5 persistence removed - host is stateless
   * @throws Error explaining deprecation
   */
  loadSession(sessionId: string, cid: string): Promise<void>;

  /**
   * @deprecated Native bindings removed - no session stats available
   * @throws Error explaining deprecation
   */
  getSessionStats(sessionId: string): Promise<any>;
}
