/**
 * Conversation Memory Management Tests
 * Tests for memory statistics, pruning, and lifecycle
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationMemory } from '../../src/conversation/ConversationMemory.js';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';

describe('Conversation Memory Management', () => {
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
      { enabled: true }
    );
  });

  describe('Memory Statistics', () => {
    it('should return empty stats for new conversation', () => {
      const stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.userMessages).toBe(0);
      expect(stats.assistantMessages).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.oldestMessageTimestamp).toBe(0);
      expect(stats.newestMessageTimestamp).toBe(0);
    });

    it('should count total messages', async () => {
      await conversationMemory.addMessage('user', 'Message 1');
      await conversationMemory.addMessage('assistant', 'Message 2');
      await conversationMemory.addMessage('user', 'Message 3');

      const stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(3);
    });

    it('should count user and assistant messages separately', async () => {
      await conversationMemory.addMessage('user', 'User 1');
      await conversationMemory.addMessage('assistant', 'Assistant 1');
      await conversationMemory.addMessage('user', 'User 2');
      await conversationMemory.addMessage('assistant', 'Assistant 2');
      await conversationMemory.addMessage('user', 'User 3');

      const stats = conversationMemory.getMemoryStats();
      expect(stats.userMessages).toBe(3);
      expect(stats.assistantMessages).toBe(2);
    });

    it('should calculate total tokens', async () => {
      await conversationMemory.addMessage('user', 'Short');
      await conversationMemory.addMessage('assistant', 'This is a much longer message with more tokens');

      const stats = conversationMemory.getMemoryStats();
      expect(stats.totalTokens).toBeGreaterThan(0);
      // First message: ~2 tokens, second message: ~12 tokens
      expect(stats.totalTokens).toBeGreaterThan(10);
    });

    it('should track oldest message timestamp', async () => {
      const time1 = Date.now();
      await conversationMemory.addMessage('user', 'First message');

      await new Promise(resolve => setTimeout(resolve, 10));

      await conversationMemory.addMessage('user', 'Second message');

      const stats = conversationMemory.getMemoryStats();
      expect(stats.oldestMessageTimestamp).toBeGreaterThanOrEqual(time1);
      expect(stats.oldestMessageTimestamp).toBeLessThan(Date.now());
    });

    it('should track newest message timestamp', async () => {
      await conversationMemory.addMessage('user', 'First message');

      await new Promise(resolve => setTimeout(resolve, 10));

      const time2 = Date.now();
      await conversationMemory.addMessage('user', 'Second message');

      const stats = conversationMemory.getMemoryStats();
      expect(stats.newestMessageTimestamp).toBeGreaterThanOrEqual(time2);
    });

    it('should update stats after adding messages', async () => {
      let stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(0);

      await conversationMemory.addMessage('user', 'New message');

      stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(1);
    });
  });

  describe('Memory Pruning', () => {
    beforeEach(async () => {
      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        await conversationMemory.addMessage('user', `Message ${i}`);
      }
    });

    it('should keep all messages if count is greater than total', async () => {
      await conversationMemory.pruneOldMessages(20);

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(10);
    });

    it('should keep exact count when pruning', async () => {
      await conversationMemory.pruneOldMessages(5);

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(5);
    });

    it('should keep most recent messages after pruning', async () => {
      await conversationMemory.pruneOldMessages(3);

      const messages = conversationMemory.getAllMessages();
      expect(messages[0].content).toBe('Message 7');
      expect(messages[1].content).toBe('Message 8');
      expect(messages[2].content).toBe('Message 9');
    });

    it('should delete vectors from vector DB when pruning', async () => {
      await conversationMemory.pruneOldMessages(5);

      expect(mockVectorRAGManager.deleteVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        ['msg-0', 'msg-1', 'msg-2', 'msg-3', 'msg-4']
      );
    });

    it('should continue even if vector deletion fails', async () => {
      vi.mocked(mockVectorRAGManager.deleteVectors).mockRejectedValueOnce(
        new Error('Delete failed')
      );

      await expect(
        conversationMemory.pruneOldMessages(5)
      ).resolves.not.toThrow();

      // Local messages should still be pruned
      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(5);
    });

    it('should not prune if count equals total messages', async () => {
      await conversationMemory.pruneOldMessages(10);

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(10);
      expect(mockVectorRAGManager.deleteVectors).not.toHaveBeenCalled();
    });

    it('should handle pruning to zero messages', async () => {
      await conversationMemory.pruneOldMessages(0);

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(0);
    });

    it('should update stats after pruning', async () => {
      await conversationMemory.pruneOldMessages(3);

      const stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(3);
    });
  });

  describe('Memory Clearing', () => {
    beforeEach(async () => {
      await conversationMemory.addMessage('user', 'Message 1');
      await conversationMemory.addMessage('assistant', 'Message 2');
      await conversationMemory.addMessage('user', 'Message 3');
    });

    it('should clear all messages', async () => {
      await conversationMemory.clearMemory();

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(0);
    });

    it('should delete all vectors from vector DB', async () => {
      await conversationMemory.clearMemory();

      expect(mockVectorRAGManager.deleteVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        ['msg-0', 'msg-1', 'msg-2']
      );
    });

    it('should reset message index after clearing', async () => {
      await conversationMemory.clearMemory();
      await conversationMemory.addMessage('user', 'New message');

      const messages = conversationMemory.getAllMessages();
      expect(messages[0].messageIndex).toBe(0);
    });

    it('should continue even if vector deletion fails', async () => {
      vi.mocked(mockVectorRAGManager.deleteVectors).mockRejectedValueOnce(
        new Error('Delete failed')
      );

      await expect(
        conversationMemory.clearMemory()
      ).resolves.not.toThrow();

      // Local messages should still be cleared
      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(0);
    });

    it('should reset stats after clearing', async () => {
      await conversationMemory.clearMemory();

      const stats = conversationMemory.getMemoryStats();
      expect(stats.totalMessages).toBe(0);
      expect(stats.totalTokens).toBe(0);
    });

    it('should handle clearing empty memory', async () => {
      const emptyMemory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        'empty-session',
        { enabled: true }
      );

      await expect(
        emptyMemory.clearMemory()
      ).resolves.not.toThrow();
    });
  });

  describe('Memory Configuration', () => {
    it('should use custom maxRecentMessages', () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, maxRecentMessages: 5 }
      );

      const messages = Array(10).fill(null).map((_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
        timestamp: Date.now(),
        messageIndex: i,
        tokenCount: 2
      }));

      (memory as any).messages = messages;

      const recent = memory.getRecentMessages();
      expect(recent).toHaveLength(5);
    });

    it('should use custom maxMemoryTokens', async () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, maxMemoryTokens: 100 }
      );

      // Manually set messages
      const messages = Array(10).fill(null).map((_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
        timestamp: Date.now(),
        messageIndex: i,
        tokenCount: 20  // Each message = 20 tokens
      }));

      (memory as any).messages = messages;

      // Mock relevant history (empty)
      vi.mocked(mockVectorRAGManager.searchVectors).mockResolvedValueOnce([]);

      const contextWindow = await memory.getContextWindow('test query', 100);

      // Should only include messages that fit within 100 tokens
      const totalTokens = contextWindow.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
      expect(totalTokens).toBeLessThanOrEqual(100);
    });

    it('should use custom similarityThreshold', async () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, similarityThreshold: 0.85 }
      );

      // Add a message first
      const messages = [{
        role: 'user' as const,
        content: 'Test',
        timestamp: Date.now(),
        messageIndex: 0,
        tokenCount: 1
      }];
      (memory as any).messages = messages;

      await memory.getRelevantHistory('query');

      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.any(Array),
        expect.any(Number),
        expect.objectContaining({ threshold: 0.85 })
      );
    });

    it('should use custom maxHistoryMessages', async () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, maxHistoryMessages: 10 }
      );

      // Add a message first
      const messages = [{
        role: 'user' as const,
        content: 'Test',
        timestamp: Date.now(),
        messageIndex: 0,
        tokenCount: 1
      }];
      (memory as any).messages = messages;

      await memory.getRelevantHistory('query');

      expect(mockVectorRAGManager.searchVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.any(Array),
        10,
        expect.any(Object)
      );
    });
  });
});
