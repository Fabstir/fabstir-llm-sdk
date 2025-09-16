import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReconnectManager } from '../../src/websocket/reconnect';

describe('WebSocket Reconnection', () => {
  let manager: ReconnectManager;
  let mockConnect: any;

  beforeEach(() => {
    mockConnect = vi.fn();
    manager = new ReconnectManager({
      connect: mockConnect,
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 5000,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    manager.stop();
    vi.clearAllMocks();
  });

  describe('Reconnection Attempts', () => {
    it('should attempt reconnection on disconnect', async () => {
      mockConnect.mockResolvedValue(true);

      await manager.start();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should respect max attempts', async () => {
      mockConnect.mockRejectedValue(new Error('Connection failed'));

      await manager.start();

      // Wait for all retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(mockConnect).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(manager.getAttempts()).toBe(3);
    });

    it('should stop after success', async () => {
      mockConnect
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(manager.getIsReconnecting()).toBe(false);
    });

    it('should reset attempts on success', async () => {
      mockConnect.mockResolvedValue(true);

      await manager.start();
      expect(manager.getAttempts()).toBe(1);

      manager.resetAttempts();
      expect(manager.getAttempts()).toBe(0);
    });
  });

  describe('Backoff Strategy', () => {
    it('should apply exponential backoff', () => {
      const delays = [];
      for (let i = 0; i < 4; i++) {
        delays.push(manager.getNextDelay(i));
      }

      expect(delays[0]).toBe(100);  // Initial
      expect(delays[1]).toBe(200);  // 100 * 2
      expect(delays[2]).toBe(400);  // 200 * 2
      expect(delays[3]).toBe(800);  // 400 * 2
    });

    it('should cap delay at max value', () => {
      const delay = manager.getNextDelay(10); // Very high attempt
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it('should apply jitter to delays', () => {
      manager.setJitter(0.1); // 10% jitter

      const delays = new Set();
      for (let i = 0; i < 10; i++) {
        delays.add(manager.getNextDelay(1));
      }

      // With jitter, we should get different values
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('Reconnection State', () => {
    it('should track reconnection state', async () => {
      expect(manager.getIsReconnecting()).toBe(false);

      mockConnect.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(true), 200);
      }));

      const startPromise = manager.start();
      expect(manager.getIsReconnecting()).toBe(true);

      await startPromise;
      expect(manager.getIsReconnecting()).toBe(false);
    });

    it('should provide reconnection info', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Failed'));

      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 150));

      const info = manager.getReconnectionInfo();
      expect(info).toMatchObject({
        attempts: expect.any(Number),
        isReconnecting: expect.any(Boolean),
        nextAttemptIn: expect.any(Number),
        lastError: expect.any(Error)
      });
    });

    it('should emit reconnection events', async () => {
      const startHandler = vi.fn();
      const successHandler = vi.fn();
      const failHandler = vi.fn();

      manager.on('reconnect-start', startHandler);
      manager.on('reconnect-success', successHandler);
      manager.on('reconnect-failed', failHandler);

      mockConnect.mockResolvedValue(true);

      await manager.start();

      expect(startHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(failHandler).not.toHaveBeenCalled();
    });
  });

  describe('Manual Control', () => {
    it('should stop reconnection attempts', async () => {
      mockConnect.mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Failed')), 100);
      }));

      const startPromise = manager.start();
      await new Promise(resolve => setTimeout(resolve, 50));

      manager.stop();
      await startPromise.catch(() => {}); // Ignore error

      expect(manager.getIsReconnecting()).toBe(false);
    });

    it('should force immediate reconnection', async () => {
      mockConnect.mockResolvedValue(true);

      await manager.forceReconnect();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    it('should disable automatic reconnection', () => {
      manager.disable();
      expect(manager.isEnabled()).toBe(false);

      manager.enable();
      expect(manager.isEnabled()).toBe(true);
    });
  });

  describe('Connection Health Checks', () => {
    it('should schedule health checks', () => {
      vi.useFakeTimers();

      const checkHandler = vi.fn().mockResolvedValue(true);
      manager.setHealthCheck(checkHandler, 1000);

      manager.scheduleHealthCheck();

      vi.advanceTimersByTime(1000);
      expect(checkHandler).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should trigger reconnect on health check failure', async () => {
      const checkHandler = vi.fn().mockResolvedValue(false);
      manager.setHealthCheck(checkHandler, 100);

      mockConnect.mockResolvedValue(true);

      await manager.checkHealth();
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failures', async () => {
      manager.enableCircuitBreaker({
        threshold: 3,
        resetTimeout: 1000
      });

      mockConnect.mockRejectedValue(new Error('Failed'));

      await manager.start();
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(manager.isCircuitOpen()).toBe(true);
    });

    it('should prevent connections when circuit is open', async () => {
      manager.enableCircuitBreaker({
        threshold: 1,
        resetTimeout: 1000
      });

      mockConnect.mockRejectedValue(new Error('Failed'));
      await manager.start();

      mockConnect.mockClear();
      await manager.start(); // Should not attempt

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should reset circuit after timeout', async () => {
      vi.useFakeTimers();

      try {
        manager.enableCircuitBreaker({
          threshold: 1,
          resetTimeout: 1000
        });

        mockConnect.mockRejectedValue(new Error('Failed'));

        // Don't await - let it run in background
        const startPromise = manager.start().catch(() => {});

        // Advance timers to let the first attempt fail
        await vi.advanceTimersByTimeAsync(100);

        expect(manager.isCircuitOpen()).toBe(true);

        // Advance to reset the circuit
        await vi.advanceTimersByTimeAsync(1100);
        expect(manager.isCircuitOpen()).toBe(false);

        // Clean up the promise
        manager.stop();
        await startPromise;
      } finally {
        vi.useRealTimers();
      }
    });
  });
});