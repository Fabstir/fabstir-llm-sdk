/**
 * Tests for WebSocket Log Server (Sub-phase 2.1)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';

// Import the LogWebSocketServer class (will be implemented)
import { LogWebSocketServer } from '../../src/server/ws';

describe('WebSocket Log Server', () => {
  let httpServer: Server;
  let wsServer: LogWebSocketServer | null = null;
  const testPort = 3100; // Use non-standard port to avoid conflicts

  beforeEach(() => {
    // Create HTTP server for WebSocket to attach to
    httpServer = createServer();
    httpServer.listen(testPort);
  });

  afterEach(async () => {
    // Cleanup
    if (wsServer) {
      wsServer.stop();
      wsServer = null;
    }

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  test('should accept WebSocket connections', async () => {
    wsServer = new LogWebSocketServer(httpServer);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
        resolve();
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  });

  test('should authenticate connections via API key', async () => {
    const apiKey = 'test-secret-key';
    wsServer = new LogWebSocketServer(httpServer, apiKey);
    wsServer.start();

    // Connect with valid API key
    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs?apiKey=${apiKey}`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
        resolve();
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  });

  test('should reject invalid authentication', async () => {
    const apiKey = 'test-secret-key';
    wsServer = new LogWebSocketServer(httpServer, apiKey);
    wsServer.start();

    // Connect without API key
    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      client.on('error', (error: any) => {
        // Should receive error with "Unexpected server response: 401"
        expect(error.message).toContain('Unexpected server response: 401');
        resolve();
      });

      client.on('open', () => {
        // Should not open
        reject(new Error('Connection should have been rejected'));
      });
    });
  });

  test('should handle client disconnection', async () => {
    wsServer = new LogWebSocketServer(httpServer);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve) => {
      client.on('open', () => {
        // Close the connection
        client.close();
      });

      client.on('close', () => {
        // Connection closed successfully
        expect(client.readyState).toBe(WebSocket.CLOSED);
        resolve();
      });
    });
  });

  test('should broadcast messages to all connected clients', async () => {
    wsServer = new LogWebSocketServer(httpServer);
    wsServer.start();

    const client1 = new WebSocket(`ws://localhost:${testPort}/ws/logs`);
    const client2 = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve) => {
      let client1Received = false;
      let client2Received = false;

      const checkComplete = () => {
        if (client1Received && client2Received) {
          client1.close();
          client2.close();
          resolve();
        }
      };

      client1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.text).toBe('test broadcast');
        client1Received = true;
        checkComplete();
      });

      client2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.text).toBe('test broadcast');
        client2Received = true;
        checkComplete();
      });

      // Wait for both clients to connect
      Promise.all([
        new Promise(r => client1.on('open', r)),
        new Promise(r => client2.on('open', r))
      ]).then(() => {
        // Broadcast a message
        wsServer!.broadcast({ text: 'test broadcast' });
      });
    });
  });
});
