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
}

/**
 * Vector RAG Manager
 * Manages vector database sessions for RAG operations
 */
export class VectorRAGManager implements IVectorRAGManager {
  public readonly userAddress: string;
  public readonly config: RAGConfig;
  private readonly seedPhrase: string;
  private sessions: Map<string, Session>;
  private sessionCache: SessionCache<Session>;
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
    this.sessions = new Map();
    this.sessionCache = new SessionCache<Session>(50);  // Cache up to 50 sessions
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
        config: sessionConfig
      };

      // Store session
      this.sessions.set(sessionId, session);
      this.sessionCache.set(sessionId, session);

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

    // Cleanup session (VectorDbSession doesn't have explicit close/destroy)
    session.status = 'closed';

    // Remove from cache and storage
    this.sessionCache.delete(sessionId);
    this.sessions.delete(sessionId);
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

    // Validate vector dimensions (all should be same length)
    if (vectors.length > 0) {
      const expectedDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== expectedDim) {
          throw new Error('Vector dimension mismatch');
        }
      }
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
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<VectorDbStats> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const stats = await session.vectorDbSession.getStats();
    session.lastAccessedAt = Date.now();

    return {
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
