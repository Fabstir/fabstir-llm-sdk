import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatCompletions } from '../src/openai-handler';
import type { IncomingMessage, ServerResponse } from 'http';
import type { SessionBridge } from '../src/session-bridge';

function createMockBridge(response = 'Hello world', onTokenFn?: (onToken: (t: string) => void) => void): SessionBridge {
  return {
    sendPrompt: vi.fn(async (prompt: string, onToken?: (t: string) => void, opts?: any) => {
      if (onToken && onTokenFn) onTokenFn(onToken);
      else if (onToken) { onToken('Hello'); onToken(' world'); }
      return { response, tokenUsage: { llmTokens: 5, vlmTokens: 0, totalTokens: 5 } };
    }),
    ensureSession: vi.fn(),
    getSessionManager: vi.fn(),
    getSessionId: vi.fn(),
  } as any;
}

function createMockReq(body: any): IncomingMessage {
  const raw = JSON.stringify(body);
  const req: any = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    on: (event: string, cb: Function) => {
      if (event === 'data') cb(raw);
      if (event === 'end') cb();
      return req;
    },
  };
  return req as IncomingMessage;
}

function createMockRes(): { res: ServerResponse; written: string[]; headers: any; statusCode: number } {
  const written: string[] = [];
  let headers: any = {};
  let statusCode = 200;
  const res: any = {
    writeHead: vi.fn((code: number, h: any) => { statusCode = code; headers = h; }),
    write: vi.fn((data: string) => { written.push(data); }),
    end: vi.fn((data?: string) => { if (data) written.push(data); }),
    flushHeaders: vi.fn(),
    get headersSent() { return false; },
  };
  return { res, written, headers: new Proxy({}, { get: (_, p) => headers[p as string] }), get statusCode() { return statusCode; } };
}

describe('Chat Handler - Streaming', () => {
  it('streaming: returns text/event-stream content type', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, headers } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    expect(headers['Content-Type']).toBe('text/event-stream');
  });

  it('streaming: first event has delta with role: "assistant"', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const firstData = written.find(w => w.startsWith('data: '));
    expect(firstData).toBeDefined();
    const parsed = JSON.parse(firstData!.replace('data: ', '').trim());
    expect(parsed.choices[0].delta.role).toBe('assistant');
  });

  it('streaming: text tokens emit content deltas', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const contentDeltas = written.filter(w => {
      if (!w.startsWith('data: ') || w.includes('[DONE]')) return false;
      try { return JSON.parse(w.replace('data: ', '').trim()).choices[0].delta.content !== undefined; } catch { return false; }
    });
    expect(contentDeltas.length).toBeGreaterThan(0);
  });

  it('streaming: final event has finish_reason: "stop"', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const finishEvents = written.filter(w => {
      if (!w.startsWith('data: ') || w.includes('[DONE]')) return false;
      try { return JSON.parse(w.replace('data: ', '').trim()).choices[0].finish_reason === 'stop'; } catch { return false; }
    });
    expect(finishEvents.length).toBe(1);
  });

  it('streaming: ends with data: [DONE]', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const lastData = written[written.length - 1];
    expect(lastData).toContain('[DONE]');
  });

  it('streaming: tool_call parsed and emitted as tool_calls delta', async () => {
    const toolResponse = '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>';
    const bridge = createMockBridge(toolResponse, (onToken) => {
      onToken(toolResponse);
    });
    const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Weather', parameters: {} } }];
    const req = createMockReq({
      model: 'test', messages: [{ role: 'user', content: 'Weather?' }], stream: true, tools,
    });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const toolDeltas = written.filter(w => {
      if (!w.startsWith('data: ') || w.includes('[DONE]')) return false;
      try { return JSON.parse(w.replace('data: ', '').trim()).choices[0].delta.tool_calls !== undefined; } catch { return false; }
    });
    expect(toolDeltas.length).toBeGreaterThan(0);
  });

  it('streaming: tool use sets finish_reason: "tool_calls"', async () => {
    const toolResponse = '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>';
    const bridge = createMockBridge(toolResponse, (onToken) => { onToken(toolResponse); });
    const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Weather', parameters: {} } }];
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Weather?' }], stream: true, tools });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const finishEvents = written.filter(w => {
      if (!w.startsWith('data: ') || w.includes('[DONE]')) return false;
      try { return JSON.parse(w.replace('data: ', '').trim()).choices[0].finish_reason === 'tool_calls'; } catch { return false; }
    });
    expect(finishEvents.length).toBe(1);
  });

  it('streaming: think blocks stripped from output', async () => {
    const bridge = createMockBridge('<think>reasoning</think>Actual answer', (onToken) => {
      onToken('<think>reasoning</think>Actual answer');
    });
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const allContent = written.filter(w => w.startsWith('data: ') && !w.includes('[DONE]'))
      .map(w => { try { return JSON.parse(w.replace('data: ', '').trim()).choices[0].delta.content; } catch { return null; } })
      .filter(Boolean).join('');
    expect(allContent).not.toContain('<think>');
    expect(allContent).toContain('Actual answer');
  });

  it('streaming: images extracted from content parts and passed to bridge', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({
      model: 'test',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
        ],
      }],
      stream: true,
    });
    const { res } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    expect(bridge.sendPrompt).toHaveBeenCalled();
    const callArgs = (bridge.sendPrompt as any).mock.calls[0];
    expect(callArgs[2]).toEqual({ images: [{ data: 'abc123', format: 'png' }] });
  });

  it('streaming: validation error returns 400 with OpenAI error format', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test' }); // missing messages
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('invalid_request_error');
  });
});

describe('Chat Handler - Non-Streaming', () => {
  it('non-streaming: returns application/json content type', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, headers } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('non-streaming: response has correct OpenAI shape (id, object, choices, usage)', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.object).toBe('chat.completion');
    expect(body.choices).toHaveLength(1);
    expect(body.usage).toBeDefined();
  });

  it('non-streaming: message has role "assistant" and content', async () => {
    const bridge = createMockBridge('Hello world');
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].message.content).toBe('Hello world');
  });

  it('non-streaming: finish_reason is "stop" for text-only response', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.choices[0].finish_reason).toBe('stop');
  });

  it('non-streaming: tool_calls included when model returns tool call', async () => {
    const toolResp = '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp);
    const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Weather', parameters: {} } }];
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Weather?' }], tools });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.choices[0].message.tool_calls).toBeDefined();
    expect(body.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
  });

  it('non-streaming: finish_reason is "tool_calls" when tools used', async () => {
    const toolResp = '<tool_call>get_weather<arg_key>city</arg_key><arg_value>London</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp);
    const tools = [{ type: 'function' as const, function: { name: 'get_weather', description: 'Weather', parameters: {} } }];
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Weather?' }], tools });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.choices[0].finish_reason).toBe('tool_calls');
  });

  it('non-streaming: think blocks stripped from response', async () => {
    const bridge = createMockBridge('<think>reasoning</think>Actual answer');
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.choices[0].message.content).toBe('Actual answer');
  });

  it('non-streaming: usage includes prompt_tokens and completion_tokens', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', messages: [{ role: 'user', content: 'Hi' }] });
    const { res, written } = createMockRes();
    await handleChatCompletions(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.completion_tokens).toBeDefined();
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
  });
});
