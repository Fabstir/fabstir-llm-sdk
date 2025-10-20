// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionCache } from '../../src/storage/SessionCache';
import type { Message } from '../../src/storage/types';

describe('SessionCache', () => {
  let cache: SessionCache<Message[]>;
  
  beforeEach(() => {
    cache = new SessionCache<Message[]>({
      maxEntries: 5,
      defaultTTL: 60000 // 1 minute
    });
  });

  it('stores session in memory', () => {
    const messages: Message[] = [{
      id: '1',
      sessionId: 100,
      role: 'user',
      content: 'Hello',
      timestamp: Date.now()
    }];
    
    cache.set(100, messages);
    const retrieved = cache.get(100);
    
    expect(retrieved).toEqual(messages);
  });

  it('retrieves session by ID', () => {
    const messages: Message[] = [{
      id: '1',
      sessionId: 200,
      role: 'assistant',
      content: 'Hi there',
      timestamp: Date.now()
    }];
    
    cache.set(200, messages);
    
    expect(cache.get(200)).toEqual(messages);
    expect(cache.get(999)).toBeNull(); // Non-existent
  });

  it('updates existing session', () => {
    const original: Message[] = [{
      id: '1',
      sessionId: 300,
      role: 'user',
      content: 'Original',
      timestamp: Date.now()
    }];
    
    const updated: Message[] = [
      ...original,
      {
        id: '2',
        sessionId: 300,
        role: 'assistant',
        content: 'Response',
        timestamp: Date.now() + 1000
      }
    ];
    
    cache.set(300, original);
    cache.set(300, updated);
    
    expect(cache.get(300)).toEqual(updated);
    expect(cache.get(300)).toHaveLength(2);
  });

  it('deletes session from cache', () => {
    const messages: Message[] = [{
      id: '1',
      sessionId: 400,
      role: 'user',
      content: 'Delete me',
      timestamp: Date.now()
    }];
    
    cache.set(400, messages);
    expect(cache.get(400)).toEqual(messages);
    
    cache.delete(400);
    expect(cache.get(400)).toBeNull();
  });

  it('lists all active sessions', () => {
    cache.set(501, []);
    cache.set(502, []);
    cache.set(503, []);
    
    const sessions = cache.list();
    expect(sessions).toContain(501);
    expect(sessions).toContain(502);
    expect(sessions).toContain(503);
    expect(sessions).toHaveLength(3);
  });

  it('clears entire cache', () => {
    cache.set(601, []);
    cache.set(602, []);
    cache.set(603, []);
    
    expect(cache.list()).toHaveLength(3);
    
    cache.clear();
    
    expect(cache.list()).toHaveLength(0);
    expect(cache.get(601)).toBeNull();
  });

  it('handles memory limits', () => {
    // Cache configured with maxEntries: 5
    cache.set(701, []);
    cache.set(702, []);
    cache.set(703, []);
    cache.set(704, []);
    cache.set(705, []);
    
    expect(cache.list()).toHaveLength(5);
    
    // Adding 6th should evict oldest (LRU)
    cache.set(706, []);
    
    expect(cache.list()).toHaveLength(5);
    expect(cache.get(701)).toBeNull(); // Evicted
    expect(cache.get(706)).toEqual([]); // Still there
  });

  it('respects TTL expiration', async () => {
    const shortCache = new SessionCache<Message[]>({
      defaultTTL: 100 // 100ms
    });
    
    shortCache.set(800, []);
    expect(shortCache.get(800)).toEqual([]);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(shortCache.get(800)).toBeNull(); // Expired
  });

  it('returns cache statistics', () => {
    cache.set(901, []);
    cache.set(902, []);
    
    const stats = cache.getStats();
    
    expect(stats.size).toBe(2);
    expect(stats.maxEntries).toBe(5);
    expect(stats.hitRate).toBeDefined();
  });

  it('implements LRU eviction policy', () => {
    // Fill cache to limit
    cache.set(1001, []);
    cache.set(1002, []);
    cache.set(1003, []);
    cache.set(1004, []);
    cache.set(1005, []);
    
    // Access some to make them "recently used"
    cache.get(1001);
    cache.get(1003);
    
    // Add new item, should evict least recently used (1002)
    cache.set(1006, []);
    
    expect(cache.get(1001)).toEqual([]); // Still there (recently used)
    expect(cache.get(1002)).toBeNull(); // Evicted (least recently used)
    expect(cache.get(1003)).toEqual([]); // Still there (recently used)
  });
});