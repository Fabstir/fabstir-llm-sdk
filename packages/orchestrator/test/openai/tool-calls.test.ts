import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import { ChatCompletionsHandler } from '../../src/openai/chat-completions';
import { convertOpenAIMessages } from '../../src/openai/converter';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

/** Sub-phase 4.4 — tool-call translation (non-streaming + streaming buffered emit). */

const createdSDKs: any[] = [];
let nonStreamResponse = 'plain';
let streamTokens: string[] = [];
function createSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 7n, jobId: 7n }),
    sendPromptStreaming: vi.fn(async (sid: bigint, p: string, onToken: any) => {
      if (onToken) { for (const t of streamTokens) onToken(t); return streamTokens.join(''); }
      return nonStreamResponse;
    }),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    getPaymentManager: vi.fn().mockReturnValue({ completeSessionJob: vi.fn().mockResolvedValue({}) }),
    getModelManager: vi.fn().mockReturnValue({}),
    authenticate: vi.fn().mockResolvedValue(undefined),
    _sessionManager: sessionManager,
  };
}
vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => { const s = createSDK(); createdSDKs.push(s); return s; }),
}));

const budget: BudgetConfig = { maxDepositPerSubTask: '1', maxTotalDeposit: '1000', maxSubTasks: 100 };
function makeHandler() {
  const cfg: OrchestratorConfig = { sdk: createSDK() as any, chainId: 84532, privateKey: '0xabc', models: { fast: 'm' }, maxConcurrentSessions: 2, budget, proofGracePeriodMs: 0 };
  return new ChatCompletionsHandler({ pool: new SessionPool(cfg), config: { chainId: 84532, depositAmount: '1' } });
}
function jsonRes() {
  const res: any = { headers: {} };
  res.status = vi.fn(() => res); res.json = vi.fn((o: any) => { res.body = o; return res; });
  res.setHeader = vi.fn(); res.write = vi.fn(); res.end = vi.fn(); res.flushHeaders = vi.fn();
  return res;
}
function streamRes() {
  const chunks: string[] = [];
  const res: any = { headers: {}, _chunks: chunks };
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; }); res.flushHeaders = vi.fn();
  res.write = vi.fn((d: string) => { chunks.push(d); return true; }); res.end = vi.fn();
  res.status = vi.fn(() => res); res.json = vi.fn(() => res);
  return res;
}
const TOOLS = [{ type: 'function', function: { name: 'Bash', description: 'run', parameters: { required: ['command'] } } }];
const req = (over: any = {}) => ({ body: { model: 'm', tools: TOOLS, messages: [{ role: 'user', content: 'go' }], ...over } });

describe('tool-call translation (4.4)', () => {
  beforeEach(() => { vi.clearAllMocks(); createdSDKs.length = 0; });

  it('non-streaming: a tool call becomes choices[0].message.tool_calls + finish_reason tool_calls', async () => {
    nonStreamResponse = 'Let me run <tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>';
    const res = jsonRes();
    await makeHandler().handle(req() as any, res);
    const choice = res.body.choices[0];
    expect(choice.finish_reason).toBe('tool_calls');
    expect(choice.message.tool_calls).toHaveLength(1);
    expect(choice.message.tool_calls[0].function).toMatchObject({ name: 'Bash', arguments: '{"command":"ls"}' });
    expect(choice.message.content).toBe('Let me run ');
  });

  it('streaming: emits text deltas then a buffered tool-call delta (not char-by-char) then [DONE]', async () => {
    streamTokens = ['Run ', 'now <tool_call>Bash<arg_key>command</arg_key>', '<arg_value>ls</arg_value></tool_call>'];
    const res = streamRes();
    await makeHandler().handle(req({ stream: true }) as any, res);
    const parsed = res._chunks.filter((c: string) => !c.includes('[DONE]')).map((c: string) => JSON.parse(c.replace(/^data: /, '').trim()));
    const toolHead = parsed.find(d => d.choices[0]?.delta?.tool_calls?.[0]?.id);
    const toolArgs = parsed.find(d => d.choices[0]?.delta?.tool_calls?.[0]?.function?.arguments);
    expect(toolHead.choices[0].delta.tool_calls[0].function.name).toBe('Bash');
    expect(toolArgs.choices[0].delta.tool_calls[0].function.arguments).toBe('{"command":"ls"}');
    const finish = parsed.find(d => d.choices[0]?.finish_reason);
    expect(finish.choices[0].finish_reason).toBe('tool_calls');
    expect(res._chunks[res._chunks.length - 1]).toBe('data: [DONE]\n\n');
  });

  it('a role:tool result round-trips into ChatML observation', async () => {
    const { prompt } = await convertOpenAIMessages([
      { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'Bash', arguments: '{"command":"ls"}' } }] },
      { role: 'tool', content: 'a\nb', tool_call_id: 'c1' },
    ]);
    expect(prompt).toContain('<|im_start|>observation\na\nb\n<|im_end|>');
  });

  it('non-streaming: normalizes a mis-cased tool name back to the request casing (OpenCode "Bash" vs "bash")', async () => {
    nonStreamResponse = '<tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>';
    const lowerTools = [{ type: 'function', function: { name: 'bash', parameters: { required: ['command'] } } }];
    const res = jsonRes();
    await makeHandler().handle(req({ tools: lowerTools }) as any, res);
    expect(res.body.choices[0].message.tool_calls[0].function.name).toBe('bash');
  });

  it('non-streaming: strips a stray <tool_call> tag glued onto the emitted name (OpenCode "<tool_call>write")', async () => {
    // Model doubles the open tag; the parser keeps the inner one inside the name.
    nonStreamResponse = '<tool_call><tool_call>write<arg_key>path</arg_key><arg_value>todo.html</arg_value></tool_call>';
    const writeTools = [{ type: 'function', function: { name: 'write', parameters: { required: ['path'] } } }];
    const res = jsonRes();
    await makeHandler().handle(req({ tools: writeTools }) as any, res);
    expect(res.body.choices[0].message.tool_calls[0].function.name).toBe('write');
  });

  it('streaming: normalizes a mis-cased tool name in the emitted delta', async () => {
    streamTokens = ['<tool_call>Bash<arg_key>command</arg_key>', '<arg_value>ls</arg_value></tool_call>'];
    const lowerTools = [{ type: 'function', function: { name: 'bash', parameters: { required: ['command'] } } }];
    const res = streamRes();
    await makeHandler().handle(req({ stream: true, tools: lowerTools }) as any, res);
    const parsed = res._chunks.filter((c: string) => !c.includes('[DONE]')).map((c: string) => JSON.parse(c.replace(/^data: /, '').trim()));
    const toolHead = parsed.find(d => d.choices[0]?.delta?.tool_calls?.[0]?.function?.name);
    expect(toolHead.choices[0].delta.tool_calls[0].function.name).toBe('bash');
  });

  it('malformed <tool_call> is surfaced as text (no crash)', async () => {
    nonStreamResponse = 'before <tool_call></tool_call> after';
    const res = jsonRes();
    await makeHandler().handle(req() as any, res);
    expect(res.body.choices[0].finish_reason).toBe('stop');
    expect(res.body.choices[0].message.content).toContain('<tool_call></tool_call>');
  });
});
