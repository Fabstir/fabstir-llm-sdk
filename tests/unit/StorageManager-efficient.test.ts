// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Exchange, SessionMetadata, SessionSummary } from '../../src/managers/StorageManager';

// Mock the modules before importing anything that uses them
vi.mock('fake-indexeddb/auto', () => ({}));

const mockS5Client = {
  recoverIdentityFromSeedPhrase: vi.fn(),
  registerOnNewPortal: vi.fn(),
  fs: {
    ensureIdentityInitialized: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    list: vi.fn()
  }
};

vi.mock('@s5-dev/s5js', () => ({
  S5: {
    create: vi.fn().mockResolvedValue(mockS5Client)
  }
}));

// Now import after mocks are set up
import StorageManager from '../../src/managers/StorageManager';
import AuthManager from '../../src/managers/AuthManager';

describe('StorageManager - Efficient Exchange Storage', () => {
  let storageManager: StorageManager;
  let authManager: AuthManager;
  
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Setup mock AuthManager
    authManager = {
      getS5Seed: vi.fn().mockReturnValue('test-seed-phrase'),
      getUserAddress: vi.fn().mockReturnValue('0xTestUser123')
    } as any;
    
    // Reset mock implementations
    mockS5Client.recoverIdentityFromSeedPhrase.mockResolvedValue(undefined);
    mockS5Client.registerOnNewPortal.mockResolvedValue(undefined);
    mockS5Client.fs.ensureIdentityInitialized.mockResolvedValue(undefined);
    mockS5Client.fs.put.mockResolvedValue(undefined);
    mockS5Client.fs.get.mockResolvedValue(null);
    mockS5Client.fs.list.mockImplementation(async function*() {});
    
    storageManager = new StorageManager();
  });
  
  describe('O(1) Storage Complexity', () => {
    it('should store only the new exchange, not the entire conversation', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'test-session-123';
      const exchange1: Exchange = {
        prompt: 'Hello AI',
        response: 'Hello! How can I help?',
        timestamp: Date.now(),
        tokensUsed: 10
      };
      
      // Store first exchange
      await storageManager.storeExchange(sessionId, exchange1);
      
      // Verify only the exchange was stored, not a growing blob
      expect(mockS5Client.fs.put).toHaveBeenCalledTimes(3); // exchange + summary + counter
      const exchangeCall = mockS5Client.fs.put.mock.calls[0];
      expect(exchangeCall[0]).toMatch(/exchanges\/\d+-\w+\.json$/);
      expect(exchangeCall[1]).toEqual(exchange1);
      
      // Store second exchange
      const exchange2: Exchange = {
        prompt: 'What is the weather?',
        response: 'I cannot check real-time weather.',
        timestamp: Date.now() + 1000,
        tokensUsed: 15
      };
      
      mockS5Client.fs.put.mockClear();
      await storageManager.storeExchange(sessionId, exchange2);
      
      // Verify only the new exchange was stored (O(1) operation)
      expect(mockS5Client.fs.put).toHaveBeenCalledTimes(3); // exchange + summary + counter
      const secondCall = mockS5Client.fs.put.mock.calls[0];
      expect(secondCall[0]).toMatch(/exchanges\/\d+-\w+\.json$/);
      expect(secondCall[1]).toEqual(exchange2);
      
      // Verify we're NOT storing the entire conversation history
      expect(secondCall[1]).not.toHaveProperty('history');
      expect(JSON.stringify(secondCall[1])).not.toContain(exchange1.prompt);
    });
    
    it('should prevent timestamp collisions with random suffix', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'test-session';
      const timestamp = Date.now();
      
      // Store multiple exchanges with same timestamp
      const exchanges = Array.from({ length: 3 }, (_, i) => ({
        prompt: `Prompt ${i}`,
        response: `Response ${i}`,
        timestamp,
        tokensUsed: 5
      }));
      
      const storedPaths = new Set<string>();
      
      for (const exchange of exchanges) {
        await storageManager.storeExchange(sessionId, exchange);
        const call = mockS5Client.fs.put.mock.calls.find(c => 
          c[0].includes('/exchanges/') && c[1].prompt === exchange.prompt
        );
        storedPaths.add(call[0]);
      }
      
      // All paths should be unique despite same timestamp
      expect(storedPaths.size).toBe(3);
      storedPaths.forEach(path => {
        expect(path).toMatch(new RegExp(`${timestamp}-\\w+\\.json$`));
      });
    });
  });
  
  describe('Efficient Retrieval', () => {
    it('should retrieve only recent exchanges without loading entire history', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'test-session';
      const mockExchanges = Array.from({ length: 20 }, (_, i) => ({
        type: 'file',
        name: `${Date.now() + i * 1000}-abc${i}.json`,
        path: `path/to/${Date.now() + i * 1000}-abc${i}.json`
      }));
      
      // Mock async iterator for list
      mockS5Client.fs.list.mockImplementation(async function*() {
        for (const item of mockExchanges) {
          yield item;
        }
      });
      
      // Mock get to return exchange data
      mockS5Client.fs.get.mockImplementation((path: string) => {
        const filename = path.split('/').pop()!;
        const timestamp = parseInt(filename.split('-')[0]);
        const index = mockExchanges.findIndex(e => e.name === filename);
        return Promise.resolve({
          prompt: `Prompt ${index}`,
          response: `Response ${index}`,
          timestamp,
          tokensUsed: 5
        });
      });
      
      // Get only 5 recent exchanges
      const recent = await storageManager.getRecentExchanges(sessionId, 5);
      
      // Should only load 5 exchanges, not all 20
      expect(recent).toHaveLength(5);
      expect(mockS5Client.fs.get).toHaveBeenCalledTimes(5);
      
      // Verify they are the most recent (highest timestamps)
      const sortedTimestamps = recent.map(e => e.timestamp).sort((a, b) => b! - a!);
      expect(recent.map(e => e.timestamp)).toEqual(sortedTimestamps.reverse());
    });
    
    it('should stream exchanges efficiently with iterator', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'test-session';
      const mockExchanges = Array.from({ length: 100 }, (_, i) => ({
        type: 'file',
        name: `${1000000 + i * 1000}-xyz${i}.json`,
        path: `path/to/${1000000 + i * 1000}-xyz${i}.json`
      }));
      
      // Mock async iterator
      mockS5Client.fs.list.mockImplementation(async function*(path: string, options: any) {
        const start = options?.cursor ? parseInt(options.cursor) : 0;
        const limit = options?.limit || mockExchanges.length;
        
        for (let i = start; i < Math.min(start + limit, mockExchanges.length); i++) {
          yield { ...mockExchanges[i], cursor: i.toString() };
        }
      });
      
      mockS5Client.fs.get.mockImplementation((path: string) => {
        const filename = path.split('/').pop()!;
        const timestamp = parseInt(filename.split('-')[0]);
        return Promise.resolve({
          prompt: `Prompt for ${timestamp}`,
          response: `Response for ${timestamp}`,
          timestamp,
          tokensUsed: 5
        });
      });
      
      // Stream first 10 exchanges
      const streamed: Exchange[] = [];
      let count = 0;
      
      for await (const { exchange } of storageManager.getExchangesIterator(sessionId, { limit: 10 })) {
        streamed.push(exchange);
        count++;
        if (count >= 10) break;
      }
      
      expect(streamed).toHaveLength(10);
      expect(mockS5Client.fs.get).toHaveBeenCalledTimes(10);
    });
  });
  
  describe('Session Management', () => {
    it('should update session summary atomically', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'test-session';
      
      // Mock existing summary
      mockS5Client.fs.get.mockImplementation((path: string) => {
        if (path.includes('/summary.json')) {
          return Promise.resolve({
            exchangeCount: 5,
            totalTokens: 50,
            lastUpdated: Date.now() - 10000,
            firstExchange: Date.now() - 60000,
            lastExchange: Date.now() - 10000
          });
        }
        return Promise.resolve(null);
      });
      
      const newExchange: Exchange = {
        prompt: 'New prompt',
        response: 'New response',
        timestamp: Date.now(),
        tokensUsed: 20
      };
      
      await storageManager.storeExchange(sessionId, newExchange);
      
      // Verify summary was updated
      const summaryCall = mockS5Client.fs.put.mock.calls.find(c => 
        c[0].includes('/summary.json')
      );
      
      expect(summaryCall).toBeDefined();
      const updatedSummary = summaryCall![1] as SessionSummary;
      expect(updatedSummary.exchangeCount).toBe(6); // 5 + 1
      expect(updatedSummary.totalTokens).toBe(70); // 50 + 20
      expect(updatedSummary.lastExchange).toBe(newExchange.timestamp);
    });
    
    it('should create session metadata correctly', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'new-session';
      const metadata: Partial<SessionMetadata> = {
        model: 'gpt-4',
        temperature: 0.7,
        hostAddress: '0xHost123'
      };
      
      await storageManager.createSessionMetadata(sessionId, metadata);
      
      const metadataCall = mockS5Client.fs.put.mock.calls.find(c =>
        c[0].includes('/metadata.json')
      );
      
      expect(metadataCall).toBeDefined();
      const stored = metadataCall![1] as SessionMetadata;
      expect(stored.sessionId).toBe(sessionId);
      expect(stored.userAddress).toBe('0xTestUser123');
      expect(stored.model).toBe('gpt-4');
      expect(stored.temperature).toBe(0.7);
      expect(stored.created).toBeDefined();
    });
    
    it('should list sessions with metadata and summaries', async () => {
      await storageManager.initialize(authManager);
      
      // Mock directory listing
      mockS5Client.fs.list.mockImplementation(async function*(path: string) {
        if (path.includes('/0xTestUser123')) {
          yield { type: 'directory', name: 'session-1' };
          yield { type: 'directory', name: 'session-2' };
          yield { type: 'file', name: 'not-a-session.txt' }; // Should be ignored
        }
      });
      
      // Mock metadata and summary retrieval
      mockS5Client.fs.get.mockImplementation((path: string) => {
        if (path.includes('session-1/metadata.json')) {
          return Promise.resolve({
            sessionId: 'session-1',
            created: Date.now() - 86400000,
            model: 'gpt-3.5',
            userAddress: '0xTestUser123'
          });
        }
        if (path.includes('session-1/summary.json')) {
          return Promise.resolve({
            exchangeCount: 10,
            totalTokens: 150,
            lastUpdated: Date.now() - 3600000
          });
        }
        if (path.includes('session-2/metadata.json')) {
          return Promise.resolve({
            sessionId: 'session-2',
            created: Date.now() - 3600000,
            model: 'gpt-4',
            userAddress: '0xTestUser123'
          });
        }
        return Promise.reject(new Error('Not found'));
      });
      
      const sessions = await storageManager.listSessions();
      
      expect(sessions).toHaveLength(2);
      expect(sessions[0].sessionId).toBe('session-1');
      expect(sessions[0].metadata?.model).toBe('gpt-3.5');
      expect(sessions[0].summary?.exchangeCount).toBe(10);
      expect(sessions[1].sessionId).toBe('session-2');
      expect(sessions[1].metadata?.model).toBe('gpt-4');
      expect(sessions[1].summary).toBeUndefined(); // No summary for session-2
    });
  });
  
  describe('Backward Compatibility', () => {
    it('should support legacy storeData method', async () => {
      await storageManager.initialize(authManager);
      
      const key = 'legacy-conversation';
      const data = {
        messages: ['Hello', 'Hi there'],
        timestamp: Date.now()
      };
      
      const path = await storageManager.storeData(key, data);
      
      expect(path).toContain('home/conversations/0xTestUser123/legacy-conversation.json');
      expect(mockS5Client.fs.put).toHaveBeenCalledWith(
        expect.stringContaining('legacy-conversation.json'),
        expect.objectContaining({
          data,
          metadata: expect.objectContaining({
            timestamp: expect.any(Number),
            version: '1.0',
            userAddress: '0xTestUser123'
          })
        })
      );
    });
    
    it('should support legacy retrieveData method', async () => {
      await storageManager.initialize(authManager);
      
      const mockData = {
        data: { messages: ['Hello', 'Hi'] },
        metadata: { timestamp: Date.now() }
      };
      
      mockS5Client.fs.get.mockResolvedValue(mockData);
      
      const retrieved = await storageManager.retrieveData('legacy-key');
      
      expect(retrieved).toEqual(mockData.data);
      expect(mockS5Client.fs.get).toHaveBeenCalledWith(
        'home/conversations/0xTestUser123/legacy-key.json'
      );
    });
    
    it('should handle missing data gracefully', async () => {
      await storageManager.initialize(authManager);
      
      mockS5Client.fs.get.mockRejectedValue(new Error('File not found'));
      
      const result = await storageManager.retrieveData('nonexistent');
      
      expect(result).toBeNull();
    });
  });
  
  describe('Error Handling', () => {
    it('should handle S5 client initialization errors', async () => {
      const S5Module = await vi.importMock('@s5-dev/s5js');
      (S5Module.S5.create as any).mockRejectedValueOnce(new Error('Network error'));
      
      const newStorageManager = new StorageManager();
      await expect(newStorageManager.initialize(authManager))
        .rejects.toThrow('Failed to initialize StorageManager: Network error');
    });
    
    it('should continue even if summary update fails', async () => {
      await storageManager.initialize(authManager);
      
      // Make summary update fail
      let callCount = 0;
      mockS5Client.fs.put.mockImplementation((path: string) => {
        callCount++;
        if (path.includes('/summary.json')) {
          return Promise.reject(new Error('Summary update failed'));
        }
        return Promise.resolve();
      });
      
      const exchange: Exchange = {
        prompt: 'Test',
        response: 'Response',
        timestamp: Date.now()
      };
      
      // Should not throw even if summary fails
      await expect(storageManager.storeExchange('session-1', exchange))
        .resolves.toMatch(/exchanges\/\d+-\w+\.json$/);
      
      // Exchange should still be stored
      expect(callCount).toBeGreaterThan(0);
    });
    
    it('should return empty array when listing fails', async () => {
      await storageManager.initialize(authManager);
      
      mockS5Client.fs.list.mockImplementation(async function*() {
        throw new Error('List operation failed');
      });
      
      const exchanges = await storageManager.getRecentExchanges('session-1');
      
      expect(exchanges).toEqual([]);
    });
  });
  
  describe('Storage Efficiency Metrics', () => {
    it('should demonstrate O(1) vs O(n²) storage savings', async () => {
      await storageManager.initialize(authManager);
      
      const sessionId = 'efficiency-test';
      const numExchanges = 100;
      const avgExchangeSize = 500; // bytes
      
      let totalStoredBytes = 0;
      let legacyStorageBytes = 0;
      
      for (let i = 0; i < numExchanges; i++) {
        const exchange: Exchange = {
          prompt: `Question ${i}: `.padEnd(200, 'x'),
          response: `Answer ${i}: `.padEnd(250, 'y'),
          timestamp: Date.now() + i * 1000,
          tokensUsed: 10
        };
        
        // Track actual storage (O(1))
        mockS5Client.fs.put.mockImplementation((path: string, data: any) => {
          if (path.includes('/exchanges/')) {
            totalStoredBytes += JSON.stringify(data).length;
          }
        });
        
        await storageManager.storeExchange(sessionId, exchange);
        
        // Calculate what legacy storage would be (O(n²))
        legacyStorageBytes += avgExchangeSize * (i + 1);
      }
      
      // Verify O(1) storage is linear
      const expectedO1Storage = avgExchangeSize * numExchanges;
      expect(totalStoredBytes).toBeLessThanOrEqual(expectedO1Storage * 1.2); // Allow 20% overhead
      
      // Verify O(n²) storage would be quadratic
      const expectedOn2Storage = avgExchangeSize * (numExchanges * (numExchanges + 1)) / 2;
      expect(legacyStorageBytes).toBeCloseTo(expectedOn2Storage, -3);
      
      // Calculate savings
      const savingsPercent = ((legacyStorageBytes - totalStoredBytes) / legacyStorageBytes) * 100;
      console.log(`Storage efficiency: ${savingsPercent.toFixed(1)}% savings`);
      console.log(`O(1): ${(totalStoredBytes / 1024).toFixed(1)}KB vs O(n²): ${(legacyStorageBytes / 1024).toFixed(1)}KB`);
      
      // For 100 exchanges, should save ~98% of storage
      expect(savingsPercent).toBeGreaterThan(95);
    });
  });
});