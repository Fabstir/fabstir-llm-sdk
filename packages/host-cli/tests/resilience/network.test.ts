// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NetworkRecovery } from '../../src/resilience/recovery';
import { FallbackManager } from '../../src/resilience/fallback';
import EventEmitter from 'events';

vi.mock('ethers', () => {
  const mockProvider = {
    getBlockNumber: vi.fn().mockResolvedValue(12345)
  };
  return {
    JsonRpcProvider: vi.fn(() => mockProvider),
    ethers: {
      JsonRpcProvider: vi.fn(() => mockProvider)
    }
  };
});

describe('Network Error Recovery', () => {
  let recovery: NetworkRecovery;
  let fallbackManager: FallbackManager;
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = {
      getNetwork: vi.fn(),
      getBlockNumber: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      _isProvider: true
    };

    fallbackManager = new FallbackManager([
      'https://primary.rpc.com',
      'https://secondary.rpc.com',
      'https://tertiary.rpc.com'
    ]);

    recovery = new NetworkRecovery({
      fallbackManager,
      maxRetries: 3,
      retryDelay: 100,
      timeoutMs: 5000
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('network failure detection', () => {
    it('should detect connection errors', async () => {
      const error = new Error('ECONNREFUSED');
      const isNetworkError = recovery.isNetworkError(error);

      expect(isNetworkError).toBe(true);
    });

    it('should detect timeout errors', async () => {
      const error = new Error('Request timeout');
      const isTimeout = recovery.isTimeoutError(error);

      expect(isTimeout).toBe(true);
    });

    it('should detect RPC errors', async () => {
      const error = {
        code: -32603,
        message: 'Internal JSON-RPC error'
      };

      const isRpcError = recovery.isRpcError(error);

      expect(isRpcError).toBe(true);
    });
  });

  describe('automatic recovery', () => {
    it('should retry on network failure', async () => {
      let attemptCount = 0;
      const operation = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      const result = await recovery.executeWithRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const startTime = Date.now();

      const operation = vi.fn().mockImplementation(() => {
        delays.push(Date.now() - startTime);
        if (delays.length < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      await recovery.executeWithRetry(operation, {
        baseDelay: 100,
        maxDelay: 2000,
        factor: 2
      });

      // Verify exponential delays
      expect(delays.length).toBe(3);
      expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[2] - delays[1]).toBeGreaterThanOrEqual(200);
    });

    it('should respect max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        recovery.executeWithRetry(operation, { maxRetries: 2 })
      ).rejects.toThrow('Maximum retries exceeded');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('RPC endpoint failover', () => {
    it('should switch to fallback RPC on failure', async () => {
      const currentEndpoint = await fallbackManager.getCurrentEndpoint();
      expect(currentEndpoint).toBe('https://primary.rpc.com');

      await fallbackManager.markFailed('https://primary.rpc.com');

      const newEndpoint = await fallbackManager.getCurrentEndpoint();
      expect(newEndpoint).toBe('https://secondary.rpc.com');
    });

    it('should track endpoint health', async () => {
      const health = fallbackManager.getEndpointHealth('https://primary.rpc.com');
      expect(health.failures).toBe(0);
      expect(health.isHealthy).toBe(true);

      await fallbackManager.markFailed('https://primary.rpc.com');

      const updatedHealth = fallbackManager.getEndpointHealth('https://primary.rpc.com');
      expect(updatedHealth.failures).toBe(1);
    });

    it('should restore failed endpoints after cooldown', async () => {
      vi.useFakeTimers();

      await fallbackManager.markFailed('https://primary.rpc.com');
      await fallbackManager.markFailed('https://primary.rpc.com');
      await fallbackManager.markFailed('https://primary.rpc.com');

      let health = fallbackManager.getEndpointHealth('https://primary.rpc.com');
      expect(health.isHealthy).toBe(false);

      // Advance time past cooldown period
      await vi.advanceTimersByTimeAsync(60000);

      await fallbackManager.checkHealth('https://primary.rpc.com');
      health = fallbackManager.getEndpointHealth('https://primary.rpc.com');
      expect(health.isHealthy).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('connection pooling', () => {
    it('should maintain connection pool', async () => {
      const pool = recovery.getConnectionPool();

      expect(pool.size).toBe(0);

      await recovery.addConnection('https://primary.rpc.com', mockProvider);

      expect(pool.size).toBe(1);
      expect(pool.get('https://primary.rpc.com')).toBe(mockProvider);
    });

    it('should reuse healthy connections', async () => {
      await recovery.addConnection('https://primary.rpc.com', mockProvider);

      const connection = await recovery.getHealthyConnection();

      expect(connection).toBe(mockProvider);
      expect(mockProvider.getBlockNumber).toHaveBeenCalled();
    });

    it('should remove unhealthy connections', async () => {
      mockProvider.getBlockNumber.mockRejectedValue(new Error('Connection failed'));

      await recovery.addConnection('https://primary.rpc.com', mockProvider);

      const connection = await recovery.getHealthyConnection();

      expect(connection).toBeNull();
      expect(recovery.getConnectionPool().size).toBe(0);
    });
  });

  describe('event handling', () => {
    it('should emit recovery events', async () => {
      vi.useFakeTimers();

      const eventEmitter = new EventEmitter();
      recovery.setEventEmitter(eventEmitter);

      const recoveryListener = vi.fn();
      eventEmitter.on('recovery:started', recoveryListener);

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const promise = recovery.executeWithRetry(operation, { baseDelay: 100 });

      // Advance time for retry delay
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      expect(recoveryListener).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should emit failure events', async () => {
      vi.useFakeTimers();

      const eventEmitter = new EventEmitter();
      recovery.setEventEmitter(eventEmitter);

      const failureListener = vi.fn();
      eventEmitter.on('recovery:failed', failureListener);

      const operation = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const promise = recovery.executeWithRetry(operation, { maxRetries: 1, baseDelay: 100 });

      // Advance time for retries
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);

      await expect(promise).rejects.toThrow();

      expect(failureListener).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('monitoring and metrics', () => {
    it('should track recovery statistics', async () => {
      vi.useFakeTimers();

      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const promise = recovery.executeWithRetry(operation, { baseDelay: 100 });

      // Advance time for retry
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      const stats = recovery.getStatistics();

      expect(stats.totalAttempts).toBe(2);
      expect(stats.successfulRecoveries).toBe(1);
      expect(stats.failures).toBe(0);

      vi.useRealTimers();
    });

    it('should calculate success rate', async () => {
      const stats = recovery.getStatistics();

      expect(stats.successRate).toBe(100);

      // Simulate some failures
      recovery.recordFailure();
      recovery.recordFailure();
      recovery.recordSuccess();

      const updatedStats = recovery.getStatistics();
      expect(updatedStats.successRate).toBeLessThan(100);
    });
  });
});