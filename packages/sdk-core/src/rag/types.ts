/**
 * RAG System Type Definitions
 * Types for vector database operations and RAG functionality
 * Max 150 lines
 */

/**
 * Configuration for RAG system
 */
export interface RAGConfig {
  /**
   * Number of vectors per chunk (default: 10000)
   * Controls memory efficiency vs search speed tradeoff
   */
  chunkSize: number;

  /**
   * Cache size in megabytes (default: 150)
   * Higher values improve search speed for large datasets
   */
  cacheSizeMb: number;

  /**
   * Enable encryption at rest (default: true)
   * Vectors are encrypted when stored on S5 network
   */
  encryptAtRest: boolean;

  /**
   * S5 portal URL for decentralized storage
   * Example: 'http://localhost:5522' or 'https://s5.example.com'
   */
  s5Portal: string;
}

/**
 * Partial RAG configuration for merging with defaults
 */
export type PartialRAGConfig = Partial<RAGConfig>;

/**
 * Vector record with embedding and metadata
 */
export interface VectorRecord {
  /**
   * Unique identifier for this vector
   */
  id: string;

  /**
   * Vector embedding (typically 384 dimensions for all-MiniLM-L6-v2)
   */
  vector: number[];

  /**
   * Native JavaScript object metadata (no JSON.stringify needed)
   */
  metadata: Record<string, any>;
}

/**
 * Search options for vector queries
 */
export interface SearchOptions {
  /**
   * Number of results to return (default: 5)
   */
  topK?: number;

  /**
   * Minimum similarity threshold (0-1, default: 0.7)
   * Only return results with similarity >= threshold
   */
  threshold?: number;

  /**
   * Metadata filter (optional)
   * Example: { source: 'document.txt', category: 'tech' }
   */
  filter?: Record<string, any>;
}

/**
 * Search result with similarity score
 */
export interface SearchResult extends VectorRecord {
  /**
   * Similarity score (0-1, higher is more similar)
   */
  score: number;
}

/**
 * Vector database statistics
 */
export interface VectorDbStats {
  /**
   * Total number of vectors in database
   */
  totalVectors: number;

  /**
   * Total number of chunks (vectors / chunkSize)
   */
  totalChunks: number;

  /**
   * Estimated memory usage in megabytes
   */
  memoryUsageMb: number;

  /**
   * Last update timestamp
   */
  lastUpdated: number;
}

/**
 * Vector database metadata for S5 storage
 */
export interface VectorDbMetadata {
  /**
   * Database name
   */
  name: string;

  /**
   * Database description
   */
  description?: string;

  /**
   * Owner's Ethereum address
   */
  owner: string;

  /**
   * Database configuration
   */
  config: RAGConfig;

  /**
   * Creation timestamp
   */
  createdAt: number;

  /**
   * Last update timestamp
   */
  updatedAt: number;

  /**
   * S5 CID pointing to vector data
   */
  vectorsCid?: string;

  /**
   * Access control (future: Phase 7)
   */
  permissions?: VectorDbPermissions;
}

/**
 * Access control permissions for vector databases
 */
export interface VectorDbPermissions {
  /**
   * Read-only access (Ethereum addresses)
   */
  readers?: string[];

  /**
   * Read-write access (Ethereum addresses)
   */
  writers?: string[];
}

/**
 * RAG context to inject into LLM sessions
 */
export interface RAGContext {
  /**
   * Vector database ID to query
   */
  vectorDbId: string;

  /**
   * Number of relevant documents to retrieve (default: 5)
   */
  topK?: number;

  /**
   * Minimum relevance threshold (default: 0.7)
   */
  threshold?: number;

  /**
   * Optional metadata filter
   */
  filter?: Record<string, any>;
}
