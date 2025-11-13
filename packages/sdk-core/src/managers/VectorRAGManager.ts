// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * VectorRAGManager (Hybrid Architecture)
 * Client-side database management + host-side search delegation
 *
 * Architecture:
 * - Client-side: VectorDbSession for persistent storage in S5
 * - Host-side: SessionManager for stateless search operations (Rust)
 */

import { VectorDbSession } from '@fabstir/vector-db-native';
import { SessionManager } from './SessionManager';
import { IVectorRAGManager } from './interfaces/IVectorRAGManager';
import { RAGConfig, PartialRAGConfig, VectorRecord, SearchResult, SearchResultWithSource } from '../rag/types';
import { validateRAGConfig, mergeRAGConfig } from '../rag/config';
import { SessionCache } from '../rag/session-cache';
import { DatabaseMetadataService } from '../database/DatabaseMetadataService';
import type { DatabaseMetadata } from '../database/types';
import { PermissionManager } from '../permissions/PermissionManager';

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
  vectorDbSession: any; // VectorDbSession instance
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
  }

  /**
   * Create a new vector database session (client-side)
   * This creates a persistent VectorDbSession using @fabstir/vector-db-native
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
      // Create VectorDbSession (client-side storage)
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

    // Destroy native VectorDbSession to free memory and IndexedDB
    if (session.vectorDbSession && typeof session.vectorDbSession.destroy === 'function') {
      try {
        await session.vectorDbSession.destroy();
      } catch (error) {
        console.error(`Error destroying VectorDbSession ${sessionId}:`, error);
      }
    }

    // Update status and remove from caches
    session.status = 'closed';
    this.sessionCache.delete(sessionId);
    this.sessions.delete(sessionId);
    this.dbNameToSessionId.delete(session.databaseName);
  }

  /**
   * Add vectors to client-side storage
   * Stores vectors in S5 via VectorDbSession
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

    // Add vectors to client-side storage
    await session.vectorDbSession.addVectors(vectors);
    session.lastAccessedAt = Date.now();

    // Update metadata with actual vector count
    const stats = await session.vectorDbSession.getStats();
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

    await session.vectorDbSession.deleteVectors(vectorIds);
    session.lastAccessedAt = Date.now();
  }

  /**
   * Delete vectors by metadata filter (client-side storage)
   * Uses @fabstir/vector-db-native deleteByMetadata method
   */
  async deleteByMetadata(sessionId: string, filter: Record<string, any>): Promise<number> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is closed');
    }

    const result = await session.vectorDbSession.deleteByMetadata(filter);
    session.lastAccessedAt = Date.now();

    return result.deletedCount;
  }

  /**
   * Save session to S5 (client-side persistence)
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
   * Load session from S5 (client-side persistence)
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
   * Get session statistics
   */
  async getSessionStats(identifier: string): Promise<any> {
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
}
