import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageHandler } from '../../src/websocket/handlers';
import { MessageQueue } from '../../src/websocket/queue';

describe('WebSocket Messages', () => {
  let handler: MessageHandler;
  let queue: MessageQueue;

  beforeEach(() => {
    handler = new MessageHandler();
    queue = new MessageQueue();
  });

  afterEach(() => {
    handler.removeAllListeners();
    queue.clear();
  });

  describe('Message Parsing', () => {
    it('should parse JSON messages', () => {
      const message = { type: 'test', data: 'hello' };
      const parsed = handler.parseMessage(JSON.stringify(message));
      expect(parsed).toEqual(message);
    });

    it('should handle invalid JSON', () => {
      const result = handler.parseMessage('invalid json');
      expect(result).toBeNull();
    });

    it('should validate message structure', () => {
      const validMessage = { type: 'session-request', sessionId: '123' };
      expect(handler.isValidMessage(validMessage)).toBe(true);

      const invalidMessage = { data: 'no type' };
      expect(handler.isValidMessage(invalidMessage)).toBe(false);
    });
  });

  describe('Session Events', () => {
    it('should handle session-request event', () => {
      const listener = vi.fn();
      handler.on('session-request', listener);

      const message = {
        type: 'session-request',
        sessionId: 'session-123',
        jobId: 'job-456',
        model: 'gpt-4',
        maxTokens: 2000
      };

      handler.handleMessage(JSON.stringify(message));
      expect(listener).toHaveBeenCalledWith(message);
    });

    it('should handle session-start event', () => {
      const listener = vi.fn();
      handler.on('session-start', listener);

      const message = {
        type: 'session-start',
        sessionId: 'session-123',
        timestamp: Date.now()
      };

      handler.handleMessage(JSON.stringify(message));
      expect(listener).toHaveBeenCalledWith(message);
    });

    it('should handle inference-complete event', () => {
      const listener = vi.fn();
      handler.on('inference-complete', listener);

      const message = {
        type: 'inference-complete',
        sessionId: 'session-123',
        tokensGenerated: 150,
        duration: 2500,
        success: true
      };

      handler.handleMessage(JSON.stringify(message));
      expect(listener).toHaveBeenCalledWith(message);
    });

    it('should track token generation', () => {
      const message = {
        type: 'inference-complete',
        sessionId: 'session-123',
        tokensGenerated: 150
      };

      handler.handleMessage(JSON.stringify(message));
      const stats = handler.getSessionStats('session-123');
      expect(stats?.tokensGenerated).toBe(150);
    });

    it('should handle session-error event', () => {
      const listener = vi.fn();
      handler.on('session-error', listener);

      const message = {
        type: 'session-error',
        sessionId: 'session-123',
        error: 'Out of memory',
        code: 'OOM'
      };

      handler.handleMessage(JSON.stringify(message));
      expect(listener).toHaveBeenCalledWith(message);
    });
  });

  describe('Progress Tracking', () => {
    it('should track session progress', () => {
      handler.handleMessage(JSON.stringify({
        type: 'session-start',
        sessionId: 'session-123'
      }));

      handler.handleMessage(JSON.stringify({
        type: 'progress',
        sessionId: 'session-123',
        tokensGenerated: 50,
        percentComplete: 25
      }));

      const progress = handler.getSessionProgress('session-123');
      expect(progress).toEqual({
        tokensGenerated: 50,
        percentComplete: 25,
        status: 'in-progress'
      });
    });

    it('should update session status', () => {
      handler.handleMessage(JSON.stringify({
        type: 'session-start',
        sessionId: 'session-123'
      }));

      expect(handler.getSessionStatus('session-123')).toBe('active');

      handler.handleMessage(JSON.stringify({
        type: 'inference-complete',
        sessionId: 'session-123'
      }));

      expect(handler.getSessionStatus('session-123')).toBe('completed');
    });

    it('should aggregate session statistics', () => {
      handler.handleMessage(JSON.stringify({
        type: 'inference-complete',
        sessionId: 'session-1',
        tokensGenerated: 100,
        duration: 2000
      }));

      handler.handleMessage(JSON.stringify({
        type: 'inference-complete',
        sessionId: 'session-2',
        tokensGenerated: 200,
        duration: 3000
      }));

      const aggregate = handler.getAggregateStats();
      expect(aggregate).toEqual({
        totalSessions: 2,
        totalTokens: 300,
        averageTokens: 150,
        totalDuration: 5000,
        averageDuration: 2500
      });
    });
  });

  describe('Message Queue', () => {
    it('should queue messages when disconnected', () => {
      const message = { type: 'test', data: 'hello' };
      queue.enqueue(message);

      expect(queue.size()).toBe(1);
      expect(queue.peek()).toEqual(message);
    });

    it('should dequeue messages in order', () => {
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      queue.enqueue({ id: 3 });

      expect(queue.dequeue()).toEqual({ id: 1 });
      expect(queue.dequeue()).toEqual({ id: 2 });
      expect(queue.dequeue()).toEqual({ id: 3 });
      expect(queue.dequeue()).toBeNull();
    });

    it('should respect max queue size', () => {
      queue.setMaxSize(3);

      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      queue.enqueue({ id: 3 });
      queue.enqueue({ id: 4 }); // Should drop oldest

      expect(queue.size()).toBe(3);
      expect(queue.dequeue()).toEqual({ id: 2 });
    });

    it('should clear queue', () => {
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });

      queue.clear();
      expect(queue.size()).toBe(0);
      expect(queue.dequeue()).toBeNull();
    });

    it('should drain all messages', () => {
      queue.enqueue({ id: 1 });
      queue.enqueue({ id: 2 });
      queue.enqueue({ id: 3 });

      const messages = queue.drainAll();
      expect(messages).toHaveLength(3);
      expect(queue.size()).toBe(0);
    });

    it('should check if empty', () => {
      expect(queue.isEmpty()).toBe(true);

      queue.enqueue({ id: 1 });
      expect(queue.isEmpty()).toBe(false);

      queue.dequeue();
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('Message Routing', () => {
    it('should route messages by type', () => {
      const sessionHandler = vi.fn();
      const errorHandler = vi.fn();

      handler.registerHandler('session-request', sessionHandler);
      handler.registerHandler('session-error', errorHandler);

      handler.handleMessage(JSON.stringify({
        type: 'session-request',
        sessionId: '123'
      }));

      handler.handleMessage(JSON.stringify({
        type: 'session-error',
        error: 'failed'
      }));

      expect(sessionHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle unknown message types', () => {
      const unknownHandler = vi.fn();
      handler.on('unknown-message', unknownHandler);

      handler.handleMessage(JSON.stringify({
        type: 'unknown-type',
        data: 'test'
      }));

      expect(unknownHandler).toHaveBeenCalled();
    });

    it('should support wildcard handlers', () => {
      const wildcardHandler = vi.fn();
      handler.on('*', wildcardHandler);

      handler.handleMessage(JSON.stringify({
        type: 'any-type',
        data: 'test'
      }));

      expect(wildcardHandler).toHaveBeenCalled();
    });
  });

  describe('Binary Messages', () => {
    it('should handle binary data', () => {
      const buffer = Buffer.from('binary data');
      const listener = vi.fn();
      handler.on('binary', listener);

      handler.handleBinaryMessage(buffer);
      expect(listener).toHaveBeenCalledWith(buffer);
    });

    it('should convert binary to base64', () => {
      const buffer = Buffer.from('hello world');
      const base64 = handler.binaryToBase64(buffer);
      expect(base64).toBe('aGVsbG8gd29ybGQ=');
    });
  });
});