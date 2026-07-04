// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 4.2: LtxManager.generate orchestration (validate → estimate → session → submit) + guards.
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import bundleFixture from './bundle-fixture.json';
import { LtxManager } from '../../src/managers/LtxManager';
import { LtxError } from '../../src/errors/ltx-errors';

const LTX_MODEL_ID = '0x' + '01'.repeat(32);
const USDC = '0x00000000000000000000000000000000000000abcd';
const HOST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PRICE = 5n;
const validJob = { ...vectors.job, templateHash: bundleFixture.templates[0].templateHash };
const meta = { allowListVersion: 1, bundleHash: bundleFixture.bundleHash, bundleCID: 'bCid' };

function completeResult(over: Record<string, unknown> = {}) {
  return {
    outputCID: 'bOut', proofCID: 'bProof',
    manifest: { frameCount: 2, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'x', frameHashes: ['0xaa', '0xbb'], merkleRoot: '0x' },
    frames: ['uF0', 'uF1'], billing: { unit: 'megapixel-frame', tokens: 111514 }, requestId: 'r', allowListVersion: 1, ...over,
  };
}

function makeManager(order?: string[], resultOverride: Record<string, unknown> = {}) {
  const resolveModelPricePerToken = vi.fn(async () => { order?.push('estimate'); return PRICE; });
  const startSession = vi.fn(async () => { order?.push('session'); return { sessionId: 7n, jobId: 7n }; });
  const submitLtx = vi.fn(async () => { order?.push('submit'); return { requestId: 'r', cancel() {}, result: Promise.resolve(completeResult(resultOverride)) }; });
  const getByCID = vi.fn(async () => { order?.push('validate'); return bundleFixture; });
  const manager = new LtxManager({
    sessionManager: { resolveModelPricePerToken, startSession, submitLtx },
    storageManager: { getByCID },
    paymentManager: { getTokenMinDeposit: vi.fn(async () => 0n) },
    ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId: 84532,
  } as any);
  return { manager, startSession, submitLtx };
}

describe('LtxManager.generate (SP4.2)', () => {
  it('orchestrates validate → estimate → session → submit, then estimates once more to enrich billing', async () => {
    const order: string[] = [];
    const { manager } = makeManager(order);
    await manager.generate(validJob, HOST, meta);
    // trailing 'estimate' = the post-delivery price read that populates billing.gross / pricePerToken
    expect(order).toEqual(['validate', 'estimate', 'session', 'submit', 'estimate']);
  });

  it('surfaces the conditioning seed and enriches billing with gross + authoritative pricePerToken (BL1 helper surface)', async () => {
    const { manager } = makeManager();
    const res = await manager.generate(validJob, HOST, meta);
    expect(res.seed).toBe(validJob.seed);                          // the seed that conditioned the render, echoed
    expect(res.billing.pricePerToken).toBe(PRICE.toString());      // on-chain price, not the "0" the wire may carry
    expect(res.billing.gross).toBe(((111514n * PRICE) / 1000n).toString()); // floor(tokens × price / 1000), base units
  });

  it('does NOT create a session or submit when pre-validation fails', async () => {
    const { manager, startSession, submitLtx } = makeManager();
    await expect(manager.generate({ ...validJob, fps: 60 }, HOST, meta)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(startSession).not.toHaveBeenCalled();
    expect(submitLtx).not.toHaveBeenCalled();
  });

  it('rejects a billing over-claim (tokens > estimated)', async () => {
    const { manager } = makeManager(undefined, { billing: { unit: 'megapixel-frame', tokens: 999999 } });
    await expect(manager.generate(validJob, HOST, meta)).rejects.toMatchObject({ code: 'GENERATION_FAILED' });
  });

  it('flags allowListVersion drift from ltx_accepted as LTX_BUNDLE_STALE', async () => {
    const { manager } = makeManager(undefined, { allowListVersion: 2 });
    await expect(manager.generate(validJob, HOST, meta)).rejects.toMatchObject({ code: 'LTX_BUNDLE_STALE' });
  });

  it('returns the surfaced result on success', async () => {
    const { manager, submitLtx } = makeManager();
    const res = await manager.generate(validJob, HOST, meta);
    expect(res.outputCID).toBe('bOut');
    expect(res.frames).toEqual(['uF0', 'uF1']);
    expect(submitLtx).toHaveBeenCalledWith('7', validJob, undefined);
  });

  it('attaches sessionId/jobId to the result (receipts, reclaim, proof reads)', async () => {
    const { manager } = makeManager();
    const res = await manager.generate(validJob, HOST, meta);
    expect(res.sessionId).toBe(7n);
    expect(res.jobId).toBe(7n);
  });

  it('post-escrow tripwire failures carry sessionId/jobId in LtxError.details for reclaim', async () => {
    const { manager } = makeManager(undefined, { allowListVersion: 2 });
    const err: any = await manager.generate(validJob, HOST, meta).catch((e) => e);
    expect(err.code).toBe('LTX_BUNDLE_STALE');
    expect(err.details).toMatchObject({ sessionId: 7n, jobId: 7n });
  });

  it('post-escrow NODE failure (result rejects) also carries sessionId/jobId + preserves the code', async () => {
    const resolveModelPricePerToken = vi.fn(async () => PRICE);
    const startSession = vi.fn(async () => ({ sessionId: 7n, jobId: 7n }));
    const submitLtx = vi.fn(async () => ({ requestId: 'r', cancel() {}, result: Promise.reject(new LtxError('node timed out', 'TIMEOUT')) }));
    const getByCID = vi.fn(async () => bundleFixture);
    const manager = new LtxManager({
      sessionManager: { resolveModelPricePerToken, startSession, submitLtx },
      storageManager: { getByCID },
      paymentManager: { getTokenMinDeposit: vi.fn(async () => 0n) },
      ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId: 84532,
    } as any);
    const err: any = await manager.generate(validJob, HOST, meta).catch((e) => e);
    expect(err).toBeInstanceOf(LtxError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.details).toMatchObject({ sessionId: 7n, jobId: 7n });
  });
});
