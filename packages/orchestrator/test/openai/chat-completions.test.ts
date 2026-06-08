import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import { ChatCompletionsHandler } from '../../src/openai/chat-completions';
import { OpenAIServer } from '../../src/openai/OpenAIServer';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

/**
 * Sub-phase 4.2 — POST /v1/chat/completions (non-streaming) + /v1/models + per-model queue.
 * Bypasses orchestrate(); reuses SessionPool + SessionAdapter; converter-rendered ChatML.
 */

const createdSDKs: any[] = [];
function createSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 7n, jobId: 7n }),
    sendPromptStreaming: vi.fn().mockResolvedValue('<think>reasoning</think>Hello there'),
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
function mockRes() {
  const res: any = { statusCode: 0, body: undefined, headers: {} };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((o: any) => { res.body = o; return res; });
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; });
  res.write = vi.fn(); res.end = vi.fn(); res.flushHeaders = vi.fn();
  return res;
}
const chatReq = (over: any = {}) => ({ body: { model: 'm', messages: [{ role: 'user', content: 'hi' }], ...over } });

describe('chat completions non-streaming (4.2)', () => {
  let pool: SessionPool;
  let handler: ChatCompletionsHandler;
  beforeEach(() => {
    vi.clearAllMocks(); createdSDKs.length = 0;
    pool = new SessionPool(poolConfig());
    handler = new ChatCompletionsHandler({ pool, config: { chainId: 84532, depositAmount: '1' } });
  });

  it('converts request, acquires session, calls sendPromptStreaming with rendered ChatML (not System: concat)', async () => {
    const res = mockRes();
    await handler.handle(chatReq() as any, res);
    const sdk = createdSDKs[0];
    expect(sdk._sessionManager.sendPromptStreaming).toHaveBeenCalledTimes(1);
    const prompt = sdk._sessionManager.sendPromptStreaming.mock.calls[0][1];
    expect(prompt).toContain('<|im_start|>user');
    expect(prompt.startsWith('System:')).toBe(false);
  });

  it('returns an OpenAI chat.completion shape with <think> stripped', async () => {
    const res = mockRes();
    await handler.handle(chatReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.object).toBe('chat.completion');
    expect(res.body.choices[0].message).toMatchObject({ role: 'assistant', content: 'Hello there' });
    expect(res.body.usage.total_tokens).toBeGreaterThan(0);
  });

  it('serializes two concurrent same-model requests onto one warm session (one new session created)', async () => {
    await Promise.all([handler.handle(chatReq() as any, mockRes()), handler.handle(chatReq() as any, mockRes())]);
    expect(createdSDKs.length).toBe(1); // 2nd request reuses the cached warm session
    await pool.destroy();
  });

  it('400 when messages or model missing', async () => {
    const r1 = mockRes(); await handler.handle({ body: { model: 'm' } } as any, r1);
    expect(r1.statusCode).toBe(400);
    const r2 = mockRes(); await handler.handle({ body: { messages: [{ role: 'user', content: 'x' }] } } as any, r2);
    expect(r2.statusCode).toBe(400);
  });

  it('GET /v1/models returns ModelRouter.getAvailableModels(); server owns pool/router (no OrchestratorManager)', async () => {
    const modelRouter = { getAvailableModels: vi.fn().mockReturnValue(['repo:fileA', 'repo:fileB']) } as any;
    const server = new OpenAIServer({ pool, modelRouter, config: { chainId: 84532, depositAmount: '1' } });
    const res = mockRes();
    await server.handleModels({} as any, res);
    expect(res.body.object).toBe('list');
    expect(res.body.data.map((m: any) => m.id)).toEqual(['repo:fileA', 'repo:fileB']);
    expect(server.app).toBeDefined();
  });
});

// ============= Sub-phase 3.1: per-request sampling (temperature + max_tokens) =============
// SessionAdapter wraps daemon opts as { ...opts, onTokenUsage } (+signal when streaming),
// so sendPromptStreaming arg [3] is a SUPERSET — assert with toMatchObject, never toEqual.

describe('chat completions sampling (3.1)', () => {
  let pool: SessionPool;
  let handler: ChatCompletionsHandler;
  beforeEach(() => {
    vi.clearAllMocks(); createdSDKs.length = 0;
    pool = new SessionPool(poolConfig());
    handler = new ChatCompletionsHandler({ pool, config: { chainId: 84532, depositAmount: '1' } });
  });

  const optsOf = () => createdSDKs[0]._sessionManager.sendPromptStreaming.mock.calls[0][3];

  it('folds body.temperature/max_tokens into sendPromptStreaming opts (as temperature/maxTokens)', async () => {
    await handler.handle(chatReq({ temperature: 0.1, max_tokens: 256 }) as any, mockRes());
    expect(optsOf()).toMatchObject({ temperature: 0.1, maxTokens: 256 });
  });

  it('honors temperature: 0 (not dropped as falsy)', async () => {
    await handler.handle(chatReq({ temperature: 0 }) as any, mockRes());
    expect(optsOf().temperature).toBe(0);
  });

  it('injects no sampling fields when the request omits them', async () => {
    await handler.handle(chatReq() as any, mockRes());
    const opts = optsOf();
    // Key ABSENCE (not just value undefined): the daemon must not inject sampling keys at all.
    expect(opts).not.toHaveProperty('temperature');
    expect(opts).not.toHaveProperty('maxTokens');
  });
});
