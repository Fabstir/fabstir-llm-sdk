import { describe, it, expect, vi } from 'vitest';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { TranscodeError } from '../../src/errors/transcode-errors';

function createMocks() {
  const handlers: ((data: any) => void)[] = [];
  return {
    wsClient: { sendWithoutResponse: vi.fn().mockResolvedValue(undefined), onMessage: vi.fn((h: any) => { handlers.push(h); return () => {}; }) },
    encryptionManager: { encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: 'a', nonceHex: 'b', aadHex: 'c' }), decryptMessage: vi.fn() },
    emit: (d: any) => handlers.forEach(h => h(d)),
  };
}
const mkOpts = (m: ReturnType<typeof createMocks>, extra: Record<string, unknown> = {}) => ({
  wsClient: m.wsClient, encryptionManager: m.encryptionManager, sessionId: 'sess-1',
  sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: 'cid-1',
  formats: [{ id: 1, ext: 'mp4' }], timeoutMs: 500, ...extra,
});
const encResp = () => ({ type: 'encrypted_response', payload: { ciphertextHex: 'x' } });

describe('transcode-ws TranscodeError integration', () => {
  it('transcode_error with object code TRANSCODE_CAPACITY_FULL maps to CAPACITY_FULL', async () => {
    const m = createMocks();
    m.encryptionManager.decryptMessage.mockReturnValue(JSON.stringify({ type: 'transcode_error', error: { code: 'TRANSCODE_CAPACITY_FULL', message: 'No slots' } }));
    const h = await submitTranscodeWs(mkOpts(m));
    m.emit(encResp());
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('CAPACITY_FULL'); expect(e.isRetryable).toBe(true); }
  });

  it('transcode_error with string TRANSCODE_CAPACITY_FULL maps to CAPACITY_FULL', async () => {
    const m = createMocks();
    m.encryptionManager.decryptMessage.mockReturnValue(JSON.stringify({ type: 'transcode_error', error: 'TRANSCODE_CAPACITY_FULL' }));
    const h = await submitTranscodeWs(mkOpts(m));
    m.emit(encResp());
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('CAPACITY_FULL'); }
  });

  it('transcode_error without code maps to TRANSCODE_FAILED', async () => {
    const m = createMocks();
    m.encryptionManager.decryptMessage.mockReturnValue(JSON.stringify({ type: 'transcode_error', error: { message: 'Unknown error' } }));
    const h = await submitTranscodeWs(mkOpts(m));
    m.emit(encResp());
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('TRANSCODE_FAILED'); }
  });

  it('plain error message rejects with TranscodeError TRANSCODE_FAILED', async () => {
    const m = createMocks();
    const h = await submitTranscodeWs(mkOpts(m));
    m.emit({ type: 'error', message: 'Server error' });
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('TRANSCODE_FAILED'); }
  });

  it('timeout rejects with TranscodeError TRANSCODE_TIMEOUT', async () => {
    const m = createMocks();
    const h = await submitTranscodeWs(mkOpts(m, { timeoutMs: 50 }));
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('TRANSCODE_TIMEOUT'); }
  });

  it('send failure rejects with TranscodeError TRANSCODE_FAILED', async () => {
    const m = createMocks();
    m.wsClient.sendWithoutResponse.mockRejectedValue(new Error('ws closed'));
    const h = await submitTranscodeWs(mkOpts(m));
    await expect(h.result).rejects.toThrow(TranscodeError);
    try { await h.result; } catch (e: any) { expect(e.code).toBe('TRANSCODE_FAILED'); }
  });
});
