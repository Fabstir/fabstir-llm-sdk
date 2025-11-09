/**
 * Conversation Storage Tests
 * Tests for message storage and basic retrieval
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationMemory } from '../../src/conversation/ConversationMemory.js';
import type { EmbeddingService } from '../../src/embeddings/EmbeddingService.js';
import type { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import type { ConversationMessage } from '../../src/conversation/ConversationMemory.js';

describe('Conversation Storage', () => {
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

  describe('Message Storage', () => {
    it('should store a user message', async () => {
      await conversationMemory.addMessage('user', 'Hello, how are you?');

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hello, how are you?');
      expect(messages[0].messageIndex).toBe(0);
    });

    it('should store an assistant message', async () => {
      await conversationMemory.addMessage('assistant', 'I am doing well, thank you!');

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('I am doing well, thank you!');
    });

    it('should store a system message', async () => {
      await conversationMemory.addMessage('system', 'You are a helpful assistant.');

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('system');
    });

    it('should auto-increment message index', async () => {
      await conversationMemory.addMessage('user', 'First message');
      await conversationMemory.addMessage('assistant', 'Second message');
      await conversationMemory.addMessage('user', 'Third message');

      const messages = conversationMemory.getAllMessages();
      expect(messages[0].messageIndex).toBe(0);
      expect(messages[1].messageIndex).toBe(1);
      expect(messages[2].messageIndex).toBe(2);
    });

    it('should add timestamps to messages', async () => {
      const beforeTime = Date.now();
      await conversationMemory.addMessage('user', 'Test message');
      const afterTime = Date.now();

      const messages = conversationMemory.getAllMessages();
      expect(messages[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(messages[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should estimate token count for messages', async () => {
      await conversationMemory.addMessage('user', 'This is a test message with some content');

      const messages = conversationMemory.getAllMessages();
      expect(messages[0].tokenCount).toBeGreaterThan(0);
      // Rough estimate: 1 token ≈ 4 characters
      expect(messages[0].tokenCount).toBeCloseTo(
        Math.ceil('This is a test message with some content'.length / 4),
        0
      );
    });

    it('should embed and store message in vector DB', async () => {
      await conversationMemory.addMessage('user', 'Test message for vector storage');

      expect(mockEmbeddingService.embedText).toHaveBeenCalledWith('Test message for vector storage');
      expect(mockVectorRAGManager.addVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.arrayContaining([
          expect.objectContaining({
            id: 'msg-0',
            vector: expect.any(Array),
            metadata: expect.objectContaining({
              role: 'user',
              content: 'Test message for vector storage',
              messageIndex: 0
            })
          })
        ])
      );
    });

    it('should continue storing messages even if vector storage fails', async () => {
      // Mock vector storage failure
      vi.mocked(mockVectorRAGManager.addVectors).mockRejectedValueOnce(
        new Error('Vector storage failed')
      );

      // Should not throw
      await expect(
        conversationMemory.addMessage('user', 'Test message')
      ).resolves.not.toThrow();

      // Message should still be in local storage
      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Test message');
    });

    it('should store multiple messages in sequence', async () => {
      await conversationMemory.addMessage('user', 'Hello');
      await conversationMemory.addMessage('assistant', 'Hi there!');
      await conversationMemory.addMessage('user', 'How can you help?');
      await conversationMemory.addMessage('assistant', 'I can assist with many tasks.');

      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(4);
    });

    it('should store messages with correct metadata in vector DB', async () => {
      const timestamp = Date.now();
      await conversationMemory.addMessage('assistant', 'Test response');

      expect(mockVectorRAGManager.addVectors).toHaveBeenCalledWith(
        vectorDbSessionId,
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({
              role: 'assistant',
              content: 'Test response',
              timestamp: expect.any(Number),
              messageIndex: 0,
              tokenCount: expect.any(Number)
            })
          })
        ])
      );
    });
  });

  describe('Message Retrieval', () => {
    beforeEach(async () => {
      // Add some messages
      await conversationMemory.addMessage('user', 'What is TypeScript?');
      await conversationMemory.addMessage('assistant', 'TypeScript is a typed superset of JavaScript.');
      await conversationMemory.addMessage('user', 'What is React?');
      await conversationMemory.addMessage('assistant', 'React is a JavaScript library for building UIs.');
      await conversationMemory.addMessage('user', 'Tell me about Node.js');
    });

    it('should retrieve all messages', () => {
      const messages = conversationMemory.getAllMessages();
      expect(messages).toHaveLength(5);
    });

    it('should return messages in correct order', () => {
      const messages = conversationMemory.getAllMessages();
      expect(messages[0].content).toBe('What is TypeScript?');
      expect(messages[1].content).toBe('TypeScript is a typed superset of JavaScript.');
      expect(messages[2].content).toBe('What is React?');
      expect(messages[3].content).toBe('React is a JavaScript library for building UIs.');
      expect(messages[4].content).toBe('Tell me about Node.js');
    });

    it('should not modify original messages array when calling getAllMessages', () => {
      const messages1 = conversationMemory.getAllMessages();
      messages1.push({
        role: 'user',
        content: 'Modified',
        timestamp: Date.now(),
        messageIndex: 999,
        tokenCount: 1
      });

      const messages2 = conversationMemory.getAllMessages();
      expect(messages2).toHaveLength(5);
      expect(messages2[messages2.length - 1].content).not.toBe('Modified');
    });

    it('should retrieve recent messages', () => {
      const recent = conversationMemory.getRecentMessages(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].content).toBe('What is React?');
      expect(recent[1].content).toBe('React is a JavaScript library for building UIs.');
      expect(recent[2].content).toBe('Tell me about Node.js');
    });

    it('should retrieve all messages if count exceeds total', () => {
      const recent = conversationMemory.getRecentMessages(10);
      expect(recent).toHaveLength(5);
    });

    it('should use default recent count from config', () => {
      const memory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        vectorDbSessionId,
        { enabled: true, maxRecentMessages: 2 }
      );

      // Add messages to new memory instance (synchronously add to internal array)
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'One', timestamp: Date.now(), messageIndex: 0, tokenCount: 1 },
        { role: 'user', content: 'Two', timestamp: Date.now(), messageIndex: 1, tokenCount: 1 },
        { role: 'user', content: 'Three', timestamp: Date.now(), messageIndex: 2, tokenCount: 1 }
      ];

      (memory as any).messages = messages;

      const recent = memory.getRecentMessages();
      expect(recent).toHaveLength(2);
    });

    it('should handle empty conversation', () => {
      const emptyMemory = new ConversationMemory(
        mockEmbeddingService,
        mockVectorRAGManager,
        'empty-session',
        { enabled: true }
      );

      const messages = emptyMemory.getAllMessages();
      expect(messages).toHaveLength(0);

      const recent = emptyMemory.getRecentMessages(5);
      expect(recent).toHaveLength(0);
    });
  });

  describe('Message Formatting', () => {
    it('should format empty messages list', () => {
      const formatted = conversationMemory.formatMessagesForContext([]);
      expect(formatted).toBe('');
    });

    it('should format single message', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
          messageIndex: 0,
          tokenCount: 1
        }
      ];

      const formatted = conversationMemory.formatMessagesForContext(messages);
      expect(formatted).toBe('Previous conversation:\nUser: Hello\n\n');
    });

    it('should format multiple messages with correct role labels', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'system',
          content: 'You are helpful',
          timestamp: Date.now(),
          messageIndex: 0,
          tokenCount: 3
        },
        {
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
          messageIndex: 1,
          tokenCount: 1
        },
        {
          role: 'assistant',
          content: 'Hi there',
          timestamp: Date.now(),
          messageIndex: 2,
          tokenCount: 2
        }
      ];

      const formatted = conversationMemory.formatMessagesForContext(messages);
      expect(formatted).toContain('System: You are helpful');
      expect(formatted).toContain('User: Hello');
      expect(formatted).toContain('Assistant: Hi there');
    });

    it('should separate messages with newlines', () => {
      const messages: ConversationMessage[] = [
        {
          role: 'user',
          content: 'First',
          timestamp: Date.now(),
          messageIndex: 0,
          tokenCount: 1
        },
        {
          role: 'assistant',
          content: 'Second',
          timestamp: Date.now(),
          messageIndex: 1,
          tokenCount: 1
        }
      ];

      const formatted = conversationMemory.formatMessagesForContext(messages);
      expect(formatted).toBe('Previous conversation:\nUser: First\nAssistant: Second\n\n');
    });
  });
});
