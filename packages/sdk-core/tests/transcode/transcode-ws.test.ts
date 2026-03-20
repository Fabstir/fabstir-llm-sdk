import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTranscodeWs, cancelTranscodeWs } from '../../src/utils/transcode-ws';
import type { VideoFormat } from '../../src/types/transcode.types';

const makeMocks = () => {
  let handler: (data: any) => void;
  return {
    messageHandler: (d: any) => handler(d),
    ws: {
      sendWithoutResponse: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn((h: (d: any) => void) => { handler = h; return vi.fn(); }),
    },
    enc: {
      encryptMessage: vi.fn((_k: Uint8Array, pt: string, _i: number) => ({ ciphertextHex: 'encrypted-' + pt, nonceHex: 'n', aadHex: 'a' })),
      decryptMessage: vi.fn((_k: Uint8Array, p: any) => (p.ciphertextHex as string).replace('encrypted-', '')),
    },
  };
};

const baseOpts = (ws: any, enc: any, extra: Record<string, unknown> = {}) => ({
  wsClient: ws, encryptionManager: enc, sessionId: 'sess-1', sessionKey: new Uint8Array(32),
  messageIndex: { value: 0 }, sourceCid: 'uEiBmSrc', formats: [{ id: 1, ext: 'mp4', vcodec: 'libx264' }] as VideoFormat[],
  timeoutMs: 2000, ...extra,
});

const encResp = (obj: any) => ({ type: 'encrypted_response', payload: { ciphertextHex: 'encrypted-' + JSON.stringify(obj) } });

const completeMsgBase = { type: 'transcode_complete', taskId: 'task-1', outputs: [{ id: 1, ext: 'mp4', cid: 'uOut' }], billing: { units: 60, tokens: 60000 }, duration: 120.5 };

describe('submitTranscodeWs', () => {
  let m: ReturnType<typeof makeMocks>;
  beforeEach(() => { m = makeMocks(); });

  it('encrypts inner payload with action "transcode"', async () => {
    submitTranscodeWs(baseOpts(m.ws, m.enc, { timeoutMs: 500 }));
    await vi.waitFor(() => expect(m.enc.encryptMessage).toHaveBeenCalled());
    const parsed = JSON.parse(m.enc.encryptMessage.mock.calls[0][1]);
    expect(parsed.action).toBe('transcode');
    expect(parsed.source_cid).toBe('uEiBmSrc');
    expect(parsed.formats).toEqual([{ id: 1, ext: 'mp4', vcodec: 'libx264' }]);
  });

  it('sends encrypted_message envelope with session_id', async () => {
    submitTranscodeWs(baseOpts(m.ws, m.enc, { timeoutMs: 500 }));
    await vi.waitFor(() => expect(m.ws.sendWithoutResponse).toHaveBeenCalled());
    const env = m.ws.sendWithoutResponse.mock.calls[0][0];
    expect(env.type).toBe('encrypted_message');
    expect(env.session_id).toBe('sess-1');
    expect(env.payload).toBeDefined();
  });

  it('resolves handle.taskId on transcode_accepted', async () => {
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc));
    m.messageHandler(encResp({ type: 'transcode_accepted', taskId: 'task-1' }));
    expect(h.taskId).toBe('task-1');
  });

  it('calls onProgress with progress and gopInfo', async () => {
    const onProgress = vi.fn();
    await submitTranscodeWs(baseOpts(m.ws, m.enc, { onProgress }));
    m.messageHandler(encResp({ type: 'transcode_progress', taskId: 'task-1', progress: 45, gopInfo: { current_gop: 27, total_gops: 60, elapsed_seconds: 18.5 } }));
    expect(onProgress).toHaveBeenCalledWith(45, { currentGop: 27, totalGops: 60, elapsedSeconds: 18.5 });
  });

  it('resolves handle.result on transcode_complete', async () => {
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc));
    m.messageHandler(encResp({ ...completeMsgBase, qualityMetrics: null, proofTreeCID: null, proofTreeRootHash: null }));
    const r = await h.result;
    expect(r.taskId).toBe('task-1');
    expect(r.outputs).toHaveLength(1);
    expect(r.billing).toEqual({ units: 60, tokens: 60000 });
    expect(r.duration).toBe(120.5);
  });

  it('includes qualityMetrics, proofTreeCID, proofTreeRootHash in result', async () => {
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc));
    m.messageHandler(encResp({ ...completeMsgBase, qualityMetrics: { psnr_db: 42.3, ssim: 0.96, actual_bitrate: 4850 }, proofTreeCID: 'uProof', proofTreeRootHash: '0xa1b2' }));
    const r = await h.result;
    expect(r.qualityMetrics).toBeDefined();
    expect(r.proofTreeCID).toBe('uProof');
    expect(r.proofTreeRootHash).toBe('0xa1b2');
  });

  it('rejects on transcode_error', async () => {
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc));
    m.messageHandler(encResp({ type: 'transcode_error', taskId: 'task-1', error: 'Codec not supported', code: 'CODEC_ERROR' }));
    await expect(h.result).rejects.toThrow('Codec not supported');
  });

  it('maps snake_case wire format to camelCase SDK types', async () => {
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc));
    m.messageHandler(encResp({ ...completeMsgBase, qualityMetrics: { psnr_db: 42.3, ssim: 0.96, actual_bitrate: 4850 }, proofTreeCID: null, proofTreeRootHash: null }));
    const r = await h.result;
    expect(r.qualityMetrics!.psnrDB).toBe(42.3);
    expect(r.qualityMetrics!.ssim).toBe(0.96);
    expect(r.qualityMetrics!.actualBitrate).toBe(4850);
  });

  it('sets isEncrypted default to true', async () => {
    submitTranscodeWs(baseOpts(m.ws, m.enc, { timeoutMs: 500 }));
    await vi.waitFor(() => expect(m.enc.encryptMessage).toHaveBeenCalled());
    const parsed = JSON.parse(m.enc.encryptMessage.mock.calls[0][1]);
    expect(parsed.is_encrypted).toBe(true);
  });
});

describe('cancelTranscodeWs', () => {
  it('sends plaintext transcode_cancel', () => {
    const ws = { sendWithoutResponse: vi.fn().mockResolvedValue(undefined), onMessage: vi.fn(() => vi.fn()) };
    cancelTranscodeWs(ws, 'sess-xyz');
    expect(ws.sendWithoutResponse).toHaveBeenCalledWith({ type: 'transcode_cancel', session_id: 'sess-xyz' });
  });
});

describe('handle.cancel()', () => {
  it('calls cancelTranscodeWs', async () => {
    const m = makeMocks();
    const h = await submitTranscodeWs(baseOpts(m.ws, m.enc, { sessionId: 'sess-cancel' }));
    h.cancel();
    const cancelCall = m.ws.sendWithoutResponse.mock.calls.find((c: any[]) => c[0].type === 'transcode_cancel');
    expect(cancelCall).toBeDefined();
    expect(cancelCall![0].session_id).toBe('sess-cancel');
  });
});
