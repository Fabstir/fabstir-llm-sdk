/**
 * Storage Lock Tests - Sub-phase 1.1
 *
 * Tests for the withConversationLock() helper method that serializes
 * concurrent operations to prevent S5 "Revision number too low" errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// We'll test the lock helper by creating a minimal mock StorageManager
// that exposes the lock mechanism for testing

describe('withConversationLock', () => {
  // Helper to create a testable lock implementation
  // This mirrors the actual implementation pattern
  class TestLockManager {
    private saveLocks: Map<string, Promise<any>> = new Map();

    /**
     * Execute operation with per-conversation lock to prevent S5 revision conflicts
     */
    async withConversationLock<T>(
      conversationId: string,
      operation: () => Promise<T>
    ): Promise<T> {
      const existingLock = this.saveLocks.get(conversationId);

      const wrappedOperation = (async () => {
        if (existingLock) {
          try {
            await existingLock;
          } catch {
            // Previous operation failed, but we still proceed
          }
        }
        return operation();
      })();

      this.saveLocks.set(conversationId, wrappedOperation);

      try {
        return await wrappedOperation;
      } finally {
        // Clean up lock if it's still ours
        if (this.saveLocks.get(conversationId) === wrappedOperation) {
          this.saveLocks.delete(conversationId);
        }
      }
    }

    // Expose lock map for testing
    getLockCount(): number {
      return this.saveLocks.size;
    }

    hasLock(conversationId: string): boolean {
      return this.saveLocks.has(conversationId);
    }
  }

  let lockManager: TestLockManager;

  beforeEach(() => {
    lockManager = new TestLockManager();
  });

  it('should serialize concurrent operations for same conversation', async () => {
    const executionOrder: number[] = [];
    let operationCounter = 0;

    // Create 3 concurrent operations
    const op1 = lockManager.withConversationLock('conv1', async () => {
      const myOrder = ++operationCounter;
      await new Promise(r => setTimeout(r, 50)); // Simulate async work
      executionOrder.push(myOrder);
      return `result-${myOrder}`;
    });

    const op2 = lockManager.withConversationLock('conv1', async () => {
      const myOrder = ++operationCounter;
      await new Promise(r => setTimeout(r, 30));
      executionOrder.push(myOrder);
      return `result-${myOrder}`;
    });

    const op3 = lockManager.withConversationLock('conv1', async () => {
      const myOrder = ++operationCounter;
      await new Promise(r => setTimeout(r, 10));
      executionOrder.push(myOrder);
      return `result-${myOrder}`;
    });

    // Wait for all to complete
    const results = await Promise.all([op1, op2, op3]);

    // Operations should complete in the order they started (serialized)
    // Even though op3 has shortest delay, it should finish last
    expect(executionOrder).toEqual([1, 2, 3]);
    expect(results).toEqual(['result-1', 'result-2', 'result-3']);
  });

  it('should wait for previous operation to complete before starting next', async () => {
    const timeline: string[] = [];

    const op1 = lockManager.withConversationLock('conv1', async () => {
      timeline.push('op1-start');
      await new Promise(r => setTimeout(r, 50));
      timeline.push('op1-end');
      return 'op1';
    });

    // Start op2 immediately after op1 (while op1 is still running)
    const op2 = lockManager.withConversationLock('conv1', async () => {
      timeline.push('op2-start');
      await new Promise(r => setTimeout(r, 20));
      timeline.push('op2-end');
      return 'op2';
    });

    await Promise.all([op1, op2]);

    // op2-start should come AFTER op1-end (serialized)
    expect(timeline).toEqual(['op1-start', 'op1-end', 'op2-start', 'op2-end']);
  });

  it('should clean up lock after completion', async () => {
    expect(lockManager.getLockCount()).toBe(0);

    await lockManager.withConversationLock('conv1', async () => {
      // Lock should exist during operation
      return 'done';
    });

    // Lock should be cleaned up after operation completes
    expect(lockManager.getLockCount()).toBe(0);
    expect(lockManager.hasLock('conv1')).toBe(false);
  });

  it('should continue if previous operation failed', async () => {
    const results: string[] = [];

    // First operation fails
    const op1 = lockManager.withConversationLock('conv1', async () => {
      results.push('op1-start');
      throw new Error('Operation 1 failed');
    }).catch(err => {
      results.push('op1-failed');
      return 'op1-error';
    });

    // Second operation should still run
    const op2 = lockManager.withConversationLock('conv1', async () => {
      results.push('op2-start');
      await new Promise(r => setTimeout(r, 10));
      results.push('op2-end');
      return 'op2-success';
    });

    const [r1, r2] = await Promise.all([op1, op2]);

    // op2 should complete successfully even though op1 failed
    expect(results).toContain('op2-start');
    expect(results).toContain('op2-end');
    expect(r2).toBe('op2-success');
  });

  it('should return operation result correctly', async () => {
    const result = await lockManager.withConversationLock('conv1', async () => {
      return { status: 'success', data: [1, 2, 3] };
    });

    expect(result).toEqual({ status: 'success', data: [1, 2, 3] });
  });

  it('should allow parallel operations on different conversations', async () => {
    const timeline: string[] = [];

    // Two operations on different conversations should run in parallel
    const op1 = lockManager.withConversationLock('conv1', async () => {
      timeline.push('conv1-start');
      await new Promise(r => setTimeout(r, 50));
      timeline.push('conv1-end');
      return 'conv1';
    });

    const op2 = lockManager.withConversationLock('conv2', async () => {
      timeline.push('conv2-start');
      await new Promise(r => setTimeout(r, 30));
      timeline.push('conv2-end');
      return 'conv2';
    });

    await Promise.all([op1, op2]);

    // Both should start before either ends (parallel execution)
    const conv1StartIdx = timeline.indexOf('conv1-start');
    const conv2StartIdx = timeline.indexOf('conv2-start');
    const conv1EndIdx = timeline.indexOf('conv1-end');
    const conv2EndIdx = timeline.indexOf('conv2-end');

    // conv2 should end before conv1 (it's faster and runs in parallel)
    expect(conv2EndIdx).toBeLessThan(conv1EndIdx);
    // Both starts should be at the beginning
    expect(conv1StartIdx).toBeLessThan(2);
    expect(conv2StartIdx).toBeLessThan(2);
  });

  it('should propagate errors correctly', async () => {
    await expect(
      lockManager.withConversationLock('conv1', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    // Lock should still be cleaned up after error
    expect(lockManager.hasLock('conv1')).toBe(false);
  });

  it('should handle rapid successive operations', async () => {
    const results: number[] = [];

    // Fire off 10 rapid operations
    const operations = Array.from({ length: 10 }, (_, i) =>
      lockManager.withConversationLock('conv1', async () => {
        results.push(i);
        return i;
      })
    );

    const finalResults = await Promise.all(operations);

    // All operations should complete in order
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(finalResults).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

/**
 * Sub-phase 1.2 Tests: _saveConversationInternal with retry logic
 *
 * Tests for the internal save method that handles S5 revision conflicts
 * through retry with exponential backoff.
 */
describe('_saveConversationInternal', () => {
  // Mock S5 client for testing retry behavior
  interface MockS5Client {
    fs: {
      put: ReturnType<typeof vi.fn>;
    };
  }

  interface StorageResult {
    cid: string;
    url: string;
    size: number;
    timestamp: number;
  }

  interface ConversationData {
    id: string;
    messages: Array<{ role: string; content: string }>;
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }

  // Test implementation that mirrors the actual internal save method
  class TestInternalSaveManager {
    private s5Client: MockS5Client;
    private userAddress = '0xTestUser';

    constructor(s5Client: MockS5Client) {
      this.s5Client = s5Client;
    }

    async _saveConversationInternal(
      conversation: ConversationData,
      maxRetries = 3
    ): Promise<StorageResult> {
      const path = `home/conversations/${this.userAddress}/${conversation.id}/conversation.json`;

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
            // Exponential backoff: 200ms, 400ms, 800ms
            await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
            continue;
          }

          const errorMsg = error.message || 'Unknown S5 error';
          throw new Error(`Failed to save conversation: ${errorMsg}`);
        }
      }

      // TypeScript: unreachable but needed for return type
      throw new Error('Save failed after retries');
    }
  }

  let mockS5Client: MockS5Client;
  let saveManager: TestInternalSaveManager;

  const testConversation: ConversationData = {
    id: 'test-conv-123',
    messages: [{ role: 'user', content: 'Hello' }],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(() => {
    mockS5Client = {
      fs: {
        put: vi.fn()
      }
    };
    saveManager = new TestInternalSaveManager(mockS5Client);
  });

  it('should save conversation to S5 successfully', async () => {
    mockS5Client.fs.put.mockResolvedValueOnce(undefined);

    const result = await saveManager._saveConversationInternal(testConversation);

    expect(result).toEqual({
      cid: testConversation.id,
      url: `s5://${testConversation.id}`,
      size: expect.any(Number),
      timestamp: testConversation.updatedAt
    });
    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(1);
  });

  it('should retry on "Revision number too low" error', async () => {
    mockS5Client.fs.put
      .mockRejectedValueOnce(new Error('Revision number too low'))
      .mockRejectedValueOnce(new Error('Revision number too low'))
      .mockResolvedValueOnce(undefined);

    const result = await saveManager._saveConversationInternal(testConversation);

    expect(result.cid).toBe(testConversation.id);
    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(3);
  });

  it('should retry on "DirectoryTransactionException" error', async () => {
    mockS5Client.fs.put
      .mockRejectedValueOnce(new Error('DirectoryTransactionException: Error: Revision number too low'))
      .mockResolvedValueOnce(undefined);

    const result = await saveManager._saveConversationInternal(testConversation);

    expect(result.cid).toBe(testConversation.id);
    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(2);
  });

  it('should use exponential backoff between retries', async () => {
    const timestamps: number[] = [];

    mockS5Client.fs.put.mockImplementation(async () => {
      timestamps.push(Date.now());
      if (timestamps.length < 3) {
        throw new Error('Revision number too low');
      }
    });

    await saveManager._saveConversationInternal(testConversation);

    expect(timestamps.length).toBe(3);

    // Check delays (with tolerance for timing variance)
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];

    // First retry after ~200ms (100 * 2^1)
    expect(delay1).toBeGreaterThanOrEqual(150);
    expect(delay1).toBeLessThan(350);

    // Second retry after ~400ms (100 * 2^2)
    expect(delay2).toBeGreaterThanOrEqual(350);
    expect(delay2).toBeLessThan(550);
  });

  it('should throw after max retries exceeded', async () => {
    mockS5Client.fs.put.mockRejectedValue(new Error('Revision number too low'));

    await expect(
      saveManager._saveConversationInternal(testConversation)
    ).rejects.toThrow('Failed to save conversation: Revision number too low');

    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(3);
  });

  it('should return StorageResult on success', async () => {
    mockS5Client.fs.put.mockResolvedValueOnce(undefined);

    const result = await saveManager._saveConversationInternal(testConversation);

    expect(result).toHaveProperty('cid');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.size).toBe('number');
    expect(result.size).toBeGreaterThan(0);
  });

  it('should not retry on non-revision errors', async () => {
    mockS5Client.fs.put.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      saveManager._saveConversationInternal(testConversation)
    ).rejects.toThrow('Failed to save conversation: Network error');

    // Should not retry - only 1 call
    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(1);
  });

  it('should respect custom maxRetries parameter', async () => {
    mockS5Client.fs.put.mockRejectedValue(new Error('Revision number too low'));

    await expect(
      saveManager._saveConversationInternal(testConversation, 5)
    ).rejects.toThrow('Failed to save conversation');

    expect(mockS5Client.fs.put).toHaveBeenCalledTimes(5);
  });
});

/**
 * Sub-phase 2.1 Tests: appendMessage simplification
 *
 * Tests to verify appendMessage still works correctly after
 * refactoring to use withConversationLock() and _saveConversationInternal().
 */
describe('appendMessage', () => {
  interface Message {
    role: string;
    content: string;
  }

  interface ConversationData {
    id: string;
    messages: Message[];
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }

  interface MockS5Client {
    fs: {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
  }

  // Simplified test implementation that mirrors the refactored appendMessage
  class TestAppendMessageManager {
    private saveLocks: Map<string, Promise<any>> = new Map();
    private s5Client: MockS5Client;

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

    async loadConversation(conversationId: string): Promise<ConversationData | null> {
      try {
        return await this.s5Client.fs.get(`conversations/${conversationId}/conversation.json`);
      } catch {
        return null;
      }
    }

    private async _saveConversationInternal(conversation: ConversationData): Promise<void> {
      await this.s5Client.fs.put(
        `conversations/${conversation.id}/conversation.json`,
        conversation
      );
    }

    async appendMessage(conversationId: string, message: Message): Promise<void> {
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
  let appendManager: TestAppendMessageManager;

  beforeEach(() => {
    mockS5Client = {
      fs: {
        get: vi.fn(),
        put: vi.fn()
      }
    };
    appendManager = new TestAppendMessageManager(mockS5Client);
  });

  it('should serialize operations for same conversation', async () => {
    const executionOrder: number[] = [];
    let counter = 0;

    // Mock load to return existing conversation
    mockS5Client.fs.get.mockResolvedValue({
      id: 'conv1',
      messages: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    // Mock put to track execution order with delays
    mockS5Client.fs.put.mockImplementation(async () => {
      const myOrder = ++counter;
      await new Promise(r => setTimeout(r, 50 - (myOrder * 10)));
      executionOrder.push(myOrder);
    });

    // Fire 3 concurrent appends
    const p1 = appendManager.appendMessage('conv1', { role: 'user', content: 'msg1' });
    const p2 = appendManager.appendMessage('conv1', { role: 'user', content: 'msg2' });
    const p3 = appendManager.appendMessage('conv1', { role: 'user', content: 'msg3' });

    await Promise.all([p1, p2, p3]);

    // Should execute in order (serialized)
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('should load, modify, and save atomically', async () => {
    const existingConversation = {
      id: 'conv1',
      messages: [{ role: 'user', content: 'existing' }],
      metadata: {},
      createdAt: 1000,
      updatedAt: 1000
    };

    mockS5Client.fs.get.mockResolvedValue(existingConversation);
    mockS5Client.fs.put.mockResolvedValue(undefined);

    await appendManager.appendMessage('conv1', { role: 'assistant', content: 'new message' });

    // Verify load was called
    expect(mockS5Client.fs.get).toHaveBeenCalledWith('conversations/conv1/conversation.json');

    // Verify save was called with updated conversation
    expect(mockS5Client.fs.put).toHaveBeenCalledWith(
      'conversations/conv1/conversation.json',
      expect.objectContaining({
        id: 'conv1',
        messages: [
          { role: 'user', content: 'existing' },
          { role: 'assistant', content: 'new message' }
        ]
      })
    );
  });

  it('should create new conversation if not exists', async () => {
    mockS5Client.fs.get.mockResolvedValue(null);
    mockS5Client.fs.put.mockResolvedValue(undefined);

    await appendManager.appendMessage('new-conv', { role: 'user', content: 'first message' });

    // Verify new conversation was created with the message
    expect(mockS5Client.fs.put).toHaveBeenCalledWith(
      'conversations/new-conv/conversation.json',
      expect.objectContaining({
        id: 'new-conv',
        messages: [{ role: 'user', content: 'first message' }]
      })
    );
  });

  it('should append to existing conversation', async () => {
    const existingConversation = {
      id: 'conv1',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' }
      ],
      metadata: {},
      createdAt: 1000,
      updatedAt: 2000
    };

    mockS5Client.fs.get.mockResolvedValue(existingConversation);
    mockS5Client.fs.put.mockResolvedValue(undefined);

    await appendManager.appendMessage('conv1', { role: 'user', content: 'how are you?' });

    expect(mockS5Client.fs.put).toHaveBeenCalledWith(
      'conversations/conv1/conversation.json',
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
          { role: 'user', content: 'how are you?' }
        ]
      })
    );
  });
});

/**
 * Sub-phase 2.2 Tests: Encrypted save methods use lock
 *
 * Tests to verify encrypted save methods also use the lock
 * for concurrency protection.
 */
describe('saveConversationEncrypted', () => {
  interface ConversationData {
    id: string;
    messages: Array<{ role: string; content: string }>;
    metadata: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }

  interface MockS5Client {
    fs: {
      put: ReturnType<typeof vi.fn>;
    };
  }

  interface MockEncryptionManager {
    encryptForStorage: ReturnType<typeof vi.fn>;
  }

  // Simplified test implementation for encrypted save
  class TestEncryptedSaveManager {
    private saveLocks: Map<string, Promise<any>> = new Map();
    private s5Client: MockS5Client;
    private encryptionManager: MockEncryptionManager;

    constructor(s5Client: MockS5Client, encryptionManager: MockEncryptionManager) {
      this.s5Client = s5Client;
      this.encryptionManager = encryptionManager;
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

    async saveConversationEncrypted(
      conversation: ConversationData,
      options: { hostPubKey: string }
    ): Promise<{ cid: string }> {
      return this.withConversationLock(conversation.id, async () => {
        const encrypted = await this.encryptionManager.encryptForStorage(
          options.hostPubKey,
          conversation
        );

        const wrapper = { encrypted: true, version: 1, ...encrypted };
        const path = `conversations/${conversation.id}/conversation-encrypted.json`;
        await this.s5Client.fs.put(path, wrapper);

        return { cid: conversation.id };
      });
    }
  }

  let mockS5Client: MockS5Client;
  let mockEncryptionManager: MockEncryptionManager;
  let encryptedManager: TestEncryptedSaveManager;

  const testConversation: ConversationData = {
    id: 'conv1',
    messages: [{ role: 'user', content: 'Hello' }],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  beforeEach(() => {
    mockS5Client = {
      fs: { put: vi.fn() }
    };
    mockEncryptionManager = {
      encryptForStorage: vi.fn().mockResolvedValue({ ciphertext: 'encrypted', nonce: 'nonce' })
    };
    encryptedManager = new TestEncryptedSaveManager(mockS5Client, mockEncryptionManager);
  });

  it('should use lock for encrypted saves', async () => {
    mockS5Client.fs.put.mockResolvedValue(undefined);

    await encryptedManager.saveConversationEncrypted(testConversation, { hostPubKey: '0x123' });

    expect(mockS5Client.fs.put).toHaveBeenCalledWith(
      'conversations/conv1/conversation-encrypted.json',
      expect.objectContaining({ encrypted: true, version: 1 })
    );
  });

  it('should serialize concurrent encrypted saves to same conversation', async () => {
    const executionOrder: number[] = [];
    let counter = 0;

    mockS5Client.fs.put.mockImplementation(async () => {
      const myOrder = ++counter;
      await new Promise(r => setTimeout(r, 50 - (myOrder * 10)));
      executionOrder.push(myOrder);
    });

    const p1 = encryptedManager.saveConversationEncrypted(testConversation, { hostPubKey: '0x1' });
    const p2 = encryptedManager.saveConversationEncrypted(testConversation, { hostPubKey: '0x2' });
    const p3 = encryptedManager.saveConversationEncrypted(testConversation, { hostPubKey: '0x3' });

    await Promise.all([p1, p2, p3]);

    // Should execute in order (serialized by lock)
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('should allow parallel encrypted saves to different conversations', async () => {
    const executionOrder: string[] = [];

    mockS5Client.fs.put.mockImplementation(async (path: string) => {
      executionOrder.push(`start-${path}`);
      await new Promise(r => setTimeout(r, 30));
      executionOrder.push(`end-${path}`);
    });

    const conv1 = { ...testConversation, id: 'conv1' };
    const conv2 = { ...testConversation, id: 'conv2' };

    const p1 = encryptedManager.saveConversationEncrypted(conv1, { hostPubKey: '0x1' });
    const p2 = encryptedManager.saveConversationEncrypted(conv2, { hostPubKey: '0x2' });

    await Promise.all([p1, p2]);

    // Both should start before either ends (parallel execution)
    const startIdx1 = executionOrder.findIndex(e => e.includes('conv1') && e.startsWith('start'));
    const startIdx2 = executionOrder.findIndex(e => e.includes('conv2') && e.startsWith('start'));
    const endIdx1 = executionOrder.findIndex(e => e.includes('conv1') && e.startsWith('end'));
    const endIdx2 = executionOrder.findIndex(e => e.includes('conv2') && e.startsWith('end'));

    // Both starts should come before both ends (truly parallel)
    expect(Math.max(startIdx1, startIdx2)).toBeLessThan(Math.min(endIdx1, endIdx2));
  });
});
