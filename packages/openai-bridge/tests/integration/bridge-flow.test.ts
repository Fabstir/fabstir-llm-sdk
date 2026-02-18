import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { BridgeServer } from '../../src/server';
import type { SessionBridge, SendPromptResult } from '../../src/session-bridge';

function createMockBridge(opts?: {
  response?: string;
  onTokenBehavior?: (onToken: (t: string) => void) => void;
  imageBase64?: string;
  generateImageError?: Error;
}): SessionBridge {
  const mockSessionManager = {
    generateImage: opts?.generateImageError
      ? vi.fn().mockRejectedValue(opts.generateImageError)
      : vi.fn().mockResolvedValue({ image: opts?.imageBase64 || 'mockBase64Data' }),
  };
  return {
    sendPrompt: vi.fn(async (prompt: string, onToken?: (t: string) => void, options?: any): Promise<SendPromptResult> => {
      if (onToken && opts?.onTokenBehavior) opts.onTokenBehavior(onToken);
      else if (onToken) { onToken('Hello'); onToken(' world'); }
      return { response: opts?.response || 'Hello world', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } };
    }),
    ensureSession: vi.fn().mockResolvedValue(42n),
    getSessionManager: vi.fn().mockReturnValue(mockSessionManager),
    getSessionId: vi.fn().mockReturnValue(42n),
    initialize: vi.fn(),
    shutdown: vi.fn(),
  } as any;
}

function httpRequest(port: number, method: string, path: string, body?: any): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: '127.0.0.1', port, method, path,
      headers: body ? { 'content-type': 'application/json' } : {},
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode!, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Integration: Bridge Flow', () => {
  describe('non-streaming chat', () => {
    let server: BridgeServer;
    let port: number;

    beforeAll(async () => {
      const bridge = createMockBridge({ response: 'Integration test response' });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('non-streaming chat returns valid OpenAI ChatCompletion', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test', messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toMatch(/^chatcmpl-/);
      expect(body.object).toBe('chat.completion');
      expect(body.choices).toHaveLength(1);
      expect(body.choices[0].message.role).toBe('assistant');
      expect(body.choices[0].message.content).toBe('Integration test response');
      expect(body.choices[0].finish_reason).toBe('stop');
      expect(body.usage).toBeDefined();
      expect(body.usage.total_tokens).toBeGreaterThan(0);
    });
  });

  describe('streaming chat', () => {
    let server: BridgeServer;
    let port: number;

    beforeAll(async () => {
      const bridge = createMockBridge({
        onTokenBehavior: (onToken) => { onToken('Streamed'); onToken(' response'); },
      });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('streaming chat emits correct SSE event sequence', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test', messages: [{ role: 'user', content: 'Hello' }], stream: true,
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
      const lines = res.body.split('\n').filter(l => l.startsWith('data: '));
      // First: role delta, then content deltas, then finish delta, then [DONE]
      expect(lines.length).toBeGreaterThanOrEqual(4); // role + 2 content + finish + [DONE]
      const first = JSON.parse(lines[0].replace('data: ', ''));
      expect(first.choices[0].delta.role).toBe('assistant');
      const last = lines[lines.length - 1];
      expect(last).toContain('[DONE]');
    });
  });

  describe('tool use', () => {
    let server: BridgeServer;
    let port: number;

    beforeAll(async () => {
      const toolResp = '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>';
      const bridge = createMockBridge({ response: toolResp });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('tool use returns tool_calls in response', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test',
        messages: [{ role: 'user', content: 'Weather in London?' }],
        tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: {} } }],
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.choices[0].finish_reason).toBe('tool_calls');
      expect(body.choices[0].message.tool_calls).toBeDefined();
      expect(body.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
    });
  });

  describe('multi-turn with tool results', () => {
    let server: BridgeServer;
    let port: number;
    let bridge: any;

    beforeAll(async () => {
      bridge = createMockBridge({ response: 'The weather is sunny' });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('multi-turn with tool results serialises as observation blocks', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test',
        messages: [
          { role: 'user', content: 'Weather?' },
          { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"London"}' } }] },
          { role: 'tool', content: '{"temp": 20, "condition": "sunny"}', tool_call_id: 'call_1' },
        ],
      });
      expect(res.status).toBe(200);
      // Verify the bridge received a prompt containing observation block
      const promptArg = bridge.sendPrompt.mock.calls[0][0];
      expect(promptArg).toContain('<|im_start|>observation');
      expect(promptArg).toContain('{"temp": 20, "condition": "sunny"}');
    });
  });

  describe('image generation', () => {
    let server: BridgeServer;
    let port: number;

    beforeAll(async () => {
      const bridge = createMockBridge({ imageBase64: 'iVBORw0KGgoAAAANS' });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('image generation returns OpenAI ImageResponse with b64_json', async () => {
      const res = await httpRequest(port, 'POST', '/v1/images/generations', {
        prompt: 'A cat astronaut',
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.created).toBeDefined();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].b64_json).toBe('iVBORw0KGgoAAAANS');
      expect(body.data[0].revised_prompt).toBe('A cat astronaut');
    });
  });

  describe('image generation with quality hd', () => {
    let server: BridgeServer;
    let port: number;
    let bridge: any;

    beforeAll(async () => {
      bridge = createMockBridge({ imageBase64: 'hdImage' });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('image generation with quality "hd" passes steps=20', async () => {
      await httpRequest(port, 'POST', '/v1/images/generations', {
        prompt: 'HD mountain', quality: 'hd',
      });
      const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
      expect(genCall[2].steps).toBe(20);
    });
  });

  describe('vision message', () => {
    let server: BridgeServer;
    let port: number;
    let bridge: any;

    beforeAll(async () => {
      bridge = createMockBridge({ response: 'I see a cat' });
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('vision message extracts image and passes to bridge', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,testImageData' } },
          ],
        }],
      });
      expect(res.status).toBe(200);
      const callArgs = bridge.sendPrompt.mock.calls[0];
      expect(callArgs[2]).toEqual({ images: [{ data: 'testImageData', format: 'png' }] });
    });
  });

  describe('error handling', () => {
    let server: BridgeServer;
    let port: number;

    beforeAll(async () => {
      const bridge = createMockBridge();
      server = new BridgeServer(0, bridge, 'test-model');
      await server.start();
      port = server.getPort();
    });
    afterAll(async () => { await server.stop(); });

    it('error returns OpenAI error format', async () => {
      const res = await httpRequest(port, 'POST', '/v1/chat/completions', {
        model: 'test', // missing messages
      });
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBeDefined();
      expect(body.error.message).toBeDefined();
      expect(body.error.type).toBe('invalid_request_error');
    });
  });
});
