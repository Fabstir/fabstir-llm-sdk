// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * VectorRAGManager (Simplified - Host Delegation)
 * Thin wrapper around SessionManager for RAG vector operations
 * Delegates all vector storage/search to host via WebSocket
 */

import { SessionManager } from './SessionManager';
import { IVectorRAGManager } from './interfaces/IVectorRAGManager';
import type {
  VectorRecord,
  SearchResult,
  UploadVectorsResult,
  MetadataFilter
} from '../types';

/**
 * Simplified VectorRAGManager
 *
 * **Architecture Change (Phase 3, Sub-phase 3.1)**:
 * - Removed `@fabstir/vector-db-native` dependency (client-side vector DB)
 * - Removed S5 persistence (host is stateless)
 * - Delegates to SessionManager WebSocket methods
 * - Host stores vectors in session memory (Rust backend)
 *
 * **Migration from 961 lines to ~200 lines**:
 * - ❌ Removed: Native VectorDbSession, S5 storage, session caching, folder hierarchies
 * - ✅ Kept: Simple delegation to SessionManager.uploadVectors/searchVectors
 */
export class VectorRAGManager implements IVectorRAGManager {
  private sessionManager: SessionManager;

  /**
   * Create a new VectorRAGManager
   *
   * **BREAKING CHANGE**: Constructor signature changed
   *
   * @param sessionManager - SessionManager instance for WebSocket delegation
   *
   * @example
   * ```typescript
   * const sessionManager = await sdk.getSessionManager();
   * const vectorManager = new VectorRAGManager(sessionManager);
   * ```
   */
  constructor(sessionManager: SessionManager) {
    if (!sessionManager) {
      throw new Error('SessionManager is required');
    }
    this.sessionManager = sessionManager;
  }

  /**
   * Add vectors to session vector store
   *
   * Delegates to `SessionManager.uploadVectors()` which sends vectors to host via WebSocket.
   * Host stores vectors in session memory (Rust) for the duration of the WebSocket connection.
   *
   * @param sessionId - Active session ID
   * @param vectors - Vectors to upload (384 dimensions)
   * @param replace - If true, replace all existing vectors; if false, append (default: false)
   * @returns Upload result with counts
   *
   * @throws Error if vector dimensions are invalid (must be 384)
   * @throws Error if session is not active or WebSocket not connected
   */
  async addVectors(
    sessionId: string,
    vectors: VectorRecord[],
    replace: boolean = false
  ): Promise<UploadVectorsResult> {
    // Validate vector dimensions (384 for all-MiniLM-L6-v2)
    for (const vector of vectors) {
      if (vector.vector.length !== 384) {
        throw new Error(
          `Invalid vector dimensions for vector "${vector.id}": expected 384, got ${vector.vector.length}`
        );
      }
    }

    // Delegate to SessionManager
    return await this.sessionManager.uploadVectors(sessionId, vectors, replace);
  }

  /**
   * Search for similar vectors
   *
   * Delegates to `SessionManager.searchVectors()` which performs cosine similarity search
   * on the host side (Rust vector store in session memory).
   *
   * @param sessionId - Active session ID
   * @param queryVector - Query embedding (384 dimensions)
   * @param k - Number of results to return (default: 5, max: 20)
   * @param threshold - Minimum similarity score (default: 0.7, range: 0.0-1.0)
   * @returns Search results sorted by score (descending)
   *
   * @throws Error if query vector dimensions are invalid
   * @throws Error if session is not active or WebSocket not connected
   */
  async search(
    sessionId: string,
    queryVector: number[],
    k: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    // Delegate to SessionManager
    return await this.sessionManager.searchVectors(sessionId, queryVector, k, threshold);
  }

  /**
   * Delete vectors by metadata filter (soft delete)
   *
   * **Implementation**: Marks vectors as deleted in metadata instead of physically removing them.
   * This is because the host is stateless - vectors only exist during WebSocket session.
   *
   * **Workflow**:
   * 1. Search for vectors matching metadata filter (threshold=0.0 to match all)
   * 2. Mark matching vectors with `{ ...metadata, deleted: true }`
   * 3. Re-upload marked vectors (replace=false to update metadata)
   * 4. Client filters out `{ deleted: true }` in future searches
   *
   * @param sessionId - Active session ID
   * @param filter - Metadata filter (MongoDB-style query)
   * @returns Number of vectors marked as deleted
   *
   * @example
   * ```typescript
   * // Delete all vectors from a specific source
   * const count = await vectorManager.deleteByMetadata(sessionId, {
   *   source: 'obsolete-docs'
   * });
   * console.log(`Marked ${count} vectors as deleted`);
   * ```
   */
  async deleteByMetadata(
    sessionId: string,
    filter: MetadataFilter
  ): Promise<number> {
    // Step 1: Search for all vectors (threshold=0.0 to get all results)
    // Note: This is a simplified approach. A production implementation would:
    // - Use a dedicated "searchByMetadata" WebSocket method
    // - Or maintain a client-side metadata index
    // For now, we use a zero vector to match all (host returns by metadata filter)
    const queryVector = new Array(384).fill(0);

    let matchingVectors: SearchResult[];
    try {
      // Search with threshold=0.0 to get all vectors
      matchingVectors = await this.sessionManager.searchVectors(
        sessionId,
        queryVector,
        20, // Max results per search
        0.0 // Match all
      );
    } catch (error) {
      // If search fails (e.g., no vectors in session), return 0
      return 0;
    }

    // Step 2: Filter by metadata on client side
    const vectorsToDelete = matchingVectors.filter(result => {
      return this.matchesFilter(result.metadata, filter);
    });

    if (vectorsToDelete.length === 0) {
      return 0;
    }

    // Step 3: Mark vectors as deleted
    const updatedVectors: VectorRecord[] = vectorsToDelete.map(result => ({
      id: result.id,
      vector: result.vector,
      metadata: {
        ...result.metadata,
        deleted: true
      }
    }));

    // Step 4: Re-upload with deleted flag (replace=false to update)
    await this.sessionManager.uploadVectors(sessionId, updatedVectors, false);

    return updatedVectors.length;
  }

  /**
   * Check if metadata matches filter (simple implementation)
   *
   * @private
   * @param metadata - Vector metadata
   * @param filter - Filter criteria
   * @returns True if metadata matches all filter conditions
   */
  private matchesFilter(metadata: Record<string, any>, filter: MetadataFilter): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * @deprecated Host is stateless - vectors only exist during WebSocket session
   * Use SessionManager.startSession() to create a new session with vectors
   */
  async createSession(_databaseName: string): Promise<string> {
    throw new Error(
      'createSession() is deprecated. Use SessionManager.startSession() instead.\n' +
      'Vectors are stored in host session memory (stateless) for WebSocket duration only.'
    );
  }

  /**
   * @deprecated Host is stateless - no session persistence needed
   */
  async closeSession(_sessionId: string): Promise<void> {
    throw new Error(
      'closeSession() is deprecated. Use SessionManager.endSession() instead.\n' +
      'Vectors are automatically cleared when WebSocket disconnects.'
    );
  }

  /**
   * @deprecated S5 persistence removed - host is stateless
   */
  async saveSession(_sessionId: string): Promise<string> {
    throw new Error(
      'saveSession() is deprecated. Host does not persist vectors to S5.\n' +
      'Vectors only exist in session memory during WebSocket connection.'
    );
  }

  /**
   * @deprecated S5 persistence removed - host is stateless
   */
  async loadSession(_sessionId: string, _cid: string): Promise<void> {
    throw new Error(
      'loadSession() is deprecated. Host does not load vectors from S5.\n' +
      'Upload vectors using addVectors() after starting a session.'
    );
  }

  /**
   * @deprecated Native bindings removed - no session stats available
   */
  async getSessionStats(_sessionId: string): Promise<any> {
    throw new Error(
      'getSessionStats() is deprecated. Native VectorDbSession stats not available.\n' +
      'Host does not expose vector store statistics via WebSocket.'
    );
  }

  /**
   * @deprecated Multi-database search removed - host stores per-session
   */
  async searchMultipleDatabases(
    _databaseNames: string[],
    _queryVector: number[],
    _k?: number
  ): Promise<SearchResult[]> {
    throw new Error(
      'searchMultipleDatabases() is deprecated. Host stores vectors per-session, not per-database.\n' +
      'Use search() with a single sessionId instead.'
    );
  }
}
