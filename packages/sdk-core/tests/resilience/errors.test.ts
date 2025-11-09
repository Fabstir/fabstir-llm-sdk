/**
 * Error Handling Tests
 * Tests for comprehensive error scenarios and handling
 * Max 300 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorHandler } from '../../src/resilience/error-handler.js';

describe('Error Handler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = new ErrorHandler({
      maxRetries: 3,
      retryDelay: 100,
      exponentialBackoff: true
    });
  });

  describe('Error Classification', () => {
    it('should classify network errors', () => {
      const error = new Error('Network request failed');
      error.name = 'NetworkError';

      const classified = errorHandler.classify(error);
      expect(classified.type).toBe('network');
      expect(classified.recoverable).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it('should classify storage errors', () => {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';

      const classified = errorHandler.classify(error);
      expect(classified.type).toBe('storage');
      expect(classified.recoverable).toBe(true);
      expect(classified.retryable).toBe(false);
    });

    it('should classify validation errors', () => {
      const error = new Error('Invalid input data');
      error.name = 'ValidationError';

      const classified = errorHandler.classify(error);
      expect(classified.type).toBe('validation');
      expect(classified.recoverable).toBe(false);
      expect(classified.retryable).toBe(false);
    });

    it('should classify concurrent operation errors', () => {
      const error = new Error('Transaction conflict');
      error.name = 'ConflictError';

      const classified = errorHandler.classify(error);
      expect(classified.type).toBe('concurrency');
      expect(classified.recoverable).toBe(true);
      expect(classified.retryable).toBe(true);
    });

    it('should classify unknown errors as system errors', () => {
      const error = new Error('Unknown error');

      const classified = errorHandler.classify(error);
      expect(classified.type).toBe('system');
      expect(classified.recoverable).toBe(false);
    });
  });

  describe('Error Handling Strategy', () => {
    it('should handle recoverable errors with retry', async () => {
      let attempts = 0;
      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Temporary failure');
          error.name = 'NetworkError';
          throw error;
        }
        return 'success';
      });

      const result = await errorHandler.handle(operation);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw non-recoverable errors immediately', async () => {
      const operation = vi.fn(async () => {
        const error = new Error('Invalid data');
        error.name = 'ValidationError';
        throw error;
      });

      await expect(errorHandler.handle(operation)).rejects.toThrow('Invalid data');
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });

    it('should respect max retries limit', async () => {
      const operation = vi.fn(async () => {
        const error = new Error('Always fails');
        error.name = 'NetworkError';
        throw error;
      });

      await expect(errorHandler.handle(operation)).rejects.toThrow('Always fails');
      expect(operation).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should apply exponential backoff between retries', async () => {
      const startTime = Date.now();
      let attempts = 0;

      const operation = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Retry needed');
          error.name = 'NetworkError';
          throw error;
        }
        return 'success';
      });

      await errorHandler.handle(operation);
      const duration = Date.now() - startTime;

      // Should wait: 100ms + 200ms = 300ms minimum
      expect(duration).toBeGreaterThanOrEqual(280);
    });
  });

  describe('Error Context', () => {
    it('should capture error context', () => {
      const error = new Error('Test error');
      const context = {
        operation: 'vectorSearch',
        databaseName: 'test-db',
        userId: 'user-123'
      };

      const enriched = errorHandler.enrichError(error, context);
      expect(enriched.context).toEqual(context);
      expect(enriched.timestamp).toBeDefined();
      expect(enriched.stack).toBeDefined();
    });

    it('should preserve original error properties', () => {
      const error = new Error('Original error');
      error.name = 'CustomError';

      const enriched = errorHandler.enrichError(error, {});
      expect(enriched.message).toBe('Original error');
      expect(enriched.name).toBe('CustomError');
    });

    it('should track error history', () => {
      const error1 = new Error('First error');
      const error2 = new Error('Second error');

      errorHandler.recordError(error1, { operation: 'op1' });
      errorHandler.recordError(error2, { operation: 'op2' });

      const history = errorHandler.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('First error');
      expect(history[1].message).toBe('Second error');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      const handler = new ErrorHandler({
        maxRetries: 0,
        circuitBreakerThreshold: 3,
        circuitBreakerTimeout: 1000
      });

      const operation = vi.fn(async () => {
        throw new Error('Service unavailable');
      });

      // Fail 3 times to open circuit
      await expect(handler.handle(operation)).rejects.toThrow();
      await expect(handler.handle(operation)).rejects.toThrow();
      await expect(handler.handle(operation)).rejects.toThrow();

      // Circuit should be open, immediate failure
      const startTime = Date.now();
      await expect(handler.handle(operation)).rejects.toThrow('Circuit breaker is open');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(50); // Should fail fast
      expect(operation).toHaveBeenCalledTimes(3); // Not called when circuit open
    });

    it('should transition to half-open after timeout', async () => {
      const handler = new ErrorHandler({
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeout: 200
      });

      const operation = vi.fn(async () => {
        throw new Error('Failure');
      });

      // Open circuit
      await expect(handler.handle(operation)).rejects.toThrow();
      await expect(handler.handle(operation)).rejects.toThrow();

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 250));

      // Circuit should be half-open, allow one attempt
      await expect(handler.handle(operation)).rejects.toThrow('Failure');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should close circuit after successful operation', async () => {
      const handler = new ErrorHandler({
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeout: 200
      });

      let shouldFail = true;
      const operation = vi.fn(async () => {
        if (shouldFail) throw new Error('Failure');
        return 'success';
      });

      // Open circuit
      await expect(handler.handle(operation)).rejects.toThrow();
      await expect(handler.handle(operation)).rejects.toThrow();

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 250));

      // Succeed to close circuit
      shouldFail = false;
      const result = await handler.handle(operation);
      expect(result).toBe('success');

      // Circuit closed, subsequent calls should work
      const result2 = await handler.handle(operation);
      expect(result2).toBe('success');
    });
  });

  describe('Error Reporting', () => {
    it('should trigger error callbacks', () => {
      const onError = vi.fn();
      const handler = new ErrorHandler({
        maxRetries: 0,
        onError
      });

      const error = new Error('Test error');
      handler.recordError(error, { operation: 'test' });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          context: { operation: 'test' }
        })
      );
    });

    it('should provide error statistics', () => {
      errorHandler.recordError(new Error('Error 1'), { type: 'network' });
      errorHandler.recordError(new Error('Error 2'), { type: 'network' });
      errorHandler.recordError(new Error('Error 3'), { type: 'storage' });

      const stats = errorHandler.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.network).toBe(2);
      expect(stats.byType.storage).toBe(1);
    });

    it('should clear error history', () => {
      errorHandler.recordError(new Error('Error 1'), {});
      errorHandler.recordError(new Error('Error 2'), {});

      expect(errorHandler.getErrorHistory()).toHaveLength(2);

      errorHandler.clearHistory();
      expect(errorHandler.getErrorHistory()).toHaveLength(0);
    });
  });

  describe('Graceful Degradation', () => {
    it('should provide fallback for failed operations', async () => {
      const operation = vi.fn(async () => {
        throw new Error('Service unavailable');
      });

      const fallback = vi.fn(async () => {
        return 'fallback-value';
      });

      const result = await errorHandler.handleWithFallback(operation, fallback);
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should return result without fallback if operation succeeds', async () => {
      const operation = vi.fn(async () => {
        return 'primary-value';
      });

      const fallback = vi.fn(async () => {
        return 'fallback-value';
      });

      const result = await errorHandler.handleWithFallback(operation, fallback);
      expect(result).toBe('primary-value');
      expect(fallback).not.toHaveBeenCalled();
    });
  });
});
