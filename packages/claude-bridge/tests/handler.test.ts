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

  test('system as array of content blocks extracted correctly', async () => {
    const req = createMockReq({
      model: 'glm-4', max_tokens: 100,
      messages: [{ role: 'user', content: 'Hi' }],
      system: [{ type: 'text', text: 'You are helpful.' }, { type: 'text', text: 'Be concise.' }],
    });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    expect(res._status).toBe(200);
    const call = (bridge.sendPrompt as any).mock.calls[0];
    expect(call[0]).toContain('You are helpful.');
    expect(call[0]).toContain('Be concise.');
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

// Helper to parse all SSE events from response body
function parseAllSSE(body: string): any[] {
  return body.split('\n\n')
    .filter(Boolean)
    .map(block => {
      const dataLine = block.split('\ndata: ')[1];
      return dataLine ? JSON.parse(dataLine) : null;
    })
    .filter(Boolean);
}

// ===== Sub-phase 10.4: Tool Use Tests =====
describe('handler — streaming with tool_use', () => {
  test('tool_call in output produces tool_use content block', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Weather?' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const toolStart = events.find(e => e.type === 'content_block_start' && e.content_block?.type === 'tool_use');
    expect(toolStart).toBeDefined();
    expect(toolStart.content_block.name).toBe('get_weather');
    const jsonDelta = events.find(e => e.delta?.type === 'input_json_delta');
    expect(jsonDelta).toBeDefined();
  });

  test('text before tool_call emitted as text block, then tool_use block', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('Let me check. ');
        onToken?.('<tool_call>read_file<arg_key>path</arg_key><arg_value>a.txt</arg_value></tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'read_file', description: 'Read file', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Read' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const blockStarts = events.filter(e => e.type === 'content_block_start');
    expect(blockStarts.length).toBeGreaterThanOrEqual(2);
    expect(blockStarts[0].content_block.type).toBe('text');
    const toolStart = blockStarts.find(e => e.content_block.type === 'tool_use');
    expect(toolStart).toBeDefined();
    expect(toolStart.index).toBeGreaterThan(0);
  });

  test('stop_reason is "tool_use" when tool calls detected', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<tool_call>test</tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'test', description: 'Test', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const msgDelta = events.find(e => e.type === 'message_delta');
    expect(msgDelta.delta.stop_reason).toBe('tool_use');
  });

  test('no tools in request still works unchanged (backward compat)', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('Hello');
        return { response: 'Hello', tokenUsage: { llmTokens: 1, vlmTokens: 0, totalTokens: 1 } } as SendPromptResult;
      }),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const types = events.map(e => e.type);
    expect(types).toEqual(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
    expect(events.find(e => e.type === 'message_delta').delta.stop_reason).toBe('end_turn');
  });

  test('tool_use id starts with "toolu_"', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<tool_call>test</tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'test', description: 'Test', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const toolStart = events.find(e => e.content_block?.type === 'tool_use');
    expect(toolStart.content_block.id).toMatch(/^toolu_/);
  });

  test('multiple tool_calls produce multiple tool_use blocks', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<tool_call>a</tool_call>');
        onToken?.('<tool_call>b</tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [
      { name: 'a', description: 'Tool A', input_schema: { type: 'object' } },
      { name: 'b', description: 'Tool B', input_schema: { type: 'object' } },
    ];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const toolStarts = events.filter(e => e.content_block?.type === 'tool_use');
    expect(toolStarts).toHaveLength(2);
    expect(toolStarts[0].content_block.name).toBe('a');
    expect(toolStarts[1].content_block.name).toBe('b');
  });
});

describe('handler — non-streaming with tool_use', () => {
  test('tool_call in response produces tool_use in response body', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockResolvedValue({
        response: '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>',
        tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 },
      } as SendPromptResult),
    });
    const tools = [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Weather?' }], tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(body.content.some((b: any) => b.type === 'tool_use')).toBe(true);
    const toolBlock = body.content.find((b: any) => b.type === 'tool_use');
    expect(toolBlock.name).toBe('get_weather');
    expect(toolBlock.input).toEqual({ city: 'London' });
    expect(toolBlock.id).toMatch(/^toolu_/);
  });

  test('non-streaming stop_reason is "tool_use" when tool calls detected', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockResolvedValue({
        response: '<tool_call>test</tool_call>',
        tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 },
      } as SendPromptResult),
    });
    const tools = [{ name: 'test', description: 'Test', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(body.stop_reason).toBe('tool_use');
  });
});

// ===== Think stripping tests =====
describe('handler — think stripping', () => {
  test('non-streaming: <think>...</think> reasoning stripped from response', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockResolvedValue({
        response: '<think>Let me think about this...</think>Hello!',
        tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 },
      } as SendPromptResult),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(body.content[0].text).toBe('Hello!');
    expect(body.content[0].text).not.toContain('think');
  });

  test('streaming with tools: think tokens stripped before parser', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<think>reasoning');
        onToken?.('</think>');
        onToken?.('<tool_call>test</tool_call>');
        return { response: '', tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'test', description: 'Test', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'x' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    expect(events.some(e => e.delta?.text?.includes('think'))).toBe(false);
    const toolStart = events.find(e => e.content_block?.type === 'tool_use');
    expect(toolStart).toBeDefined();
  });

  test('streaming without tools: think tokens stripped from output', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('<think>reasoning</think>');
        onToken?.('Hello');
        return { response: '', tokenUsage: { llmTokens: 2, vlmTokens: 0, totalTokens: 2 } } as SendPromptResult;
      }),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const deltas = events.filter(e => e.type === 'content_block_delta');
    const allText = deltas.map(d => d.delta.text).join('');
    expect(allText).not.toContain('think');
    expect(allText).toContain('Hello');
  });

  test('non-streaming: response without think block passes through immediately', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockResolvedValue({
        response: 'Just a plain answer',
        tokenUsage: { llmTokens: 3, vlmTokens: 0, totalTokens: 3 },
      } as SendPromptResult),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    expect(body.content[0].text).toBe('Just a plain answer');
  });

  test('non-streaming with tools: think block stripped before tool parsing', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockResolvedValue({
        response: '<think>I should use a tool</think><tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>',
        tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 },
      } as SendPromptResult),
    });
    const tools = [{ name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 100, messages: [{ role: 'user', content: 'Weather?' }], tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const body = JSON.parse(res._body);
    const toolBlock = body.content.find((b: any) => b.type === 'tool_use');
    expect(toolBlock).toBeDefined();
    expect(toolBlock.name).toBe('get_weather');
    const textBlocks = body.content.filter((b: any) => b.type === 'text');
    for (const tb of textBlocks) {
      expect(tb.text).not.toContain('think');
    }
  });
});

// ===== Output limit tests =====
describe('handler — output limit', () => {
  test('streaming: degenerate output truncated after max_tokens * 4 chars', async () => {
    // Simulate model generating 200 tokens of repetitive text (each ~50 chars)
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        for (let i = 0; i < 200; i++) {
          onToken?.('ls -la /home/user/some/long/path/directory\n');
        }
        return { response: '', tokenUsage: { llmTokens: 200, vlmTokens: 0, totalTokens: 200 } } as SendPromptResult;
      }),
    });
    // max_tokens=50, so char limit = 50 * 4 = 200 chars
    const req = createMockReq({ model: 'glm-4', max_tokens: 50, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    // Stream should still close properly
    const types = events.map(e => e.type);
    expect(types[types.length - 1]).toBe('message_stop');
    expect(types).toContain('message_delta');
    // Total text should be bounded — limit is max(1000, 50*4)=1000 chars
    // Last token before cutoff may partially exceed limit, so allow some margin
    const allText = events.filter(e => e.type === 'content_block_delta').map(e => e.delta.text).join('');
    expect(allText.length).toBeLessThan(200 * 43); // Not all 200 tokens
    expect(allText.length).toBeLessThanOrEqual(1100); // Within limit + one token margin
  });

  test('streaming with tools: output limit still applies', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        for (let i = 0; i < 500; i++) {
          onToken?.('repeat this text over and over again ');
        }
        return { response: '', tokenUsage: { llmTokens: 500, vlmTokens: 0, totalTokens: 500 } } as SendPromptResult;
      }),
    });
    const tools = [{ name: 'test', description: 'Test', input_schema: { type: 'object' } }];
    const req = createMockReq({ model: 'glm-4', max_tokens: 50, messages: [{ role: 'user', content: 'x' }], stream: true, tools });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const types = events.map(e => e.type);
    expect(types[types.length - 1]).toBe('message_stop');
    const allText = events.filter(e => e.type === 'content_block_delta').map(e => e.delta?.text || '').join('');
    expect(allText.length).toBeLessThan(500 * 37);
  });

  test('streaming: normal-length responses not truncated', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        onToken?.('Hello');
        onToken?.(' world');
        return { response: 'Hello world', tokenUsage: { llmTokens: 2, vlmTokens: 0, totalTokens: 2 } } as SendPromptResult;
      }),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 1000, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const deltas = events.filter(e => e.type === 'content_block_delta');
    expect(deltas).toHaveLength(2);
    expect(deltas[0].delta.text).toBe('Hello');
    expect(deltas[1].delta.text).toBe(' world');
  });

  test('streaming: stop_reason is "end_turn" even when truncated (no tool calls)', async () => {
    const bridge = createMockBridge({
      sendPrompt: vi.fn().mockImplementation(async (_p: string, onToken?: (t: string) => void) => {
        for (let i = 0; i < 100; i++) onToken?.('x'.repeat(50));
        return { response: '', tokenUsage: { llmTokens: 100, vlmTokens: 0, totalTokens: 100 } } as SendPromptResult;
      }),
    });
    const req = createMockReq({ model: 'glm-4', max_tokens: 20, messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const res = createMockRes();
    await handleMessages(req, res, bridge);
    const events = parseAllSSE(res._body);
    const msgDelta = events.find(e => e.type === 'message_delta');
    expect(msgDelta.delta.stop_reason).toBe('end_turn');
  });
});
