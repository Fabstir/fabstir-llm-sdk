import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withRetry,
  RetryConfig,
  RetryError,
  isRetriableError,
  getRetryDelay,
  createRetryPolicy
} from '../../src/sdk/retry';

describe('SDK Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Retry Functionality', () => {
    it('should succeed on first attempt if no error', async () => {
      const successFn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(successFn);

      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 10
      };

      await expect(withRetry(fn, config)).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should include original error in RetryError', async () => {
      const originalError = new Error('Original error');
      const fn = vi.fn().mockRejectedValue(originalError);

      try {
        await withRetry(fn, { maxAttempts: 2, initialDelay: 10 });
      } catch (error: any) {
        expect(error).toBeInstanceOf(RetryError);
        expect(error.cause).toBe(originalError);
        expect(error.attempts).toBe(2);
      }
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff by default', () => {
      const delays = [
        getRetryDelay(1, { initialDelay: 100 }),
        getRetryDelay(2, { initialDelay: 100 }),
        getRetryDelay(3, { initialDelay: 100 }),
        getRetryDelay(4, { initialDelay: 100 })
      ];

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
      expect(delays[3]).toBe(800);
    });

    it('should respect maxDelay', () => {
      const config = { initialDelay: 100, maxDelay: 500 };

      const delays = [
        getRetryDelay(1, config),
        getRetryDelay(2, config),
        getRetryDelay(3, config),
        getRetryDelay(4, config)
      ];

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(400);
      expect(delays[3]).toBe(500); // Capped at maxDelay
    });

    it('should apply jitter when enabled', () => {
      const config = { initialDelay: 100, jitter: true };

      const delay = getRetryDelay(1, config);

      // With jitter, delay should be between 50% and 100% of base delay
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(100);
    });

    it('should use custom backoff multiplier', () => {
      const config = { initialDelay: 100, backoffMultiplier: 3 };

      const delays = [
        getRetryDelay(1, config),
        getRetryDelay(2, config),
        getRetryDelay(3, config)
      ];

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(300);
      expect(delays[2]).toBe(900);
    });
  });

  describe('Error Classification', () => {
    it('should identify retriable network errors', () => {
      const networkErrors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('ENOTFOUND'),
        new Error('Network timeout'),
        new Error('Request timeout')
      ];

      networkErrors.forEach(error => {
        expect(isRetriableError(error)).toBe(true);
      });
    });

    it('should identify non-retriable errors', () => {
      const nonRetriableErrors = [
        new Error('Invalid private key'),
        new Error('Unauthorized'),
        new Error('Forbidden'),
        new Error('Invalid configuration'),
        new Error('Missing required parameter')
      ];

      nonRetriableErrors.forEach(error => {
        expect(isRetriableError(error)).toBe(false);
      });
    });

    it('should respect custom error classifier', async () => {
      const customClassifier = (error: Error) => error.message.includes('retry-me');

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('retry-me please'))
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 2,
        initialDelay: 10,
        shouldRetry: customClassifier
      };

      const result = await withRetry(fn, config);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retriable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Invalid private key'));

      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 10
      };

      await expect(withRetry(fn, config)).rejects.toThrow('Invalid private key');
      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Retry Policies', () => {
    it('should create policy for RPC calls', () => {
      const policy = createRetryPolicy('rpc');

      expect(policy.maxAttempts).toBeGreaterThan(1);
      expect(policy.initialDelay).toBeDefined();
      expect(policy.maxDelay).toBeDefined();
    });

    it('should create policy for contract calls', () => {
      const policy = createRetryPolicy('contract');

      expect(policy.maxAttempts).toBeGreaterThan(1);
      expect(policy.initialDelay).toBeDefined();
    });

    it('should create policy for authentication', () => {
      const policy = createRetryPolicy('auth');

      expect(policy.maxAttempts).toBeLessThanOrEqual(3); // Auth shouldn't retry too much
    });

    it('should allow policy customization', () => {
      const basePolicy = createRetryPolicy('rpc');
      const customPolicy = {
        ...basePolicy,
        maxAttempts: 10,
        initialDelay: 200
      };

      expect(customPolicy.maxAttempts).toBe(10);
      expect(customPolicy.initialDelay).toBe(200);
    });
  });

  describe('Cancellation', () => {
    it('should support cancellation via AbortController', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const controller = new AbortController();
      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 100,
        signal: controller.signal
      };

      const promise = withRetry(fn, config);

      // Cancel after first retry starts
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow('aborted');
      // Should have tried at least once before cancellation
      expect(fn.mock.calls.length).toBeGreaterThan(0);
      expect(fn.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('should not retry after cancellation', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const controller = new AbortController();
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 100,
        signal: controller.signal
      };

      // Start the retry operation
      const promise = withRetry(fn, config);

      // Abort after first attempt
      setTimeout(() => controller.abort(), 50);

      await expect(promise).rejects.toThrow('aborted');

      // Should have attempted at least once but not all 5 times
      expect(fn).toHaveBeenCalled();
      expect(fn.mock.calls.length).toBeLessThan(5);
    });
  });

  describe('Retry Events and Callbacks', () => {
    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValueOnce('success');

      const config: RetryConfig = {
        maxAttempts: 3,
        initialDelay: 10,
        onRetry
      };

      await withRetry(fn, config);

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should track retry statistics', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce('success');

      const stats = { attempts: 0, errors: [] as Error[] };
      const config: RetryConfig = {
        maxAttempts: 5,
        initialDelay: 10,
        onRetry: (attempt, error) => {
          stats.attempts = attempt;
          stats.errors.push(error);
        }
      };

      await withRetry(fn, config);

      expect(stats.attempts).toBe(2);
      expect(stats.errors).toHaveLength(2);
    });
  });

  describe('Integration with SDK Operations', () => {
    it('should retry blockchain connection', async () => {
      const connectFn = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ connected: true });

      const policy = createRetryPolicy('rpc');
      // Use shorter delays for testing
      policy.initialDelay = 10;

      const result = await withRetry(
        () => connectFn(),
        policy
      );

      expect(result.connected).toBe(true);
    });

    it('should retry contract calls with gas issues', async () => {
      const contractCall = vi.fn()
        .mockRejectedValueOnce(new Error('replacement fee too low'))
        .mockResolvedValueOnce({ txHash: '0x123' });

      const policy = createRetryPolicy('contract');
      // Use shorter delays for testing
      policy.initialDelay = 10;

      const result = await withRetry(
        () => contractCall(),
        policy
      );

      expect(result.txHash).toBe('0x123');
    });
  });
});