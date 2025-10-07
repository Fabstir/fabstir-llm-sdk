/**
 * Tests for Management API Server (Sub-phase 1.1)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';

// Import the ManagementServer class (will be implemented)
import { ManagementServer, type ServerConfig } from '../../src/server/api';

describe('ManagementServer - Core & Health Endpoint', () => {
  let server: ManagementServer | null = null;
  const testPort = 3099; // Use non-standard port to avoid conflicts

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  test('should start server on specified port', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000']
    };

    server = new ManagementServer(config);
    await server.start();

    // Try to connect to the server
    const response = await fetch(`http://localhost:${testPort}/health`);
    expect(response.status).toBe(200);
  });

  test('should respond to health check at GET /health', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000']
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/health`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('uptime');
    expect(typeof data.uptime).toBe('number');
  });

  test('should enable CORS for localhost origins', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000']
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/health`, {
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });

    const corsHeader = response.headers.get('access-control-allow-origin');
    expect(corsHeader).toBeTruthy();
    expect(corsHeader).toBe('http://localhost:3000');
  });

  test('should reject requests without API key when auth is enabled', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      apiKey: 'test-secret-key'
    };

    server = new ManagementServer(config);
    await server.start();

    // Request without API key should fail
    const responseWithoutKey = await fetch(`http://localhost:${testPort}/api/status`);
    expect(responseWithoutKey.status).toBe(401);

    // Request with correct API key should succeed (even if endpoint doesn't exist yet)
    const responseWithKey = await fetch(`http://localhost:${testPort}/api/status`, {
      headers: {
        'X-API-Key': 'test-secret-key'
      }
    });
    // Should not be 401 (could be 404 if endpoint not implemented yet)
    expect(responseWithKey.status).not.toBe(401);
  });

  test('should gracefully shutdown server', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000']
    };

    server = new ManagementServer(config);
    await server.start();

    // Give server a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Server should be running
    const response1 = await fetch(`http://localhost:${testPort}/health`);
    expect(response1.ok).toBe(true);

    // Stop the server
    await server.stop();

    // Give server a moment to fully shutdown
    await new Promise(resolve => setTimeout(resolve, 100));

    // Server should no longer respond
    let connectionRefused = false;
    try {
      await fetch(`http://localhost:${testPort}/health`);
    } catch (error: any) {
      // Expected to fail with connection refused or similar
      connectionRefused = error.code === 'ECONNREFUSED' ||
                         error.cause?.code === 'ECONNREFUSED' ||
                         error.message.includes('fetch failed');
    }
    expect(connectionRefused).toBe(true);

    server = null; // Prevent double cleanup in afterEach
  });
});
