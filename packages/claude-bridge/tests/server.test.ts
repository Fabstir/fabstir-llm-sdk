import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'http';
import { BridgeServer } from '../src/server';
import type { SessionBridge, SendPromptResult } from '../src/session-bridge';

function createMockBridge(): SessionBridge {
  return {
    sendPrompt: vi.fn().mockResolvedValue({
      response: 'Test response',
      tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 },
    } as SendPromptResult),
    initialize: vi.fn(),
    ensureSession: vi.fn(),
    shutdown: vi.fn(),
  } as any;
}

function request(port: number, method: string, path: string, body?: any, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'content-type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('BridgeServer', () => {
  let server: BridgeServer;
  let bridge: SessionBridge;
  const PORT = 0; // Let OS pick a free port

  beforeEach(async () => {
    bridge = createMockBridge();
    server = new BridgeServer(0, bridge);
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  test('server starts and accepts connections', async () => {
    const port = server.getPort();
    const res = await request(port, 'GET', '/health');
    expect(res.status).toBe(200);
  });

  test('GET /health → 200 with { status: "ok" }', async () => {
    const port = server.getPort();
    const res = await request(port, 'GET', '/health');
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  test('POST /v1/messages with valid body routes to handler', async () => {
    const port = server.getPort();
    const res = await request(port, 'POST', '/v1/messages', {
      model: 'glm-4',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.type).toBe('message');
    expect(body.content[0].text).toBe('Test response');
  });

  test('OPTIONS /v1/messages → 200 with CORS headers', async () => {
    const port = server.getPort();
    const res = await request(port, 'OPTIONS', '/v1/messages');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  test('GET /v1/unknown → 404', async () => {
    const port = server.getPort();
    const res = await request(port, 'GET', '/v1/unknown');
    expect(res.status).toBe(404);
  });

  test('GET /v1/messages → 405 Method Not Allowed', async () => {
    const port = server.getPort();
    const res = await request(port, 'GET', '/v1/messages');
    expect(res.status).toBe(405);
  });

  test('x-api-key accepted but not required when no apiKey configured', async () => {
    const port = server.getPort();
    // Without key
    const res1 = await request(port, 'POST', '/v1/messages', {
      model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(res1.status).toBe(200);
    // With key
    const res2 = await request(port, 'POST', '/v1/messages', {
      model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }],
    }, { 'x-api-key': 'some-key' });
    expect(res2.status).toBe(200);
  });

  test('stop() closes server and frees port', async () => {
    const port = server.getPort();
    await server.stop();
    // Trying to connect should fail
    await expect(request(port, 'GET', '/health')).rejects.toThrow();
  });
});

describe('BridgeServer — API key enforcement', () => {
  test('rejects request with wrong API key when apiKey configured', async () => {
    const bridge = createMockBridge();
    const server = new BridgeServer(0, bridge, 'secret-key');
    await server.start();
    try {
      const port = server.getPort();
      const res = await request(port, 'POST', '/v1/messages', {
        model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }],
      }, { 'x-api-key': 'wrong-key' });
      expect(res.status).toBe(403);
    } finally {
      await server.stop();
    }
  });
});
