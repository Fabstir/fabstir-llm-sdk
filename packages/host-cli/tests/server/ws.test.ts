/**
 * Tests for WebSocket Log Server (Sub-phases 2.1 & 2.2)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

describe('Log Tailing & Broadcasting (Sub-phase 2.2)', () => {
  let httpServer: Server;
  let wsServer: LogWebSocketServer | null = null;
  let testLogDir: string;
  let testStdoutLog: string;
  let testStderrLog: string;
  const testPort = 3101; // Different port to avoid conflicts

  beforeEach(() => {
    // Create HTTP server
    httpServer = createServer();
    httpServer.listen(testPort);

    // Create temporary log directory and files
    testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-log-test-'));
    testStdoutLog = path.join(testLogDir, 'test.out.log');
    testStderrLog = path.join(testLogDir, 'test.err.log');

    // Create initial log files with some content
    fs.writeFileSync(testStdoutLog, 'Initial stdout line 1\nInitial stdout line 2\n', 'utf8');
    fs.writeFileSync(testStderrLog, 'Initial stderr line 1\nInitial stderr line 2\n', 'utf8');
  });

  afterEach(async () => {
    // Cleanup WebSocket server
    if (wsServer) {
      wsServer.stop();
      wsServer = null;
    }

    // Cleanup HTTP server
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    // Cleanup log files and directory
    if (fs.existsSync(testStdoutLog)) {
      fs.unlinkSync(testStdoutLog);
    }
    if (fs.existsSync(testStderrLog)) {
      fs.unlinkSync(testStderrLog);
    }
    if (fs.existsSync(testLogDir)) {
      fs.rmdirSync(testLogDir);
    }
  });

  test('should send historical logs on connection', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        // Should receive historical logs first
        if (message.type === 'history') {
          expect(message).toHaveProperty('lines');
          expect(Array.isArray(message.lines)).toBe(true);
          expect(message.lines.length).toBeGreaterThan(0);
          // Should contain initial log lines
          const content = message.lines.join('\n');
          expect(content).toContain('Initial stdout line');
          client.close();
          resolve();
        }
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  });

  test('should tail stdout log file and broadcast new lines', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      let historyReceived = false;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'history') {
          historyReceived = true;
          // After receiving history, append new line to stdout
          setTimeout(() => {
            fs.appendFileSync(testStdoutLog, 'New stdout log line\n', 'utf8');
          }, 100);
        } else if (message.type === 'log' && historyReceived) {
          // Should receive new log line
          expect(message).toHaveProperty('timestamp');
          expect(message).toHaveProperty('level');
          expect(message).toHaveProperty('message');
          expect(message.level).toBe('stdout');
          expect(message.message).toContain('New stdout log line');
          client.close();
          resolve();
        }
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  }, 10000); // 10 second timeout for file watching

  test('should tail stderr log file and broadcast new lines', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      let historyReceived = false;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'history') {
          historyReceived = true;
          // After receiving history, append new line to stderr
          setTimeout(() => {
            fs.appendFileSync(testStderrLog, 'New stderr log line\n', 'utf8');
          }, 100);
        } else if (message.type === 'log' && historyReceived) {
          // Should receive new log line
          expect(message).toHaveProperty('timestamp');
          expect(message).toHaveProperty('level');
          expect(message).toHaveProperty('message');
          expect(message.level).toBe('stderr');
          expect(message.message).toContain('New stderr log line');
          client.close();
          resolve();
        }
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  }, 10000);

  test('should broadcast new log lines to all connected clients', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    const client1 = new WebSocket(`ws://localhost:${testPort}/ws/logs`);
    const client2 = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      let client1History = false;
      let client2History = false;
      let client1Log = false;
      let client2Log = false;

      const checkComplete = () => {
        if (client1Log && client2Log) {
          client1.close();
          client2.close();
          resolve();
        }
      };

      client1.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'history') {
          client1History = true;
          if (client1History && client2History) {
            // Both clients ready, append new log
            setTimeout(() => {
              fs.appendFileSync(testStdoutLog, 'Broadcast test line\n', 'utf8');
            }, 100);
          }
        } else if (message.type === 'log') {
          expect(message.message).toContain('Broadcast test line');
          client1Log = true;
          checkComplete();
        }
      });

      client2.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'history') {
          client2History = true;
          if (client1History && client2History) {
            // Both clients ready, append new log
            setTimeout(() => {
              fs.appendFileSync(testStdoutLog, 'Broadcast test line\n', 'utf8');
            }, 100);
          }
        } else if (message.type === 'log') {
          expect(message.message).toContain('Broadcast test line');
          client2Log = true;
          checkComplete();
        }
      });

      client1.on('error', reject);
      client2.on('error', reject);
    });
  }, 10000);

  test('should stop tailing when all clients disconnect', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    // Connect and disconnect a client
    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      client.on('open', () => {
        // Close immediately after connection
        client.close();
      });

      client.on('close', () => {
        resolve();
      });

      client.on('error', (error) => {
        reject(error);
      });
    });

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify tailer is stopped (by checking client count)
    expect(wsServer!.getClientCount()).toBe(0);
  });

  test('should continue tailing existing log file', async () => {
    wsServer = new LogWebSocketServer(httpServer, undefined, '/ws/logs', testLogDir);
    wsServer.start();

    const client = new WebSocket(`ws://localhost:${testPort}/ws/logs`);

    await new Promise<void>((resolve, reject) => {
      let historyReceived = false;

      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'history') {
          historyReceived = true;
          // Append to existing file (simpler test)
          setTimeout(() => {
            fs.appendFileSync(testStdoutLog, 'Continuous tail test line\n', 'utf8');
          }, 100);
        } else if (message.type === 'log' && historyReceived) {
          // Should receive appended logs
          expect(message.message).toContain('Continuous tail test line');
          client.close();
          resolve();
        }
      });

      client.on('error', (error) => {
        reject(error);
      });
    });
  }, 10000);
});
