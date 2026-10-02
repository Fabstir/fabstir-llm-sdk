// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * VectorRAGManager (Hybrid Architecture)
 * Client-side database management + host-side search delegation
 *
 * Architecture:
 * - Client-side: S5VectorStore for persistent storage in S5 (browser-compatible, ~5KB)
 * - Host-side: SessionManager for stateless search operations (Rust)
 */

import { S5VectorStore, assertVectorList, type DocumentStatus, type DocumentStatusUpdates } from '../storage/S5VectorStore';
import { retryableOf, type PathToHash } from '../storage/sealed/sealed-io';
import type { RagCoherence } from '../storage/sealed/rag-coherence';
import type { DiscardUnreadable, MigrationProgress, RagMigrationReport } from '../storage/sealed/rag-migration';
import type { S5 } from '@julesl23/s5js';
import { SessionManager } from './SessionManager';
import { EncryptionManager } from './EncryptionManager';
import { IVectorRAGManager } from './interfaces/IVectorRAGManager';
import { RAGConfig, PartialRAGConfig, VectorRecord, SearchResult, SearchResultWithSource } from '../rag/types';
import { validateRAGConfig, mergeRAGConfig } from '../rag/config';
import { SessionCache } from '../rag/session-cache';
import { DatabaseMetadataService } from '../database/DatabaseMetadataService';
import type { DatabaseMetadata } from '../database/types';
import { PermissionManager } from '../permissions/PermissionManager';
import type { Vector, VectorDatabaseMetadata, FolderStats } from '../types';
import { SDKError } from '../types';

/**
 * Session status
 */
type SessionStatus = 'active' | 'closed' | 'unknown';

/**
 * Internal session object
 */
interface Session {
  sessionId: string;
  databaseName: string;
  status: SessionStatus;
  createdAt: number;
  lastAccessedAt: number;
  config: RAGConfig;
  folderPaths: Set<string>; // Track unique folder paths
}

/**
 * Database statistics
 */
export interface DatabaseStats {
  databaseName: string;
  vectorCount: number;
  storageSizeBytes: number;
  sessionCount: number;
}

/**
 * A store write, settled so this manager's bookkeeping runs for every write that landed (§35 PP3): resolves to its
 * value and, for one that landed but whose head this tab could not record (`committed: true`, §34 OO4), its error — the
 * caller throws it once its own state reflects the write — with the value the error carries (`details.result`, §37
 * RR2). Rejects with any other failure.
 */
async function landedWrite<T>(write: Promise<T>): Promise<{ value: T; unrecorded?: SDKError }> {
  try {
    return { value: await write };
  } catch (error: any) {
    if (error?.details?.committed !== true) throw error;
    return { value: error.details.result as T, unrecorded: error };
  }
}

/**
 * Vector RAG Manager (Hybrid)
 * Manages client-side vector databases with host-side search
 */
export class VectorRAGManager implements IVectorRAGManager {
  public readonly userAddress: string;
  public readonly config: RAGConfig;
  private readonly seedPhrase: string;
  private readonly metadataService: DatabaseMetadataService;
  private readonly permissionManager?: PermissionManager;
  private readonly sessionManager: SessionManager;
  private readonly vectorStore: S5VectorStore;
  private sessions: Map<string, Session>;
  private sessionCache: SessionCache<Session>;
  private dbNameToSessionId: Map<string, string>;
  private disposed: boolean = false;

  /**
   * Create a new VectorRAGManager
   *
   * @param options - Manager options
   */
  constructor(options: {
    userAddress: string;
    seedPhrase: string;
    config: RAGConfig;
    sessionManager: SessionManager;
    s5Client: S5;
    encryptionManager: EncryptionManager;
    metadataService?: DatabaseMetadataService;
    permissionManager?: PermissionManager;
    /** S5 connection state — RAG writes fail fast with STORAGE_OFFLINE while it reports offline. */
    isOnline?: () => boolean;
    /** Injected in tests; production resolves `FS5Advanced.pathToCID`. */
    pathToHash?: PathToHash;
    /** Injected in tests; production uses Web Locks + IndexedDB (browser) or an in-process lock. */
    coherence?: RagCoherence;
  }) {
    // Validate required fields
    if (!options.userAddress) {
      throw new SDKError('userAddress is required', 'RAG_MANAGER_MISCONFIGURED', { retryable: false });
    }
    if (!options.seedPhrase) {
      throw new SDKError('seedPhrase is required', 'RAG_MANAGER_MISCONFIGURED', { retryable: false });
    }
    if (!options.sessionManager) {
      throw new SDKError('sessionManager is required', 'RAG_MANAGER_MISCONFIGURED', { retryable: false });
    }
    if (!options.s5Client) {
      throw new SDKError('s5Client is required', 'RAG_MANAGER_MISCONFIGURED', { retryable: false });
    }
    if (!options.encryptionManager) {
      throw new SDKError('encryptionManager is required', 'RAG_MANAGER_MISCONFIGURED', { retryable: false });
    }

    // Validate configuration
    validateRAGConfig(options.config);

    this.userAddress = options.userAddress;
    this.seedPhrase = options.seedPhrase;
    this.config = options.config;
    this.sessionManager = options.sessionManager;
    this.metadataService = options.metadataService || new DatabaseMetadataService();
    this.permissionManager = options.permissionManager;
    this.sessions = new Map();
    this.sessionCache = new SessionCache<Session>(50);
    this.dbNameToSessionId = new Map();

    // Initialize S5VectorStore (shared across all sessions)
    this.vectorStore = new S5VectorStore({
      s5Client: options.s5Client,
      userAddress: options.userAddress,
      encryptionManager: options.encryptionManager,
      isOnline: options.isOnline,
      pathToHash: options.pathToHash,
      coherence: options.coherence,
    });
  }

  /**
   * Initialize the VectorRAGManager by loading existing databases from S5 storage
   *
   * IMPORTANT: This method MUST be called after construction to load existing vector databases
   * from S5 storage. Without this call, listDatabases() will return an empty array even when
   * databases exist.
   *
   * This method should be called once after creating the VectorRAGManager instance:
   * ```typescript
   * const vectorRAGManager = new VectorRAGManager(options);
   * await vectorRAGManager.initialize();
   * ```
   */
  async initialize(): Promise<void> {
    this.ensureNotDisposed();
    console.log('[VectorRAGManager] Initialize called - about to call vectorStore.initialize()');
    await this.vectorStore.initialize();
    console.log('[VectorRAGManager] ✅ VectorStore initialized');

    // Populate metadataService from loaded databases
    const loadedDatabases = await this.vectorStore.listDatabases();
    for (const db of loadedDatabases) this.mirror(db);
    console.log(`[VectorRAGManager] ✅ Populated metadata for ${loadedDatabases.length} existing database(s)`);
  }

  /**
   * Create a new vector database session (client-side)
   * This creates a persistent vector database using S5VectorStore
   */
  async createSession(databaseName: string, config?: PartialRAGConfig): Promise<string> {
    this.ensureNotDisposed();

    // An empty name cannot be listed; a blank one is the store's to refuse — only where it is not listed (§24 EE6).
    if (typeof databaseName !== 'string' || databaseName === '') {
      throw new SDKError('Database name cannot be empty', 'RAG_DATABASE_NAME_INVALID', { database: databaseName, retryable: false });
    }

    // Merge config with defaults
    const sessionConfig = config ? mergeRAGConfig({ ...this.config, ...config }) : this.config;

    // Generate unique session ID
    const sessionId = `rag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create database in S5VectorStore (client-side storage)
      console.log(`[Enhanced S5.js] Creating sealed vector database "${databaseName}"`);
      const { unrecorded } = await landedWrite(this.vectorStore.createDatabase({
        name: databaseName,
        owner: this.userAddress,
        description: sessionConfig.description
      }));
      console.log(`[Enhanced S5.js] Vector database created successfully`);

      // Create session object
      const session: Session = {
        sessionId,
        databaseName,
        status: 'active',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        config: sessionConfig,
        folderPaths: new Set<string>()
      };

      // Store session
      this.sessions.set(sessionId, session);
      this.sessionCache.set(sessionId, session);
      this.dbNameToSessionId.set(databaseName, sessionId);

      // Initialize database metadata if this is the first session for this database
      if (!this.metadataService.exists(databaseName)) {
        this.metadataService.create(databaseName, 'vector', this.userAddress);
      } else {
        // Database exists - check user has at least read access
        this.checkPermission(databaseName, 'read');
      }

      // Created, its head not recorded: the session is open all the same — its id rides the error (§35 PP3).
      if (unrecorded) throw new SDKError(unrecorded.message, unrecorded.code, { ...unrecorded.details, sessionId, retryable: false });
      return sessionId;
    } catch (error) {
      // Coded failures (RAG_DATABASE_EXISTS, STORAGE_OFFLINE, RAG_LOCK_TIMEOUT, …) reach the caller as they are (S4).
      if (typeof (error as { code?: unknown })?.code === 'string') throw error;
      throw new SDKError(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`, 'RAG_SESSION_CREATE_FAILED', { cause: error, retryable: retryableOf(error) });
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    this.ensureNotDisposed();
    // Try cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.lastAccessedAt = Date.now();
      return cached;
    }

    // Try main store
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessedAt = Date.now();
      this.sessionCache.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * Get existing session ID for a database, or create a new one if it doesn't exist
   *
   * @param databaseName - Database name
   * @param config - Optional RAG configuration for new session
   * @returns Session ID
   */
  async getOrCreateSessionId(databaseName: string, config?: PartialRAGConfig): Promise<string> {
    this.ensureNotDisposed();

    // Check if session already exists for this database
    let sessionId = this.dbNameToSessionId.get(databaseName);
    if (sessionId) {
      return sessionId;
    }

    // Create new session (will reuse existing database if it exists)
    try {
      sessionId = await this.createSession(databaseName, config);
      return sessionId;
    } catch (error: any) {
      // If database already exists, just create a session without creating database
      if (error?.code === 'RAG_DATABASE_EXISTS') {
        // Another tab or device may have made it: this manager's list learns it now (§24 EE6).
        const existing = await this.vectorStore.getDatabase(databaseName);
        if (existing) this.mirror(existing);

        // Generate unique session ID
        sessionId = `rag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Merge config with defaults
        const sessionConfig = config ? mergeRAGConfig({ ...this.config, ...config }) : this.config;

        // Create session object
        const session: Session = {
          sessionId,
          databaseName,
          status: 'active',
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
          config: sessionConfig,
          folderPaths: new Set<string>()
        };

        // Store session
        this.sessions.set(sessionId, session);
        this.sessionCache.set(sessionId, session);
        this.dbNameToSessionId.set(databaseName, sessionId);

        return sessionId;
      }
      throw error;
    }
  }

  /**
   * List all active sessions
   */
  listSessions(databaseName?: string): Session[] {
    this.ensureNotDisposed();
    const allSessions = Array.from(this.sessions.values());

    if (databaseName) {
      return allSessions.filter(s => s.databaseName === databaseName);
    }

    return allSessions;
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    this.ensureNotDisposed();
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }

    session.status = 'closed';
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    this.ensureNotDisposed();
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }

    // S5VectorStore auto-saves - no cleanup needed
    // Update status and remove from caches
    session.status = 'closed';
    this.sessionCache.delete(sessionId);
    this.sessions.delete(sessionId);
    this.dbNameToSessionId.delete(session.databaseName);
  }

  /**
   * Add vectors to client-side storage
   * Stores vectors in S5 via S5VectorStore
   *
   * @throws SDKError RAG_VECTORS_INVALID (not retryable) unless `vectors` is a dense list of
   *   `{ id: string, vector: number[], metadata? }` — a typed array: `Array.from` it (§38 SS3, §39 TT4)
   * @throws SDKError RAG_DATABASE_MOVED (retryable) — a legacy database another device moved, changed or deleted, or
   *   an outdated tab of this browser rewrote, under this write: nothing was committed — retry (RAG_DATABASE_NOT_FOUND
   *   after a delete); it repeats while an outdated tab keeps writing (§39 TT2, §40 UU1, §41 VV4). Every write to a
   *   legacy database, and a read of one, can answer it.
   */
  async addVectors(sessionId: string, vectors: VectorRecord[]): Promise<void> {
    this.ensureNotDisposed();
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }
    if (session.status !== 'active') {
      throw new SDKError('Session is closed', 'RAG_SESSION_CLOSED', { retryable: false });
    }

    // Check write permission
    this.checkPermission(session.databaseName, 'write');
    assertVectorList(session.databaseName, vectors); // coded, before anything reads them (§38 SS3)

    // Validate vector dimensions (S5VectorStore also validates, but check here for better error messages)
    if (vectors.length > 0) {
      const expectedDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== expectedDim) {
          throw new SDKError(`Vector dimension mismatch (expected ${expectedDim}, got ${vec.vector.length})`, 'RAG_VECTOR_DIMENSION_MISMATCH', {
            database: session.databaseName, expected: expectedDim, got: vec.vector.length, retryable: false,
          });
        }
      }
    }

    // Add vectors to S5VectorStore (auto-saved)
    if (vectors.length > 0) {
      const dimension = vectors[0].vector.length;
      console.log(`[Enhanced S5.js] Storing ${vectors.length} vector embeddings: Float32Array[${dimension}]`);
    }
    const { value: vectorCount, unrecorded } = await landedWrite(this.vectorStore.addVectors(session.databaseName, vectors));
    session.lastAccessedAt = Date.now();

    // The committed count, from the write itself — also one that landed with its head not recorded: no second read to
    // fail after a write that landed (§36 QQ4, §37 RR2).
    console.log(`[Enhanced S5.js] Vector database now has ${vectorCount} embeddings`);
    this.metadataService.upsert(session.databaseName, 'vector', this.userAddress, { vectorCount });
    if (unrecorded) throw unrecorded;
  }

  /**
   * Convenience method: Add a single vector
   */
  async addVector(
    dbName: string,
    id: string,
    values: number[],
    metadata: Record<string, any> = {}
  ): Promise<void> {
    this.ensureNotDisposed();
    // Get or create session
    let sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) {
      sessionId = await this.createSession(dbName);
    }

    const vectorRecord: VectorRecord = {
      id,
      vector: values,
      metadata
    };

    await this.addVectors(sessionId, [vectorRecord]);
  }

  /**
   * Search vectors using host-side search (delegated to SessionManager)
   *
   * This method delegates to SessionManager which performs search on the host via WebSocket.
   * Vectors must first be uploaded to the host session using SessionManager.uploadVectors().
   *
   * @param sessionId - Host session ID (NOT VectorRAGManager sessionId)
   * @param queryVector - Query embedding
   * @param topK - Number of results
   * @param threshold - Similarity threshold
   * @returns Search results from host
   */
  async search(
    sessionId: string,
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    this.ensureNotDisposed();
    // Delegate to SessionManager for host-side search
    return await this.sessionManager.searchVectors(sessionId, queryVector, topK, threshold);
  }

  /**
   * Alias for search() - for backward compatibility
   */
  async searchVectors(
    sessionId: string,
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    this.ensureNotDisposed();
    return await this.search(sessionId, queryVector, topK, threshold);
  }

  /**
   * Delete vectors by IDs — one write for the whole list: it lands whole or not at all, and a `committed: true` covers
   * every id (§36 QQ1). An id that is not there is no error; an empty list writes nothing (§37 RR3).
   *
   * @throws SDKError RAG_VECTOR_IDS_INVALID (not retryable) unless `vectorIds` is an array (a Set: `Array.from(ids)`)
   */
  async deleteVectors(sessionId: string, vectorIds: string[]): Promise<void> {
    this.ensureNotDisposed();
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }
    if (session.status !== 'active') {
      throw new SDKError('Session is closed', 'RAG_SESSION_CLOSED', { retryable: false });
    }

    // One write for them all (§36 QQ1): a write that lands says so for every id.
    await this.vectorStore.deleteVectors(session.databaseName, vectorIds);
    session.lastAccessedAt = Date.now();
  }

  /**
   * Delete vectors by metadata filter (client-side storage): an exact key/value match.
   * @throws SDKError RAG_FILTER_INVALID (not retryable) unless the filter is a non-empty object of defined values
   */
  async deleteByMetadata(sessionId: string, filter: Record<string, any>): Promise<number> {
    this.ensureNotDisposed();
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }
    if (session.status !== 'active') {
      throw new SDKError('Session is closed', 'RAG_SESSION_CLOSED', { retryable: false });
    }

    const deletedCount = await this.vectorStore.deleteByMetadata(session.databaseName, filter);
    session.lastAccessedAt = Date.now();

    return deletedCount;
  }

  /**
   * Save session to S5 (client-side persistence)
   * S5VectorStore auto-saves on every operation, so this returns a dummy CID
   */
  async saveSession(sessionId: string): Promise<string> {
    this.ensureNotDisposed();
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }

    session.lastAccessedAt = Date.now();
    return 'auto-saved'; // S5VectorStore auto-saves
  }

  /**
   * Load session from S5 (client-side persistence)
   * S5VectorStore auto-loads on access, so this is a no-op
   */
  async loadSession(sessionId: string, cid: string): Promise<void> {
    this.ensureNotDisposed();
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }
    if (session.status !== 'active') {
      throw new SDKError('Session is closed', 'RAG_SESSION_CLOSED', { retryable: false });
    }

    // S5VectorStore auto-loads on access - no action needed
    session.lastAccessedAt = Date.now();
  }

  /**
   * Get session statistics
   */
  async getSessionStats(identifier: string): Promise<any> {
    this.ensureNotDisposed();
    // Try as dbName first, then as sessionId
    const sessionId = this.dbNameToSessionId.get(identifier) || identifier;
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SDKError('Session not found', 'RAG_SESSION_NOT_FOUND', { retryable: false });
    }

    const stats = await this.vectorStore.getStats(session.databaseName);
    session.lastAccessedAt = Date.now();

    return {
      vectorCount: stats.vectorCount || 0,
      totalVectors: stats.vectorCount || 0,
      totalChunks: stats.chunkCount || 0,
      memoryUsageMb: (stats.storageSizeBytes || 0) / (1024 * 1024),
      lastUpdated: stats.lastUpdated || Date.now()
    };
  }

  /**
   * This manager's list of databases — counts only (no `pendingDocuments` / `readyDocuments` / `dimensions`); read
   * those with `getDatabaseMetadata(name)` or `listAllDatabases()`. `refreshDatabases()` renews it (§22 CC8).
   */
  listDatabases(): DatabaseMetadata[] {
    this.ensureNotDisposed();
    return this.metadataService.list({ type: 'vector' });
  }

  /**
   * Get database statistics
   */
  getDatabaseStats(databaseName: string): DatabaseStats | null {
    this.ensureNotDisposed();
    const metadata = this.metadataService.get(databaseName);
    if (!metadata) {
      return null;
    }

    const sessions = this.listSessions(databaseName);

    return {
      databaseName: metadata.databaseName,
      vectorCount: metadata.vectorCount,
      storageSizeBytes: metadata.storageSizeBytes,
      sessionCount: sessions.length
    };
  }

  /**
   * Delete a database: everything under it on S5 (sealed and legacy — vectors, documents, bodies, manifest),
   * then its sessions and metadata. Throws if nothing of it exists anywhere.
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    this.ensureNotDisposed();
    const { unrecorded } = await landedWrite(this.vectorStore.deleteDatabase(databaseName));

    // Destroy all sessions for this database
    const sessions = this.listSessions(databaseName);
    for (const session of sessions) {
      await this.destroySession(session.sessionId);
    }

    if (this.metadataService.exists(databaseName)) this.metadataService.delete(databaseName);
    if (unrecorded) throw unrecorded;
  }

  /**
   * Drop every cache and re-read the databases from S5 — sees what another tab created, changed or deleted.
   * @returns the complete entries read (document arrays included — §22 CC8), with this manager's own fields (`isPublic`).
   */
  async refreshDatabases(): Promise<DatabaseMetadata[]> {
    this.ensureNotDisposed();
    this.vectorStore.invalidateCaches();
    // Only a complete list replaces this manager's (§15 T3): RAG_DISCOVERY_INCOMPLETE leaves it as it was.
    const loaded = await this.vectorStore.listAllDatabases();
    const names = new Set(loaded.map((db) => db.databaseName));
    for (const db of this.metadataService.list({ type: 'vector' })) {
      if (!names.has(db.databaseName)) this.metadataService.delete(db.databaseName);
    }
    for (const db of loaded) this.mirror(db);
    return loaded.map((db) => ({ ...this.metadataService.get(db.databaseName), ...db }));
  }

  /**
   * Move every legacy plaintext database to sealed storage and delete the plaintext (see
   * S5VectorStore.migrateLegacyStorage), then refresh the database list. Run on every unlock.
   */
  async migrateLegacyRagStorage(opts: { onProgress?: (e: MigrationProgress) => void; discardUnreadable?: DiscardUnreadable } = {}): Promise<RagMigrationReport> {
    this.ensureNotDisposed();
    const report = await this.vectorStore.migrateLegacyStorage(opts);
    if (report.databases.length > 0) {
      try {
        await this.refreshDatabases();
      } catch (error: any) {
        // The migration finished: its report travels with the refresh failure (T8).
        throw new SDKError(error?.message ?? String(error), error?.code ?? 'RAG_REFRESH_FAILED', { ...(error?.details ?? {}), report, cause: error });
      }
    }
    return report;
  }

  /**
   * Every database, or RAG_DISCOVERY_INCOMPLETE `{ retryable, failed: [{ what, code, dbId?, database? }] }` when one could not
   * be read — for callers that decide on "all" (§15 T3). `listDatabases()` is this manager's list, which
   * `refreshDatabases()` renews.
   */
  async listAllDatabases(): Promise<DatabaseMetadata[]> {
    this.ensureNotDisposed();
    return this.vectorStore.listAllDatabases();
  }

  // ===== DOCUMENTS (sealed; the UI never writes RAG files itself) =====

  /** Add a pending document to a database's manifest (same id → replaced; a ready id → RAG_DOCUMENT_ALREADY_READY). */
  async addPendingDocument(databaseName: string, doc: { id: string; [key: string]: unknown }): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.addPendingDocument(databaseName, doc);
  }

  /** Remove a document's entry and its body. Delete its vectors with deleteByMetadata. */
  async removeDocument(databaseName: string, documentId: string): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.removeDocument(databaseName, documentId);
  }

  /** Store a document body, sealed. Fails fast with STORAGE_OFFLINE while S5 is disconnected. */
  async putDocumentBody(databaseName: string, documentId: string, body: string | Uint8Array): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.putDocumentBody(databaseName, documentId, body);
  }

  /**
   * Read a document body back with exactly the type and bytes it was stored with.
   *
   * @throws SDKError RAG_DATABASE_MOVED (retryable) — a legacy database another tab or device moved under this read:
   *   retry once, never treat the body as missing (§38 SS2)
   */
  async getDocumentBody(databaseName: string, documentId: string): Promise<string | Uint8Array> {
    this.ensureNotDisposed();
    return this.vectorStore.getDocumentBody(databaseName, documentId);
  }

  /**
   * Update database metadata
   */
  updateDatabaseMetadata(
    databaseName: string,
    updates: Partial<Omit<DatabaseMetadata, 'databaseName' | 'owner' | 'createdAt'>>
  ): void {
    this.ensureNotDisposed();
    this.metadataService.update(databaseName, updates);
  }

  // ===== MOCK SDK PARITY METHODS (for UI4→UI5 Migration) =====

  /** Get vector database metadata, in the declared `VectorDatabaseMetadata` shape. */
  async getVectorDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    this.ensureNotDisposed();
    const m = (await this.vectorStore.getDatabaseMetadata(databaseName)) as DatabaseMetadata & { dimensions?: number };
    return {
      id: m.databaseName,
      name: m.databaseName,
      owner: m.owner,
      vectorCount: m.vectorCount,
      storageSizeBytes: m.storageSizeBytes,
      created: m.createdAt,
      lastAccessed: m.lastAccessedAt,
      description: m.description,
      dimensions: m.dimensions,
    };
  }

  /**
   * A database's stored metadata, read from its (sealed) manifest: counts, description and the
   * `pendingDocuments` / `readyDocuments` lists. Throws RAG_DATABASE_NOT_FOUND.
   */
  async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata> {
    this.ensureNotDisposed();
    return await this.vectorStore.getDatabaseMetadata(databaseName);
  }

  /** Update vector database metadata */
  async updateVectorDatabaseMetadata(databaseName: string, updates: Partial<VectorDatabaseMetadata>): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.updateDatabaseMetadata(databaseName, updates as Partial<DatabaseMetadata>);
  }

  /** Add single vector to database */
  async addVector(dbName: string, id: string, values: number[], metadata: Record<string, any> = {}): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.addVector(dbName, id, values, metadata);
  }

  /**
   * Add multiple vectors directly to database (without session)
   *
   * Used for deferred embeddings workflow where documents are processed
   * in background without an active RAG session.
   *
   * @param databaseName - Database identifier
   * @param vectors - Array of vectors with IDs, embeddings, and metadata
   */
  async addVectorsToDatabase(databaseName: string, vectors: Array<{ id: string; vector: number[]; metadata: Record<string, any> }>): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.addVectors(databaseName, vectors);
  }

  /**
   * Search database directly without requiring an active session
   *
   * Used for deferred embeddings workflow where we need to search vectors
   * that were stored outside of a RAG session.
   *
   * @param databaseName - Database identifier
   * @param queryVector - Query embedding vector (384 dimensions)
   * @param topK - Number of results to return (default: 5)
   * @param threshold - Minimum similarity threshold (default: 0.7)
   * @returns Search results with scores and metadata
   */
  async searchDatabaseDirect(
    databaseName: string,
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.7
  ): Promise<Array<{ id: string; score: number; content: string; metadata: any }>> {
    this.ensureNotDisposed();

    // Load all vectors from database
    const allVectors = await this.vectorStore.listVectors(databaseName);

    if (allVectors.length === 0) {
      return [];
    }

    // Calculate cosine similarity for each vector
    const results: Array<{ id: string; score: number; content: string; metadata: any }> = [];

    for (const vector of allVectors) {
      const similarity = this._cosineSimilarity(queryVector, vector.vector);

      if (similarity >= threshold) {
        results.push({
          id: vector.id,
          score: similarity,
          content: vector.metadata?.text || '',
          metadata: vector.metadata || {}
        });
      }
    }

    // Sort by similarity score (descending) and take top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  private _cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new SDKError(`Vector dimension mismatch: ${a.length} vs ${b.length}`, 'RAG_VECTOR_DIMENSION_MISMATCH', { expected: a.length, got: b.length, retryable: false });
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /** Get specific vectors by IDs */
  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    this.ensureNotDisposed();
    return await this.vectorStore.getVectors(databaseName, vectorIds);
  }

  /** List all vectors in database */
  async listVectors(databaseName: string): Promise<Vector[]> {
    this.ensureNotDisposed();
    return await this.vectorStore.listVectors(databaseName);
  }

  /** List all folder paths */
  async listFolders(databaseName: string): Promise<string[]> {
    this.ensureNotDisposed();
    return await this.vectorStore.listFolders(databaseName);
  }

  /** Get all folders with vector counts */
  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    this.ensureNotDisposed();
    return await this.vectorStore.getAllFoldersWithCounts(databaseName);
  }

  /** Get folder statistics */
  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    this.ensureNotDisposed();
    return await this.vectorStore.getFolderStatistics(databaseName, folderPath);
  }

  /** Create empty folder */
  async createFolder(databaseName: string, folderPath: string): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.createFolder(databaseName, folderPath);
  }

  /** Rename folder and update all vectors */
  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    this.ensureNotDisposed();
    return await this.vectorStore.renameFolder(databaseName, oldPath, newPath);
  }

  /** Delete folder and all vectors */
  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    this.ensureNotDisposed();
    return await this.vectorStore.deleteFolder(databaseName, folderPath);
  }

  /** Move single vector to folder */
  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    this.ensureNotDisposed();
    await this.vectorStore.moveToFolder(databaseName, vectorId, targetFolder);
  }

  /** Move all vectors from one folder to another */
  async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
    this.ensureNotDisposed();
    return await this.vectorStore.moveFolderContents(databaseName, sourceFolder, targetFolder);
  }

  /** Search within a specific folder (requires host support via SessionManager) */
  async searchInFolder(databaseName: string, folderPath: string, queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> {
    this.ensureNotDisposed();
    return await this.vectorStore.searchInFolder(databaseName, folderPath, queryVector, k, threshold);
  }

  /**
   * Check permission
   * @private
   */
  private checkPermission(databaseName: string, action: 'read' | 'write'): void {
    if (!this.permissionManager) {
      return;
    }

    const metadata = this.metadataService.get(databaseName);
    if (!metadata) {
      throw new SDKError(`Database not found: ${databaseName}`, 'RAG_DATABASE_NOT_FOUND', { database: databaseName, retryable: false });
    }

    const allowed = this.permissionManager.checkAndLog(metadata, this.userAddress, action);
    if (!allowed) {
      throw new SDKError('Permission denied: insufficient permissions for this operation', 'RAG_PERMISSION_DENIED', { retryable: false });
    }
  }

  /**
   * Dispose manager and cleanup all resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    // Refuses from this line on — a sign-out disposes without waiting (§25 FF1).
    this.disposed = true;

    for (const session of this.sessions.values()) session.status = 'closed';
    this.sessions.clear();
    this.sessionCache.clear();
    this.dbNameToSessionId.clear();
  }

  /** This manager's list learns a database its store has (listed, opened, or just written to) — §24 EE6. */
  private mirror(db: DatabaseMetadata): void {
    this.metadataService.upsert(db.databaseName, 'vector', this.userAddress, {
      vectorCount: db.vectorCount, storageSizeBytes: db.storageSizeBytes, description: db.description,
    });
  }

  /**
   * Ensure manager is not disposed
   * @private
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new SDKError('Manager has been disposed', 'RAG_MANAGER_DISPOSED', { retryable: false });
    }
  }

  /**
   * Get pending documents from a specific vector database or all databases
   *
   * Retrieves documents that have embeddingStatus: 'pending' from the specified
   * database or all databases if no database name is provided.
   *
   * @param databaseName - Optional database name to filter results
   * @returns Array of DocumentMetadata objects with pending embeddings
   */
  async getPendingDocuments(databaseName?: string): Promise<any[]> {
    this.ensureNotDisposed();

    // One database: read from the store (RAG_DATABASE_NOT_FOUND for an unknown name, never []). All of them: the
    // store's complete list — its metadata already carries the documents (no second read to race another tab's
    // delete), or RAG_DISCOVERY_INCOMPLETE when one could not be read (I2, §15 T3).
    const databases = databaseName
      ? [await this.vectorStore.getDatabaseMetadata(databaseName)]
      : await this.vectorStore.listAllDatabases();

    const allPendingDocs: any[] = [];

    for (const metadata of databases) {
      if (metadata.pendingDocuments && Array.isArray(metadata.pendingDocuments)) {
        // Add database name to each document for context
        const docsWithDbName = metadata.pendingDocuments.map(doc => ({
          ...doc,
          databaseName: metadata.databaseName
        }));
        allPendingDocs.push(...docsWithDbName);
      }
    }

    console.log(`[VectorRAGManager] Found ${allPendingDocs.length} pending documents in ${databases.length} database(s)${databaseName ? ` (filtered to: ${databaseName})` : ''}`);

    return allPendingDocs;
  }

  /**
   * Update document embedding status
   *
   * Finds a document by ID across all databases and updates its status.
   * If status is 'ready', moves document from pendingDocuments[] to readyDocuments[].
   *
   * @param documentId - Unique document identifier
   * @param status - New embedding status
   * @param updates - Optional fields to update (vectorCount, embeddingProgress, embeddingError)
   * @param databaseName - The database holding the document; without it every database is searched
   * @throws SDKError RAG_DOCUMENT_NOT_FOUND; a database that cannot be read is thrown, not skipped (I2)
   */
  async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    updates?: DocumentStatusUpdates,
    databaseName?: string
  ): Promise<void> {
    this.ensureNotDisposed();

    // Find the database that holds the document (pending or ready), among the store's databases (S5)
    let foundDatabase: string | null = databaseName ?? null;
    for (const metadata of foundDatabase ? [] : await this.vectorStore.listAllDatabases()) {
      if ([...(metadata.pendingDocuments ?? []), ...(metadata.readyDocuments ?? [])].some((doc) => doc.id === documentId)) {
        foundDatabase = metadata.databaseName;
        break;
      }
    }

    if (!foundDatabase) {
      throw new SDKError(`Document ${documentId} not found in any database`, 'RAG_DOCUMENT_NOT_FOUND', { documentId, retryable: false });
    }

    // The read-modify-write runs inside the store, under the database lock, on a fresh manifest.
    await this.vectorStore.updateDocumentStatus(foundDatabase, documentId, status, updates);

    console.log(`[VectorRAGManager] ✅ Document ${documentId} status updated to ${status}`);
  }
}
