// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SessionManager.searchVectors() method
 * Tests similarity search, parameter validation, and WebSocket communication
 * Part of Phase 2, Sub-phase 2.3: Implement searchVectors() Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import type { SearchResult } from '../../src/types/rag-websocket';

// Helper function to create test query vector (executed at runtime)
function createQueryVector(): number[] {
  return new Array(384).fill(0.5);
}

// Helper function to create mock search results
function createMockSearchResults(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(i / count),
    metadata: { index: i, text: `Document ${i}` },
    score: 0.9 - (i * 0.1) // Descending scores: 0.9, 0.8, 0.7, ...
  }));
}

describe('SessionManager.searchVectors()', () => {
  let sessionManager: SessionManager;
  let mockPaymentManager: PaymentManager;
  let mockStorageManager: StorageManager;

  beforeEach(() => {
    // Create mock managers
    mockPaymentManager = {} as PaymentManager;
    mockStorageManager = {} as StorageManager;

    sessionManager = new SessionManager(
      mockPaymentManager,
      mockStorageManager
    );
  });

  describe('Basic functionality', () => {
    it('should search with default parameters (k=5, threshold=0.7)', async () => {
      const sessionId = 'test-session-1';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Mock _sendRAGRequest to simulate successful search
      const mockResults = createMockSearchResults(3);
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: mockResults,
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(0.9);
      expect((sessionManager as any)._sendRAGRequest).toHaveBeenCalledTimes(1);
    });

    it('should search with custom topK (k=10)', async () => {
      const sessionId = 'test-session-2';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      const mockResults = createMockSearchResults(10);
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: mockResults,
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector, 10);

      expect(results).toHaveLength(10);
    });

    it('should search with custom threshold (0.8)', async () => {
      const sessionId = 'test-session-3';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      const mockResults = createMockSearchResults(2); // Only 2 results above 0.8
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: mockResults,
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector, 5, 0.8);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.score >= 0.8)).toBe(true);
    });
  });

  describe('Parameter validation', () => {
    it('should validate query vector has 384 dimensions', async () => {
      const sessionId = 'test-session-4';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: [],
        error: undefined
      });

      // Should not throw for 384 dimensions
      await expect(sessionManager.searchVectors(sessionId, queryVector)).resolves.toBeDefined();
    });

    it('should reject query vector with invalid dimensions', async () => {
      const sessionId = 'test-session-5';
      const invalidVector = new Array(512).fill(0.5); // Wrong dimension!

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Should throw with descriptive error
      await expect(sessionManager.searchVectors(sessionId, invalidVector))
        .rejects.toThrow(/Invalid query vector dimensions: expected 384, got 512/);
    });

    it('should validate k parameter (1-20 range)', async () => {
      const sessionId = 'test-session-6';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // k too low
      await expect(sessionManager.searchVectors(sessionId, queryVector, 0))
        .rejects.toThrow(/Parameter k must be between 1 and 20/);

      // k too high
      await expect(sessionManager.searchVectors(sessionId, queryVector, 21))
        .rejects.toThrow(/Parameter k must be between 1 and 20/);
    });

    it('should validate threshold parameter (0.0-1.0 range)', async () => {
      const sessionId = 'test-session-7';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // threshold too low
      await expect(sessionManager.searchVectors(sessionId, queryVector, 5, -0.1))
        .rejects.toThrow(/Parameter threshold must be between 0.0 and 1.0/);

      // threshold too high
      await expect(sessionManager.searchVectors(sessionId, queryVector, 5, 1.1))
        .rejects.toThrow(/Parameter threshold must be between 0.0 and 1.0/);
    });
  });

  describe('Response handling', () => {
    it('should parse successful search response with results', async () => {
      const sessionId = 'test-session-8';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      const mockResults = createMockSearchResults(5);
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: mockResults,
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector);

      expect(results).toHaveLength(5);
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('vector');
      expect(results[0]).toHaveProperty('metadata');
      expect(results[0]).toHaveProperty('score');
    });

    it('should handle empty results (no matches above threshold)', async () => {
      const sessionId = 'test-session-9';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: [],
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector, 5, 0.95);

      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return results sorted by score (descending order)', async () => {
      const sessionId = 'test-session-10';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      const mockResults = createMockSearchResults(5);
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: mockResults,
        error: undefined
      });

      const results = await sessionManager.searchVectors(sessionId, queryVector);

      // Verify scores are in descending order
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('Error scenarios', () => {
    it('should throw error if session does not exist', async () => {
      const sessionId = 'non-existent-session';
      const queryVector = createQueryVector();

      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/Session .* not found/);
    });

    it('should throw error if session is not active', async () => {
      const sessionId = 'inactive-session';
      const queryVector = createQueryVector();

      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'ended',  // Not active!
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/Session .* is not active/);
    });

    it('should throw error if WebSocket is not connected', async () => {
      const sessionId = 'test-session-no-ws';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = undefined;  // No WebSocket!
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/WebSocket not connected/);
    });

    it('should throw error if RAG context is not configured', async () => {
      const sessionId = 'test-session-no-rag';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
        // ragContext NOT configured - should fail
      }]]);

      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/No vector database attached to this session/);
    });

    it.skip('should timeout after 10 seconds', async () => {
      const sessionId = 'test-session-timeout';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Mock _sendRAGRequest to simulate timeout
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockImplementation(() => {
        // Never resolve - simulate timeout
        return new Promise(() => {});
      });

      // Note: This test would actually wait 10 seconds - skip in practice or use fake timers
      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/timeout/i);
    }, 15000); // 15 second test timeout

    it('should handle host error response', async () => {
      const sessionId = 'test-session-error';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Mock _sendRAGRequest to simulate host error response
      vi.spyOn(sessionManager as any, '_sendRAGRequest').mockResolvedValue({
        results: [],
        error: 'Session vector store not initialized'
      });

      await expect(sessionManager.searchVectors(sessionId, queryVector))
        .rejects.toThrow(/Session vector store not initialized/);
    });
  });
});
