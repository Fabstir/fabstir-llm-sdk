/**
 * MockStorage - localStorage wrapper that simulates S5 encrypted storage
 *
 * Provides:
 * - localStorage persistence (survives page refresh)
 * - Namespace isolation (per-user, per-resource type)
 * - JSON serialization
 * - Simple CRUD operations
 */

export class MockStorage {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = `fabstir-mock-${prefix}`;
  }

  /**
   * Store a value with a key
   */
  set(key: string, value: any): void {
    const fullKey = `${this.prefix}-${key}`;
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch (error) {
      console.error(`[MockStorage] Failed to set ${fullKey}:`, error);
    }
  }

  /**
   * Retrieve a value by key
   */
  get<T = any>(key: string): T | null {
    const fullKey = `${this.prefix}-${key}`;
    const value = localStorage.getItem(fullKey);

    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[MockStorage] Failed to parse ${fullKey}:`, error);
      return value as T;
    }
  }

  /**
   * Delete a value by key
   */
  delete(key: string): void {
    const fullKey = `${this.prefix}-${key}`;
    localStorage.removeItem(fullKey);
  }

  /**
   * Get all values with this prefix
   */
  getAll<T = any>(): T[] {
    const results: T[] = [];
    const prefixLength = this.prefix.length + 1;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}-`)) {
          const value = this.get<T>(key.substring(prefixLength));
          if (value !== null) {
            results.push(value);
          }
        }
      }
    } catch (error) {
      console.error('[MockStorage] Failed to getAll:', error);
    }

    return results;
  }

  /**
   * Clear all values with this prefix
   */
  clear(): void {
    const keysToDelete: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}-`)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => localStorage.removeItem(key));
      console.log(`[MockStorage] Cleared ${keysToDelete.length} items with prefix: ${this.prefix}`);
    } catch (error) {
      console.error('[MockStorage] Failed to clear:', error);
    }
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    const fullKey = `${this.prefix}-${key}`;
    return localStorage.getItem(fullKey) !== null;
  }

  /**
   * Get all keys with this prefix
   */
  keys(): string[] {
    const keys: string[] = [];
    const prefixLength = this.prefix.length + 1;

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${this.prefix}-`)) {
          keys.push(key.substring(prefixLength));
        }
      }
    } catch (error) {
      console.error('[MockStorage] Failed to get keys:', error);
    }

    return keys;
  }

  /**
   * Get the number of items with this prefix
   */
  size(): number {
    return this.keys().length;
  }
}
