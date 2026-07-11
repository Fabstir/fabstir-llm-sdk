// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 4.1: submitLtxWs — send ltx_generate, dispatch ltx_accepted/progress/complete/error.
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import icloraVectors from './vectors-iclora.json';
import { submitLtxWs } from '../../src/utils/ltx-ws';
import { LtxError } from '../../src/errors/ltx-errors';

const job = { ...vectors.job };

// encryptMessage returns the plaintext as ciphertextHex; decryptMessage echoes it back.
const encryptionManager = {
  encryptMessage: vi.fn((_k: Uint8Array, plaintext: string) => ({ ciphertextHex: plaintext, nonceHex: '00', aadHex: 'aa' })),
  decryptMessage: vi.fn((_k: Uint8Array, payload: any) => payload.ciphertextHex),
};

function makeWs() {
  let handler: ((data: any) => void) | undefined;
  const sent: any[] = [];
  const wsClient = {
    sendWithoutResponse: vi.fn(async (data: any) => { sent.push(data); }),
    onMessage: (h: (data: any) => void) => { handler = h; return () => { handler = undefined; }; },
  };
  return { wsClient, sent, emit: (d: any) => handler?.(d) };
}

const resp = (msg: any) => ({ type: 'encrypted_response', payload: { ciphertextHex: JSON.stringify(msg), nonceHex: '', aadHex: '' } });

function submit(extra: any = {}) {
  const ws = makeWs();
  const handle = submitLtxWs({
    wsClient: ws.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
    messageIndex: { value: 0 }, job, timeoutMs: 5000, ...extra,
  } as any);
  return { ws, handle };
}

describe('submitLtxWs (SP4.1, Constraint 2)', () => {
  it('sends an encrypted_message with inner action=ltx_generate, decimal seed, and requestId', async () => {
    const { ws } = submit({ requestId: 'req-1' });
    await ws.wsClient.sendWithoutResponse.mock.results[0]?.value; // ensure send fired
    const envelope = ws.sent[0];
    expect(envelope.type).toBe('encrypted_message');
    const inner = JSON.parse(envelope.payload.ciphertextHex);
    expect(inner.action).toBe('ltx_generate');
    expect(inner.seed).toBe(vectors.job.seed);
    expect(typeof inner.seed).toBe('string');
    expect(inner.requestId).toBe('req-1');
    expect(inner.templateId).toBe(vectors.job.templateId);
    expect(inner.resolution).toEqual(vectors.job.resolution);
  });

  it('routes ltx_progress to onProgress and does NOT resolve early', async () => {
    const onProgress = vi.fn();
    const { ws, handle } = submit({ onProgress });
    ws.emit(resp({ type: 'ltx_progress', stage: 'encrypting', pct: 42 }));
    expect(onProgress).toHaveBeenCalledWith({ stage: 'encrypting', pct: 42 });
    const raced = await Promise.race([(await handle).result.then(() => 'resolved'), Promise.resolve('pending')]);
    expect(raced).toBe('pending');
  });

  it('resolves ltx_complete with the result + allowListVersion from ltx_accepted; requestId matches', async () => {
    const { ws, handle } = submit({ requestId: 'req-9' });
    ws.emit(resp({ type: 'ltx_accepted', status: 'processing', sessionId: '0x5', requestId: 'req-9', allowListVersion: 3 }));
    ws.emit(resp({
      type: 'ltx_complete', outputCID: 'bOut', proofCID: 'bProof', frames: ['uF0', 'uF1'],
      manifest: { frameCount: 2, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'x', frameHashes: [], merkleRoot: '0x' },
      billing: { unit: 'megapixel-frame', tokens: 111514 }, requestId: 'req-9',
    }));
    const res = await (await handle).result;
    expect(res.outputCID).toBe('bOut');
    expect(res.proofCID).toBe('bProof');
    expect(res.frames).toEqual(['uF0', 'uF1']);
    expect(res.billing.tokens).toBe(111514);
    expect(res.requestId).toBe('req-9');
    expect(res.allowListVersion).toBe(3);
  });

  it('maps each ltx_error wire code to a rejected LtxError', async () => {
    for (const code of ['VALIDATION_FAILED', 'SIDECAR_UNAVAILABLE', 'CAPACITY', 'GENERATION_FAILED', 'TIMEOUT']) {
      const { ws, handle } = submit();
      ws.emit(resp({ type: 'ltx_error', error: { code, message: 'boom' } }));
      const err = await (await handle).result.catch((e) => e);
      expect(err).toBeInstanceOf(LtxError);
      expect(err.code).toBe(code);
    }
  });

  it('returns a handle with requestId and a cancel() function', async () => {
    const { handle } = submit({ requestId: 'req-x' });
    const h = await handle;
    expect(h.requestId).toBe('req-x');
    expect(typeof h.cancel).toBe('function');
  });

  it('cancel() settles the result promise with a typed LtxError (does not hang)', async () => {
    const { handle } = submit();
    const h = await handle;
    h.cancel();
    const err = await h.result.catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
  });

  it('M1a: carries images[] on the wire when present, omits it otherwise', async () => {
    const withImages = makeWs();
    await submitLtxWs({
      wsClient: withImages.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job: { ...job, images: ['uCap0', 'uCap1'] }, timeoutMs: 5000,
    } as any);
    expect(JSON.parse(withImages.sent[0].payload.ciphertextHex).images).toEqual(['uCap0', 'uCap1']);

    const without = makeWs();
    await submitLtxWs({
      wsClient: without.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job, timeoutMs: 5000,
    } as any);
    expect('images' in JSON.parse(without.sent[0].payload.ciphertextHex)).toBe(false);
  });

  it('BL3: carries videos[] on the wire when present, omits it otherwise', async () => {
    const withVideos = makeWs();
    await submitLtxWs({
      wsClient: withVideos.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job: { ...job, videos: ['uCapV0'] }, timeoutMs: 5000,
    } as any);
    expect(JSON.parse(withVideos.sent[0].payload.ciphertextHex).videos).toEqual(['uCapV0']);

    const without = makeWs();
    await submitLtxWs({
      wsClient: without.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job, timeoutMs: 5000,
    } as any);
    expect('videos' in JSON.parse(without.sent[0].payload.ciphertextHex)).toBe(false);
  });
});

// The ltx_generate builder is a field whitelist, so a field added to LtxJob but not to the
// whitelist is dropped silently — the node then rejects on a count gate it cannot satisfy.
// These assert the wire message field for field against a job carrying EVERY optional input.
describe('submitLtxWs wire message (field-for-field, all optional inputs present)', () => {
  const iclora = icloraVectors.referencePlusControl;
  const fullJob = { ...iclora.job, images: [...iclora.images], videos: [...iclora.videos] };

  async function wireOf(j: any, requestId?: string) {
    const ws = makeWs();
    await submitLtxWs({
      wsClient: ws.wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, job: j, requestId, timeoutMs: 5000,
    } as any);
    return JSON.parse(ws.sent[0].payload.ciphertextHex);
  }

  it('emits exactly the frozen ltx_generate shape — no field dropped, none extra', async () => {
    expect(await wireOf(fullJob, 'req-full')).toEqual({
      action: 'ltx_generate',
      templateId: iclora.job.templateId,
      templateHash: iclora.job.templateHash,
      prompt: iclora.job.prompt,
      seed: iclora.job.seed,
      frames: iclora.job.frames,
      fps: iclora.job.fps,
      resolution: iclora.job.resolution,
      lora: iclora.job.lora,
      output: iclora.job.output,
      images: iclora.images,
      videos: iclora.videos,
      requestId: 'req-full',
    });
  });

  // Generic guard: catches the NEXT field added to LtxJob and forgotten in the whitelist.
  it('carries every LtxJob field onto the wire (whitelist has no silent drops)', async () => {
    const inner = await wireOf(fullJob);
    for (const [field, value] of Object.entries(fullJob)) {
      expect(inner, `LtxJob field "${field}" was dropped by the ltx_generate whitelist`).toHaveProperty(field, value);
    }
  });
});
