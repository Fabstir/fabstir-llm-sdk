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
import type { DatabaseMetadata } from '../../database/types';
import type { PartialRAGConfig } from '../../rag/types';
import type { DiscardUnreadable, MigrationProgress, RagMigrationReport } from '../../storage/sealed/rag-migration';
import type { DocumentStatus, DocumentStatusUpdates } from '../../storage/S5VectorStore';

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
   * Delete — remove — every vector of the session's database whose metadata matches the filter: each key equal to
   * its value (exact match; a vector without metadata matches nothing).
   *
   * @param sessionId - Active session ID
   * @param filter - A non-empty object of defined values
   * @returns Number of vectors deleted
   * @throws SDKError RAG_FILTER_INVALID (not retryable) for `{}`, a value that is `undefined`, or no object — they
   *   would match every vector (lacking the key) — before anything is read (plan §26 GG7)
   */
  deleteByMetadata(
    sessionId: string,
    filter: MetadataFilter
  ): Promise<number>;

  // ===== DEPRECATED METHODS =====
  // These methods are deprecated and will throw errors if called.
  // Kept for interface compatibility during migration.

  /**
   * Create a (sealed) vector database and a RAG session for it — the way to create a database. Throws the store's
   * codes as they are: RAG_DATABASE_EXISTS, STORAGE_OFFLINE, RAG_LOCK_TIMEOUT, … (RAG_SESSION_CREATE_FAILED when a
   * failure brought none).
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

  // ===== Sealed storage (1.39.0) — the UI never writes RAG files itself =====

  /** Add a pending document (same id → replaced; a ready id → RAG_DOCUMENT_ALREADY_READY). */
  addPendingDocument(databaseName: string, doc: { id: string; [key: string]: unknown }): Promise<void>;

  /**
   * Set a document's embedding status; `ready` moves it from pending to ready. Without `databaseName` every
   * database is searched. RAG_DOCUMENT_NOT_FOUND; a database that cannot be read NOW is thrown, not skipped (one
   * that never can — a corrupt legacy manifest, RAG_MANIFEST_CORRUPT — is not listed; the migration report names it).
   */
  updateDocumentStatus(documentId: string, status: DocumentStatus, updates?: DocumentStatusUpdates, databaseName?: string): Promise<void>;

  /** A database's stored metadata, including `pendingDocuments` / `readyDocuments`. RAG_DATABASE_NOT_FOUND. */
  getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata>;

  /**
   * The databases known to this manager — counts only, no document arrays (read those with getDatabaseMetadata() or
   * listAllDatabases()); call refreshDatabases() to see other tabs' changes.
   */
  listDatabases(): DatabaseMetadata[];

  /**
   * Pending documents of one database, or of all; a database that cannot be read NOW is thrown, not skipped (one that
   * never can — a corrupt legacy manifest — is not listed; the migration report names it).
   */
  getPendingDocuments(databaseName?: string): Promise<any[]>;

  /** The in-memory RAG session for a database, created on first use. */
  getOrCreateSessionId(databaseName: string, config?: PartialRAGConfig): Promise<string>;

  /** Remove a document's entry and its body (delete its vectors with deleteByMetadata). */
  removeDocument(databaseName: string, documentId: string): Promise<void>;

  /** Store a document body, sealed. STORAGE_OFFLINE while S5 is disconnected. */
  putDocumentBody(databaseName: string, documentId: string, body: string | Uint8Array): Promise<void>;

  /**
   * A document body with exactly the type and bytes it was stored with — only for a listed document (plan §19 Z11).
   * RAG_DOCUMENT_NOT_FOUND for an id that is not listed; RAG_DOCUMENT_BODY_MISSING for a listed one with no body yet.
   */
  getDocumentBody(databaseName: string, documentId: string): Promise<string | Uint8Array>;

  /** Delete a database and everything under it on S5. */
  deleteDatabase(databaseName: string): Promise<void>;

  /**
   * Re-read the databases from S5 (sees other tabs' and devices' changes). Replaces this manager's list only from
   * a complete one: RAG_DISCOVERY_INCOMPLETE leaves the list as it was. Returns the complete entries read, document
   * arrays included.
   */
  refreshDatabases(): Promise<DatabaseMetadata[]>;

  /** Move legacy plaintext databases to sealed storage and delete the plaintext. Run on every unlock. */
  migrateLegacyRagStorage(opts?: { onProgress?: (e: MigrationProgress) => void; discardUnreadable?: DiscardUnreadable }): Promise<RagMigrationReport>;

  /**
   * Every database, or RAG_DISCOVERY_INCOMPLETE `{ retryable: true, failed: [{ what, code, dbId?, database? }] }` when
   * one could not be read — for decisions on "all" (a partial list is never all). `database` names a legacy database;
   * one whose manifest never reads can be removed with `deleteDatabase(database)` (plan §19 Z7). A permanent failure
   * (a corrupt legacy manifest — RAG_MANIFEST_CORRUPT) is not in `failed`: that database is not listed, and the
   * migration report's failed entry names it (§24 EE10).
   */
  listAllDatabases(): Promise<DatabaseMetadata[]>;

  /** Every call refuses RAG_MANAGER_DISPOSED from the moment this is called (a sign-out calls it — §25 FF1). */
  dispose(): Promise<void>;
}
