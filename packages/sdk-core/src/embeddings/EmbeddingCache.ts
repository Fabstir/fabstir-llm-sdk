/**
 * Embedding Cache
 * LRU cache for embedding results to reduce API costs
 * Max 200 lines
 */

import { createHash } from 'crypto';
import { EmbeddingService } from './EmbeddingService.js';
import { EmbeddingResult, EmbeddingResponse } from './types.js';

interface CacheEntry {
  result: EmbeddingResult;
  timestamp: number;
}

interface CacheOptions {
  maxSize: number;
  expirationMs: number;
}

/**
 * Embedding cache with LRU eviction
 */
export class EmbeddingCache {
  private adapter: EmbeddingService;
  private cache: Map<string, CacheEntry>;
  private accessOrder: string[];  // For LRU tracking
  private maxSize: number;
  private expirationMs: number;

  // Statistics
  private hits: number = 0;
  private misses: number = 0;

  constructor(adapter: EmbeddingService, options: CacheOptions) {
    this.adapter = adapter;
    this.cache = new Map();
    this.accessOrder = [];
    this.maxSize = options.maxSize;
    this.expirationMs = options.expirationMs;
  }

  /**
   * Generate cache key
   */
  private generateKey(text: string): string {
    const content = `${this.adapter['provider']}-${this.adapter['model']}-${text}`;
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.expirationMs;
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Get cached result
   */
  private getCached(text: string): EmbeddingResult | null {
    const key = this.generateKey(text);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    this.updateAccessOrder(key);
    return entry.result;
  }

  /**
   * Set cached result
   */
  private setCached(text: string, result: EmbeddingResult): void {
    const key = this.generateKey(text);

    // Evict if at max size
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });

    this.updateAccessOrder(key);
  }

  /**
   * Embed single text with caching
   */
  async embedText(text: string, inputType?: string): Promise<EmbeddingResult> {
    // Check cache first
    const cached = this.getCached(text);
    if (cached) {
      return cached;
    }

    // Cache miss - call adapter
    const result = await this.adapter.embedText(text, inputType);
    this.setCached(text, result);
    return result;
  }

  /**
   * Embed batch with partial caching
   */
  async embedBatch(texts: string[], inputType?: string): Promise<EmbeddingResponse> {
    const results: EmbeddingResult[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const cached = this.getCached(texts[i]);
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // Fetch uncached texts
    if (uncachedTexts.length > 0) {
      const response = await this.adapter.embedBatch(uncachedTexts, inputType);

      // Store in cache and results
      response.embeddings.forEach((embedding, idx) => {
        const originalIndex = uncachedIndices[idx];
        results[originalIndex] = embedding;
        this.setCached(texts[originalIndex], embedding);
      });

      // Return combined results
      const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
      return {
        embeddings: results,
        model: response.model,
        provider: response.provider,
        totalTokens,
        cost: response.cost
      };
    }

    // All cached - construct response
    const totalTokens = results.reduce((sum, r) => sum + r.tokenCount, 0);
    return {
      embeddings: results,
      model: this.adapter['model'],
      provider: this.adapter['provider'],
      totalTokens,
      cost: 0  // No cost for cached results
    };
  }

  /**
   * Get hit rate
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  /**
   * Get cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Check if text is cached
   */
  has(text: string): boolean {
    const key = this.generateKey(text);
    const entry = this.cache.get(key);
    return entry !== undefined && !this.isExpired(entry);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: this.getHitRate()
    };
  }
}
