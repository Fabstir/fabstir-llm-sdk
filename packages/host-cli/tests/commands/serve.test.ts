// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Serve Command (Sub-phase 3.1)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Import the serve command functions (will be implemented)
import { registerServeCommand, startServer, cleanupServers } from '../../src/commands/serve';

describe('Serve Command', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  test('should export registerServeCommand function', () => {
    expect(registerServeCommand).toBeDefined();
    expect(typeof registerServeCommand).toBe('function');
  });

  test('should export startServer function', () => {
    expect(startServer).toBeDefined();
    expect(typeof startServer).toBe('function');
  });

  test('should start server on default port 3001', async () => {
    const options = {
      port: '3001',
      cors: 'http://localhost:3000'
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is accessible
    const response = await fetch('http://localhost:3001/health');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('ok');

    // Cleanup
    await cleanupServers();
  }, 10000);

  test('should start server on custom port via --port flag', async () => {
    const customPort = 3099;
    const options = {
      port: customPort.toString(),
      cors: 'http://localhost:3000'
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is accessible on custom port
    const response = await fetch(`http://localhost:${customPort}/health`);
    expect(response.ok).toBe(true);

    // Cleanup
    await cleanupServers();
  }, 10000);

  test('should load API key from environment variable', async () => {
    const testApiKey = 'test-env-api-key';
    process.env.FABSTIR_API_KEY = testApiKey;

    const options = {
      port: '3098',
      cors: 'http://localhost:3000'
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try accessing protected endpoint without API key
    const responseWithoutKey = await fetch('http://localhost:3098/api/status');
    expect(responseWithoutKey.status).toBe(401);

    // Try with correct API key
    const responseWithKey = await fetch('http://localhost:3098/api/status', {
      headers: {
        'X-API-Key': testApiKey
      }
    });
    expect(responseWithKey.status).not.toBe(401);

    // Cleanup
    await cleanupServers();
  }, 10000);

  test('should configure CORS origins from --cors flag', async () => {
    const corsOrigin = 'http://localhost:4000';
    const options = {
      port: '3097',
      cors: corsOrigin
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 500));

    // Make request with CORS origin
    const response = await fetch('http://localhost:3097/health', {
      headers: {
        'Origin': corsOrigin
      }
    });

    expect(response.ok).toBe(true);
    const corsHeader = response.headers.get('access-control-allow-origin');
    expect(corsHeader).toBe(corsOrigin);

    // Cleanup
    await cleanupServers();
  }, 10000);

  test('should handle port already in use', async () => {
    const port = 3096;
    const options = {
      port: port.toString(),
      cors: 'http://localhost:3000'
    };

    // Start first server (don't await - it runs indefinitely)
    startServer(options);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try to start second server on same port
    let errorThrown = false;
    try {
      await startServer(options);
    } catch (error: any) {
      errorThrown = true;
      expect(error.message).toContain('already in use');
    }

    expect(errorThrown).toBe(true);

    // Cleanup
    await cleanupServers();
  }, 10000);

  test('should gracefully shutdown on SIGTERM', async () => {
    const options = {
      port: '3095',
      cors: 'http://localhost:3000'
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is running
    const response1 = await fetch('http://localhost:3095/health');
    expect(response1.ok).toBe(true);

    // Send SIGTERM
    process.emit('SIGTERM' as any);

    // Wait for shutdown
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is stopped
    let connectionFailed = false;
    try {
      await fetch('http://localhost:3095/health');
    } catch (error) {
      connectionFailed = true;
    }

    expect(connectionFailed).toBe(true);
  }, 10000);

  test('should gracefully shutdown on SIGINT', async () => {
    const options = {
      port: '3094',
      cors: 'http://localhost:3000'
    };

    // Start server (don't await - it runs indefinitely)
    startServer(options);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is running
    const response1 = await fetch('http://localhost:3094/health');
    expect(response1.ok).toBe(true);

    // Send SIGINT (Ctrl+C)
    process.emit('SIGINT' as any);

    // Wait for shutdown
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify server is stopped
    let connectionFailed = false;
    try {
      await fetch('http://localhost:3094/health');
    } catch (error) {
      connectionFailed = true;
    }

    expect(connectionFailed).toBe(true);
  }, 10000);
});
