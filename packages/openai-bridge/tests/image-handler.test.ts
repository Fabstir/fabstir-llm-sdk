import { describe, it, expect, vi } from 'vitest';
import { handleImageGeneration } from '../src/image-handler';
import type { IncomingMessage, ServerResponse } from 'http';

function createMockBridge(imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'): any {
  const mockSessionManager = {
    generateImage: vi.fn().mockResolvedValue({ image: imageBase64 }),
  };
  return {
    ensureSession: vi.fn().mockResolvedValue(42n),
    getSessionManager: vi.fn().mockReturnValue(mockSessionManager),
    getSessionId: vi.fn().mockReturnValue(42n),
  };
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

function createMockRes() {
  const s = { written: [] as string[], statusCode: 200, headers: {} as any };
  const res: any = {
    writeHead: vi.fn((code: number, h: any) => { s.statusCode = code; s.headers = h; }),
    write: vi.fn((data: string) => { s.written.push(data); }),
    end: vi.fn((data?: string) => { if (data) s.written.push(data); }),
  };
  return { res, s };
}

describe('Image Handler', () => {
  it('successful generation returns OpenAI image response shape', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'A cat in space' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const body = JSON.parse(s.written[0]);
    expect(body.created).toBeDefined();
    expect(body.data).toHaveLength(1);
  });

  it('response includes created timestamp and data array', async () => {
    const bridge = createMockBridge();
    const before = Math.floor(Date.now() / 1000);
    const req = createMockReq({ prompt: 'Test' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const body = JSON.parse(s.written[0]);
    expect(body.created).toBeGreaterThanOrEqual(before);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('data[0] has b64_json and revised_prompt', async () => {
    const bridge = createMockBridge('base64imagedata');
    const req = createMockReq({ prompt: 'A mountain' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const body = JSON.parse(s.written[0]);
    expect(body.data[0].b64_json).toBe('base64imagedata');
    expect(body.data[0].revised_prompt).toBe('A mountain');
  });

  it('passes sessionId as string to generateImage (not bigint)', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(typeof genCall[0]).toBe('string');
    expect(genCall[0]).toBe('42');
  });

  it('default size is 1024x1024', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(genCall[2].size).toBe('1024x1024');
  });

  it('maps quality "standard" to 4 steps', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test', quality: 'standard' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(genCall[2].steps).toBe(4);
  });

  it('maps quality "hd" to 20 steps', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test', quality: 'hd' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(genCall[2].steps).toBe(20);
  });

  it('maps OpenAI size 1024x1792 to Fabstir 768x1024', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test', size: '1024x1792' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(genCall[2].size).toBe('768x1024');
  });

  it('maps OpenAI size 1792x1024 to Fabstir 1024x768', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test', size: '1792x1024' });
    const { res } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const genCall = bridge.getSessionManager().generateImage.mock.calls[0];
    expect(genCall[2].size).toBe('1024x768');
  });

  it('n=2 returns 2 images in data array', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'Test', n: 2 });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    const body = JSON.parse(s.written[0]);
    expect(body.data).toHaveLength(2);
    expect(bridge.getSessionManager().generateImage).toHaveBeenCalledTimes(2);
  });

  it('missing prompt returns 400 error', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({});
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(400);
    const body = JSON.parse(s.written[0]);
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('prompt exceeding 2000 chars returns 400 error', async () => {
    const bridge = createMockBridge();
    const req = createMockReq({ prompt: 'x'.repeat(2001) });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(400);
    const body = JSON.parse(s.written[0]);
    expect(body.error.message).toContain('2000');
  });

  it('PROMPT_BLOCKED error returns 400 with content_policy_violation', async () => {
    const bridge = createMockBridge();
    const err = new Error('PROMPT_BLOCKED');
    (err as any).code = 'PROMPT_BLOCKED';
    bridge.getSessionManager().generateImage.mockRejectedValueOnce(err);
    const req = createMockReq({ prompt: 'Bad content' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(400);
    const body = JSON.parse(s.written[0]);
    expect(body.error.code).toBe('content_policy_violation');
  });

  it('RATE_LIMIT_EXCEEDED error returns 429', async () => {
    const bridge = createMockBridge();
    const err = new Error('RATE_LIMIT_EXCEEDED');
    (err as any).code = 'RATE_LIMIT_EXCEEDED';
    bridge.getSessionManager().generateImage.mockRejectedValueOnce(err);
    const req = createMockReq({ prompt: 'Test' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(429);
  });

  it('DIFFUSION_SERVICE_UNAVAILABLE error returns 503', async () => {
    const bridge = createMockBridge();
    const err = new Error('DIFFUSION_SERVICE_UNAVAILABLE');
    (err as any).code = 'DIFFUSION_SERVICE_UNAVAILABLE';
    bridge.getSessionManager().generateImage.mockRejectedValueOnce(err);
    const req = createMockReq({ prompt: 'Test' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(503);
  });

  it('SESSION_NOT_FOUND retries with new session and string sessionId', async () => {
    const mockSessionManager = {
      generateImage: vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' }))
        .mockResolvedValueOnce({ image: 'retried_image_data' }),
    };
    let sessionCounter = 0n;
    const bridge: any = {
      ensureSession: vi.fn().mockResolvedValue(42n),
      getSessionManager: vi.fn().mockReturnValue(mockSessionManager),
      getSessionId: vi.fn().mockReturnValue(42n),
      resetSession: vi.fn(async () => {
        sessionCounter++;
        bridge.getSessionId.mockReturnValue(42n + sessionCounter);
        return 42n + sessionCounter;
      }),
    };
    const req = createMockReq({ prompt: 'A cat' });
    const { res, s } = createMockRes();
    await handleImageGeneration(req, res as any, bridge);
    expect(s.statusCode).toBe(200);
    const body = JSON.parse(s.written[0]);
    expect(body.data[0].b64_json).toBe('retried_image_data');
    expect(bridge.resetSession).toHaveBeenCalled();
    // Verify both calls received string sessionIds
    const calls = mockSessionManager.generateImage.mock.calls;
    expect(typeof calls[0][0]).toBe('string');
    expect(typeof calls[1][0]).toBe('string');
    expect(calls[1][0]).toBe('43'); // 42n + 1n = 43n → "43"
  });
});
