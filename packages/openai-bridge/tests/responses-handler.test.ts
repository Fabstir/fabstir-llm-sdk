import { describe, it, expect, vi } from 'vitest';
import { handleResponses } from '../src/responses-handler';
import type { IncomingMessage, ServerResponse } from 'http';
import type { SessionBridge } from '../src/session-bridge';

function createMockBridge(response = 'Hello world', onTokenFn?: (onToken: (t: string) => void) => void): SessionBridge {
  return {
    sendPrompt: vi.fn(async (prompt: string, onToken?: (t: string) => void) => {
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

/** Parse named SSE events from written data */
function parseSSEEvents(written: string[]): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  const raw = written.join('');
  const parts = raw.split('\n\n').filter(Boolean);
  for (const part of parts) {
    const lines = part.split('\n');
    let eventName = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventName = line.slice(7);
      if (line.startsWith('data: ')) dataStr = line.slice(6);
    }
    if (eventName && dataStr) {
      try { events.push({ event: eventName, data: JSON.parse(dataStr) }); } catch {}
    }
  }
  return events;
}

describe('Responses Handler - Non-Streaming', () => {
  it('returns response object with status "completed" and output array', async () => {
    const bridge = createMockBridge('Hello world');
    const req = createMockReq({ model: 'test', input: 'Hi' });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.id).toMatch(/^resp_/);
    expect(body.object).toBe('response');
    expect(body.status).toBe('completed');
    expect(body.output).toHaveLength(1);
    expect(body.output[0].type).toBe('message');
    expect(body.output[0].role).toBe('assistant');
    expect(body.output[0].content[0].type).toBe('output_text');
    expect(body.output[0].content[0].text).toBe('Hello world');
  });

  it('includes usage with input_tokens and output_tokens', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi' });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.usage.input_tokens).toBeGreaterThan(0);
    expect(body.usage.output_tokens).toBeDefined();
    expect(body.usage.total_tokens).toBe(body.usage.input_tokens + body.usage.output_tokens);
  });

  it('converts string input to user message prompt', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hello there' });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    expect(prompt).toContain('Hello there');
  });

  it('converts array input with roles to prompt', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({
      model: 'test',
      input: [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4' },
        { role: 'user', content: 'And 3+3?' },
      ],
    });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    expect(prompt).toContain('What is 2+2?');
    expect(prompt).toContain('And 3+3?');
  });

  it('includes instructions as system message in prompt', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', instructions: 'You are a pirate.' });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    expect(prompt).toContain('You are a pirate.');
  });

  it('strips think blocks from response', async () => {
    const bridge = createMockBridge('<think>reasoning</think>Actual answer');
    const req = createMockReq({ model: 'test', input: 'Hi' });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.output[0].content[0].text).toBe('Actual answer');
  });

  it('returns 400 for missing input', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test' });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('returns 503 when circuit breaker is open', async () => {
    const bridge = createMockBridge();
    (bridge as any).isCircuitOpen = () => true;
    (bridge as any).getCircuitError = () => 'Decryption failed (aead::Error)';
    const req = createMockReq({ model: 'test', input: 'Hi' });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    expect(body.error).toBeDefined();
    expect(body.error.type).toBe('server_error');
    expect(body.error.message).toContain('Circuit breaker');
  });
});

describe('Responses Handler - Streaming', () => {
  it('returns text/event-stream content type', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, headers } = createMockRes();
    await handleResponses(req, res as any, bridge);
    expect(headers['Content-Type']).toBe('text/event-stream');
  });

  it('every event data has type field matching event name', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    for (const e of events) {
      expect(e.data.type).toBe(e.event);
    }
  });

  it('every event data has sequence_number', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    for (const e of events) {
      expect(typeof e.data.sequence_number).toBe('number');
    }
  });

  it('response.created wraps data under response key', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const created = events.find(e => e.event === 'response.created')!;
    expect(created.data.response).toBeDefined();
    expect(created.data.response.status).toBe('in_progress');
    expect(created.data.response.id).toMatch(/^resp_/);
  });

  it('delta events include item_id', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const deltas = events.filter(e => e.event === 'response.output_text.delta');
    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) {
      expect(d.data.item_id).toBeDefined();
      expect(d.data.delta).toBeDefined();
    }
  });

  it('response.completed wraps data under response key with usage', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const completed = events.find(e => e.event === 'response.completed')!;
    expect(completed.data.response).toBeDefined();
    expect(completed.data.response.status).toBe('completed');
    expect(completed.data.response.usage).toBeDefined();
    expect(completed.data.response.usage.output_tokens).toBeDefined();
  });

  it('emits correct lifecycle events in order', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ model: 'test', input: 'Hi', stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const names = events.map(e => e.event);
    expect(names[0]).toBe('response.created');
    expect(names).toContain('response.in_progress');
    expect(names).toContain('response.output_item.added');
    expect(names).toContain('response.content_part.added');
    expect(names).toContain('response.output_text.done');
    expect(names).toContain('response.content_part.done');
    expect(names).toContain('response.output_item.done');
    expect(names[names.length - 1]).toBe('response.completed');
  });
});

describe('Responses Handler - Tool Calling', () => {
  it('includes tool definitions in prompt when tools provided', async () => {
    const bridge = createMockBridge();
    const tools = [{ type: 'function', name: 'Bash', description: 'Run a command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } }];
    const req = createMockReq({ model: 'test', input: 'List files', tools, stream: true });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    expect(prompt).toContain('Bash');
    expect(prompt).toContain('<tool_call>');
  });

  it('streaming: emits function_call events when model returns tool call', async () => {
    const toolResp = '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls -la</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp, (onToken) => { onToken(toolResp); });
    const tools = [{ type: 'function', name: 'Bash', description: 'Run command', parameters: {} }];
    const req = createMockReq({ model: 'test', input: 'List files', tools, stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const fcAdded = events.filter(e => e.event === 'response.output_item.added' && e.data.item?.type === 'function_call');
    expect(fcAdded.length).toBe(1);
    expect(fcAdded[0].data.item.name).toBe('Bash');
  });

  it('streaming: emits function_call_arguments.done with serialized args', async () => {
    const toolResp = '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls -la</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp, (onToken) => { onToken(toolResp); });
    const tools = [{ type: 'function', name: 'Bash', description: 'Run command', parameters: {} }];
    const req = createMockReq({ model: 'test', input: 'List files', tools, stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const argsDone = events.filter(e => e.event === 'response.function_call_arguments.done');
    expect(argsDone.length).toBe(1);
    expect(JSON.parse(argsDone[0].data.arguments)).toEqual({ command: 'ls -la' });
  });

  it('converts function_call_output items in input to observation blocks', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({
      model: 'test',
      input: [
        { role: 'user', content: 'List files' },
        { type: 'function_call', name: 'Bash', arguments: '{"command":"ls"}', call_id: 'call_1' },
        { type: 'function_call_output', call_id: 'call_1', output: 'file1.txt\nfile2.txt' },
        { role: 'user', content: 'Now delete them' },
      ],
      stream: true,
    });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    expect(prompt).toContain('observation');
    expect(prompt).toContain('file1.txt');
  });

  it('function_call history uses individual arg_key/arg_value pairs in prompt', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({
      model: 'test',
      input: [
        { role: 'user', content: 'List files' },
        { type: 'function_call', name: 'Bash', arguments: '{"command":"ls -la"}', call_id: 'call_1' },
        { type: 'function_call_output', call_id: 'call_1', output: 'file1.txt' },
      ],
    });
    const { res } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const prompt = (bridge.sendPrompt as any).mock.calls[0][0] as string;
    // Should use individual arg keys, not <arg_key>arguments</arg_key><arg_value>JSON</arg_value>
    expect(prompt).toContain('<arg_key>command</arg_key>');
    expect(prompt).toContain('<arg_value>ls -la</arg_value>');
    expect(prompt).not.toContain('<arg_key>arguments</arg_key>');
  });

  it('normalizes nested arguments key from model output to flat args', async () => {
    // Model might output: <tool_call>Bash<arg_key>arguments</arg_key><arg_value>{"command":"ls"}</arg_value></tool_call>
    const toolResp = '<tool_call>Bash<arg_key>arguments</arg_key><arg_value>{"command":"ls -la"}</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp, (onToken) => { onToken(toolResp); });
    const tools = [{ type: 'function', name: 'Bash', description: 'Run command', parameters: {} }];
    const req = createMockReq({ model: 'test', input: 'List files', tools, stream: true });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const events = parseSSEEvents(written);
    const argsDone = events.filter(e => e.event === 'response.function_call_arguments.done');
    expect(argsDone.length).toBe(1);
    // Should unwrap nested arguments to top-level
    expect(JSON.parse(argsDone[0].data.arguments)).toEqual({ command: 'ls -la' });
  });

  it('normalizes nested arguments key in non-streaming mode', async () => {
    const toolResp = '<tool_call>Bash<arg_key>arguments</arg_key><arg_value>{"command":"pwd"}</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp);
    const tools = [{ type: 'function', name: 'Bash', description: 'Run command', parameters: {} }];
    const req = createMockReq({ model: 'test', input: 'Where am I?', tools });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    const fcItems = body.output.filter((o: any) => o.type === 'function_call');
    expect(fcItems.length).toBe(1);
    expect(JSON.parse(fcItems[0].arguments)).toEqual({ command: 'pwd' });
  });

  it('non-streaming: returns function_call output items when model uses tools', async () => {
    const toolResp = '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>';
    const bridge = createMockBridge(toolResp);
    const tools = [{ type: 'function', name: 'Bash', description: 'Run command', parameters: {} }];
    const req = createMockReq({ model: 'test', input: 'List files', tools });
    const { res, written } = createMockRes();
    await handleResponses(req, res as any, bridge);
    const body = JSON.parse(written[0]);
    const fcItems = body.output.filter((o: any) => o.type === 'function_call');
    expect(fcItems.length).toBe(1);
    expect(fcItems[0].name).toBe('Bash');
    expect(JSON.parse(fcItems[0].arguments)).toEqual({ command: 'ls' });
  });
});
