// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Host WebSocket Client (Sub-phase 4.2)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { HostWsClient } from './hostWsClient';

// Mock WebSocket
class MockWebSocket {
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public readyState: number = 0; // CONNECTING

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 10);
  }

  send(data: string) {
    // Mock send
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  // Simulate receiving a message
  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Simulate connection error
  simulateError(error: any) {
    this.onerror?.(error);
  }

  // Simulate disconnection
  simulateDisconnect() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }
}

// Replace global WebSocket with mock and add constants
(global as any).WebSocket = MockWebSocket;
(global as any).WebSocket.CONNECTING = 0;
(global as any).WebSocket.OPEN = 1;
(global as any).WebSocket.CLOSING = 2;
(global as any).WebSocket.CLOSED = 3;

describe('HostWsClient', () => {
  let client: HostWsClient;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    client?.disconnect();
  });

  describe('Connection', () => {
    test('should connect to WebSocket server', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');

      await client.connect();

      // Connection should be established
      expect(client.isConnected()).toBe(true);
    });

    test('should include API key in connection URL when provided', async () => {
      const apiKey = 'test-api-key';
      client = new HostWsClient('ws://localhost:3001/ws/logs', apiKey);

      await client.connect();

      // URL should include API key as query parameter
      const wsUrl = (client as any).ws?.url;
      expect(wsUrl).toContain('apiKey=test-api-key');
    });

    test('should handle disconnection gracefully', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');
      await client.connect();

      expect(client.isConnected()).toBe(true);

      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('Message Handling', () => {
    test('should receive log messages via onLog callback', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');

      const receivedLogs: any[] = [];
      client.onLog((log) => {
        receivedLogs.push(log);
      });

      await client.connect();

      // Simulate receiving a log message
      const mockLog = {
        type: 'log',
        timestamp: '2025-01-07T12:00:00.000Z',
        level: 'stdout',
        message: 'Test log message'
      };

      mockWs = (client as any).ws as MockWebSocket;
      mockWs.simulateMessage(mockLog);

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedLogs.length).toBe(1);
      expect(receivedLogs[0]).toEqual(mockLog);
    });

    test('should receive historical logs on connection', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');

      const receivedHistory: string[][] = [];
      client.onHistory((logs) => {
        receivedHistory.push(logs);
      });

      await client.connect();

      // Simulate receiving historical logs
      const mockHistory = {
        type: 'history',
        lines: [
          '[stdout] Historical log 1',
          '[stdout] Historical log 2',
          '[stderr] Historical log 3'
        ]
      };

      mockWs = (client as any).ws as MockWebSocket;
      mockWs.simulateMessage(mockHistory);

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedHistory.length).toBe(1);
      expect(receivedHistory[0]).toEqual(mockHistory.lines);
    });

    test('should handle multiple log messages', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');

      const receivedLogs: any[] = [];
      client.onLog((log) => {
        receivedLogs.push(log);
      });

      await client.connect();

      mockWs = (client as any).ws as MockWebSocket;

      // Simulate multiple log messages
      for (let i = 0; i < 5; i++) {
        mockWs.simulateMessage({
          type: 'log',
          timestamp: new Date().toISOString(),
          level: i % 2 === 0 ? 'stdout' : 'stderr',
          message: `Log message ${i}`
        });
      }

      // Wait for message processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedLogs.length).toBe(5);
    });
  });

  describe('Reconnection', () => {
    test('should reconnect on connection loss', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');
      await client.connect();

      expect(client.isConnected()).toBe(true);

      // Simulate connection loss
      mockWs = (client as any).ws as MockWebSocket;
      mockWs.simulateDisconnect();

      // Wait for reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should reconnect automatically
      expect(client.isConnected()).toBe(true);
    });

    test('should stop reconnection after max retries', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');
      await client.connect();

      // Force multiple disconnects to exceed retry limit
      for (let i = 0; i < 5; i++) {
        mockWs = (client as any).ws as MockWebSocket;
        mockWs.simulateDisconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // After max retries, should give up
      await new Promise(resolve => setTimeout(resolve, 500));

      // Connection state should reflect failure
      expect((client as any).retries).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Cleanup', () => {
    test('should clean up on disconnect', async () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');
      await client.connect();

      const wsInstance = (client as any).ws;
      expect(wsInstance).not.toBeNull();

      client.disconnect();

      expect((client as any).ws).toBeNull();
      expect(client.isConnected()).toBe(false);
    });

    test('should not error when disconnecting without connection', () => {
      client = new HostWsClient('ws://localhost:3001/ws/logs');

      // Should not throw error
      expect(() => client.disconnect()).not.toThrow();
    });
  });
});
