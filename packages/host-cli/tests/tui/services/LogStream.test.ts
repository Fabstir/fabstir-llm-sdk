// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LogStream Service Tests
 * TDD tests for WebSocket log streaming
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
const mockWsInstance = {
  on: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
};

vi.mock('ws', () => ({
  default: vi.fn(() => mockWsInstance),
}));

describe('LogStream Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('should export LogStreamClient class', async () => {
    const { LogStreamClient } = await import('../../../src/tui/services/LogStream');
    expect(typeof LogStreamClient).toBe('function');
  });

  test('should create WebSocket URL from management URL', async () => {
    const WebSocket = (await import('ws')).default;
    const { LogStreamClient } = await import('../../../src/tui/services/LogStream');

    const client = new LogStreamClient('http://localhost:3001');
    client.connect();

    expect(WebSocket).toHaveBeenCalledWith('ws://localhost:3001/ws/logs');
  });

  test('should handle https to wss conversion', async () => {
    const WebSocket = (await import('ws')).default;
    const { LogStreamClient } = await import('../../../src/tui/services/LogStream');

    const client = new LogStreamClient('https://secure.example.com:3001');
    client.connect();

    expect(WebSocket).toHaveBeenCalledWith('wss://secure.example.com:3001/ws/logs');
  });

  test('should emit log events on message', async () => {
    const { LogStreamClient } = await import('../../../src/tui/services/LogStream');
    const client = new LogStreamClient('http://localhost:3001');

    const logHandler = vi.fn();
    client.on('log', logHandler);
    client.connect();

    // Simulate message event
    const messageHandler = mockWsInstance.on.mock.calls.find(
      (call: string[]) => call[0] === 'message'
    )?.[1];

    if (messageHandler) {
      messageHandler(JSON.stringify({
        type: 'log',
        timestamp: '2025-12-19T10:00:00Z',
        level: 'info',
        message: 'Test log message',
      }));
    }

    expect(logHandler).toHaveBeenCalledWith(expect.objectContaining({
      type: 'log',
      message: 'Test log message',
    }));
  });

  test('should close WebSocket on disconnect', async () => {
    const { LogStreamClient } = await import('../../../src/tui/services/LogStream');
    const client = new LogStreamClient('http://localhost:3001');

    client.connect();
    client.disconnect();

    expect(mockWsInstance.close).toHaveBeenCalled();
  });
});
