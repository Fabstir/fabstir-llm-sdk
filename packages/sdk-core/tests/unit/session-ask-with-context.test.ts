// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SessionManager.askWithContext() method
 * Tests RAG-enhanced question answering with automatic embedding generation
 * Part of Phase 2, Sub-phase 2.4: Implement askWithContext() Helper Method
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import type { SearchResult } from '../../src/types/rag-websocket';
import { HostAdapter } from '../../src/embeddings/adapters/HostAdapter';

// Helper function to create test query vector (executed at runtime)
function createQueryVector(): number[] {
  return new Array(384).fill(0.5);
}

// Helper function to create mock search results
function createMockSearchResults(count: number, withText: boolean = true): SearchResult[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `vec_${i}`,
    vector: new Array(384).fill(i / count),
    metadata: withText ? {
      text: `Document ${i} contains relevant information about the topic.`,
      index: i
    } : { index: i },
    score: 0.9 - (i * 0.1)
  }));
}

describe('SessionManager.askWithContext()', () => {
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

  describe('Happy path', () => {
    it('should generate embedding and return enhanced prompt with context', async () => {
      const sessionId = 'test-session-1';
      const question = 'What is the capital of France?';
      const queryVector = createQueryVector();

      // Setup session
      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Mock HostAdapter.embedText() to return query vector
      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      // Mock searchVectors() to return 3 results
      const mockResults = createMockSearchResults(3);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(mockResults);

      const enhancedPrompt = await sessionManager.askWithContext(sessionId, question);

      // Verify HostAdapter was called
      expect(HostAdapter.prototype.embedText).toHaveBeenCalledWith(question, 'query');

      // Verify searchVectors was called with default topK=5
      expect(sessionManager.searchVectors).toHaveBeenCalledWith(sessionId, queryVector, 5, 0.7);

      // Verify enhanced prompt format
      expect(enhancedPrompt).toContain('Context:');
      expect(enhancedPrompt).toContain('Document 0 contains relevant information');
      expect(enhancedPrompt).toContain('Document 1 contains relevant information');
      expect(enhancedPrompt).toContain('Document 2 contains relevant information');
      expect(enhancedPrompt).toContain(`Question: ${question}`);
    });

    it('should use custom topK parameter', async () => {
      const sessionId = 'test-session-2';
      const question = 'What is machine learning?';
      const queryVector = createQueryVector();
      const customTopK = 10;

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      const mockResults = createMockSearchResults(10);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(mockResults);

      await sessionManager.askWithContext(sessionId, question, customTopK);

      // Verify searchVectors was called with custom topK
      expect(sessionManager.searchVectors).toHaveBeenCalledWith(sessionId, queryVector, customTopK, 0.7);
    });
  });

  describe('No results case', () => {
    it('should return original question when no vectors match threshold', async () => {
      const sessionId = 'test-session-3';
      const question = 'What is quantum computing?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      // Mock searchVectors() to return empty array
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue([]);

      const result = await sessionManager.askWithContext(sessionId, question);

      // Should return original question (graceful degradation)
      expect(result).toBe(question);
      expect(result).not.toContain('Context:');
    });
  });

  describe('Embedding generation failure', () => {
    it('should return original question when embedding fails', async () => {
      const sessionId = 'test-session-4';
      const question = 'What is deep learning?';

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      // Mock HostAdapter to throw error
      vi.spyOn(HostAdapter.prototype, 'embedText').mockRejectedValue(
        new Error('Host embedding service unavailable')
      );

      const result = await sessionManager.askWithContext(sessionId, question);

      // Should return original question (graceful degradation, no throw)
      expect(result).toBe(question);
    });
  });

  describe('Search failure', () => {
    it('should return original question when search fails', async () => {
      const sessionId = 'test-session-5';
      const question = 'What is neural networks?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      // Mock searchVectors() to throw error
      vi.spyOn(sessionManager, 'searchVectors').mockRejectedValue(
        new Error('Vector store not initialized')
      );

      const result = await sessionManager.askWithContext(sessionId, question);

      // Should return original question (graceful degradation)
      expect(result).toBe(question);
    });
  });

  describe('Multiple results formatting', () => {
    it('should format multiple results with proper spacing', async () => {
      const sessionId = 'test-session-6';
      const question = 'Explain transformers';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      const mockResults = createMockSearchResults(5);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(mockResults);

      const enhancedPrompt = await sessionManager.askWithContext(sessionId, question);

      // Verify all 5 results are included
      for (let i = 0; i < 5; i++) {
        expect(enhancedPrompt).toContain(`Document ${i} contains relevant information`);
      }

      // Verify format structure
      const lines = enhancedPrompt.split('\n');
      expect(lines[0]).toBe('Context:');
      expect(lines[lines.length - 2]).toBe('');
      expect(lines[lines.length - 1]).toBe(`Question: ${question}`);
    });
  });

  describe('Parameter validation', () => {
    it('should handle topK=1 correctly', async () => {
      const sessionId = 'test-session-7';
      const question = 'What is AI?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      const mockResults = createMockSearchResults(1);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(mockResults);

      await sessionManager.askWithContext(sessionId, question, 1);

      // Verify searchVectors called with topK=1
      expect(sessionManager.searchVectors).toHaveBeenCalledWith(sessionId, queryVector, 1, 0.7);
    });
  });

  describe('Session validation', () => {
    it('should return original question if session is not active', async () => {
      const sessionId = 'test-session-8';
      const question = 'What is NLP?';

      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'ended',  // Not active!
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      const result = await sessionManager.askWithContext(sessionId, question);

      // Should return original question (graceful degradation)
      expect(result).toBe(question);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty question by returning it unchanged', async () => {
      const sessionId = 'test-session-9';
      const emptyQuestion = '';

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now()
      }]]);

      const result = await sessionManager.askWithContext(sessionId, emptyQuestion);

      // Should return empty string (no context needed for empty question)
      expect(result).toBe(emptyQuestion);
    });

    it('should handle very long question (>1000 chars)', async () => {
      const sessionId = 'test-session-10';
      const longQuestion = 'What is machine learning? '.repeat(50); // ~1250 chars
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      const mockResults = createMockSearchResults(3);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(mockResults);

      const enhancedPrompt = await sessionManager.askWithContext(sessionId, longQuestion);

      // Should still format correctly
      expect(enhancedPrompt).toContain('Context:');
      expect(enhancedPrompt).toContain(`Question: ${longQuestion}`);
    });

    it('should handle context with special characters', async () => {
      const sessionId = 'test-session-11';
      const question = 'What is "machine learning"?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      // Mock results with special characters
      const specialResults: SearchResult[] = [{
        id: 'vec_0',
        vector: createQueryVector(),
        metadata: {
          text: 'ML uses "neural networks" & algorithms: f(x) = y'
        },
        score: 0.95
      }];
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(specialResults);

      const enhancedPrompt = await sessionManager.askWithContext(sessionId, question);

      // Should preserve special characters
      expect(enhancedPrompt).toContain('"neural networks"');
      expect(enhancedPrompt).toContain('& algorithms');
      expect(enhancedPrompt).toContain('f(x) = y');
    });

    it('should handle single result correctly', async () => {
      const sessionId = 'test-session-12';
      const question = 'What is Python?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      const singleResult = createMockSearchResults(1);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(singleResult);

      const enhancedPrompt = await sessionManager.askWithContext(sessionId, question);

      // Verify format is correct for single result
      expect(enhancedPrompt).toBe(
        `Context:\nDocument 0 contains relevant information about the topic.\n\nQuestion: ${question}`
      );
    });

    it('should return original question when metadata lacks text field', async () => {
      const sessionId = 'test-session-13';
      const question = 'What is JavaScript?';
      const queryVector = createQueryVector();

      (sessionManager as any).wsClient = {};
      (sessionManager as any).sessions = new Map([[sessionId, {
        sessionId: BigInt(1),
        jobId: BigInt(1),
        chainId: 84532,
        model: 'llama-3',
        provider: 'test-host',
        endpoint: 'http://localhost:8080',
        status: 'active',
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
        ragContext: { vectorDbId: 'test-db' }
      }]]);

      vi.spyOn(HostAdapter.prototype, 'embedText').mockResolvedValue({
        embedding: queryVector,
        model: 'all-MiniLM-L6-v2',
        provider: 'host',
        cost: 0.0
      });

      // Mock results without text field
      const resultsNoText = createMockSearchResults(3, false);
      vi.spyOn(sessionManager, 'searchVectors').mockResolvedValue(resultsNoText);

      const result = await sessionManager.askWithContext(sessionId, question);

      // Should return original question (graceful degradation)
      expect(result).toBe(question);
    });
  });
});
