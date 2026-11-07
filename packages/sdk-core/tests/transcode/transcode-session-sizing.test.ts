// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-TRANSCODE-SESSION-SIZING (1.39.17). Since node 8.62.4 a transcode the model's rate cap cannot bill before
 * the session expires stops with SESSION_NOT_BILLABLE soon after it starts. The session must be sized BEFORE funding:
 * estimated tokens ÷ the rate read from the chain, plus a margin, never below today's 3,600 s.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { HostManager } from '../../src/managers/HostManager';
import { SessionManager } from '../../src/managers/SessionManager';
import { transcodeSessionDuration, estimateTranscodeUnits, billingUnitsToTokens, resolutionFactor } from '../../src/utils/transcode-utils';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import type { VideoFormat } from '../../src/types/transcode.types';

const fmt = (id: number, h: number, w: number, vcodec = 'h264_nvenc'): VideoFormat =>
  ({ id, ext: 'mp4', vcodec, acodec: 'aac', preset: 'fast', vf: `scale=${w}x${h}`, b_v: '5M', ar: '48k', ch: 2, dest: 's5' }) as VideoFormat;
const P1080 = fmt(1, 1080, 1920), P720 = fmt(2, 720, 1280), P480 = fmt(3, 480, 854), UHD = fmt(4, 2160, 3840);
const LADDER = [P480, P720, P1080, UHD];
const RATE = 2000;

describe('transcodeSessionDuration', () => {
  it('Z1: a short source keeps the 3,600 s floor; longer sources get tokens ÷ rate + 600 s', () => {
    expect(transcodeSessionDuration(600, [P1080], { ratePerSecond: RATE })).toBe(3600);
    expect(transcodeSessionDuration(7200, [P1080], { ratePerSecond: RATE })).toBe(4561);    // 7,920,001 tokens (billingUnitsToTokens rounds the float up) → 3,961 + 600
    expect(transcodeSessionDuration(1800, LADDER, { ratePerSecond: RATE })).toBe(4313);     // 7.425M tokens → 3,713 + 600
  });

  it('Z2: codec, encryption and the rate all count', () => {
    const av1 = fmt(1, 1080, 1920, 'av1_nvenc');
    expect(transcodeSessionDuration(6000, [av1], { ratePerSecond: RATE })).toBe(5550);      // × 1.5: 9,900,000 tokens
    expect(transcodeSessionDuration(7200, [P1080], { ratePerSecond: RATE, isEncrypted: false })).toBe(4200);
    expect(transcodeSessionDuration(3600, [P1080], { ratePerSecond: 1000 })).toBe(4561);
    expect(transcodeSessionDuration(7200, [P1080], { ratePerSecond: RATE, marginSeconds: 0, minimumSeconds: 0 })).toBe(3961);
  });

  it.each([0, -1, NaN, Infinity, undefined])('Z3: source length %s is refused', (bad) => {
    expect(() => transcodeSessionDuration(bad as any, [P1080], { ratePerSecond: RATE }))
      .toThrow(expect.objectContaining({ code: 'TRANSCODE_FAILED', details: expect.objectContaining({ reason: 'INVALID_SOURCE_DURATION' }) }));
  });

  it.each([undefined, 0, -1, NaN])('Z3: a rate of %s is refused: never defaulted, and the node can never bill at 0', (rate) => {
    expect(() => transcodeSessionDuration(600, [P1080], { ratePerSecond: rate } as any))
      .toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'INVALID_RATE' }) }));
  });

  it("Y1: a job the node is certain to withhold is refused: over (final wait ceiling + run limit) of rate", () => {
    // 5,400 s × 2,000 = 10.8M tokens; the 4-rung ladder costs 4,125 tokens per source second.
    expect(transcodeSessionDuration(2618, LADDER, { ratePerSecond: RATE })).toBeGreaterThan(3600);   // 10,799,250 tokens
    expect(() => transcodeSessionDuration(2619, LADDER, { ratePerSecond: RATE }))
      .toThrow(expect.objectContaining({ code: 'TRANSCODE_FAILED', details: expect.objectContaining({ reason: 'SOURCE_TOO_LONG', ratePerSecond: RATE, maxTokens: 10_800_000 }) }));
  });

  it("Z4: at the node's own table limits, the unmargined requirement is the 3,600 s session", () => {
    const need = (seconds: number, formats: VideoFormat[]) =>
      transcodeSessionDuration(seconds, formats, { ratePerSecond: RATE, marginSeconds: 0, minimumSeconds: 0 });
    expect(need(6545, [P1080])).toBeLessThanOrEqual(3600);          // 1 h 49 min
    expect(need(6546, [P1080])).toBeGreaterThan(3600);
    expect(need(4363, [P720, P1080])).toBeLessThanOrEqual(3600);    // 1 h 12 min
    expect(need(1745, LADDER)).toBeLessThanOrEqual(3600);           // 29 min
    expect(need(1746, LADDER)).toBeGreaterThan(3600);
  });

  it.each([
    ['scale=3840:2160', 2.0], ['scale=1920:1080', 1.0], ['scale=1280:720', 0.5], ['scale=854:480', 0.25],
    ['scale=3840x2160', 2.0], ['scale=854x480,fps=30', 1.0], ['fps=30', 1.0], ['crop=854x480', 1.0], ['', 1.0],
    // The node splits on the first `x`, else the first `:`, and parses the rest as a u32 (a leading + allowed).
    ['scale=1280:720x480', 0.25], ['scale=a:bx2160', 2.0], ['scale=1280:+720', 0.5], ['scale=1x4294967296', 1.0],
    ['scale=1280:720:flags=lanczos', 1.0], ['scale=1280x-2', 1.0], ['scale=1280x 720', 1.0], ['scale=x720', 0.5],
  ])("Y2: resolutionFactor(%s) = %s, exactly as the node's billing reads it", (vf, factor) => {
    expect(resolutionFactor(vf)).toBe(factor);
  });

  it("the tokens match the SDK's own estimate", () => {
    expect(billingUnitsToTokens(estimateTranscodeUnits(7200, [P1080], true))).toBe(7920001);
  });
});

describe('TranscodeManager', () => {
  const HOST = { address: '0xhost', apiUrl: 'https://host2.fabstir.test', metadata: {}, supportedModels: [] };
  const MODEL = '0x' + 'ab'.repeat(32);
  const CID = 's5://uSource';

  function manager(overrides: Record<string, unknown> = {}) {
    const sm = {
      startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
      submitTranscode: vi.fn(async () => ({ taskId: 't', cancel: vi.fn(), result: Promise.resolve({}) })),
      resolveModelRateLimit: vi.fn(async () => RATE),
      getConfidentialHosts: vi.fn(() => ['0xhost']),
      ...overrides,
    };
    const storage = { uploadJSON: vi.fn(async () => 'bSpec') };
    const tm: any = new TranscodeManager(sm as any, storage as any, {} as any, {} as any, {} as any, 84532);
    tm.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => [{ host: HOST }]) } as any);
    return { tm, sm, storage };
  }
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ total: 4, available: 4, sidecar_connected: true, sidecarConnected: true }) })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('Z5: sizeTranscodeSession reads the rate for the model and reports what it used', async () => {
    const { tm, sm } = manager();
    await expect(tm.sizeTranscodeSession(7200, [P1080], { modelId: MODEL })).resolves.toEqual({ duration: 4561, tokens: 7920001, ratePerSecond: RATE, finalWaitUncapped: false });
    expect(sm.resolveModelRateLimit).toHaveBeenCalledWith(MODEL);
  });

  it('Z5: a failed rate read throws — no assumed 2,000', async () => {
    const { tm } = manager({ resolveModelRateLimit: vi.fn(async () => { throw new Error('rpc down'); }) });
    await expect(tm.sizeTranscodeSession(7200, [P1080], { modelId: MODEL })).rejects.toThrow('rpc down');
  });

  it('Z6: with sourceDurationSeconds the session is funded at the sized duration', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200 });
    expect(sm.startSession.mock.calls[0][0].duration).toBe(4561);
    expect(sm.resolveModelRateLimit).toHaveBeenCalledWith(MODEL);   // the rate of the model the session is funded on
  });

  it('Z6b: isEncrypted false sizes for the unencrypted job', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200, isEncrypted: false });
    expect(sm.startSession.mock.calls[0][0].duration).toBe(4200);
  });

  it('Y3: the wait covers the session when the caller sets none: the result cannot be released sooner than the rate allows', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200 });
    expect(sm.submitTranscode.mock.calls[0][3].timeoutMs).toBe((4561 + 300) * 1000);   // 1.39.18: lifetime + 300 s
  });

  it("Y3: the caller's own timeoutMs stands; without a source length the 3,600 s session's + 300 s", async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200, timeoutMs: 60_000 });
    expect(sm.submitTranscode.mock.calls[0][3].timeoutMs).toBe(60_000);
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL);
    expect(sm.submitTranscode.mock.calls[1][3].timeoutMs).toBe((3600 + 300) * 1000);
  });

  it('Y3b: a very long session cannot overflow the wait timer (a delay over 2^31-1 ms fires at once)', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200, duration: 3_000_000 });
    expect(sm.submitTranscode.mock.calls[0][3].timeoutMs).toBe(2_147_483_647);
  });

  it('Y1: a source the node would withhold funds nothing', async () => {
    const { tm, sm } = manager();
    await expect(tm.submitTranscodeWithLoadBalancing(CID, LADDER, MODEL, { sourceDurationSeconds: 3600 }))
      .rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'SOURCE_TOO_LONG' } });
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('Z7: without it nothing changes: 3,600 s and no rate read', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL);
    expect(sm.startSession.mock.calls[0][0].duration).toBe(3600);
    expect(sm.resolveModelRateLimit).not.toHaveBeenCalled();
  });

  it('Z8: an explicit longer duration is kept', async () => {
    const { tm, sm } = manager();
    await tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200, duration: 9000 });
    expect(sm.startSession.mock.calls[0][0].duration).toBe(9000);
  });

  it('Z8: an explicit shorter duration is refused before funding', async () => {
    const { tm, sm } = manager();
    await expect(tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200, duration: 3600 }))
      .rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'SESSION_TOO_SHORT', duration: 3600, requiredSeconds: 4561 } });
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('Z9: a failed rate read funds nothing', async () => {
    const { tm, sm } = manager({ resolveModelRateLimit: vi.fn(async () => { throw new Error('rpc down'); }) });
    await expect(tm.submitTranscodeWithLoadBalancing(CID, [P1080], MODEL, { sourceDurationSeconds: 7200 })).rejects.toThrow('rpc down');
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('Z10: a sourceCid without its network is refused before any host call or funding', async () => {
    const { tm, sm } = manager();
    for (const bad of ['uSource', '://uSource', 's5://']) {
      await expect(tm.submitTranscodeWithLoadBalancing(bad, [P1080], MODEL))
        .rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'SOURCE_CID_NO_NETWORK' } });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('Z11: createTranscodeJob sizes its session from maxDuration, reading the rate before upload and funding', async () => {
    const order: string[] = [];
    const { tm, sm, storage } = manager({
      resolveModelRateLimit: vi.fn(async () => { order.push('rate'); return RATE; }),
      startSession: vi.fn(async () => { order.push('fund'); return { sessionId: 7n, jobId: 8n }; }),
    });
    storage.uploadJSON.mockImplementation(async () => { order.push('upload'); return 'bSpec'; });
    await tm.createTranscodeJob({ hostAddress: '0xhost', inputCID: CID, mediaFormats: [P1080], maxDuration: 7200, proofInterval: 100, chainId: 84532 });
    expect(order).toEqual(['rate', 'upload', 'fund']);
    expect(sm.startSession.mock.calls[0][0].duration).toBe(4561);
  });
});

describe('Z12: the rate path', () => {
  const ID = '0x' + 'ab'.repeat(32);

  it('ModelManager.getModelRateLimit reads the registry as a number', async () => {
    const mm: any = Object.create(ModelManager.prototype);
    mm.initialized = true;
    mm.modelRegistry = { getModelRateLimit: vi.fn(async () => 2000n) };
    await expect(mm.getModelRateLimit(ID)).resolves.toBe(2000);
    expect(mm.modelRegistry.getModelRateLimit).toHaveBeenCalledWith(ID);
  });

  it('HostManager.getModelRateLimit asks its ModelManager', async () => {
    const hm: any = Object.create(HostManager.prototype);
    hm.modelManager = { getModelRateLimit: vi.fn(async () => 2000) };
    await expect(hm.getModelRateLimit(ID)).resolves.toBe(2000);
    expect(hm.modelManager.getModelRateLimit).toHaveBeenCalledWith(ID);
  });

  it('SessionManager.resolveModelRateLimit goes through HostManager; without one it throws', async () => {
    const sm: any = new SessionManager({} as any, {} as any);
    await expect(sm.resolveModelRateLimit(ID)).rejects.toThrow(/HostManager/);
    sm.hostManager = { getModelRateLimit: vi.fn(async () => 2000) };
    await expect(sm.resolveModelRateLimit(ID)).resolves.toBe(2000);
    expect(sm.hostManager.getModelRateLimit).toHaveBeenCalledWith(ID);
  });
});

it('Z13: flag', () => {
  expect((SDK_CAPABILITIES as any).transcodeSessionSizing).toBe(true);
});
