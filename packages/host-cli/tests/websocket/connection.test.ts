import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from '../../src/websocket/client';

// Mock ws module
vi.mock('ws', () => {
  const MockWebSocket = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    readyState: 1, // OPEN
    once: vi.fn(),
    removeAllListeners: vi.fn()
  }));

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  return {
    WebSocket: MockWebSocket
  };
});

describe('WebSocket Connection', () => {
  let client: WebSocketClient;
  let mockWs: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { WebSocket } = await import('ws');

    client = new WebSocketClient();

    // Setup mock WebSocket instance
    mockWs = {
      on: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      ping: vi.fn(),
      terminate: vi.fn(),
      once: vi.fn(),
      readyState: (WebSocket as any).OPEN,
      removeAllListeners: vi.fn()
    };

    mockWs.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'open') {
        setTimeout(() => handler(), 10);
      }
      return mockWs;
    });

    (WebSocket as any).mockImplementation(() => mockWs);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('Connection Management', () => {
    it('should connect to WebSocket URL', async () => {
      const { WebSocket } = await import('ws');
      const url = 'ws://localhost:8080';
      await client.connect(url);

      expect(WebSocket).toHaveBeenCalledWith(url, {});
      expect(client.isConnected()).toBe(true);
    });

    it('should reject invalid URLs', async () => {
      await expect(client.connect('invalid-url')).rejects.toThrow('Invalid WebSocket URL');
    });

    it('should handle connection timeout', async () => {
      mockWs.on.mockImplementation(() => mockWs); // Don't trigger open

      const promise = client.connect('ws://localhost:8080', { timeout: 100 });
      await expect(promise).rejects.toThrow('Connection timeout');
    });

    it('should disconnect cleanly', async () => {
      await client.connect('ws://localhost:8080');
      await client.disconnect();

      expect(mockWs.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle forced disconnect', async () => {
      await client.connect('ws://localhost:8080');
      await client.disconnect(true);

      expect(mockWs.terminate).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('should prevent multiple connections', async () => {
      await client.connect('ws://localhost:8080');
      await expect(client.connect('ws://localhost:8081')).rejects.toThrow('Already connected');
    });
  });

  describe('Connection Events', () => {
    it('should emit connected event', async () => {
      const handler = vi.fn();
      client.on('connected', handler);

      await client.connect('ws://localhost:8080');
      expect(handler).toHaveBeenCalled();
    });

    it('should emit disconnected event', async () => {
      const handler = vi.fn();
      client.on('disconnected', handler);

      await client.connect('ws://localhost:8080');

      // Simulate server disconnect
      const closeHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'close')?.[1];
      closeHandler?.();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit error event', async () => {
      const handler = vi.fn();
      client.on('error', handler);

      await client.connect('ws://localhost:8080');

      // Simulate error
      const errorHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'error')?.[1];
      const error = new Error('Connection error');
      errorHandler?.(error);

      expect(handler).toHaveBeenCalledWith(error);
    });
  });

  describe('Connection Options', () => {
    it('should apply custom headers', async () => {
      const { WebSocket } = await import('ws');
      const headers = { 'X-Auth-Token': 'secret' };
      await client.connect('ws://localhost:8080', { headers });

      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8080', {
        headers
      });
    });

    it('should apply connection timeout', async () => {
      const timeout = 5000;
      mockWs.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'open') {
          setTimeout(() => handler(), 10);
        }
        return mockWs;
      });

      await client.connect('ws://localhost:8080', { timeout });
      expect(client.isConnected()).toBe(true);
    });

    it('should apply max reconnect attempts', async () => {
      await client.connect('ws://localhost:8080', {
        maxReconnectAttempts: 3
      });

      const config = client.getConnectionConfig();
      expect(config?.maxReconnectAttempts).toBe(3);
    });
  });

  describe('Ping/Pong Keepalive', () => {
    it('should send periodic pings', async () => {
      vi.useFakeTimers();

      await client.connect('ws://localhost:8080', {
        pingInterval: 1000
      });

      vi.advanceTimersByTime(1100);
      expect(mockWs.ping).toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(mockWs.ping).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should handle pong responses', async () => {
      await client.connect('ws://localhost:8080');

      const pongHandler = mockWs.on.mock.calls.find((call: any) => call[0] === 'pong')?.[1];
      pongHandler?.();

      expect(client.getLastPongTime()).toBeDefined();
    });

    it('should detect connection death', async () => {
      vi.useFakeTimers();
      const handler = vi.fn();
      client.on('connection_lost', handler);

      await client.connect('ws://localhost:8080', {
        pingInterval: 1000,
        pongTimeout: 3000
      });

      // No pong received
      vi.advanceTimersByTime(4000);
      expect(handler).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Connection State', () => {
    it('should track connection state', async () => {
      expect(client.getState()).toBe('disconnected');

      const connectPromise = client.connect('ws://localhost:8080');
      expect(client.getState()).toBe('connecting');

      await connectPromise;
      expect(client.getState()).toBe('connected');

      await client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });

    it('should provide connection info', async () => {
      await client.connect('ws://localhost:8080');

      const info = client.getConnectionInfo();
      expect(info).toMatchObject({
        url: 'ws://localhost:8080',
        state: 'connected',
        connectedAt: expect.any(Date)
      });
    });

    it('should track connection uptime', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await client.connect('ws://localhost:8080');

      vi.advanceTimersByTime(5000);
      const uptime = client.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(5000);

      vi.useRealTimers();
    });
  });
});