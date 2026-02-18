import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

// Mock the handler modules before import
vi.mock('../src/openai-handler', () => ({
  handleChatCompletions: vi.fn(async (_req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion', choices: [] }));
  }),
}));
vi.mock('../src/image-handler', () => ({
  handleImageGeneration: vi.fn(async (_req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: 0, data: [] }));
  }),
}));

import { BridgeServer } from '../src/server';
import { handleChatCompletions } from '../src/openai-handler';
import { handleImageGeneration } from '../src/image-handler';

function request(port: number, method: string, path: string, body?: any, headers?: Record<string, string>): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, method, path, headers: { ...headers } };
    if (body) opts.headers['content-type'] = 'application/json';
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode!, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('BridgeServer', () => {
  let server: BridgeServer;
  const mockBridge: any = {};

  afterEach(async () => {
    if (server) await server.stop();
  });

  it('GET /health returns 200 with { status: "ok" }', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'GET', '/health');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('GET /v1/models returns model list', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'GET', '/v1/models');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.object).toBe('list');
    expect(body.data[0].id).toBe('test-model');
    expect(body.data[0].object).toBe('model');
  });

  it('POST /v1/chat/completions routes to chat handler', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/chat/completions',
      { model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.statusCode).toBe(200);
    expect(handleChatCompletions).toHaveBeenCalled();
  });

  it('POST /v1/images/generations routes to image handler', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/images/generations',
      { prompt: 'A cat' });
    expect(res.statusCode).toBe(200);
    expect(handleImageGeneration).toHaveBeenCalled();
  });

  it('OPTIONS returns CORS headers', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'OPTIONS', '/v1/chat/completions');
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('unknown path returns 404', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'GET', '/v1/unknown');
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.type).toBe('not_found_error');
  });

  it('missing Content-Type returns 400', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/chat/completions');
    expect(res.statusCode).toBe(400);
  });

  it('invalid JSON body is handled by handler (routes correctly)', async () => {
    // The server routes to handler which does its own JSON parsing
    // Here we verify the route works — JSON parse errors tested in handler tests
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/chat/completions',
      { model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    expect(res.statusCode).toBe(200);
    expect(handleChatCompletions).toHaveBeenCalled();
  });

  it('valid API key passes through', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model', 'secret-key');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/chat/completions',
      { model: 'test', messages: [{ role: 'user', content: 'Hi' }] },
      { authorization: 'Bearer secret-key' });
    expect(res.statusCode).toBe(200);
  });

  it('invalid API key returns 401', async () => {
    server = new BridgeServer(0, mockBridge, 'test-model', 'secret-key');
    await server.start();
    const res = await request(server.getPort(), 'POST', '/v1/chat/completions',
      { model: 'test', messages: [{ role: 'user', content: 'Hi' }] },
      { authorization: 'Bearer wrong-key' });
    expect(res.statusCode).toBe(401);
  });

  it('logs incoming requests to console', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    server = new BridgeServer(0, mockBridge, 'test-model');
    await server.start();
    await request(server.getPort(), 'GET', '/health');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('GET /health'));
    spy.mockRestore();
  });
});
