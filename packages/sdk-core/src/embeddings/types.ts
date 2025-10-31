/**
 * Embedding Types
 * Type definitions for embedding generation system
 * Max 120 lines
 */

/**
 * Supported embedding providers
 */
export enum EmbeddingProvider {
  OpenAI = 'openai',
  Cohere = 'cohere',
  Host = 'host'  // Future: host-side embedding (Sub-phase 4.2)
}

/**
 * Embedding model configuration
 */
export interface EmbeddingModel {
  provider: EmbeddingProvider;
  modelName: string;
  dimensions: number;
  maxBatchSize: number;
  costPer1MTokens: number;  // USD
}

/**
 * Predefined embedding models
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  // OpenAI models
  'openai-small': {
    provider: EmbeddingProvider.OpenAI,
    modelName: 'text-embedding-3-small',
    dimensions: 384,  // Reduced from default 1536
    maxBatchSize: 2048,
    costPer1MTokens: 0.02
  },

  // Cohere models
  'cohere-light': {
    provider: EmbeddingProvider.Cohere,
    modelName: 'embed-english-light-v3.0',
    dimensions: 384,
    maxBatchSize: 96,
    costPer1MTokens: 0.10
  }
};

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  texts: string[];
  model?: string;  // Defaults to provider's recommended model
  inputType?: 'search_document' | 'search_query';  // Cohere-specific
}

/**
 * Single embedding result
 */
export interface EmbeddingResult {
  embedding: number[];
  text: string;
  tokenCount: number;
}

/**
 * Batch embedding response
 */
export interface EmbeddingResponse {
  embeddings: EmbeddingResult[];
  model: string;
  provider: EmbeddingProvider;
  totalTokens: number;
  cost: number;  // USD
}

/**
 * Embedding service configuration
 */
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey: string;
  model?: string;  // Optional model override
  maxRetries?: number;
  retryDelay?: number;  // milliseconds
  timeout?: number;  // milliseconds

  // Rate limiting
  maxRequestsPerMinute?: number;
  maxTokensPerMinute?: number;

  // Cost limits
  maxDailyCostUsd?: number;

  // Caching
  cacheEnabled?: boolean;
  maxCacheSize?: number;  // entries
  cacheExpiration?: number;  // milliseconds
}

/**
 * Cost tracking entry
 */
export interface CostEntry {
  timestamp: number;
  provider: EmbeddingProvider;
  model: string;
  tokenCount: number;
  cost: number;  // USD
}

/**
 * Cost statistics
 */
export interface CostStats {
  totalCost: number;  // USD
  totalTokens: number;
  totalRequests: number;
  costByProvider: Record<EmbeddingProvider, number>;
  costByDay: Record<string, number>;  // ISO date string -> cost
}

/**
 * Rate limit state
 */
export interface RateLimitState {
  requestsThisMinute: number;
  tokensThisMinute: number;
  lastResetTime: number;
  waitTimeMs: number;  // 0 if no wait needed
}
