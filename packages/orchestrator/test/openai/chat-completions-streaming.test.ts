import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SessionPool } from '../../src/core/SessionPool';
import { ChatCompletionsHandler } from '../../src/openai/chat-completions';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

/** Sub-phase 4.3 — SSE streaming for chat completions. */

const createdSDKs: any[] = [];
let streamImpl: (onToken: (t: string) => void, opts: any) => Promise<string> =
  async (onToken) => { onToken('<think>r</think>Hel'); onToken('lo'); return 'Hello'; };

function createSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 7n, jobId: 7n }),
    sendPromptStreaming: vi.fn((sid: bigint, prompt: string, onToken: any, opts: any) => streamImpl(onToken, opts)),
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
function poolConfig(): OrchestratorConfig {
  return { sdk: createSDK() as any, chainId: 84532, privateKey: '0xabc', models: { fast: 'm' }, maxConcurrentSessions: 2, budget, proofGracePeriodMs: 0 };
}
function streamRes() {
  const chunks: string[] = [];
  const res: any = { headers: {} };
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; });
  res.flushHeaders = vi.fn();
  res.write = vi.fn((d: string) => { chunks.push(d); return true; });
  res.end = vi.fn();
  res.status = vi.fn(() => res); res.json = vi.fn(() => res);
  res._chunks = chunks;
  return res;
}
function deltas(res: any) {
  return res._chunks.filter((c: string) => c.startsWith('data: ') && !c.includes('[DONE]'))
    .map((c: string) => JSON.parse(c.replace(/^data: /, '').trim()));
}
const streamReq = () => Object.assign(new EventEmitter(), { body: { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] } });

describe('chat completions streaming (4.3)', () => {
  let handler: ChatCompletionsHandler;
  beforeEach(() => {
    vi.clearAllMocks(); createdSDKs.length = 0;
    streamImpl = async (onToken) => { onToken('<think>r</think>Hel'); onToken('lo'); return 'Hello'; };
    handler = new ChatCompletionsHandler({ pool: new SessionPool(poolConfig()), config: { chainId: 84532, depositAmount: '1' } });
  });

  it('emits ordered content-delta chunks (post think-strip) and terminates with [DONE]', async () => {
    const res = streamRes();
    await handler.handle(streamReq() as any, res);
    expect(res.headers['Content-Type']).toBe('text/event-stream');
    const contentDeltas = deltas(res).map(d => d.choices[0]?.delta?.content).filter(Boolean);
    expect(contentDeltas).toEqual(['Hel', 'lo']);
    expect(res._chunks[res._chunks.length - 1]).toBe('data: [DONE]\n\n');
  });

  it('emits a usage chunk when token usage is available', async () => {
    const res = streamRes();
    await handler.handle(streamReq() as any, res);
    const usageChunk = deltas(res).find(d => d.usage);
    expect(usageChunk).toBeTruthy();
    expect(usageChunk.usage.total_tokens).toBeGreaterThan(0);
  });

  it('aborts the underlying prompt when the client disconnects', async () => {
    let capturedSignal: AbortSignal | undefined;
    streamImpl = (onToken, opts) => { capturedSignal = opts?.signal; return new Promise<string>(() => {}); }; // never resolves
    const req = streamReq();
    const res = streamRes();
    const p = handler.handle(req as any, res);
    await new Promise(r => setTimeout(r, 10));
    req.emit('close');
    await new Promise(r => setTimeout(r, 10));
    expect(capturedSignal?.aborted).toBe(true);
    void p;
  });
});
