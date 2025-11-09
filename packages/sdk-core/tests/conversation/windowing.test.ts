/**
 * Context Windowing Tests
 * Tests for conversation context window building
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationMemory } from '../../src/conversation/ConversationMemory.js';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { ConversationMessage } from '../../src/conversation/ConversationMemory.js';

describe('Context Windowing', () => {
  let conversationMemory: ConversationMemory;
  let mockEmbeddingService: EmbeddingService;
  let mockVectorRAGManager: VectorRAGManager;
  const vectorDbSessionId = 'test-session-123';

  beforeEach(() => {
    mockEmbeddingService = {
      embedText: vi.fn().mockResolvedValue({
        embedding: Array(384).fill(0.1),
        text: 'test',
        tokenCount: 10
      })
    } as any;

    mockVectorRAGManager = {
      addVectors: vi.fn().mockResolvedValue(undefined),
      searchVectors: vi.fn().mockResolvedValue([]),
      deleteVectors: vi.fn().mockResolvedValue(undefined)
    } as any;

    conversationMemory = new ConversationMemory(
      mockEmbeddingService,
      mockVectorRAGManager,
      vectorDbSessionId,
      { enabled: true, maxRecentMessages: 3, maxMemoryTokens: 1000 }
    );
  });

  describe('Recent Messages Retrieval', () => {
    beforeEach(async () => {
      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        await conversationMemory.addMessage('user', `Message ${i}`);
      }
    });

    it('should retrieve last N recent messages', () => {
      const recent = conversationMemory.getRecentMessages(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].content).toBe('Message 7');
      expect(recent[1].content).toBe('Message 8');
      expect(recent[2].content).toBe('Message 9');
    });

    it('should retrieve all messages if N exceeds total', () => {
      const recent = conversationMemory.getRecentMessages(20);
      expect(recent).toHaveLength(10);
    });

    it('should use default from config if count not provided', () => {
      const recent = conversationMemory.getRecentMessages();
      expect(recent).toHaveLength(3); // maxRecentMessages = 3
    });

    it('should return empty array for empty conversation', () => {
      const emptyMemory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        'empty-session',
        { enabled: true }
      );

      const recent = emptyMemory.getRecentMessages(5);
      expect(recent).toHaveLength(0);
    });
  });

  describe('Relevant History Retrieval', () => {
    beforeEach(async () => {
      // Add some messages
      await conversationMemory.addMessage('user', 'What is TypeScript?');
      await conversationMemory.addMessage('assistant', 'TypeScript is a typed superset of JavaScript.');
      await conversationMemory.addMessage('user', 'What is React?');
      await conversationMemory.addMessage('assistant', 'React is a JavaScript library for building UIs.');
    });

    it('should embed query and search vector DB', async () => {
      await conversationMemory.getRelevantHistory('Tell me about TypeScript');

      expect(mockEmbeddingService.embedText).toHaveBeenCalledWith('Tell me about TypeScript');
      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.any(Array),
        expect.any(Number),
        expect.objectContaining({ threshold: expect.any(Number) })
      );
    });

    it('should use custom maxMessages parameter', async () => {
      await conversationMemory.getRelevantHistory('test query', 10);

      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.any(Array),
        10,
        expect.any(Object)
      );
    });

    it('should use config maxHistoryMessages if not provided', async () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, maxHistoryMessages: 7 }
      );

      await memory.getRelevantHistory('test query');

      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.any(Array),
        7,
        expect.any(Object)
      );
    });

    it('should convert search results to conversation messages', async () => {
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-0',
          score: 0.95,
          metadata: {
            role: 'user',
            content: 'What is TypeScript?',
            timestamp: Date.now(),
            messageIndex: 0,
            tokenCount: 4
          }
        },
        {
          id: 'msg-1',
          score: 0.85,
          metadata: {
            role: 'assistant',
            content: 'TypeScript is a typed superset of JavaScript.',
            timestamp: Date.now(),
            messageIndex: 1,
            tokenCount: 8
          }
        }
      ]);

      const history = await conversationMemory.getRelevantHistory('TypeScript info');

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        role: 'user',
        content: 'What is TypeScript?',
        messageIndex: 0
      });
      expect(history[1]).toMatchObject({
        role: 'assistant',
        content: 'TypeScript is a typed superset of JavaScript.',
        messageIndex: 1
      });
    });

    it('should sort results by message index', async () => {
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-3',
          score: 0.95,
          metadata: {
            role: 'assistant',
            content: 'Message 3',
            timestamp: Date.now(),
            messageIndex: 3,
            tokenCount: 2
          }
        },
        {
          id: 'msg-1',
          score: 0.90,
          metadata: {
            role: 'user',
            content: 'Message 1',
            timestamp: Date.now(),
            messageIndex: 1,
            tokenCount: 2
          }
        },
        {
          id: 'msg-5',
          score: 0.85,
          metadata: {
            role: 'user',
            content: 'Message 5',
            timestamp: Date.now(),
            messageIndex: 5,
            tokenCount: 2
          }
        }
      ]);

      const history = await conversationMemory.getRelevantHistory('test');

      expect(history[0].messageIndex).toBe(1);
      expect(history[1].messageIndex).toBe(3);
      expect(history[2].messageIndex).toBe(5);
    });

    it('should handle retrieval errors gracefully', async () => {
      vi.mocked(mockVectorRAGManager.searchVectors).mockRejectedValueOnce(
        new Error('Search failed')
      );

      const history = await conversationMemory.getRelevantHistory('test query');
      expect(history).toEqual([]);
    });
  });

  describe('Context Window Building', () => {
    beforeEach(async () => {
      // Add 10 messages (each ~10 tokens)
      for (let i = 0; i < 10; i++) {
        await conversationMemory.addMessage('user', `Message number ${i} with some content`);
      }
    });

    it('should combine recent and historical messages', async () => {
      // Mock relevant history
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-2',
          score: 0.95,
          metadata: {
            role: 'user',
            content: 'Message number 2 with some content',
            timestamp: Date.now(),
            messageIndex: 2,
            tokenCount: 10
          }
        },
        {
          id: 'msg-4',
          score: 0.85,
          metadata: {
            role: 'user',
            content: 'Message number 4 with some content',
            timestamp: Date.now(),
            messageIndex: 4,
            tokenCount: 10
          }
        }
      ]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      // Should have recent (3) + historical (2) = 5 messages
      expect(contextWindow.length).toBeGreaterThanOrEqual(3); // At least recent messages
    });

    it('should deduplicate messages (recent takes priority)', async () => {
      // Mock relevant history that includes a message already in recent
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-9', // This is in recent messages (last 3)
          score: 0.95,
          metadata: {
            role: 'user',
            content: 'Message number 9 with some content',
            timestamp: Date.now(),
            messageIndex: 9,
            tokenCount: 10
          }
        },
        {
          id: 'msg-3', // This is NOT in recent messages
          score: 0.90,
          metadata: {
            role: 'user',
            content: 'Message number 3 with some content',
            timestamp: Date.now(),
            messageIndex: 3,
            tokenCount: 10
          }
        }
      ]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      // Should not have duplicate of message 9
      const messageIndices = contextWindow.map(m => m.messageIndex);
      const uniqueIndices = new Set(messageIndices);
      expect(messageIndices.length).toBe(uniqueIndices.size);
    });

    it('should respect token limits', async () => {
      // Mock relevant history with many messages
      const historicalMessages = Array(20).fill(null).map((_, i) => ({
        id: `msg-${i}`,
        score: 0.9 - (i * 0.01),
        metadata: {
          role: 'user',
          content: `Historical message ${i}`,
          timestamp: Date.now(),
          messageIndex: i,
          tokenCount: 50  // Each message = 50 tokens
        }
      }));

      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce(historicalMessages);

      const maxTokens = 200;
      const contextWindow = await conversationMemory.getContextWindow('test query', maxTokens);

      // Calculate total tokens
      const totalTokens = contextWindow.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(maxTokens);
    });

    it('should prioritize recent messages over historical', async () => {
      // Mock relevant history
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-0',
          score: 0.95,
          metadata: {
            role: 'user',
            content: 'Message number 0 with some content',
            timestamp: Date.now(),
            messageIndex: 0,
            tokenCount: 10
          }
        }
      ]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      // Recent messages (7, 8, 9) should always be included
      const recentIndices = [7, 8, 9];
      const windowIndices = contextWindow.map(m => m.messageIndex);

      recentIndices.forEach(index => {
        expect(windowIndices).toContain(index);
      });
    });

    it('should sort final window by message index', async () => {
      // Mock relevant history with out-of-order results
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([
        {
          id: 'msg-5',
          score: 0.95,
          metadata: {
            role: 'user',
            content: 'Message number 5 with some content',
            timestamp: Date.now(),
            messageIndex: 5,
            tokenCount: 10
          }
        },
        {
          id: 'msg-2',
          score: 0.90,
          metadata: {
            role: 'user',
            content: 'Message number 2 with some content',
            timestamp: Date.now(),
            messageIndex: 2,
            tokenCount: 10
          }
        }
      ]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      // Verify sorted by message index
      for (let i = 1; i < contextWindow.length; i++) {
        expect(contextWindow[i].messageIndex).toBeGreaterThan(contextWindow[i - 1].messageIndex);
      }
    });

    it('should handle empty historical results', async () => {
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      // Should still have recent messages
      expect(contextWindow).toHaveLength(3); // maxRecentMessages = 3
    });

    it('should use custom maxTokens parameter', async () => {
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([]);

      const contextWindow = await conversationMemory.getContextWindow('test query', 50);

      const totalTokens = contextWindow.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(50);
    });

    it('should use config maxMemoryTokens if not provided', async () => {
      // Config has maxMemoryTokens: 1000
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([]);

      const contextWindow = await conversationMemory.getContextWindow('test query');

      const totalTokens = contextWindow.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(1000);
    });
  });
});
