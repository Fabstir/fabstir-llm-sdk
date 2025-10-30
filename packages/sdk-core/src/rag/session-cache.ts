/**
 * Session Cache
 * LRU cache for vector database sessions
 * Max 200 lines
 */

/**
 * Cache entry with LRU tracking
 */
interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
  accessCount: number;
}

/**
 * LRU Cache for session objects
 * Automatically evicts least recently used entries when capacity is reached
 */
export class SessionCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxSize: number;

  /**
   * Create a new session cache
   * @param maxSize - Maximum number of entries to cache (default: 100)
   */
  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Get an entry from the cache
   * Updates last accessed time
   *
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.accessCount++;

    return entry.value;
  }

  /**
   * Set an entry in the cache
   * Evicts LRU entry if cache is full
   *
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: string, value: T): void {
    // If cache is full, evict LRU entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Add or update entry
    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
      accessCount: 1
    });
  }

  /**
   * Check if key exists in cache
   *
   * @param key - Cache key
   * @returns True if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete an entry from the cache
   *
   * @param key - Cache key
   * @returns True if entry was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get number of entries in cache
   *
   * @returns Number of cached entries
   */
  size(): number {
    return this.cache.size();
  }

  /**
   * Get all keys in cache
   *
   * @returns Array of cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache
   *
   * @returns Array of cached values
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Evict the least recently used entry
   * @private
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find the entry with the oldest lastAccessed time
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Evict multiple LRU entries
   *
   * @param count - Number of entries to evict
   * @returns Number of entries evicted
   */
  evictMultiple(count: number): number {
    const entries = Array.from(this.cache.entries());

    // Sort by lastAccessed (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Evict the oldest entries
    const toEvict = Math.min(count, entries.length);
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
    }

    return toEvict;
  }

  /**
   * Get cache statistics
   *
   * @returns Cache statistics object
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    averageAccessCount: number;
  } {
    const totalAccess = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);

    const averageAccessCount = this.cache.size > 0
      ? totalAccess / this.cache.size
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0,  // Would need separate tracking for hits/misses
      averageAccessCount
    };
  }

  /**
   * Prune entries that haven't been accessed in specified time
   *
   * @param maxAge - Maximum age in milliseconds
   * @returns Number of entries pruned
   */
  pruneOld(maxAge: number): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastAccessed > maxAge) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}
