import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from '../../src/resilience/circuit';
import EventEmitter from 'events';

describe('Circuit Breaker Pattern', () => {
  let circuitBreaker: CircuitBreaker;
  let mockOperation: any;
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter();

    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 5000,
      halfOpenMaxCalls: 2,
      monitoringWindow: 60000,
      eventEmitter
    });

    mockOperation = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('circuit states', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.isOpen()).toBe(false);
    });

    it('should open after failure threshold', async () => {
      mockOperation.mockRejectedValue(new Error('Failed'));

      // Fail 3 times to trigger open state
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should reject calls when open', async () => {
      // Force open state
      circuitBreaker.trip();

      await expect(
        circuitBreaker.execute(mockOperation)
      ).rejects.toThrow('Circuit breaker is OPEN');

      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      vi.useFakeTimers();

      // Open the circuit
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Advance time past reset timeout
      vi.advanceTimersByTime(5000);

      expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    });

    it('should close from half-open on success', async () => {
      vi.useFakeTimers();

      // Open the circuit
      circuitBreaker.trip();

      // Move to half-open
      vi.advanceTimersByTime(5000);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      // Need 2 successful calls to close (halfOpenMaxCalls = 2)
      mockOperation.mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN'); // Still half-open after 1

      await circuitBreaker.execute(mockOperation);
      expect(circuitBreaker.getState()).toBe('CLOSED'); // Closed after 2 successes
    });

    it('should reopen from half-open on failure', async () => {
      vi.useFakeTimers();

      // Open the circuit
      circuitBreaker.trip();

      // Move to half-open
      vi.advanceTimersByTime(5000);
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      // Failed call should reopen the circuit
      mockOperation.mockRejectedValue(new Error('Failed'));

      try {
        await circuitBreaker.execute(mockOperation);
      } catch {
        // Expected to fail
      }

      expect(circuitBreaker.getState()).toBe('OPEN');
    });
  });

  describe('failure counting', () => {
    it('should count consecutive failures', async () => {
      mockOperation.mockRejectedValue(new Error('Failed'));

      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Expected
        }
      }

      const stats = circuitBreaker.getStatistics();
      expect(stats.consecutiveFailures).toBe(2);
    });

    it('should reset failure count on success', async () => {
      mockOperation
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      // Two failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Expected
        }
      }

      let stats = circuitBreaker.getStatistics();
      expect(stats.consecutiveFailures).toBe(2);

      // Success should reset
      await circuitBreaker.execute(mockOperation);

      stats = circuitBreaker.getStatistics();
      expect(stats.consecutiveFailures).toBe(0);
    });

    it('should track failure rate', async () => {
      mockOperation
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Failed'));

      for (let i = 0; i < 4; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Some will fail
        }
      }

      const stats = circuitBreaker.getStatistics();
      expect(stats.failureRate).toBe(50); // 2 failures out of 4 calls
    });
  });

  describe('half-open state', () => {
    it('should limit calls in half-open state', async () => {
      vi.useFakeTimers();

      // Open the circuit
      circuitBreaker.trip();

      // Move to half-open
      vi.advanceTimersByTime(5000);

      mockOperation.mockResolvedValue('success');

      // Should allow limited calls
      await circuitBreaker.execute(mockOperation);
      // Still in half-open after first call
      expect(circuitBreaker.getState()).toBe('HALF_OPEN');

      await circuitBreaker.execute(mockOperation);
      // Closed after 2 successful calls (100% success > 50% threshold)
      expect(circuitBreaker.getState()).toBe('CLOSED');

      // Now in CLOSED state, call succeeds
      await circuitBreaker.execute(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should track half-open success rate', async () => {
      vi.useFakeTimers();

      // Open the circuit
      circuitBreaker.trip();

      // Move to half-open
      vi.advanceTimersByTime(5000);

      mockOperation
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Failed'));

      await circuitBreaker.execute(mockOperation);

      try {
        await circuitBreaker.execute(mockOperation);
      } catch {
        // Expected
      }

      const stats = circuitBreaker.getHalfOpenStats();
      expect(stats.successRate).toBe(50);
    });
  });

  describe('events', () => {
    it('should emit state change events', async () => {
      const stateChangeListener = vi.fn();
      eventEmitter.on('circuit:state-change', stateChangeListener);

      // Trigger state change to OPEN
      circuitBreaker.trip();

      expect(stateChangeListener).toHaveBeenCalledWith({
        from: 'CLOSED',
        to: 'OPEN'
      });
    });

    it('should emit failure events', async () => {
      const failureListener = vi.fn();
      eventEmitter.on('circuit:failure', failureListener);

      mockOperation.mockRejectedValue(new Error('Test error'));

      try {
        await circuitBreaker.execute(mockOperation);
      } catch {
        // Expected
      }

      expect(failureListener).toHaveBeenCalledWith({
        error: expect.any(Error),
        consecutiveFailures: 1
      });
    });

    it('should emit trip events', async () => {
      const tripListener = vi.fn();
      eventEmitter.on('circuit:trip', tripListener);

      mockOperation.mockRejectedValue(new Error('Failed'));

      // Fail enough times to trip
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Expected
        }
      }

      expect(tripListener).toHaveBeenCalled();
    });
  });

  describe('fallback mechanism', () => {
    it('should use fallback when open', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback result');
      circuitBreaker.setFallback(fallback);

      // Open the circuit
      circuitBreaker.trip();

      const result = await circuitBreaker.execute(mockOperation);

      expect(result).toBe('fallback result');
      expect(fallback).toHaveBeenCalled();
      expect(mockOperation).not.toHaveBeenCalled();
    });

    it('should pass context to fallback', async () => {
      const fallback = vi.fn().mockResolvedValue('fallback');
      circuitBreaker.setFallback(fallback);

      circuitBreaker.trip();

      const context = { userId: '123' };
      await circuitBreaker.execute(mockOperation, context);

      expect(fallback).toHaveBeenCalledWith(context);
    });
  });

  describe('monitoring', () => {
    it('should track call metrics', async () => {
      mockOperation
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('success');

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch {
          // Some will fail
        }
      }

      const metrics = circuitBreaker.getMetrics();

      expect(metrics.totalCalls).toBe(3);
      expect(metrics.successfulCalls).toBe(2);
      expect(metrics.failedCalls).toBe(1);
      expect(metrics.rejectedCalls).toBe(0);
    });

    it('should track response times', async () => {
      vi.useFakeTimers();

      mockOperation.mockImplementation(async () => {
        await vi.advanceTimersByTimeAsync(100);
        return 'success';
      });

      await circuitBreaker.execute(mockOperation);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(100);

      vi.useRealTimers();
    });

    it('should maintain rolling window stats', async () => {
      const startTime = Date.now();
      vi.useFakeTimers({ now: startTime });

      // Add calls over time
      mockOperation.mockResolvedValue('success');

      await circuitBreaker.execute(mockOperation); // T=0

      vi.setSystemTime(startTime + 20000);
      await circuitBreaker.execute(mockOperation); // T=20s

      vi.setSystemTime(startTime + 40000);
      await circuitBreaker.execute(mockOperation); // T=40s

      const window = circuitBreaker.getRollingWindow();
      expect(window.callsInWindow).toBe(3);

      // Advance past window (monitoring window is 60000ms)
      // All calls should be older than 60s
      vi.setSystemTime(startTime + 100001);

      const newWindow = circuitBreaker.getRollingWindow();
      expect(newWindow.callsInWindow).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('manual control', () => {
    it('should allow manual trip', () => {
      expect(circuitBreaker.getState()).toBe('CLOSED');

      circuitBreaker.trip();

      expect(circuitBreaker.getState()).toBe('OPEN');
    });

    it('should allow manual reset', () => {
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).toBe('OPEN');

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    it('should allow force close', () => {
      circuitBreaker.trip();

      circuitBreaker.forceClose();

      expect(circuitBreaker.getState()).toBe('CLOSED');
      expect(circuitBreaker.getStatistics().consecutiveFailures).toBe(0);
    });
  });
});