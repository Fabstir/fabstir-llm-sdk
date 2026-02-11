import { describe, test, expect, vi, beforeEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';
import { handleMessages } from '../src/handler';
import type { SessionBridge, SendPromptResult } from '../src/session-bridge';

function createMockBridge(overrides: Partial<SessionBridge> = {}): SessionBridge {
  return {
    sendPrompt: vi.fn().mockResolvedValue({
      response: 'Hello from host',
      tokenUsage: { llmTokens: 10, vlmTokens: 5, totalTokens: 15 },
    } as SendPromptResult),
    ...overrides,
  } as any;
}

function createMockReq(body: any, method = 'POST'): IncomingMessage {
  const bodyStr = JSON.stringify(body);
  const stream = Readable.from([bodyStr]);
  return Object.assign(stream, {
    method,
    url: '/v1/messages',
    headers: { 'content-type': 'application/json' },
  }) as any;
}

function createMockRes(): ServerResponse & { _body: string; _status: number; _headers: Record<string, string> } {
  const res: any = {
    _body: '',
    _status: 200,
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          res._headers[k.toLowerCase()] = v;
        }
      }
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name.toLowerCase()] = value;
    },
    write(chunk: string) {
      res._body += chunk;
      return true;
    },
    end(data?: string) {
      if (data) res._body += data;
    },
    flushHeaders() {},
  };
  return res;
}

// ===== Sub-phase 5.1: Non-Streaming Tests =====
describe('handler — non-streaming', () => {
  let bridge: SessionBridge;

  beforeEach(() => {
    bridge = createMockBridge();
  });

  test('valid request → 200 with response shape', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(res._status).toBe(200);
    expect(body.id).toMatch(/^msg_/);
    expect(body.type).toBe('message');
    expect(body.role).toBe('assistant');
  });

  test('response content is [{type: "text", text: "..."}]', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(body.content).toHaveLength(1);
    expect(body.content[0].type).toBe('text');
    expect(body.content[0].text).toBe('Hello from host');
  });

  test('response has usage.input_tokens and usage.output_tokens', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(typeof body.usage.input_tokens).toBe('number');
    expect(typeof body.usage.output_tokens).toBe('number');
    expect(body.usage.output_tokens).toBe(10); // llmTokens
  });

  test('missing messages field → 400', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100 });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(res._status).toBe(400);
    expect(body.type).toBe('error');
    expect(body.error.type).toBe('invalid_request_error');
  });

  test('missing max_tokens → 400', async () => {
    const req = createMockReq({ model: 'glm-4', messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(res._status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
  });

  test('empty messages array → 400', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(res._status).toBe(400);
    expect(body.error.type).toBe('invalid_request_error');
  });

  test('SDK error → 500', async () => {
    bridge = createMockBridge({
      sendPrompt: vi.fn().mockRejectedValue(new Error('Node offline')),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(res._status).toBe(500);
    expect(body.type).toBe('error');
    expect(body.error.type).toBe('api_error');
    expect(body.error.message).toContain('Node offline');
  });
});

// ===== Sub-phase 5.2: Streaming Tests =====
describe('handler — streaming', () => {
  let bridge: SessionBridge;

  beforeEach(() => {
    bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_prompt: string, onToken?: (t: string) => void) => {
        onToken?.('Hello');
        onToken?.(' world');
        return {
          response: 'Hello world',
          tokenUsage: { llmTokens: 2, vlmTokens: 0, totalTokens: 2 },
        } as SendPromptResult;
      }),
    });
  });

  test('stream: true → Content-Type is text/event-stream', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    expect(res._headers['content-type']).toBe('text/event-stream');
  });

  test('first SSE event is message_start', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = res._body.split('\n\n').filter(Boolean);
    const firstData = events[0].split('\ndata: ')[1];
    const parsed = JSON.parse(firstData);
    expect(parsed.type).toBe('message_start');
  });

  test('token callbacks produce content_block_delta events', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const deltas = res._body.split('\n\n')
      .filter(Boolean)
      .map(block => {
        const dataLine = block.split('\ndata: ')[1];
        return dataLine ? JSON.parse(dataLine) : null;
      })
      .filter(d => d?.type === 'content_block_delta');
    expect(deltas.length).toBe(2);
    expect(deltas[0].delta.text).toBe('Hello');
    expect(deltas[1].delta.text).toBe(' world');
  });

  test('correct event order: message_start → block_start → deltas → block_stop → message_delta → message_stop', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const types = res._body.split('\n\n')
      .filter(Boolean)
      .map(block => {
        const dataLine = block.split('\ndata: ')[1];
        return dataLine ? JSON.parse(dataLine).type : null;
      })
      .filter(Boolean);
    expect(types).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
  });

  test('message_delta includes usage.output_tokens', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const msgDelta = res._body.split('\n\n')
      .filter(Boolean)
      .map(block => {
        const dataLine = block.split('\ndata: ')[1];
        return dataLine ? JSON.parse(dataLine) : null;
      })
      .find(d => d?.type === 'message_delta');
    expect(msgDelta.usage.output_tokens).toBe(2);
  });

  test('response headers include Cache-Control: no-cache', async () => {
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    expect(res._headers['cache-control']).toBe('no-cache');
  });

  test('SDK error during streaming produces error event', async () => {
    bridge = createMockBridge({
      sendPrompt: vi.fn().mockRejectedValue(new Error('Connection lost')),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const errorEvt = res._body.split('\n\n')
      .filter(Boolean)
      .map(block => {
        const dataLine = block.split('\ndata: ')[1];
        return dataLine ? JSON.parse(dataLine) : null;
      })
      .find(d => d?.type === 'error');
    expect(errorEvt).toBeDefined();
    expect(errorEvt.error.message).toContain('Connection lost');
  });
});
