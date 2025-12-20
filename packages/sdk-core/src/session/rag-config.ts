/**
 * RAG Session Configuration
 * Type definitions and configuration for RAG integration with SessionManager
 * Max 150 lines
 */

import { SearchOptions } from '../rag/types.js';

/**
 * RAG Session Configuration
 * Controls how RAG context retrieval integrates with LLM sessions
 */
export interface RAGSessionConfig {
  /**
   * Enable/disable RAG for this session
   * Default: false
   */
  enabled: boolean;

  /**
   * Vector DB session ID to use (if already created)
   * Either provide this OR databaseName
   */
  vectorDbSessionId?: string;

  /**
   * Database names to query (supports multi-database selection)
   * Either provide this OR vectorDbSessionId
   *
   * For backward compatibility:
   * - Single database: ['my-db']
   * - Multiple databases: ['db1', 'db2', 'db3']
   * - Results from all databases are merged and ranked by relevance
   */
  databaseNames?: string[];

  /**
   * Number of similar documents to retrieve
   * Default: 5
   */
  topK?: number;

  /**
   * Minimum similarity threshold (0-1)
   * Default: 0.7
   */
  similarityThreshold?: number;

  /**
   * Template for formatting context into prompt
   * Available placeholders: {context}, {sources}
   * Default: "Context from your documents:\n{context}\n\n"
   */
  contextTemplate?: string;

  /**
   * Maximum context length in tokens
   * Default: 2000
   */
  maxContextLength?: number;

  /**
   * Include source references in context
   * Default: true
   */
  includeSources?: boolean;

  /**
   * Metadata filter for vector search
   * Example: { documentType: 'pdf', category: 'technical' }
   */
  metadataFilter?: Record<string, any>;

  /**
   * Enable conversation memory (stores conversation history in vectors)
   * Default: false
   */
  conversationMemory?: {
    enabled: boolean;
    maxRecentMessages?: number;     // Number of recent messages always included (default: 3)
    maxHistoryMessages?: number;    // Max similar historical messages to retrieve (default: 5)
    maxMemoryTokens?: number;       // Max tokens for all memory messages (default: 1000)
    similarityThreshold?: number;   // Min similarity for historical messages (default: 0.6)
  };
}

/**
 * Partial RAG config for merging with defaults
 */
export type PartialRAGSessionConfig = Partial<RAGSessionConfig>;

/**
 * RAG Metrics for tracking context quality and performance
 */
export interface RAGMetrics {
  /**
   * Total number of context retrievals
   */
  totalRetrievals: number;

  /**
   * Average similarity score of retrieved documents
   */
  averageSimilarity: number;

  /**
   * Average retrieval latency in milliseconds
   */
  averageLatencyMs: number;

  /**
   * Number of retrievals with no results
   */
  emptyRetrievals: number;

  /**
   * Total tokens used for context
   */
  totalContextTokens: number;

  /**
   * Cache hit rate (if caching enabled)
   */
  cacheHitRate?: number;
}

/**
 * Context Retrieval Options
 * Options for retrieving and formatting context
 */
export interface ContextRetrievalOptions extends SearchOptions {
  /**
   * The prompt to find context for
   */
  prompt: string;

  /**
   * Context template for formatting
   */
  template?: string;

  /**
   * Maximum context length in tokens
   */
  maxTokens?: number;

  /**
   * Include source references
   */
  includeSources?: boolean;
}

/**
 * Default RAG configuration
 */
export const DEFAULT_RAG_CONFIG: Required<Omit<RAGSessionConfig, 'vectorDbSessionId' | 'databaseNames' | 'metadataFilter' | 'conversationMemory'>> = {
  enabled: false,
  topK: 5,
  similarityThreshold: 0.7,
  contextTemplate: "Context from your documents:\n{context}\n\n",
  maxContextLength: 2000,
  includeSources: true
};

/**
 * Validate RAG configuration
 * @param config - RAG configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateRAGConfig(config: PartialRAGSessionConfig): void {
  if (!config.enabled) {
    return; // No validation needed if disabled
  }

  // Must provide either vectorDbSessionId or databaseNames
  if (!config.vectorDbSessionId && !config.databaseNames) {
    throw new Error('RAG config requires either vectorDbSessionId or databaseNames when enabled');
  }

  // Can't provide both
  if (config.vectorDbSessionId && config.databaseNames) {
    throw new Error('RAG config cannot have both vectorDbSessionId and databaseNames');
  }

  // Validate numeric ranges
  if (config.topK !== undefined && (config.topK < 1 || config.topK > 100)) {
    throw new Error('RAG topK must be between 1 and 100');
  }

  if (config.similarityThreshold !== undefined && (config.similarityThreshold < 0 || config.similarityThreshold > 1)) {
    throw new Error('RAG similarityThreshold must be between 0 and 1');
  }

  if (config.maxContextLength !== undefined && config.maxContextLength < 100) {
    throw new Error('RAG maxContextLength must be at least 100 tokens');
  }
}

/**
 * Merge RAG config with defaults
 * @param config - Partial RAG configuration
 * @returns Complete RAG configuration with defaults
 */
export function mergeRAGConfig(config: PartialRAGSessionConfig = {}): RAGSessionConfig {
  return {
    ...DEFAULT_RAG_CONFIG,
    ...config
  };
}
