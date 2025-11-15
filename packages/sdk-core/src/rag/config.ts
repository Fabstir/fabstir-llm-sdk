/**
 * RAG System Configuration
 * Default configuration and validation for RAG system
 * Max 100 lines
 */

import { RAGConfig, PartialRAGConfig } from './types.js';

/**
 * Default RAG configuration
 * Optimized for 10x memory efficiency and sub-100ms search latency
 */
export const DEFAULT_RAG_CONFIG: RAGConfig = {
  chunkSize: 10000,          // 10K vectors per chunk (64MB for 100K vectors)
  cacheSizeMb: 150,          // 150MB cache for fast search
  encryptAtRest: true,       // Encryption enabled by default
  s5Portal: 'http://localhost:5522'  // Local S5 portal (override in production)
};

/**
 * Validate RAG configuration
 * Throws error if configuration is invalid
 *
 * @param config - Partial or full RAG configuration
 * @throws Error if validation fails
 */
export function validateRAGConfig(config: PartialRAGConfig): void {
  // Validate chunk size
  if (config.chunkSize !== undefined) {
    if (config.chunkSize <= 0) {
      throw new Error('chunkSize must be positive');
    }
    if (!Number.isInteger(config.chunkSize)) {
      throw new Error('chunkSize must be an integer');
    }
  }

  // Validate cache size
  if (config.cacheSizeMb !== undefined) {
    if (config.cacheSizeMb < 10 || config.cacheSizeMb > 1000) {
      throw new Error('cacheSizeMb must be between 10 and 1000');
    }
  }

  // Validate S5 portal URL
  if (config.s5Portal !== undefined) {
    try {
      const url = new URL(config.s5Portal);
      const validProtocols = ['http:', 'https:', 'ws:', 'wss:'];
      if (!validProtocols.includes(url.protocol)) {
        throw new Error('s5Portal must use http, https, ws, or wss protocol');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('protocol')) {
        throw error;
      }
      throw new Error('s5Portal must be a valid URL');
    }
  }
}

/**
 * Merge partial configuration with defaults
 * Returns a complete RAG configuration
 *
 * @param partial - Partial configuration to merge
 * @returns Complete RAG configuration
 */
export function mergeRAGConfig(partial: PartialRAGConfig): RAGConfig {
  // Validate before merging
  validateRAGConfig(partial);

  // Merge with defaults
  return {
    ...DEFAULT_RAG_CONFIG,
    ...partial
  };
}

/**
 * Get S5 portal URL from environment or config
 * Priority: env var > config > default
 *
 * @param config - Optional partial configuration
 * @returns S5 portal URL
 */
export function getS5PortalUrl(config?: PartialRAGConfig): string {
  // Check environment variable first
  const envPortal = process.env.S5_PORTAL_URL;
  if (envPortal) {
    return envPortal;
  }

  // Use config or default
  return config?.s5Portal || DEFAULT_RAG_CONFIG.s5Portal;
}

/**
 * Estimate memory usage for a given number of vectors
 * Based on: 384 dimensions * 4 bytes/float = 1.5KB per vector
 * Plus metadata overhead
 *
 * @param vectorCount - Number of vectors
 * @param dimensionality - Vector dimensions (default: 384)
 * @returns Estimated memory usage in MB
 */
export function estimateMemoryUsage(
  vectorCount: number,
  dimensionality: number = 384
): number {
  // Bytes per vector: dimensions * 4 bytes (float32) + metadata overhead (~100 bytes)
  const bytesPerVector = (dimensionality * 4) + 100;
  const totalBytes = vectorCount * bytesPerVector;
  return totalBytes / (1024 * 1024);  // Convert to MB
}
