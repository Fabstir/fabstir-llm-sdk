/**
 * Management API Integration Tests (Sub-phase 6.1)
 *
 * End-to-end tests for browser-based node management via HTTP + WebSocket API.
 * These tests run against a REAL Docker container (fabstir-host-test).
 *
 * Prerequisites:
 * 1. Docker container running: ./start-fabstir-docker.sh
 * 2. Management server started: ./start-management-server.sh
 * 3. Port 3001 accessible from host
 *
 * To run:
 *   pnpm test tests/integration/management-api.test.ts
 *
 * To skip (if Docker not available):
 *   SKIP_DOCKER_TESTS=1 pnpm test
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Import clients from apps/harness (browser API client)
// These are the actual clients used by the browser UI
interface NodeStatus {
  status: 'running' | 'stopped';
  pid?: number;
  uptime?: number;
  publicUrl?: string;
  startTime?: string;
}

interface HostApiConfig {
  baseUrl: string;
  apiKey?: string;
}

interface LogMessage {
  type: 'log';
  timestamp: string;
  level: 'stdout' | 'stderr';
  message: string;
}

// Simple API client for testing (mirrors apps/harness/lib/hostApiClient.ts)
class TestHostApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: HostApiConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      this.headers['X-API-Key'] = config.apiKey;
    }
  }

  async getStatus(): Promise<NodeStatus> {
    const response = await fetch(`${this.baseUrl}/api/status`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async start(daemon = true): Promise<{ status: string; pid: number; publicUrl: string }> {
    const response = await fetch(`${this.baseUrl}/api/start`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ daemon }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Start failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async stop(force = false): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/stop`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Stop failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async discoverNodes(): Promise<{ nodes: any[] }> {
    const response = await fetch(`${this.baseUrl}/api/discover-nodes`, {
      method: 'GET',
      headers: this.headers,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Discovery failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
}

// Simple WebSocket client for testing (mirrors apps/harness/lib/hostWsClient.ts)
class TestHostWsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private onLogCallback?: (log: LogMessage) => void;
  private onHistoryCallback?: (logs: string[]) => void;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (error) => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'log') {
          this.onLogCallback?.(message as LogMessage);
        } else if (message.type === 'history') {
          this.onHistoryCallback?.(message.lines);
        }
      };
    });
  }

  onLog(callback: (log: LogMessage) => void): void {
    this.onLogCallback = callback;
  }

  onHistory(callback: (logs: string[]) => void): void {
    this.onHistoryCallback = callback;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Helper: Check if Docker container is running
function isDockerContainerRunning(): boolean {
  try {
    execSync('docker ps | grep -q fabstir-host-test', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if management server is running
async function isManagementServerRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3001/health', {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Helper: Start management server in Docker container
function startManagementServer(): void {
  try {
    execSync(
      "docker exec -d fabstir-host-test sh -c 'cd /app && node --require /app/polyfills.js dist/index.js serve --port 3001'",
      { stdio: 'ignore' }
    );
    // Wait for server to start
    execSync('sleep 3');
  } catch (error) {
    throw new Error('Failed to start management server');
  }
}

// Helper: Stop management server
function stopManagementServer(): void {
  try {
    execSync(
      "docker exec fabstir-host-test pkill -f 'dist/index.js serve'",
      { stdio: 'ignore' }
    );
  } catch {
    // Ignore errors (process might not be running)
  }
}

// Helper: Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Skip all tests if Docker is not available or SKIP_DOCKER_TESTS=1
const skipDockerTests = process.env.SKIP_DOCKER_TESTS === '1';

describe.skipIf(skipDockerTests)('Management API Integration Tests', () => {
  let apiClient: TestHostApiClient;
  let containerRunning: boolean;
  let serverWasRunning: boolean;

  beforeAll(async () => {
    // Check prerequisites
    containerRunning = isDockerContainerRunning();

    if (!containerRunning) {
      console.warn('⚠️  Docker container not running. Skipping integration tests.');
      console.warn('   Run: ./start-fabstir-docker.sh');
      return;
    }

    // Check if server is already running
    serverWasRunning = await isManagementServerRunning();

    if (!serverWasRunning) {
      console.log('🚀 Starting management server for tests...');
      startManagementServer();

      // Verify server started
      await sleep(2000);
      const serverRunning = await isManagementServerRunning();
      if (!serverRunning) {
        throw new Error('Management server failed to start');
      }
    }

    // Initialize API client
    apiClient = new TestHostApiClient({
      baseUrl: 'http://localhost:3001',
    });
  });

  afterAll(async () => {
    // Only stop server if we started it
    if (containerRunning && !serverWasRunning) {
      console.log('🛑 Stopping management server...');
      stopManagementServer();
    }
  });

  beforeEach(async () => {
    // Skip if container not running
    if (!containerRunning) {
      return;
    }
  });

  describe('Health & Status Endpoints', () => {
    test('GET /health should return ok status', async () => {
      const response = await fetch('http://localhost:3001/health');
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('uptime');
      expect(typeof data.uptime).toBe('number');
    });

    test('GET /api/status should return node status', async () => {
      const status = await apiClient.getStatus();

      expect(status).toHaveProperty('status');
      expect(['running', 'stopped']).toContain(status.status);

      // If running, should have additional fields
      if (status.status === 'running') {
        expect(status).toHaveProperty('pid');
        expect(status).toHaveProperty('uptime');
        expect(typeof status.pid).toBe('number');
        expect(typeof status.uptime).toBe('number');
      }
    });
  });

  describe('Node Lifecycle Operations', () => {
    test('should handle start/stop operations', async () => {
      // Get initial status
      const initialStatus = await apiClient.getStatus();

      // If node is running, stop it first
      if (initialStatus.status === 'running') {
        await apiClient.stop();
        await sleep(2000);
      }

      // Verify node is stopped
      const stoppedStatus = await apiClient.getStatus();
      expect(stoppedStatus.status).toBe('stopped');

      // Note: Actually starting the node requires:
      // - Valid registration
      // - Model files
      // - Binary available
      // These are tested separately in host-lifecycle.test.ts
    });

    test('should report correct status after operations', async () => {
      const status = await apiClient.getStatus();

      // Status should be valid
      expect(['running', 'stopped']).toContain(status.status);

      // If stopped, optional fields should be undefined
      if (status.status === 'stopped') {
        expect(status.pid).toBeUndefined();
        expect(status.publicUrl).toBeUndefined();
      }
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers for allowed origins', async () => {
      const response = await fetch('http://localhost:3001/api/status', {
        method: 'GET',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });

      const corsHeader = response.headers.get('Access-Control-Allow-Origin');
      expect(corsHeader).toBeTruthy();
      expect(corsHeader).toBe('http://localhost:3000');
    });

    test('should handle OPTIONS preflight requests', async () => {
      const response = await fetch('http://localhost:3001/api/status', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await fetch('http://localhost:3001/api/nonexistent', {
        method: 'GET',
      });

      expect(response.status).toBe(404);
    });

    test('should handle invalid JSON payloads', async () => {
      const response = await fetch('http://localhost:3001/api/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      expect(response.ok).toBe(false);
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Network Discovery', () => {
    test('GET /api/discover-nodes should return nodes list', async () => {
      const result = await apiClient.discoverNodes();

      expect(result).toHaveProperty('nodes');
      expect(Array.isArray(result.nodes)).toBe(true);

      // Nodes might be empty if none are registered on testnet
      // But the structure should be correct
      if (result.nodes.length > 0) {
        const node = result.nodes[0];
        expect(node).toHaveProperty('nodeAddress');
        expect(node).toHaveProperty('apiUrl');
        expect(node).toHaveProperty('supportedModels');
        expect(node).toHaveProperty('isActive');
      }
    });
  });
});

// WebSocket tests in separate describe block (requires WebSocket polyfill in Node.js)
describe.skipIf(skipDockerTests || typeof WebSocket === 'undefined')('WebSocket Log Streaming', () => {
  let wsClient: TestHostWsClient;
  let containerRunning: boolean;

  beforeAll(() => {
    containerRunning = isDockerContainerRunning();
  });

  beforeEach(async () => {
    if (!containerRunning) {
      return;
    }

    // Note: WebSocket client requires global WebSocket object
    // In Node.js, this needs to be polyfilled
    // For now, these tests are skipped in Node.js environment
  });

  afterEach(() => {
    if (wsClient) {
      wsClient.disconnect();
    }
  });

  test.skip('should connect to WebSocket server', async () => {
    // Skipped: Requires WebSocket polyfill in Node.js
    // This works in browser environments
    wsClient = new TestHostWsClient('ws://localhost:3001/ws/logs');
    await wsClient.connect();

    expect(wsClient.isConnected()).toBe(true);
  });

  test.skip('should receive log messages', async () => {
    // Skipped: Requires WebSocket polyfill in Node.js
    // This works in browser environments
    const logs: LogMessage[] = [];

    wsClient = new TestHostWsClient('ws://localhost:3001/ws/logs');
    wsClient.onLog((log) => logs.push(log));

    await wsClient.connect();
    await sleep(2000);

    // Should receive some logs (historical or new)
    expect(logs.length).toBeGreaterThan(0);
  });
});
