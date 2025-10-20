// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { CacheConfig, CacheEntry } from './types';

export class SessionCache<T> {
  private cache = new Map<number, CacheEntry<T>>();
  private accessOrder: number[] = [];
  private hits = 0; private misses = 0;
  private maxEntries: number;
  private defaultTTL: number;

  constructor(config: CacheConfig = {}) {
    this.maxEntries = config.maxEntries || 100;
    this.defaultTTL = config.defaultTTL || 300000;
  }

  set(key: number, data: T): void {
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      const lru = this.accessOrder.shift();
      if (lru !== undefined) this.cache.delete(lru);
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl: this.defaultTTL });
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  get(key: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) { this.misses++; return null; }
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key); this.misses++; return null;
    }
    this.hits++;
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    return entry.data;
  }

  delete(key: number): void { this.cache.delete(key); this.accessOrder = this.accessOrder.filter(k => k !== key); }
  list(): number[] { return Array.from(this.cache.keys()); }
  clear(): void { this.cache.clear(); this.accessOrder = []; }
  getStats() { return { size: this.cache.size, maxEntries: this.maxEntries, hitRate: this.hits / (this.hits + this.misses) || 0 }; }
}