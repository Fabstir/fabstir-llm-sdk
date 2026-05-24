import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPool } from '../../src/core/SessionPool';
import { ImagesHandler } from '../../src/openai/images';
import { SessionAdapter } from '../../src/core/SessionAdapter';
import type { OrchestratorConfig, BudgetConfig } from '../../src/types';

/** Sub-phase 4.5 — POST /v1/images/generations (ported from image-handler.ts). */

const createdSDKs: any[] = [];
let genImpl: (sid: string, prompt: string, opts: any) => Promise<any> =
  async () => ({ image: 'BASE64IMG' });
function createSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 7n, jobId: 7n }),
    sendPromptStreaming: vi.fn().mockResolvedValue('x'),
    endSession: vi.fn().mockResolvedValue(undefined),
    generateImage: vi.fn((sid: string, prompt: string, opts: any) => genImpl(sid, prompt, opts)),
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
  return new ImagesHandler({ pool: new SessionPool(cfg), config: { chainId: 84532, depositAmount: '1', imageModel: 'img-model' } });
}
function res() {
  const r: any = {};
  r.status = vi.fn(() => r); r.json = vi.fn((o: any) => { r.body = o; return r; });
  return r;
}
const req = (over: any = {}) => ({ body: { prompt: 'a cat', ...over } });

describe('images/generations (4.5)', () => {
  beforeEach(() => { vi.clearAllMocks(); createdSDKs.length = 0; genImpl = async () => ({ image: 'BASE64IMG' }); });

  it('calls generateImage(sessionId, prompt, {size, steps}) and returns OpenAI image shape', async () => {
    const r = res();
    await makeHandler().handle(req() as any, r);
    const gi = createdSDKs[0]._sessionManager.generateImage;
    expect(gi).toHaveBeenCalledWith('7', 'a cat', { size: '1024x1024', steps: 4 });
    expect(r.body.data).toEqual([{ b64_json: 'BASE64IMG', revised_prompt: 'a cat' }]);
    expect(r.body.created).toBeGreaterThan(0);
  });

  it('maps size + quality (hd→20 steps) and produces n images', async () => {
    const r = res();
    await makeHandler().handle(req({ quality: 'hd', size: '1024x1792', n: 3 }) as any, r);
    const gi = createdSDKs[0]._sessionManager.generateImage;
    expect(gi).toHaveBeenCalledWith('7', 'a cat', { size: '768x1024', steps: 20 });
    expect(r.body.data).toHaveLength(3);
  });

  it('rejects a prompt over 2000 chars with 400', async () => {
    const r = res();
    await makeHandler().handle(req({ prompt: 'x'.repeat(2001) }) as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('maps generation errors: PROMPT_BLOCKED→400, RATE_LIMIT_EXCEEDED→429, DIFFUSION_SERVICE_UNAVAILABLE→503', async () => {
    for (const [code, status] of [['PROMPT_BLOCKED', 400], ['RATE_LIMIT_EXCEEDED', 429], ['DIFFUSION_SERVICE_UNAVAILABLE', 503]] as const) {
      genImpl = async () => { const e: any = new Error(code); e.code = code; throw e; };
      const r = res();
      await makeHandler().handle(req() as any, r);
      expect(r.status).toHaveBeenCalledWith(status);
    }
  });

  it('resets + retries once when the (warm) session is stale on the first image', async () => {
    let calls = 0;
    genImpl = async () => {
      calls++;
      if (calls === 1) { const e: any = new Error('SESSION_NOT_FOUND'); e.code = 'SESSION_NOT_FOUND'; throw e; }
      return { image: 'RECOVERED' };
    };
    const r = res();
    await makeHandler().handle(req() as any, r);
    expect(calls).toBe(2); // first failed (stale), retried on a fresh session
    expect(r.body.data).toEqual([{ b64_json: 'RECOVERED', revised_prompt: 'a cat' }]);
  });

  it('does NOT double-release the pool slot when the reset re-acquire fails', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    let acquireCalls = 0;
    const acquire = vi.fn(async () => {
      acquireCalls++;
      if (acquireCalls === 2) throw new Error('pool exhausted'); // re-acquire fails
      return { adapter: { generateImage: async () => { const e: any = new Error('SESSION_NOT_FOUND'); e.code = 'SESSION_NOT_FOUND'; throw e; } }, session: { sessionId: 7n } };
    });
    const handler = new ImagesHandler({ pool: { acquire, release } as any, config: { chainId: 84532, depositAmount: '1', imageModel: 'img-model' } });
    const r = res();
    await handler.handle(req() as any, r);
    expect(release).toHaveBeenCalledTimes(1); // released the stale session once, not twice
    expect(r.status).toHaveBeenCalledWith(500); // re-acquire failure surfaced
  });

  it('PROMPT_BLOCKED maps to 400 with content_policy_violation code', async () => {
    genImpl = async () => { const e: any = new Error('blocked'); e.code = 'PROMPT_BLOCKED'; throw e; };
    const r = res();
    await makeHandler().handle(req() as any, r);
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.body.error.code).toBe('content_policy_violation');
  });

  it('SessionAdapter.generateImage delegates to SessionManager.generateImage (string id)', async () => {
    const sdk = createSDK();
    const adapter = new SessionAdapter(sdk as any);
    await adapter.generateImage(7n, 'a cat', { size: '512x512', steps: 4 });
    expect(sdk._sessionManager.generateImage).toHaveBeenCalledWith('7', 'a cat', { size: '512x512', steps: 4 });
  });
});
