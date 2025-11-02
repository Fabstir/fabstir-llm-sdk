/**
 * Cache Manager
 * Multi-level caching system with LRU eviction
 * Max 400 lines
 */

export interface CacheConfig {
  maxSize: number;
  ttl?: number; // Time to live in milliseconds
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
}

export interface CacheEntry<T = any> {
  value: T;
  timestamp: number;
  ttl?: number;
  accessCount: number;
  lastAccess: number;
  priority?: number;
  namespace?: string;
}

export interface CacheOptions {
  ttl?: number;
  priority?: number;
  namespace?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0
  };
  private accessCounter = 0; // Monotonic counter for access ordering

  constructor(config: CacheConfig) {
    this.config = {
      maxSize: config.maxSize,
      ttl: config.ttl || 3600000, // Default 1 hour
      evictionPolicy: config.evictionPolicy || 'lru'
    };
  }

  /**
   * Set a cache entry
   */
  set<T>(key: string, value: T, options?: CacheOptions): void {
    const now = Date.now();
    const ttl = options?.ttl || this.config.ttl;

    // Remove expired entry if exists
    this.evictExpired(key);

    // Check if we need to evict
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    // If entry exists, update it while preserving access stats
    const existing = this.cache.get(key);
    if (existing) {
      existing.value = value;
      existing.timestamp = now;
      existing.ttl = ttl;
      if (options?.priority !== undefined) existing.priority = options.priority;
      if (options?.namespace !== undefined) existing.namespace = options.namespace;
    } else {
      // Create new entry
      const entry: CacheEntry<T> = {
        value,
        timestamp: now,
        ttl,
        accessCount: 0,
        lastAccess: ++this.accessCounter, // Use monotonic counter
        priority: options?.priority,
        namespace: options?.namespace
      };

      this.cache.set(key, entry);
    }
  }

  /**
   * Get a cache entry
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = ++this.accessCounter; // Use monotonic counter
    this.stats.hits++;

    return entry.value as T;
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      size: this.cache.size,
      maxSize: this.config.maxSize
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Invalidate all entries in a namespace
   */
  invalidateNamespace(namespace: string): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.namespace === namespace) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Warm cache with multiple entries
   */
  warm(entries: Map<string, any>, options?: CacheOptions): void {
    for (const [key, value] of entries.entries()) {
      // Set without counting as hit
      const now = Date.now();
      const ttl = options?.ttl || this.config.ttl;

      const entry: CacheEntry = {
        value,
        timestamp: now,
        ttl,
        accessCount: 0,
        lastAccess: ++this.accessCounter, // Use monotonic counter
        priority: options?.priority,
        namespace: options?.namespace
      };

      // Evict if needed
      if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
        this.evict();
      }

      this.cache.set(key, entry);
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    return entry.timestamp + (entry.ttl || this.config.ttl) < now;
  }

  /**
   * Evict expired entry
   */
  private evictExpired(key: string): void {
    const entry = this.cache.get(key);
    if (entry && this.isExpired(entry)) {
      this.cache.delete(key);
    }
  }

  /**
   * Evict entries based on policy
   */
  private evict(): void {
    if (this.cache.size === 0) return;

    switch (this.config.evictionPolicy) {
      case 'lru':
        this.evictLRU();
        break;
      case 'lfu':
        this.evictLFU();
        break;
      case 'fifo':
        this.evictFIFO();
        break;
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let targetKey: string | null = null;
    let oldestAccess = Infinity;
    let lowestPriority = Infinity; // Start with highest possible to find minimum

    for (const [key, entry] of this.cache.entries()) {
      // First, check for expired entries
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        return;
      }

      const priority = entry.priority ?? 5; // Default priority

      // Evict entries with lower priority first, then oldest access within same priority
      if (priority < lowestPriority ||
          (priority === lowestPriority && entry.lastAccess < oldestAccess)) {
        targetKey = key;
        oldestAccess = entry.lastAccess;
        lowestPriority = priority;
      }
    }

    if (targetKey) {
      this.cache.delete(targetKey);
    }
  }

  /**
   * Evict least frequently used entry
   */
  private evictLFU(): void {
    let targetKey: string | null = null;
    let minAccessCount = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        return;
      }

      if (entry.accessCount < minAccessCount) {
        targetKey = key;
        minAccessCount = entry.accessCount;
      }
    }

    if (targetKey) {
      this.cache.delete(targetKey);
    }
  }

  /**
   * Evict first in first out
   */
  private evictFIFO(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        return;
      }

      if (entry.timestamp < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = entry.timestamp;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get cache size
   */
  size(): number {
    // Clean up expired entries first
    this.cleanup();
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}
