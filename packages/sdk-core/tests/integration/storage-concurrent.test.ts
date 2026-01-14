/**
 * Integration Tests: Concurrent Storage Operations
 * Sub-phase 3.1
 *
 * Tests to verify that concurrent save operations are properly serialized
 * and don't cause S5 "Revision number too low" errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * These tests verify the lock pattern prevents race conditions
 * using a realistic mock StorageManager that simulates S5 behavior.
 */
describe('Concurrent Storage Operations', () => {
  interface ConversationData {
    id: string;
    messages: Array<{ role: string; content: string }>;
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }

  interface StorageResult {
    cid: string;
    url: string;
    size: number;
    timestamp: number;
  }

  // Mock S5 client that tracks revision numbers and can simulate errors
  class MockS5Client {
    private revisions: Map<string, number> = new Map();
    private data: Map<string, any> = new Map();
    private simulateRevisionErrorOnce = false;

    fs = {
      put: async (path: string, data: any): Promise<void> => {
        // Simulate async S5 write delay
        await new Promise(r => setTimeout(r, Math.random() * 20));

        if (this.simulateRevisionErrorOnce) {
          this.simulateRevisionErrorOnce = false;
          throw new Error('DirectoryTransactionException: Error: Revision number too low');
        }

        const currentRev = this.revisions.get(path) || 0;
        this.revisions.set(path, currentRev + 1);
        this.data.set(path, data);
      },

      get: async (path: string): Promise<any> => {
        await new Promise(r => setTimeout(r, Math.random() * 10));
        return this.data.get(path) || null;
      }
    };

    simulateRevisionError(): void {
      this.simulateRevisionErrorOnce = true;
    }

    getRevision(path: string): number {
      return this.revisions.get(path) || 0;
    }
  }

  // Realistic StorageManager mock with lock implementation
  class TestStorageManager {
    private saveLocks: Map<string, Promise<any>> = new Map();
    private s5Client: MockS5Client;
    private userAddress = '0xTestUser';
    private static SESSIONS_PATH = 'home/conversations';

    constructor(s5Client: MockS5Client) {
      this.s5Client = s5Client;
    }

    private async withConversationLock<T>(
      conversationId: string,
      operation: () => Promise<T>
    ): Promise<T> {
      const existingLock = this.saveLocks.get(conversationId);

      const wrappedOperation = (async () => {
        if (existingLock) {
          try { await existingLock; } catch { /* continue */ }
        }
        return operation();
      })();

      this.saveLocks.set(conversationId, wrappedOperation);

      try {
        return await wrappedOperation;
      } finally {
        if (this.saveLocks.get(conversationId) === wrappedOperation) {
          this.saveLocks.delete(conversationId);
        }
      }
    }

    private async _saveConversationInternal(
      conversation: ConversationData,
      maxRetries = 3
    ): Promise<StorageResult> {
      const path = `${TestStorageManager.SESSIONS_PATH}/${this.userAddress}/${conversation.id}/conversation.json`;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.s5Client.fs.put(path, conversation);
          return {
            cid: conversation.id,
            url: `s5://${conversation.id}`,
            size: JSON.stringify(conversation).length,
            timestamp: conversation.updatedAt
          };
        } catch (error: any) {
          const isRevisionError =
            error.message?.includes('Revision number too low') ||
            error.message?.includes('DirectoryTransactionException');

          if (isRevisionError && attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 50 * attempt));
            continue;
          }
          throw error;
        }
      }
      throw new Error('Save failed after retries');
    }

    async saveConversation(conversation: ConversationData): Promise<StorageResult> {
      return this.withConversationLock(conversation.id, () =>
        this._saveConversationInternal(conversation)
      );
    }

    async loadConversation(conversationId: string): Promise<ConversationData | null> {
      const path = `${TestStorageManager.SESSIONS_PATH}/${this.userAddress}/${conversationId}/conversation.json`;
      return this.s5Client.fs.get(path);
    }

    async appendMessage(conversationId: string, message: { role: string; content: string }): Promise<void> {
      return this.withConversationLock(conversationId, async () => {
        let conversation = await this.loadConversation(conversationId);

        if (!conversation) {
          conversation = {
            id: conversationId,
            messages: [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
        }

        conversation.messages.push(message);
        conversation.updatedAt = Date.now();

        await this._saveConversationInternal(conversation);
      });
    }
  }

  let mockS5Client: MockS5Client;
  let storageManager: TestStorageManager;

  beforeEach(() => {
    mockS5Client = new MockS5Client();
    storageManager = new TestStorageManager(mockS5Client);
  });

  it('should handle 5 parallel saveConversation() calls to same conversation', async () => {
    const conversationId = 'test-conv-1';
    const baseConversation: ConversationData = {
      id: conversationId,
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Fire 5 parallel saves
    const saves = Array.from({ length: 5 }, (_, i) =>
      storageManager.saveConversation({
        ...baseConversation,
        messages: [{ role: 'user', content: `Message ${i}` }],
        updatedAt: Date.now() + i
      })
    );

    // All should complete successfully
    const results = await Promise.all(saves);

    expect(results).toHaveLength(5);
    results.forEach(result => {
      expect(result.cid).toBe(conversationId);
    });

    // Verify conversation was saved (last write wins)
    const saved = await storageManager.loadConversation(conversationId);
    expect(saved).not.toBeNull();
    expect(saved?.messages).toHaveLength(1);
  });

  it('should handle appendMessage() + saveConversation() concurrent calls', async () => {
    const conversationId = 'test-conv-2';

    // Create initial conversation
    await storageManager.saveConversation({
      id: conversationId,
      messages: [{ role: 'user', content: 'Initial' }],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Fire concurrent appendMessage and saveConversation
    const append = storageManager.appendMessage(conversationId, { role: 'assistant', content: 'Response' });
    const save = storageManager.saveConversation({
      id: conversationId,
      messages: [{ role: 'user', content: 'New message' }],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Both should complete without errors
    await expect(Promise.all([append, save])).resolves.toBeDefined();
  });

  it('should handle rapid message streaming without revision errors', async () => {
    const conversationId = 'test-conv-3';

    // Simulate rapid message streaming (10 messages in quick succession)
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`
    }));

    // Fire all appends concurrently (simulates streaming)
    const appends = messages.map(msg =>
      storageManager.appendMessage(conversationId, msg)
    );

    // All should complete without errors
    await expect(Promise.all(appends)).resolves.toBeDefined();

    // Verify final state
    const conversation = await storageManager.loadConversation(conversationId);
    expect(conversation).not.toBeNull();
    // Messages should be there (order might vary due to race, but all present)
    expect(conversation?.messages.length).toBe(10);
  });

  it('should retry and succeed when S5 returns revision error', async () => {
    const conversationId = 'test-conv-4';

    // Tell mock S5 to fail once with revision error
    mockS5Client.simulateRevisionError();

    const conversation: ConversationData = {
      id: conversationId,
      messages: [{ role: 'user', content: 'Test' }],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Should succeed despite initial error (retry logic)
    const result = await storageManager.saveConversation(conversation);

    expect(result.cid).toBe(conversationId);

    // Verify conversation was saved
    const saved = await storageManager.loadConversation(conversationId);
    expect(saved).not.toBeNull();
  });

  it('should allow parallel saves to different conversations', async () => {
    const conversations = Array.from({ length: 5 }, (_, i) => ({
      id: `conv-${i}`,
      messages: [{ role: 'user', content: `Message for conv ${i}` }],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    }));

    // Fire parallel saves to different conversations
    const saves = conversations.map(conv => storageManager.saveConversation(conv));

    // All should complete
    const results = await Promise.all(saves);
    expect(results).toHaveLength(5);

    // Verify all were saved
    for (const conv of conversations) {
      const saved = await storageManager.loadConversation(conv.id);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBe(conv.id);
    }
  });
});
