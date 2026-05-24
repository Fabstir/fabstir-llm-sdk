import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SessionPool } from '../../src/core/SessionPool';
import { ResponsesHandler } from '../../src/openai/responses';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

/** Sub-phase 4.6 — POST /v1/responses (full Responses-API translation, ported). */

const createdSDKs: any[] = [];
let nonStream = 'Hello';
let streamTokens: string[] = [];
let lastPrompt = '';
let lastSignal: AbortSignal | undefined;
let hangStream = false;
function createSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 7n, jobId: 7n }),
    sendPromptStreaming: vi.fn(async (sid: bigint, prompt: string, onToken: any, opts: any) => {
      lastPrompt = prompt;
      lastSignal = opts?.signal;
      if (hangStream) return new Promise<string>(() => {}); // never resolves
      if (onToken) { for (const t of streamTokens) onToken(t); return streamTokens.join(''); }
      return nonStream;
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
  return new ResponsesHandler({ pool: new SessionPool(cfg), config: { chainId: 84532, depositAmount: '1' } });
}
function jsonRes() {
  const r: any = {};
  r.status = vi.fn(() => r); r.json = vi.fn((o: any) => { r.body = o; return r; });
  r.setHeader = vi.fn(); r.write = vi.fn(); r.end = vi.fn(); r.flushHeaders = vi.fn();
  return r;
}
function streamRes() {
  const chunks: string[] = [];
  const r: any = { _chunks: chunks };
  r.setHeader = vi.fn(); r.flushHeaders = vi.fn(); r.status = vi.fn(() => r); r.json = vi.fn(() => r);
  r.write = vi.fn((d: string) => { chunks.push(d); return true; }); r.end = vi.fn();
  return r;
}
const TOOLS = [{ type: 'function', name: 'Bash', parameters: { required: ['command'] } }];

describe('responses API (4.6)', () => {
  beforeEach(() => { vi.clearAllMocks(); createdSDKs.length = 0; nonStream = 'Hello'; streamTokens = []; lastPrompt = ''; lastSignal = undefined; hangStream = false; });

  it('non-streaming string input → response shape with a message output item; instructions become system block', async () => {
    nonStream = '<think>r</think>Hi there';
    const r = jsonRes();
    await makeHandler().handle({ body: { model: 'm', input: 'hello', instructions: 'Be terse' } } as any, r);
    expect(lastPrompt).toContain('<|im_start|>system\nBe terse<|im_end|>');
    expect(lastPrompt).toContain('<|im_start|>user\nhello<|im_end|>');
    expect(r.body.object).toBe('response');
    expect(r.body.status).toBe('completed');
    expect(r.body.output[0]).toMatchObject({ type: 'message', role: 'assistant' });
    expect(r.body.output[0].content[0]).toMatchObject({ type: 'output_text', text: 'Hi there' });
  });

  it('structured input: function_call_output → observation in the ChatML prompt', async () => {
    const r = jsonRes();
    await makeHandler().handle({ body: { model: 'm', input: [
      { type: 'message', role: 'user', content: 'go' },
      { type: 'function_call_output', output: 'result-data' },
    ] } } as any, r);
    expect(lastPrompt).toContain('<|im_start|>observation\nresult-data<|im_end|>');
  });

  it('tools non-streaming → a function_call output item with name + arguments', async () => {
    nonStream = 'ok <tool_call>Bash<arg_key>command</arg_key><arg_value>ls</arg_value></tool_call>';
    const r = jsonRes();
    await makeHandler().handle({ body: { model: 'm', input: 'go', tools: TOOLS } } as any, r);
    const fc = r.body.output.find((o: any) => o.type === 'function_call');
    expect(fc).toMatchObject({ name: 'Bash', arguments: '{"command":"ls"}', status: 'completed' });
  });

  it('streaming emits Responses SSE events (created → output_text.delta → completed)', async () => {
    streamTokens = ['He', 'llo'];
    const r = streamRes();
    await makeHandler().handle({ body: { model: 'm', input: 'hi', stream: true } } as any, r);
    const names = r._chunks.filter((c: string) => c.startsWith('event: ')).map((c: string) => c.slice(7, c.indexOf('\n')));
    expect(names).toContain('response.created');
    expect(names).toContain('response.output_text.delta');
    expect(names).toContain('response.completed');
  });

  it('400 when input is missing', async () => {
    const r = jsonRes();
    await makeHandler().handle({ body: { model: 'm' } } as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('streaming aborts the underlying prompt when the client disconnects', async () => {
    hangStream = true;
    const res: any = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn(), end: vi.fn(),
      status: vi.fn(function (this: any) { return this; }), json: vi.fn(),
    });
    const p = makeHandler().handle({ body: { model: 'm', input: 'hi', stream: true } } as any, res);
    await new Promise(r => setTimeout(r, 10));
    res.emit('close');
    await new Promise(r => setTimeout(r, 10));
    expect(lastSignal?.aborted).toBe(true);
    void p;
  });
});
