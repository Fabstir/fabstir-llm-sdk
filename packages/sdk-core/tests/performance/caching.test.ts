/**
 * Caching Tests
 * Tests for multi-level caching system
 * Max 250 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CacheManager } from '../../src/optimization/cache-manager.js';

describe('Cache Manager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      maxSize: 100,
      ttl: 60000, // 1 minute
      evictionPolicy: 'lru'
    });
  });

  describe('Basic Operations', () => {
    it('should set and get cached values', () => {
      cacheManager.set('key1', { data: 'value1' });

      const result = cacheManager.get('key1');
      expect(result).toEqual({ data: 'value1' });
    });

    it('should return undefined for non-existent keys', () => {
      const result = cacheManager.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should update existing keys', () => {
      cacheManager.set('key1', { data: 'value1' });
      cacheManager.set('key1', { data: 'value2' });

      const result = cacheManager.get('key1');
      expect(result).toEqual({ data: 'value2' });
    });

    it('should delete cached values', () => {
      cacheManager.set('key1', { data: 'value1' });
      cacheManager.delete('key1');

      const result = cacheManager.get('key1');
      expect(result).toBeUndefined();
    });

    it('should clear all cached values', () => {
      cacheManager.set('key1', { data: 'value1' });
      cacheManager.set('key2', { data: 'value2' });
      cacheManager.clear();

      expect(cacheManager.get('key1')).toBeUndefined();
      expect(cacheManager.get('key2')).toBeUndefined();
    });
  });

  describe('Eviction Policy', () => {
    it('should evict least recently used items when cache is full', () => {
      const smallCache = new CacheManager({ maxSize: 3, evictionPolicy: 'lru' });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it more recently used
      smallCache.get('key1');

      // Add key4, should evict key2 (least recently used)
      smallCache.set('key4', 'value4');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeUndefined();
      expect(smallCache.get('key3')).toBe('value3');
      expect(smallCache.get('key4')).toBe('value4');
    });

    it('should update access time on get operations', () => {
      const smallCache = new CacheManager({ maxSize: 2, evictionPolicy: 'lru' });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');

      // Access key1 multiple times
      smallCache.get('key1');
      smallCache.get('key1');

      // Add key3, should evict key2
      smallCache.set('key3', 'value3');

      expect(smallCache.get('key1')).toBe('value1');
      expect(smallCache.get('key2')).toBeUndefined();
      expect(smallCache.get('key3')).toBe('value3');
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const shortTTL = new CacheManager({ maxSize: 10, ttl: 100 }); // 100ms

      shortTTL.set('key1', 'value1');
      expect(shortTTL.get('key1')).toBe('value1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(shortTTL.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', async () => {
      const longTTL = new CacheManager({ maxSize: 10, ttl: 500 }); // 500ms

      longTTL.set('key1', 'value1');

      // Wait less than TTL
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(longTTL.get('key1')).toBe('value1');
    });

    it('should allow custom TTL per entry', async () => {
      cacheManager.set('key1', 'value1', { ttl: 100 });
      cacheManager.set('key2', 'value2', { ttl: 500 });

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cacheManager.get('key1')).toBeUndefined();
      expect(cacheManager.get('key2')).toBe('value2');
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', () => {
      cacheManager.set('key1', 'value1');

      cacheManager.get('key1'); // hit
      cacheManager.get('key2'); // miss
      cacheManager.get('key1'); // hit
      cacheManager.get('key3'); // miss

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should calculate correct hit rate', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');

      // 3 hits, 1 miss
      cacheManager.get('key1');
      cacheManager.get('key2');
      cacheManager.get('key1');
      cacheManager.get('key3');

      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBe(0.75);
    });

    it('should track cache size', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.set('key2', 'value2');
      cacheManager.set('key3', 'value3');

      const stats = cacheManager.getStats();
      expect(stats.size).toBe(3);
    });

    it('should reset statistics', () => {
      cacheManager.set('key1', 'value1');
      cacheManager.get('key1');
      cacheManager.get('key2');

      cacheManager.resetStats();

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('Multi-level Caching', () => {
    it('should support namespace-based cache levels', () => {
      cacheManager.set('search:query1', { results: [] }, { namespace: 'search' });
      cacheManager.set('vector:id1', { data: [] }, { namespace: 'vector' });

      expect(cacheManager.get('search:query1')).toBeDefined();
      expect(cacheManager.get('vector:id1')).toBeDefined();
    });

    it('should invalidate entire namespaces', () => {
      cacheManager.set('search:query1', { results: [] }, { namespace: 'search' });
      cacheManager.set('search:query2', { results: [] }, { namespace: 'search' });
      cacheManager.set('vector:id1', { data: [] }, { namespace: 'vector' });

      cacheManager.invalidateNamespace('search');

      expect(cacheManager.get('search:query1')).toBeUndefined();
      expect(cacheManager.get('search:query2')).toBeUndefined();
      expect(cacheManager.get('vector:id1')).toBeDefined();
    });

    it('should support priority-based eviction', () => {
      const cache = new CacheManager({ maxSize: 3, evictionPolicy: 'lru' });

      cache.set('low', 'value1', { priority: 1 });
      cache.set('medium', 'value2', { priority: 5 });
      cache.set('high', 'value3', { priority: 10 });

      // Add one more, should evict low priority first
      cache.set('new', 'value4', { priority: 5 });

      expect(cache.get('low')).toBeUndefined();
      expect(cache.get('medium')).toBe('value2');
      expect(cache.get('high')).toBe('value3');
      expect(cache.get('new')).toBe('value4');
    });
  });

  describe('Cache Warming', () => {
    it('should preload multiple entries', () => {
      const entries = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ]);

      cacheManager.warm(entries);

      expect(cacheManager.get('key1')).toBe('value1');
      expect(cacheManager.get('key2')).toBe('value2');
      expect(cacheManager.get('key3')).toBe('value3');
    });

    it('should not count warm entries as cache hits', () => {
      const entries = new Map([['key1', 'value1']]);
      cacheManager.warm(entries);

      const stats = cacheManager.getStats();
      expect(stats.hits).toBe(0);
    });
  });
});
