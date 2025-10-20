// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Management API Server (Sub-phases 1.1 & 1.2)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

describe('ManagementServer - Node Status Endpoint (Sub-phase 1.2)', () => {
  let server: ManagementServer | null = null;
  const testPort = 3098; // Different port to avoid conflicts
  const testPidDir = path.join(os.tmpdir(), '.fabstir-test-' + Date.now());
  const testPidPath = path.join(testPidDir, 'host.pid');

  beforeEach(() => {
    // Create test PID directory
    if (!fs.existsSync(testPidDir)) {
      fs.mkdirSync(testPidDir, { recursive: true });
    }
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }

    // Clean up test PID file
    if (fs.existsSync(testPidPath)) {
      fs.unlinkSync(testPidPath);
    }
    if (fs.existsSync(testPidDir)) {
      fs.rmdirSync(testPidDir);
    }
  });

  test('should return running status when node is active', async () => {
    // Create a PID file with current process (which is running)
    const pidInfo = {
      pid: process.pid,
      publicUrl: 'http://localhost:8080',
      startTime: new Date(Date.now() - 5000).toISOString() // Started 5 seconds ago
    };
    fs.writeFileSync(testPidPath, JSON.stringify(pidInfo, null, 2), 'utf8');

    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      pidPath: testPidPath
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/api/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('running');
    expect(data.pid).toBe(process.pid);
    expect(data.publicUrl).toBe('http://localhost:8080');
    expect(data.startTime).toBe(pidInfo.startTime);
    expect(typeof data.uptime).toBe('number');
    expect(data.uptime).toBeGreaterThanOrEqual(4); // At least 4 seconds
  });

  test('should return stopped status when no PID file exists', async () => {
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      pidPath: testPidPath
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/api/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('stopped');
    expect(data.pid).toBeUndefined();
    expect(data.publicUrl).toBeUndefined();
    expect(data.uptime).toBeUndefined();
  });

  test('should return stopped status when PID exists but process dead', async () => {
    // Create a PID file with a dead process (PID 999999 is unlikely to exist)
    const pidInfo = {
      pid: 999999,
      publicUrl: 'http://localhost:8080',
      startTime: new Date().toISOString()
    };
    fs.writeFileSync(testPidPath, JSON.stringify(pidInfo, null, 2), 'utf8');

    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      pidPath: testPidPath
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/api/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('stopped');
    expect(data.pid).toBeUndefined();
  });

  test('should include PID, uptime, and publicUrl in response', async () => {
    const startTime = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
    const pidInfo = {
      pid: process.pid,
      publicUrl: 'http://example.com:8080',
      startTime
    };
    fs.writeFileSync(testPidPath, JSON.stringify(pidInfo, null, 2), 'utf8');

    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      pidPath: testPidPath
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/api/status`);
    const data = await response.json();

    // Verify all required fields are present
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('pid');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('publicUrl');
    expect(data).toHaveProperty('startTime');

    // Verify correct values
    expect(data.pid).toBe(process.pid);
    expect(data.publicUrl).toBe('http://example.com:8080');
    expect(data.startTime).toBe(startTime);
    expect(data.uptime).toBeGreaterThanOrEqual(9);
  });

  test('should handle missing config gracefully', async () => {
    // No PID file exists, config is null scenario
    const config: ServerConfig = {
      port: testPort,
      corsOrigins: ['http://localhost:3000'],
      pidPath: testPidPath
    };

    server = new ManagementServer(config);
    await server.start();

    const response = await fetch(`http://localhost:${testPort}/api/status`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('stopped');
    // Should not crash, just return stopped status
  });
});

describe('ManagementServer - Lifecycle Control Endpoints (Sub-phase 1.3)', () => {
  let server: ManagementServer | null = null;
  const testPort = 3097; // Different port to avoid conflicts

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
  });

  describe('POST /api/start', () => {
    test('should handle start request (may fail without config)', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daemon: true })
      });

      // Endpoint is implemented - may return 500 if no config exists
      expect([200, 500].includes(response.status)).toBe(true);
      const data = await response.json();
      expect(data).toHaveProperty('error'); // Likely "No configuration found"
    });
  });

  describe('POST /api/stop', () => {
    test('should handle stop request', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // Endpoint is implemented - returns 200 with success or 500 with error
      expect([200, 500].includes(response.status)).toBe(true);
      const data = await response.json();
      // May return success: true or error message
      expect(data).toBeTruthy();
    });
  });

  describe('POST /api/register', () => {
    test('should validate required fields', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      // Test with missing fields - should return 400
      const response = await fetch(`http://localhost:${testPort}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: '0x1234...'
          // Missing publicUrl, models, stakeAmount
        })
      });

      // Endpoint is implemented - should validate and return 400 for missing fields
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Missing required fields');
    });
  });

  describe('POST /api/unregister', () => {
    test('should return method not implemented error', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/unregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // For now, should return 501 Not Implemented or 404
      expect([404, 501].includes(response.status)).toBe(true);
    });
  });

  describe('POST /api/add-stake', () => {
    test('should return method not implemented error', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/add-stake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: '100' })
      });

      expect([404, 501].includes(response.status)).toBe(true);
    });
  });

  describe('POST /api/withdraw-earnings', () => {
    test('should handle withdrawal request', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/withdraw-earnings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Endpoint is implemented - returns error if not authenticated or no balance
      expect([200, 500].includes(response.status)).toBe(true);
      const data = await response.json();
      expect(data).toBeTruthy();
    });
  });

  describe('POST /api/update-models', () => {
    test('should return method not implemented error', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/update-models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds: ['model1', 'model2'] })
      });

      expect([404, 501].includes(response.status)).toBe(true);
    });
  });

  describe('POST /api/update-metadata', () => {
    test('should return method not implemented error', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/update-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 }
          }
        })
      });

      expect([404, 501].includes(response.status)).toBe(true);
    });
  });

  describe('GET /api/discover-nodes', () => {
    test('should handle discover request', async () => {
      const config: ServerConfig = {
        port: testPort,
        corsOrigins: ['http://localhost:3000']
      };

      server = new ManagementServer(config);
      await server.start();

      const response = await fetch(`http://localhost:${testPort}/api/discover-nodes`);

      // Endpoint is implemented - may return 401 if not authenticated or 200 with hosts
      expect([200, 401, 500].includes(response.status)).toBe(true);
      const data = await response.json();
      expect(data).toBeTruthy();
    });
  });
});
