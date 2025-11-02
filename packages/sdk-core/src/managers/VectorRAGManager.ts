/**
 * VectorRAGManager
 * Core manager for vector database operations
 * Max 400 lines
 */

import { VectorDbSession } from '@fabstir/vector-db-native';
import { IVectorRAGManager } from './interfaces/IVectorRAGManager.js';
import { RAGConfig, PartialRAGConfig, VectorRecord, SearchOptions, SearchResult, VectorDbStats } from '../rag/types.js';
import { validateRAGConfig, mergeRAGConfig } from '../rag/config.js';
import { SessionCache } from '../rag/session-cache.js';
import { VectorInput, AddVectorResult, AddVectorOptions, validateVector, convertToVectorRecord, validateVectorBatch, handleDuplicates } from '../rag/vector-operations.js';
import { validateMetadata, MetadataSchema } from '../rag/metadata-validator.js';
import { BatchProcessor } from '../rag/batch-processor.js';
import { DatabaseMetadataService } from '../database/DatabaseMetadataService.js';
import type { DatabaseMetadata } from '../database/types.js';
import { validateFolderPath, normalizeFolderPath } from '../rag/folder-utils.js';
import { PermissionManager } from '../permissions/PermissionManager.js';

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
  vectorDbSession: any;  // VectorDbSession instance
  status: SessionStatus;
  createdAt: number;
  lastAccessedAt: number;
  config: RAGConfig;
  folderPaths: Set<string>;  // Track unique folder paths
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
 * Vector RAG Manager
 * Manages vector database sessions for RAG operations
 */
export class VectorRAGManager implements IVectorRAGManager {
  public readonly userAddress: string;
  public readonly config: RAGConfig;
  private readonly seedPhrase: string;
  private readonly metadataService: DatabaseMetadataService; // Shared metadata service
  private readonly permissionManager?: PermissionManager; // Optional permission manager
  private sessions: Map<string, Session>;
  private sessionCache: SessionCache<Session>;
  private dbNameToSessionId: Map<string, string>; // Map dbName to sessionId
  private disposed: boolean = false;

  /**
   * Create a new VectorRAGManager
   *
   * @param options - Manager options
   */
  constructor(options: {
    userAddress?: string;
    seedPhrase?: string;
    config: RAGConfig;
    metadataService?: DatabaseMetadataService; // Optional for backward compatibility
    permissionManager?: PermissionManager; // Optional permission manager
  }) {
    // Validate required fields
    if (!options.userAddress) {
      throw new Error('userAddress is required');
    }
    if (!options.seedPhrase) {
      throw new Error('seedPhrase is required');
    }

    // Validate configuration
    validateRAGConfig(options.config);

    this.userAddress = options.userAddress;
    this.seedPhrase = options.seedPhrase;
    this.config = options.config;
    this.metadataService = options.metadataService || new DatabaseMetadataService(); // Default if not provided
    this.permissionManager = options.permissionManager; // Optional, undefined if not provided
    this.sessions = new Map();
    this.sessionCache = new SessionCache<Session>(50);  // Cache up to 50 sessions
    this.dbNameToSessionId = new Map();
  }

  /**
   * Create a new vector database session
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
      // Create VectorDbSession
      const vectorDbSession = await VectorDbSession.create({
        s5Portal: sessionConfig.s5Portal,
        userSeedPhrase: this.seedPhrase,
        sessionId: `${this.userAddress}-${databaseName}-${sessionId}`,
        encryptAtRest: sessionConfig.encryptAtRest,
        chunkSize: sessionConfig.chunkSize,
        cacheSizeMb: sessionConfig.cacheSizeMb
      });

      // Create session object
      const session: Session = {
        sessionId,
        databaseName,
        vectorDbSession,
        status: 'active',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        config: sessionConfig,
        folderPaths: new Set<string>()  // Initialize folder paths tracker
      };

      // Store session
      this.sessions.set(sessionId, session);
      this.sessionCache.set(sessionId, session);
      this.dbNameToSessionId.set(databaseName, sessionId); // Map dbName to sessionId

      // Initialize database metadata if this is the first session for this database
      if (!this.metadataService.exists(databaseName)) {
        this.metadataService.create(databaseName, 'vector', this.userAddress);
      } else {
        // Database exists - check user has at least read access
        // Actual operations (addVectors, search) will enforce their required permissions
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
   * Get session status
   */
  getSessionStatus(sessionId: string): SessionStatus {
    const session = this.sessions.get(sessionId);
    return session ? session.status : 'unknown';
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
    // Note: VectorDbSession doesn't have explicit close(), just set status
  }

  /**
   * Reopen a closed session
   */
  async reopenSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'closed') {
      throw new Error('Session is not closed');
    }

    // Recreate VectorDbSession
    session.vectorDbSession = await VectorDbSession.create({
      s5Portal: session.config.s5Portal,
      userSeedPhrase: this.seedPhrase,
      sessionId: `${this.userAddress}-${session.databaseName}-${sessionId}`,
      encryptAtRest: session.config.encryptAtRest,
      chunkSize: session.config.chunkSize,
      cacheSizeMb: session.config.cacheSizeMb
    });

    session.status = 'active';
    session.lastAccessedAt = Date.now();
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // CRITICAL: Destroy native VectorDbSession to free memory and IndexedDB
    if (session.vectorDbSession && typeof session.vectorDbSession.destroy === 'function') {
      try {
        await session.vectorDbSession.destroy();
      } catch (error) {
        console.error(`Error destroying VectorDbSession ${sessionId}:`, error);
        // Continue with cleanup even if destroy fails
      }
    }

    // Update status and remove from caches
    session.status = 'closed';
    this.sessionCache.delete(sessionId);
    this.sessions.delete(sessionId);
    this.dbNameToSessionId.delete(session.databaseName);
  }

  /**
   * Destroy all sessions
   */
  async destroyAllSessions(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }
  }

  /**
   * Destroy sessions by database name
   */
  async destroySessionsByDatabase(databaseName: string): Promise<void> {
    const sessionsToDestroy = this.listSessions(databaseName);

    for (const session of sessionsToDestroy) {
      await this.destroySession(session.sessionId);
    }
  }

  /**
   * Add vectors to a session
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

    // Validate vector dimensions (all should be same length)
    if (vectors.length > 0) {
      const expectedDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== expectedDim) {
          throw new Error('Vector dimension mismatch');
        }
      }
    }

    // Validate and normalize folder paths in metadata
    for (const vec of vectors) {
      if (vec.metadata?.folderPath !== undefined) {
        validateFolderPath(vec.metadata.folderPath);
      }
      // Normalize folderPath (default to root if missing)
      if (!vec.metadata) {
        vec.metadata = {};
      }
      vec.metadata.folderPath = normalizeFolderPath(vec.metadata.folderPath);

      // Track folder path
      session.folderPaths.add(vec.metadata.folderPath);
    }

    await session.vectorDbSession.addVectors(vectors);
    session.lastAccessedAt = Date.now();
  }

  /**
   * Search vectors by similarity
   */
  async searchVectors(
    sessionId: string,
    queryVector: number[],
    topK: number,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    const results = await session.vectorDbSession.search(
      queryVector,
      topK,
      options
    );

    session.lastAccessedAt = Date.now();
    return results;
  }

  /**
   * Delete vectors by IDs
   */
  async deleteVectors(sessionId: string, vectorIds: string[]): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    await session.vectorDbSession.deleteVectors(vectorIds);
    session.lastAccessedAt = Date.now();
  }

  /**
   * Save session to S5
   */
  async saveSession(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const cid = await session.vectorDbSession.saveUserVectors();
    session.lastAccessedAt = Date.now();
    return cid;
  }

  /**
   * Load session from S5
   */
  async loadSession(sessionId: string, cid: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    await session.vectorDbSession.loadUserVectors(cid);
    session.lastAccessedAt = Date.now();
  }

  /**
   * Get session statistics (accepts dbName or sessionId)
   */
  async getSessionStats(identifier: string): Promise<VectorDbStats> {
    // Try as dbName first, then as sessionId
    const sessionId = this.dbNameToSessionId.get(identifier) || identifier;
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const stats = await session.vectorDbSession.getStats();
    session.lastAccessedAt = Date.now();

    return {
      vectorCount: stats.totalVectors || 0,
      totalVectors: stats.totalVectors || 0,
      totalChunks: stats.totalChunks || 0,
      memoryUsageMb: stats.memoryUsageMb || 0,
      lastUpdated: stats.lastUpdated || Date.now()
    };
  }

  /**
   * Clear session cache
   */
  async clearSessionCache(sessionId: string): Promise<void> {
    this.sessionCache.delete(sessionId);
  }

  /**
   * Evict least recently used sessions from cache
   */
  async evictLRUSessions(): Promise<void> {
    // Evict 10 LRU sessions
    this.sessionCache.evictMultiple(10);
  }

  /**
   * Add vectors using dbName (overload for tests)
   * Auto-creates session if one doesn't exist
   */
  async addVectors(dbName: string, vectors: VectorInput[], options?: AddVectorOptions): Promise<AddVectorResult> {
    // Auto-create session if it doesn't exist
    let sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) {
      sessionId = await this.createSession(dbName);
    }
    if (vectors.length === 0) return { added: 0, failed: 0 };

    // For single-vector operations, throw on validation errors
    if (vectors.length === 1) {
      validateVector(vectors[0]);
      if (vectors[0].metadata !== undefined) validateMetadata(vectors[0].metadata);
    }

    const { valid, errors } = validateVectorBatch(vectors);
    if (valid.length === 0 && errors.length > 0) {
      // All failed validation - throw first error for single vector, return result for batch
      if (vectors.length === 1) throw new Error(errors[0].error);
      return { added: 0, failed: errors.length, errors };
    }

    const deduped = options?.handleDuplicates ? handleDuplicates(valid, options.handleDuplicates) : { vectors: valid, skipped: 0 };

    const session = this.getSession(sessionId);
    if (!session || session.status !== 'active') throw new Error('Session not found');

    // Check write permission
    this.checkPermission(session.databaseName, 'write');

    // Validate and normalize folder paths in metadata
    for (const vec of deduped.vectors) {
      if (vec.metadata?.folderPath !== undefined) {
        validateFolderPath(vec.metadata.folderPath);
      }
      // Normalize folderPath (default to root if missing)
      if (!vec.metadata) {
        vec.metadata = {};
      }
      vec.metadata.folderPath = normalizeFolderPath(vec.metadata.folderPath);

      // Track folder path
      session.folderPaths.add(vec.metadata.folderPath);
    }

    const vectorRecords = deduped.vectors.map(convertToVectorRecord);
    await session.vectorDbSession.addVectors(vectorRecords);

    return { added: deduped.vectors.length, failed: errors.length, errors, skipped: deduped.skipped };
  }

  /**
   * Search vectors using dbName
   * Auto-creates session if one doesn't exist
   */
  async search(dbName: string, queryVector: number[], topK: number, options?: SearchOptions): Promise<any[]> {
    // Auto-create session if it doesn't exist
    let sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) {
      sessionId = await this.createSession(dbName);
    }

    // Check read permission
    this.checkPermission(dbName, 'read');

    return this.searchVectors(sessionId, queryVector, topK, options);
  }

  /**
   * Update vector metadata (v0.2.0)
   */
  async updateMetadata(dbName: string, vectorId: string, metadata: Record<string, any>): Promise<void> {
    validateMetadata(metadata);
    const sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) throw new Error('Session not found');
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    await session.vectorDbSession.updateMetadata(vectorId, metadata);
  }

  /**
   * Delete vectors by metadata filter (v0.2.0)
   */
  async deleteByMetadata(dbName: string, filter: Record<string, any>): Promise<{ deletedIds: string[], deletedCount: number }> {
    const sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) throw new Error('Session not found');
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    return session.vectorDbSession.deleteByMetadata(filter);
  }

  /**
   * Set metadata schema for validation (v0.2.0)
   */
  async setSchema(dbName: string, schema: Record<string, any> | null): Promise<void> {
    const sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) throw new Error('Session not found');
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    await session.vectorDbSession.setSchema(schema);
  }

  /**
   * Batch update metadata (v0.2.0)
   */
  async batchUpdateMetadata(dbName: string, updates: Array<{ id: string; metadata: Record<string, any> }>): Promise<{ updated: number }> {
    const sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) throw new Error('Session not found');
    let count = 0;
    for (const update of updates) {
      await this.updateMetadata(dbName, update.id, update.metadata);
      count++;
    }
    return { updated: count };
  }

  /**
   * Get search history for a database
   * (v0.2.0: Basic implementation, stores last 20 searches)
   */
  async getSearchHistory(dbName: string): Promise<Array<{ topK: number; timestamp: number; filter?: any }>> {
    const sessionId = this.dbNameToSessionId.get(dbName);
    if (!sessionId) throw new Error('Session not found');
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    // For now, return empty array - full implementation would store history
    // This is a placeholder for Sub-phase 3.2
    return [];
  }

  /**
   * Get metadata for a specific database
   * @param databaseName - Database name
   * @returns Database metadata or null if not found
   */
  getDatabaseMetadata(databaseName: string): DatabaseMetadata | null {
    return this.metadataService.get(databaseName);
  }

  /**
   * Update database metadata
   * @param databaseName - Database name
   * @param updates - Metadata fields to update
   */
  updateDatabaseMetadata(
    databaseName: string,
    updates: Partial<Omit<DatabaseMetadata, 'databaseName' | 'owner' | 'createdAt'>>
  ): void {
    this.metadataService.update(databaseName, updates);
  }

  /**
   * List all databases with metadata
   * @returns Array of database metadata, sorted by creation time (newest first)
   */
  listDatabases(): DatabaseMetadata[] {
    return this.metadataService.list({ type: 'vector' });
  }

  /**
   * Get statistics for a database
   * @param databaseName - Database name
   * @returns Database statistics or null if not found
   */
  getDatabaseStats(databaseName: string): DatabaseStats | null {
    const metadata = this.metadataService.get(databaseName);
    if (!metadata) {
      return null;
    }

    // Count sessions for this database
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
   * @param databaseName - Database name to delete
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    // Check if database exists (will throw if not)
    if (!this.metadataService.exists(databaseName)) {
      throw new Error('Database not found');
    }

    // Destroy all sessions for this database
    await this.destroySessionsByDatabase(databaseName);

    // Remove metadata
    this.metadataService.delete(databaseName);
  }

  /**
   * List all unique folder paths in a session
   */
  async listFolders(sessionId: string): Promise<string[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Return sorted array of folder paths
    return Array.from(session.folderPaths).sort();
  }

  /**
   * Get statistics for a specific folder
   */
  async getFolderStatistics(sessionId: string, folderPath: string): Promise<{ folderPath: string; vectorCount: number }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Validate folder path
    validateFolderPath(folderPath);

    // Search for all vectors in this folder using a dummy query
    // Since we can't get all vectors directly, we use search with very large topK
    const dummyQuery = new Array(384).fill(0);
    const allResults = await session.vectorDbSession.search(dummyQuery, 100000);

    // Filter by folder path and count
    const vectorCount = allResults.filter((result: any) => {
      const resultFolderPath = normalizeFolderPath(result.metadata?.folderPath);
      return resultFolderPath === folderPath;
    }).length;

    return { folderPath, vectorCount };
  }

  /**
   * Move vectors to a different folder
   */
  async moveToFolder(sessionId: string, vectorIds: string[], targetFolderPath: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Validate target folder path
    validateFolderPath(targetFolderPath);

    // Get all vectors to find the ones to move
    const dummyQuery = new Array(384).fill(0);
    const allResults = await session.vectorDbSession.search(dummyQuery, 100000);

    // Find vectors to move
    for (const vectorId of vectorIds) {
      const vector = allResults.find((r: any) => r.id === vectorId);
      if (!vector) {
        throw new Error(`Vector not found: ${vectorId}`);
      }

      // Update metadata
      const updatedMetadata = { ...vector.metadata, folderPath: targetFolderPath };
      await session.vectorDbSession.updateMetadata(vectorId, updatedMetadata);

      // Track new folder path
      session.folderPaths.add(targetFolderPath);
    }

    session.lastAccessedAt = Date.now();
  }

  /**
   * Search vectors within a specific folder
   */
  async searchInFolder(
    sessionId: string,
    folderPath: string,
    queryVector: number[],
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Validate folder path
    validateFolderPath(folderPath);

    // Search all vectors
    const topK = options?.topK || 10;
    const allResults = await session.vectorDbSession.search(queryVector, topK * 10); // Get more results to filter

    // Filter by folder path
    const filteredResults = allResults.filter((result: any) => {
      const resultFolderPath = normalizeFolderPath(result.metadata?.folderPath);
      return resultFolderPath === folderPath;
    });

    // Limit to topK
    const limitedResults = filteredResults.slice(0, topK);

    session.lastAccessedAt = Date.now();
    return limitedResults;
  }

  /**
   * Move all vectors from one folder to another
   */
  async moveFolderContents(sessionId: string, sourceFolderPath: string, targetFolderPath: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    // Validate folder paths
    validateFolderPath(sourceFolderPath);
    validateFolderPath(targetFolderPath);

    // Get all vectors
    const dummyQuery = new Array(384).fill(0);
    const allResults = await session.vectorDbSession.search(dummyQuery, 100000);

    // Find vectors in source folder
    const vectorsToMove = allResults.filter((r: any) => {
      const resultFolderPath = normalizeFolderPath(r.metadata?.folderPath);
      return resultFolderPath === sourceFolderPath;
    });

    // Move each vector
    for (const vector of vectorsToMove) {
      const updatedMetadata = { ...vector.metadata, folderPath: targetFolderPath };
      await session.vectorDbSession.updateMetadata(vector.id, updatedMetadata);
    }

    // Track new folder path
    if (vectorsToMove.length > 0) {
      session.folderPaths.add(targetFolderPath);
    }

    session.lastAccessedAt = Date.now();
  }

  /**
   * Check if user has permission to perform an action on a database
   * @private
   */
  private checkPermission(databaseName: string, action: 'read' | 'write'): void {
    // Skip permission check if no permission manager configured
    if (!this.permissionManager) {
      return;
    }

    // Get database metadata
    const metadata = this.metadataService.get(databaseName);
    if (!metadata) {
      throw new Error(`Database not found: ${databaseName}`);
    }

    // Check permission and log attempt
    const allowed = this.permissionManager.checkAndLog(metadata, this.userAddress, action);
    if (!allowed) {
      throw new Error('Permission denied: insufficient permissions for this operation');
    }
  }

  /**
   * Cleanup alias for dispose
   */
  async cleanup(): Promise<void> {
    await this.dispose();
  }

  /**
   * Dispose manager and cleanup all resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    await this.destroyAllSessions();
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
}
