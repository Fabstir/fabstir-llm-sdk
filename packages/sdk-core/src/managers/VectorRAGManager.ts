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

import { S5VectorStore } from '../storage/S5VectorStore';
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
  }) {
    // Validate required fields
    if (!options.userAddress) {
      throw new Error('userAddress is required');
    }
    if (!options.seedPhrase) {
      throw new Error('seedPhrase is required');
    }
    if (!options.sessionManager) {
      throw new Error('sessionManager is required');
    }
    if (!options.s5Client) {
      throw new Error('s5Client is required');
    }
    if (!options.encryptionManager) {
      throw new Error('encryptionManager is required');
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
      encryptionManager: options.encryptionManager
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
    console.log('[VectorRAGManager] Initialize called - about to call vectorStore.initialize()');
    await this.vectorStore.initialize();
    console.log('[VectorRAGManager] ✅ VectorStore initialized');

    // Populate metadataService from loaded databases
    const loadedDatabases = await this.vectorStore.listDatabases();
    for (const db of loadedDatabases) {
      if (!this.metadataService.exists(db.databaseName)) {
        this.metadataService.create(db.databaseName, 'vector', this.userAddress, {
          vectorCount: db.vectorCount,
          storageSizeBytes: db.storageSizeBytes,
          description: db.description
        });
      }
    }
    console.log(`[VectorRAGManager] ✅ Populated metadata for ${loadedDatabases.length} existing database(s)`);
  }

  /**
   * Create a new vector database session (client-side)
   * This creates a persistent vector database using S5VectorStore
   */
  async createSession(databaseName: string, config?: PartialRAGConfig): Promise<string> {
    this.ensureNotDisposed();

    // Validate database name
    if (!databaseName || databaseName.trim() === '') {
      throw new Error('Database name cannot be empty');
    }

    // Merge config with defaults
    const sessionConfig = config ? mergeRAGConfig({ ...this.config, ...config }) : this.config;

    // Generate unique session ID
    const sessionId = `rag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create database in S5VectorStore (client-side storage)
      await this.vectorStore.createDatabase({
        name: databaseName,
        owner: this.userAddress,
        description: sessionConfig.description
      });

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

      return sessionId;
    } catch (error) {
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
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
   * List all active sessions
   */
  listSessions(databaseName?: string): Session[] {
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
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'closed';
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
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
   */
  async addVectors(sessionId: string, vectors: VectorRecord[]): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Check write permission
    this.checkPermission(session.databaseName, 'write');

    // Validate vector dimensions (S5VectorStore also validates, but check here for better error messages)
    if (vectors.length > 0) {
      const expectedDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== expectedDim) {
          throw new Error('Vector dimension mismatch');
        }
      }
    }

    // Add vectors to S5VectorStore (auto-saved)
    await this.vectorStore.addVectors(session.databaseName, vectors);
    session.lastAccessedAt = Date.now();

    // Update metadata with actual vector count
    const stats = await this.vectorStore.getStats(session.databaseName);
    this.metadataService.update(session.databaseName, {
      vectorCount: stats.vectorCount || 0
    });
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
    return await this.search(sessionId, queryVector, topK, threshold);
  }

  /**
   * Delete vectors by IDs (client-side storage)
   */
  async deleteVectors(sessionId: string, vectorIds: string[]): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Delete each vector individually
    for (const vectorId of vectorIds) {
      await this.vectorStore.deleteVector(session.databaseName, vectorId);
    }
    session.lastAccessedAt = Date.now();
  }

  /**
   * Delete vectors by metadata filter (client-side storage)
   */
  async deleteByMetadata(sessionId: string, filter: Record<string, any>): Promise<number> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
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
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.lastAccessedAt = Date.now();
    return 'auto-saved'; // S5VectorStore auto-saves
  }

  /**
   * Load session from S5 (client-side persistence)
   * S5VectorStore auto-loads on access, so this is a no-op
   */
  async loadSession(sessionId: string, cid: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // S5VectorStore auto-loads on access - no action needed
    session.lastAccessedAt = Date.now();
  }

  /**
   * Get session statistics
   */
  async getSessionStats(identifier: string): Promise<any> {
    // Try as dbName first, then as sessionId
    const sessionId = this.dbNameToSessionId.get(identifier) || identifier;
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
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
   * List all databases with metadata
   */
  listDatabases(): DatabaseMetadata[] {
    return this.metadataService.list({ type: 'vector' });
  }

  /**
   * Get database metadata
   */
  getDatabaseMetadata(databaseName: string): DatabaseMetadata | null {
    return this.metadataService.get(databaseName);
  }

  /**
   * Get database statistics
   */
  getDatabaseStats(databaseName: string): DatabaseStats | null {
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
   * Delete a database and all its sessions
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    if (!this.metadataService.exists(databaseName)) {
      throw new Error('Database not found');
    }

    // Destroy all sessions for this database
    const sessions = this.listSessions(databaseName);
    for (const session of sessions) {
      await this.destroySession(session.sessionId);
    }

    // Remove metadata
    this.metadataService.delete(databaseName);
  }

  /**
   * Update database metadata
   */
  updateDatabaseMetadata(
    databaseName: string,
    updates: Partial<Omit<DatabaseMetadata, 'databaseName' | 'owner' | 'createdAt'>>
  ): void {
    this.metadataService.update(databaseName, updates);
  }

  // ===== MOCK SDK PARITY METHODS (for UI4→UI5 Migration) =====

  /** Get vector database metadata */
  async getVectorDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    return await this.vectorStore.getVectorDatabaseMetadata(databaseName);
  }

  /** Alias for getVectorDatabaseMetadata() */
  async getDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    return await this.vectorStore.getDatabaseMetadata(databaseName);
  }

  /** Update vector database metadata */
  async updateVectorDatabaseMetadata(databaseName: string, updates: Partial<VectorDatabaseMetadata>): Promise<void> {
    await this.vectorStore.updateVectorDatabaseMetadata(databaseName, updates);
  }

  /** Add single vector to database */
  async addVector(dbName: string, id: string, values: number[], metadata: Record<string, any> = {}): Promise<void> {
    await this.vectorStore.addVector(dbName, id, values, metadata);
  }

  /** Get specific vectors by IDs */
  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    return await this.vectorStore.getVectors(databaseName, vectorIds);
  }

  /** List all vectors in database */
  async listVectors(databaseName: string): Promise<Vector[]> {
    return await this.vectorStore.listVectors(databaseName);
  }

  /** List all folder paths */
  async listFolders(databaseName: string): Promise<string[]> {
    return await this.vectorStore.listFolders(databaseName);
  }

  /** Get all folders with vector counts */
  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    return await this.vectorStore.getAllFoldersWithCounts(databaseName);
  }

  /** Get folder statistics */
  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    return await this.vectorStore.getFolderStatistics(databaseName, folderPath);
  }

  /** Create empty folder */
  async createFolder(databaseName: string, folderPath: string): Promise<void> {
    await this.vectorStore.createFolder(databaseName, folderPath);
  }

  /** Rename folder and update all vectors */
  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    return await this.vectorStore.renameFolder(databaseName, oldPath, newPath);
  }

  /** Delete folder and all vectors */
  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    return await this.vectorStore.deleteFolder(databaseName, folderPath);
  }

  /** Move single vector to folder */
  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    await this.vectorStore.moveToFolder(databaseName, vectorId, targetFolder);
  }

  /** Move all vectors from one folder to another */
  async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
    return await this.vectorStore.moveFolderContents(databaseName, sourceFolder, targetFolder);
  }

  /** Search within a specific folder (requires host support via SessionManager) */
  async searchInFolder(databaseName: string, folderPath: string, queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> {
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
      throw new Error(`Database not found: ${databaseName}`);
    }

    const allowed = this.permissionManager.checkAndLog(metadata, this.userAddress, action);
    if (!allowed) {
      throw new Error('Permission denied: insufficient permissions for this operation');
    }
  }

  /**
   * Dispose manager and cleanup all resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }

    this.sessionCache.clear();
    this.disposed = true;
  }

  /**
   * Ensure manager is not disposed
   * @private
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Manager has been disposed');
    }
  }

  /**
   * Get all pending documents across all vector databases
   *
   * Retrieves documents that have embeddingStatus: 'pending' from all databases
   * in the current user's storage. Used for deferred embeddings workflow.
   *
   * @param sessionGroupId - Optional session group ID to filter databases (not yet implemented)
   * @returns Array of DocumentMetadata objects with pending embeddings
   */
  async getPendingDocuments(sessionGroupId?: string): Promise<any[]> {
    this.ensureNotDisposed();

    // Get all vector databases
    const databases = this.listDatabases();
    const allPendingDocs: any[] = [];

    // Collect pending documents from each database
    for (const db of databases) {
      try {
        const metadata = await this.vectorStore.getDatabaseMetadata(db.name);

        if (metadata.pendingDocuments && Array.isArray(metadata.pendingDocuments)) {
          // Add database name to each document for context
          const docsWithDbName = metadata.pendingDocuments.map(doc => ({
            ...doc,
            databaseName: db.name
          }));
          allPendingDocs.push(...docsWithDbName);
        }
      } catch (error) {
        console.warn(`[VectorRAGManager] Failed to get pending docs from ${db.name}:`, error);
        // Continue with other databases
      }
    }

    console.log(`[VectorRAGManager] Found ${allPendingDocs.length} pending documents across ${databases.length} databases`);

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
   */
  async updateDocumentStatus(
    documentId: string,
    status: 'pending' | 'processing' | 'ready' | 'failed',
    updates?: {
      vectorCount?: number;
      embeddingProgress?: number;
      embeddingError?: string;
    }
  ): Promise<void> {
    this.ensureNotDisposed();

    // Find document across all databases
    const databases = this.listDatabases();
    let foundDatabase: string | null = null;
    let foundDocument: any | null = null;

    for (const db of databases) {
      try {
        const metadata = await this.vectorStore.getDatabaseMetadata(db.name);

        if (metadata.pendingDocuments && Array.isArray(metadata.pendingDocuments)) {
          const docIndex = metadata.pendingDocuments.findIndex(doc => doc.id === documentId);
          if (docIndex !== -1) {
            foundDatabase = db.name;
            foundDocument = metadata.pendingDocuments[docIndex];
            break;
          }
        }

        // Also check readyDocuments in case status is being updated again
        if (metadata.readyDocuments && Array.isArray(metadata.readyDocuments)) {
          const docIndex = metadata.readyDocuments.findIndex(doc => doc.id === documentId);
          if (docIndex !== -1) {
            foundDatabase = db.name;
            foundDocument = metadata.readyDocuments[docIndex];
            break;
          }
        }
      } catch (error) {
        console.warn(`[VectorRAGManager] Failed to search ${db.name}:`, error);
      }
    }

    if (!foundDatabase || !foundDocument) {
      throw new Error(`Document ${documentId} not found in any database`);
    }

    console.log(`[VectorRAGManager] Updating document ${documentId} in ${foundDatabase}: ${foundDocument.embeddingStatus} → ${status}`);

    // Load current metadata
    const metadata = await this.vectorStore.getDatabaseMetadata(foundDatabase);

    // Initialize arrays if they don't exist
    if (!metadata.pendingDocuments) {
      metadata.pendingDocuments = [];
    }
    if (!metadata.readyDocuments) {
      metadata.readyDocuments = [];
    }

    // Update document fields
    const updatedDoc = {
      ...foundDocument,
      embeddingStatus: status,
      lastEmbeddingAttempt: Date.now(),
      ...(updates?.vectorCount !== undefined && { vectorCount: updates.vectorCount }),
      ...(updates?.embeddingProgress !== undefined && { embeddingProgress: updates.embeddingProgress }),
      ...(updates?.embeddingError !== undefined && { embeddingError: updates.embeddingError })
    };

    // Move document between arrays if status changed to 'ready'
    if (status === 'ready' && foundDocument.embeddingStatus !== 'ready') {
      // Remove from pendingDocuments
      metadata.pendingDocuments = metadata.pendingDocuments.filter(doc => doc.id !== documentId);

      // Add to readyDocuments
      metadata.readyDocuments.push(updatedDoc);

      console.log(`[VectorRAGManager] Moved document ${documentId} to readyDocuments`);
    } else {
      // Update in-place in current array
      const pendingIndex = metadata.pendingDocuments.findIndex(doc => doc.id === documentId);
      if (pendingIndex !== -1) {
        metadata.pendingDocuments[pendingIndex] = updatedDoc;
      }

      const readyIndex = metadata.readyDocuments.findIndex(doc => doc.id === documentId);
      if (readyIndex !== -1) {
        metadata.readyDocuments[readyIndex] = updatedDoc;
      }
    }

    // Save updated metadata to S5
    await this.vectorStore.updateVectorDatabaseMetadata(foundDatabase, metadata);

    console.log(`[VectorRAGManager] ✅ Document ${documentId} status updated to ${status}`);
  }
}
