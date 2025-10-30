/**
 * IVectorRAGManager Interface
 * Interface for vector database management operations
 * Max 100 lines
 */

import { RAGConfig, PartialRAGConfig, VectorRecord, SearchOptions, SearchResult, VectorDbStats } from '../../rag/types.js';

/**
 * Vector RAG Manager Interface
 * Manages vector database sessions for RAG operations
 */
export interface IVectorRAGManager {
  /**
   * User's Ethereum address
   */
  readonly userAddress: string;

  /**
   * RAG configuration
   */
  readonly config: RAGConfig;

  /**
   * Create a new vector database session
   * @param databaseName - Name of the database
   * @param config - Optional session-specific configuration
   * @returns Session ID
   */
  createSession(databaseName: string, config?: PartialRAGConfig): Promise<string>;

  /**
   * Get session by ID
   * @param sessionId - Session ID
   * @returns Session object or null if not found
   */
  getSession(sessionId: string): any | null;

  /**
   * List all active sessions
   * @param databaseName - Optional filter by database name
   * @returns Array of session objects
   */
  listSessions(databaseName?: string): any[];

  /**
   * Get session status
   * @param sessionId - Session ID
   * @returns Session status ('active', 'closed', 'unknown')
   */
  getSessionStatus(sessionId: string): 'active' | 'closed' | 'unknown';

  /**
   * Close a session (keeps data, stops operations)
   * @param sessionId - Session ID
   */
  closeSession(sessionId: string): Promise<void>;

  /**
   * Reopen a closed session
   * @param sessionId - Session ID
   */
  reopenSession(sessionId: string): Promise<void>;

  /**
   * Destroy a session (removes all data)
   * @param sessionId - Session ID
   */
  destroySession(sessionId: string): Promise<void>;

  /**
   * Destroy all sessions
   */
  destroyAllSessions(): Promise<void>;

  /**
   * Destroy sessions by database name
   * @param databaseName - Database name
   */
  destroySessionsByDatabase(databaseName: string): Promise<void>;

  /**
   * Add vectors to a session
   * @param sessionId - Session ID
   * @param vectors - Array of vector records
   */
  addVectors(sessionId: string, vectors: VectorRecord[]): Promise<void>;

  /**
   * Search vectors by similarity
   * @param sessionId - Session ID
   * @param queryVector - Query vector
   * @param topK - Number of results
   * @param options - Search options (filter, threshold)
   * @returns Array of search results
   */
  searchVectors(sessionId: string, queryVector: number[], topK: number, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Delete vectors by IDs
   * @param sessionId - Session ID
   * @param vectorIds - Array of vector IDs to delete
   */
  deleteVectors(sessionId: string, vectorIds: string[]): Promise<void>;

  /**
   * Save session to S5
   * @param sessionId - Session ID
   * @returns S5 CID
   */
  saveSession(sessionId: string): Promise<string>;

  /**
   * Load session from S5
   * @param sessionId - Session ID
   * @param cid - S5 CID
   */
  loadSession(sessionId: string, cid: string): Promise<void>;

  /**
   * Get session statistics
   * @param sessionId - Session ID
   * @returns Vector database statistics
   */
  getSessionStats(sessionId: string): Promise<VectorDbStats>;

  /**
   * Clear session cache
   * @param sessionId - Session ID
   */
  clearSessionCache(sessionId: string): Promise<void>;

  /**
   * Evict least recently used sessions from cache
   */
  evictLRUSessions(): Promise<void>;

  /**
   * Dispose manager and cleanup all resources
   */
  dispose(): Promise<void>;
}
