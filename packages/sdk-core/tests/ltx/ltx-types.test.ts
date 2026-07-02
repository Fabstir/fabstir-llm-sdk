// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 2.1: LtxJob types + error surface + re-exports.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import vectors from './vectors.json';
import { LtxError, LTX_ERROR_CODES, JobType } from '../../src';
import type { LtxJob, LtxResult, LtxManifest, LtxBundle } from '../../src';

const CODES = [
  'VALIDATION_FAILED', 'SIDECAR_UNAVAILABLE', 'CAPACITY', 'GENERATION_FAILED', 'TIMEOUT',
  'LTX_BUNDLE_STALE', 'LTX_PREVALIDATION_FAILED', 'LTX_INPUT_BINDING_MISMATCH', 'LTX_PROOF_MISMATCH',
] as const;

describe('ltx.types + errors + exports (SP2.1)', () => {
  it('a job matching vectors.job type-checks; seed is a string (Constraint 9)', () => {
    const job: LtxJob = { ...vectors.job };
    expect(typeof job.seed).toBe('string');
    expect(job.resolution.w).toBe(1280);
  });

  it('LTX_ERROR_CODES exposes every wire + client code (5 + 4)', () => {
    for (const c of CODES) expect(LTX_ERROR_CODES).toContain(c);
    expect(LTX_ERROR_CODES.length).toBe(9);
  });

  it('LtxError carries its code and is an Error', () => {
    const e = new LtxError('boom', 'VALIDATION_FAILED');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('LtxError');
    expect(e.code).toBe('VALIDATION_FAILED');
  });

  it('JobType.VIDEO_GENERATION is defined and distinct', () => {
    expect(JobType.VIDEO_GENERATION).toBeDefined();
    const others = [JobType.LLM_INFERENCE, JobType.VIDEO_TRANSCODE, JobType.AUDIO_TRANSCODE, JobType.IMAGE_GENERATION, JobType.THREE_D_RENDER];
    expect(others).not.toContain(JobType.VIDEO_GENERATION);
  });

  it('LtxResult/LtxManifest/LtxBundle resolve from ../../src', () => {
    const manifest: LtxManifest = { frameCount: 3, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'linear-HDR-from-LogC3', frameHashes: [], merkleRoot: '0x' };
    const result: LtxResult = { outputCID: 'u', proofCID: 'u', manifest, frames: [], billing: { unit: 'megapixel-frame', tokens: 1 } };
    const bundle: LtxBundle = { allowListVersion: 1, bundleHash: '0x', templates: [], loras: [], bounds: { frames: { min: 1, max: 257 }, fps: [24], resolutions: [] } };
    expect(result.manifest.frameCount).toBe(3);
    expect(bundle.bounds.frames.max).toBe(257);
  });
});
