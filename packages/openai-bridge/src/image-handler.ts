import { IncomingMessage, ServerResponse } from 'http';
import type { OpenAIImageRequest } from './types';
import type { SessionBridge } from './session-bridge';

const SIZE_MAP: Record<string, string> = {
  '256x256': '256x256', '512x512': '512x512', '1024x1024': '1024x1024',
  '1024x1792': '768x1024', '1792x1024': '1024x768',
};

const QUALITY_STEPS: Record<string, number> = { standard: 4, hd: 20 };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: string | Buffer) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, type: string, message: string, code?: string): void {
  const error: any = { message, type };
  if (code) error.code = code;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error }));
}

export async function handleImageGeneration(
  req: IncomingMessage, res: ServerResponse, bridge: SessionBridge
): Promise<void> {
  let body: OpenAIImageRequest;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, 'invalid_request_error', 'Invalid JSON body');
    return;
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    sendError(res, 400, 'invalid_request_error', 'Missing required field: prompt');
    return;
  }
  if (body.prompt.length > 2000) {
    sendError(res, 400, 'invalid_request_error', 'Prompt must be 2000 characters or fewer');
    return;
  }

  const n = body.n || 1;
  const size = SIZE_MAP[body.size || '1024x1024'] || '1024x1024';
  const steps = QUALITY_STEPS[body.quality || 'standard'] || 4;

  try {
    await bridge.ensureSession();
    const sessionManager = bridge.getSessionManager();
    // generateImage() expects string sessionId (sessions map uses string keys)
    // but bridge.getSessionId() returns bigint — must convert
    let sessionId = bridge.getSessionId()!.toString();
    const data: any[] = [];

    for (let i = 0; i < n; i++) {
      try {
        const result = await sessionManager.generateImage(sessionId, body.prompt, { size, steps });
        data.push({ b64_json: result.image, revised_prompt: body.prompt });
      } catch (genErr: any) {
        const code = genErr?.code || '';
        const msg = genErr?.message || '';
        const isSessionErr = code === 'SESSION_NOT_FOUND' || code === 'SESSION_NOT_ACTIVE'
          || msg.includes('SESSION_NOT_FOUND') || msg.includes('SESSION_NOT_ACTIVE');
        if (!isSessionErr || i > 0) throw genErr;
        // Session expired — reset and retry
        const newId = await bridge.resetSession();
        sessionId = newId.toString();
        const result = await sessionManager.generateImage(sessionId, body.prompt, { size, steps });
        data.push({ b64_json: result.image, revised_prompt: body.prompt });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ created: Math.floor(Date.now() / 1000), data }));
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'PROMPT_BLOCKED') {
      sendError(res, 400, 'invalid_request_error', err.message, 'content_policy_violation');
    } else if (code === 'RATE_LIMIT_EXCEEDED') {
      sendError(res, 429, 'rate_limit_error', err.message);
    } else if (code === 'DIFFUSION_SERVICE_UNAVAILABLE') {
      sendError(res, 503, 'server_error', err.message);
    } else {
      sendError(res, 500, 'server_error', err.message || 'Internal error');
    }
  }
}
