// POST /v1/images/generations (ported from @fabstir/openai-bridge image-handler.ts,
// Constraint 9). Transport swapped to the delegate-aware SessionPool/SessionAdapter.
import type { SessionPool } from '../core/SessionPool';
import type { OpenAIImageRequest } from './types';
import { sendOpenAIError } from './chat-completions';

const SIZE_MAP: Record<string, string> = {
  '256x256': '256x256', '512x512': '512x512', '1024x1024': '1024x1024',
  '1024x1792': '768x1024', '1792x1024': '1024x768',
};
const QUALITY_STEPS: Record<string, number> = { standard: 4, hd: 20 };

export interface ImagesConfig {
  chainId: number;
  depositAmount: string;
  paymentToken?: string;
  /** Model used to acquire an image session when the request omits `model`. */
  imageModel?: string;
}

export class ImagesHandler {
  constructor(private readonly deps: { pool: SessionPool; config: ImagesConfig }) {}

  async handle(req: any, res: any): Promise<void> {
    const body = req.body as OpenAIImageRequest;
    if (!body || !body.prompt || typeof body.prompt !== 'string') {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: prompt');
    }
    if (body.prompt.length > 2000) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Prompt must be 2000 characters or fewer');
    }
    const model = body.model || this.deps.config.imageModel;
    if (!model) {
      return sendOpenAIError(res, 400, 'invalid_request_error', 'Missing required field: model');
    }

    const n = body.n || 1;
    const size = SIZE_MAP[body.size || '1024x1024'] || '1024x1024';
    const steps = QUALITY_STEPS[body.quality || 'standard'] || 4;

    const acquire = () => this.deps.pool.acquire(model, {
      chainId: this.deps.config.chainId,
      depositAmount: this.deps.config.depositAmount,
      paymentToken: this.deps.config.paymentToken,
    });
    let { adapter, session } = await acquire();
    let holding = true; // guards against double-release if a re-acquire throws
    try {
      const data: any[] = [];
      for (let i = 0; i < n; i++) {
        try {
          const result = await adapter.generateImage(session.sessionId, body.prompt, { size, steps });
          data.push({ b64_json: result.image, revised_prompt: body.prompt });
        } catch (genErr: any) {
          const code = genErr?.code || '';
          const msg = genErr?.message || '';
          const isSessionErr = code === 'SESSION_NOT_FOUND' || code === 'SESSION_NOT_ACTIVE'
            || msg.includes('SESSION_NOT_FOUND') || msg.includes('SESSION_NOT_ACTIVE');
          if (!isSessionErr || i > 0) throw genErr;
          // Warm session expired — reset (release stale, re-acquire fresh) and retry once.
          await this.deps.pool.release(adapter, session);
          holding = false; // released; don't let finally re-release if acquire throws
          ({ adapter, session } = await acquire());
          holding = true;
          const result = await adapter.generateImage(session.sessionId, body.prompt, { size, steps });
          data.push({ b64_json: result.image, revised_prompt: body.prompt });
        }
      }
      res.status(200).json({ created: Math.floor(Date.now() / 1000), data });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'PROMPT_BLOCKED') res.status(400).json({ error: { message: err.message, type: 'invalid_request_error', code: 'content_policy_violation' } });
      else if (code === 'RATE_LIMIT_EXCEEDED') sendOpenAIError(res, 429, 'rate_limit_error', err.message);
      else if (code === 'DIFFUSION_SERVICE_UNAVAILABLE') sendOpenAIError(res, 503, 'server_error', err.message);
      else sendOpenAIError(res, 500, 'server_error', err?.message || 'Internal error');
    } finally {
      if (holding) await this.deps.pool.release(adapter, session);
    }
  }
}
