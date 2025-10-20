// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProofRetryManager } from '../../src/proof/retry';

describe('Proof Retry Mechanism', () => {
  let retryManager: ProofRetryManager;
  let mockSubmit: any;

  beforeEach(() => {
    mockSubmit = vi.fn();
    retryManager = new ProofRetryManager({
      submitFn: mockSubmit,
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 5000,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    retryManager.stop();
    vi.clearAllMocks();
  });

  describe('Retry Queue Management', () => {
    it('should queue failed proofs for retry', () => {
      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);
      expect(retryManager.getQueueSize()).toBe(1);
    });

    it('should maintain queue order', () => {
      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x1', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x2', timestamp: Date.now() },
        { sessionId: 'session-3', jobId: BigInt(3), tokensClaimed: 150, proof: '0x3', timestamp: Date.now() }
      ];

      proofs.forEach(p => retryManager.addToRetryQueue(p));

      const queue = retryManager.getRetryQueue();
      expect(queue[0].proof.sessionId).toBe('session-1');
      expect(queue[1].proof.sessionId).toBe('session-2');
      expect(queue[2].proof.sessionId).toBe('session-3');
    });

    it('should track attempts per proof', () => {
      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);
      const item = retryManager.getRetryQueue()[0];
      expect(item.attempts).toBe(0);

      retryManager.incrementAttempts(proof.sessionId);
      expect(retryManager.getRetryQueue()[0].attempts).toBe(1);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff delays', () => {
      expect(retryManager.getRetryDelay(0)).toBe(100);
      expect(retryManager.getRetryDelay(1)).toBe(200);
      expect(retryManager.getRetryDelay(2)).toBe(400);
      expect(retryManager.getRetryDelay(3)).toBe(800);
    });

    it('should cap delay at maximum', () => {
      expect(retryManager.getRetryDelay(10)).toBeLessThanOrEqual(5000);
      expect(retryManager.getRetryDelay(20)).toBe(5000);
    });

    it('should apply jitter to delays', () => {
      retryManager.setJitter(0.1);

      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(retryManager.getRetryDelay(1));
      }

      // With jitter, we should get different values
      expect(delays.size).toBeGreaterThan(1);

      // All should be within jitter range
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(180); // 200 - 10%
        expect(delay).toBeLessThanOrEqual(220);     // 200 + 10%
      });
    });
  });

  describe('Retry Processing', () => {
    it('should retry failed proofs', async () => {
      mockSubmit.mockResolvedValue({ success: true, txHash: '0x123' });

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);
      await retryManager.processRetryQueue();

      expect(mockSubmit).toHaveBeenCalledWith(proof);
      expect(retryManager.getQueueSize()).toBe(0);
    });

    it('should retry up to max attempts', async () => {
      mockSubmit.mockRejectedValue(new Error('Failed'));

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);

      // Process multiple times
      for (let i = 0; i < 4; i++) {
        await retryManager.processRetryQueue();
      }

      expect(mockSubmit).toHaveBeenCalledTimes(3); // Max attempts
      expect(retryManager.getQueueSize()).toBe(0);   // Removed after max attempts
    });

    it('should emit events on retry', async () => {
      mockSubmit.mockRejectedValueOnce(new Error('Failed'))
               .mockResolvedValueOnce({ success: true });

      const retryHandler = vi.fn();
      const successHandler = vi.fn();

      retryManager.on('retry-attempt', retryHandler);
      retryManager.on('retry-success', successHandler);

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);

      // First attempt fails
      await retryManager.processRetryQueue();
      expect(retryHandler).toHaveBeenCalledWith({
        proof,
        attempt: 1,
        nextDelay: 200
      });

      // Second attempt succeeds
      await retryManager.processRetryQueue();
      expect(successHandler).toHaveBeenCalledWith({
        proof,
        attempts: 2,
        result: { success: true }
      });
    });

    it('should emit event when max attempts reached', async () => {
      mockSubmit.mockRejectedValue(new Error('Failed'));

      const exhaustedHandler = vi.fn();
      retryManager.on('retry-exhausted', exhaustedHandler);

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);

      // Process until exhausted
      for (let i = 0; i <= 3; i++) {
        await retryManager.processRetryQueue();
      }

      expect(exhaustedHandler).toHaveBeenCalledWith({
        proof,
        attempts: 3,
        lastError: 'Failed'
      });
    });
  });

  describe('Automatic Retry', () => {
    it('should automatically retry on interval', async () => {
      vi.useFakeTimers();
      mockSubmit.mockResolvedValue({ success: true });

      retryManager.startAutoRetry(1000);

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);

      // Advance time
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockSubmit).toHaveBeenCalledWith(proof);
      expect(retryManager.getQueueSize()).toBe(0);

      retryManager.stopAutoRetry();
      vi.useRealTimers();
    });

    it('should stop automatic retry', () => {
      vi.useFakeTimers();

      retryManager.startAutoRetry(1000);
      expect(retryManager.isAutoRetryEnabled()).toBe(true);

      retryManager.stopAutoRetry();
      expect(retryManager.isAutoRetryEnabled()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      retryManager.enableCircuitBreaker({
        threshold: 5,
        resetTimeout: 10000
      });

      mockSubmit.mockRejectedValue(new Error('Failed'));

      // Add proofs that will fail
      for (let i = 0; i < 6; i++) {
        const proof = {
          sessionId: `session-${i}`,
          jobId: BigInt(i),
          tokensClaimed: 100,
          proof: '0xabc',
          timestamp: Date.now()
        };
        retryManager.addToRetryQueue(proof);
      }

      // Process first 5 (threshold)
      for (let i = 0; i < 5; i++) {
        await retryManager.processOneRetry();
      }

      expect(retryManager.isCircuitOpen()).toBe(true);

      // Sixth attempt should not process
      const processed = await retryManager.processOneRetry();
      expect(processed).toBe(false);
      expect(mockSubmit).toHaveBeenCalledTimes(5);
    });

    it('should reset circuit after timeout', async () => {
      vi.useFakeTimers();

      retryManager.enableCircuitBreaker({
        threshold: 1,
        resetTimeout: 5000
      });

      mockSubmit.mockRejectedValue(new Error('Failed'));

      const proof = {
        sessionId: 'session-1',
        jobId: BigInt(123),
        tokensClaimed: 100,
        proof: '0xabc',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(proof);
      await retryManager.processOneRetry();

      expect(retryManager.isCircuitOpen()).toBe(true);

      // Advance time past reset timeout
      await vi.advanceTimersByTimeAsync(5100);

      expect(retryManager.isCircuitOpen()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('Priority Retry', () => {
    it('should support priority queuing', () => {
      const highPriority = {
        sessionId: 'high',
        jobId: BigInt(1),
        tokensClaimed: 1000,
        proof: '0x1',
        timestamp: Date.now()
      };

      const lowPriority = {
        sessionId: 'low',
        jobId: BigInt(2),
        tokensClaimed: 50,
        proof: '0x2',
        timestamp: Date.now()
      };

      retryManager.addToRetryQueue(lowPriority, 1);
      retryManager.addToRetryQueue(highPriority, 10);

      const queue = retryManager.getRetryQueue();
      expect(queue[0].proof.sessionId).toBe('high');
      expect(queue[1].proof.sessionId).toBe('low');
    });
  });

  describe('Statistics', () => {
    it('should track retry statistics', async () => {
      mockSubmit
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValue(new Error('Failed'));

      const proofs = [
        { sessionId: 'session-1', jobId: BigInt(1), tokensClaimed: 100, proof: '0x1', timestamp: Date.now() },
        { sessionId: 'session-2', jobId: BigInt(2), tokensClaimed: 200, proof: '0x2', timestamp: Date.now() }
      ];

      proofs.forEach(p => retryManager.addToRetryQueue(p));

      // First process: both items get processed
      // session-1 calls submitFn (1st call) → fails, re-queued
      // session-2 calls submitFn (2nd call) → succeeds
      await retryManager.processRetryQueue();

      // Stats after first process: 2 retries, 1 success, 1 fail
      // Queue: session-1 (with 1 attempt)

      // Second process: session-1 gets processed again
      // session-1 calls submitFn (3rd call overall) → fails, re-queued
      await retryManager.processRetryQueue();

      // Stats after second process: 3 retries, 1 success, 2 fails
      // Queue: session-1 (with 2 attempts)

      // Third process: session-1 gets processed one more time
      // session-1 calls submitFn (4th call overall) → fails, re-queued or exhausted
      await retryManager.processRetryQueue();

      const stats = retryManager.getStatistics();
      expect(stats.totalRetries).toBe(4);
      expect(stats.successfulRetries).toBe(1);
      expect(stats.failedRetries).toBe(3);
      expect(stats.currentQueueSize).toBe(0); // session-1 exhausted after 3 attempts
      expect(stats.successRate).toBe(0.25);
    });
  });
});