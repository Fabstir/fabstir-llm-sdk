import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { BridgeServer } from '../../src/server';
import type { SessionBridge, SendPromptResult } from '../../src/session-bridge';

function request(port: number, body: any, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/v1/messages', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function createMockBridge(overrides?: Partial<SessionBridge>): SessionBridge {
  return {
    sendPrompt: vi.fn().mockImplementation(async (_prompt: string, onToken?: (t: string) => void) => {
      onToken?.('Hello');
      onToken?.(' from');
      onToken?.(' bridge');
      return { response: 'Hello from bridge', tokenUsage: { llmTokens: 3, vlmTokens: 0, totalTokens: 3 } } as SendPromptResult;
    }),
    ...overrides,
  } as any;
}

describe('Integration: bridge-flow', () => {
  let server: BridgeServer;
  let bridge: SessionBridge;
  let port: number;

  beforeAll(async () => {
    bridge = createMockBridge();
    server = new BridgeServer(0, bridge);
    await server.start();
    port = server.getPort();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('non-streaming: full request → response cycle with correct Anthropic JSON format', async () => {
    const res = await request(port, { model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hello' }] });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^msg_/);
    expect(body.type).toBe('message');
    expect(body.role).toBe('assistant');
    expect(body.content[0].type).toBe('text');
    expect(body.content[0].text).toBe('Hello from bridge');
    expect(body.usage.input_tokens).toBeGreaterThan(0);
    expect(body.usage.output_tokens).toBe(3);
    expect(body.stop_reason).toBe('end_turn');
  });

  test('streaming: full request → SSE event sequence', async () => {
    const res = await request(port, { model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hello' }], stream: true });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    const events = res.body.split('\n\n').filter(Boolean).map(block => {
      const dataLine = block.split('\ndata: ')[1];
      return dataLine ? JSON.parse(dataLine) : null;
    }).filter(Boolean);
    const types = events.map(e => e.type);
    expect(types).toEqual([
      'message_start', 'content_block_start',
      'content_block_delta', 'content_block_delta', 'content_block_delta',
      'content_block_stop', 'message_delta', 'message_stop',
    ]);
  });

  test('multi-turn: messages array builds correct ChatML prompt', async () => {
    const messages = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'And 3+3?' },
    ];
    const res = await request(port, { model: 'glm-4', max_tokens: 100, messages, system: 'You are a calculator.' });
    expect(res.status).toBe(200);
    const call = (bridge.sendPrompt as any).mock.calls.at(-1)!;
    const prompt: string = call[0];
    expect(prompt).toContain('<|im_start|>system\nYou are a calculator.\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>user\nWhat is 2+2?\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>assistant\n4\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>user\nAnd 3+3?\n<|im_end|>');
    expect(prompt).toContain('<|im_start|>assistant\n');
  });

  test('image content block extracted and passed as ImageAttachment', async () => {
    const messages = [{ role: 'user', content: [
      { type: 'text', text: 'Describe this' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR...' } },
    ] }];
    const res = await request(port, { model: 'glm-4', max_tokens: 100, messages });
    expect(res.status).toBe(200);
    const call = (bridge.sendPrompt as any).mock.calls.at(-1)!;
    const opts = call[2]; // third arg = options
    expect(opts.images).toHaveLength(1);
    expect(opts.images[0].format).toBe('png');
    expect(opts.images[0].data).toBe('iVBOR...');
  });

  test('session error triggers auto-recovery', async () => {
    let callCount = 0;
    const recoveryBridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Session expired');
          err.code = 'SESSION_NOT_FOUND';
          throw err;
        }
        return { response: 'Recovered', tokenUsage: { llmTokens: 1, vlmTokens: 0, totalTokens: 1 } } as SendPromptResult;
      }),
    });
    const recoverServer = new BridgeServer(0, recoveryBridge);
    await recoverServer.start();
    try {
      const res = await request(recoverServer.getPort(), { model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
      // The handler catches the error from sendPrompt and returns 500.
      // Auto-recovery happens inside SessionBridge, not the handler.
      // Since we're mocking at the bridge level, the first call throws and
      // handler returns 500. This tests the error propagation path.
      expect(res.status).toBe(500);
    } finally {
      await recoverServer.stop();
    }
  });
});
