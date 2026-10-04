// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LTX frame grid (docs/development/IMPLEMENTATION-LTX-FRAME-GRID.md F1–F4): templates flagged `frameGrid` take exact
// 8k+1 frame counts (bounded by the entry's maxFrames); unflagged templates keep the whole-second rule exactly.
import { describe, it, expect, vi } from 'vitest';
import bundleFixture from './bundle-fixture.json';
import { canonicalBundleHash } from '../../src/utils/ltx-utils';
import { LtxManager } from '../../src/managers/LtxManager';

const hash = (b: number) => '0x' + b.toString(16).padStart(2, '0').repeat(32);
const T2V = bundleFixture.templates[0];

/** An allow-list v26-style bundle: the fixture's t2v template plus the two frame-grid modes, authenticated. */
function bundle(extra: Record<string, unknown>[] = []) {
  const { bundleHash: _drop, ...rest } = bundleFixture as any;
  const b: any = {
    ...rest,
    allowListVersion: 26,
    templates: [
      T2V,
      { templateId: 'ltx-alpha-hdr', templateHash: hash(0xa1), frameGrid: true, maxFrames: 145 },
      { templateId: 'ltx-layout-hdr', templateHash: hash(0xb2), frameGrid: true },
      ...extra,
    ],
  };
  b.bundleHash = canonicalBundleHash(b);
  return b;
}

function validate(b: any, job: Record<string, unknown>) {
  const m = new LtxManager({ storageManager: { getByCID: vi.fn().mockResolvedValue(b) }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
  const tpl = b.templates.find((t: any) => t.templateId === job.templateId);
  return m.validateJob(
    { prompt: 'p', seed: '1', fps: 25, resolution: { w: 1280, h: 720 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence', templateHash: tpl.templateHash, ...job } as any,
    { allowListVersion: 26, bundleHash: b.bundleHash, bundleCID: 'bCid' },
  );
}

const refused = { code: 'LTX_PREVALIDATION_FAILED' };

describe('F2 — a frameGrid template takes exact 8k+1 counts', () => {
  it('121 and 145 frames at 25 fps pass (not whole seconds, on the LTX grid)', async () => {
    for (const frames of [121, 145]) await expect(validate(bundle(), { templateId: 'ltx-alpha-hdr', frames })).resolves.toBeTruthy();
  });

  it('a whole-second count off the grid is refused — 126 frames (5 s at 25 fps)', async () => {
    await expect(validate(bundle(), { templateId: 'ltx-alpha-hdr', frames: 126 })).rejects.toMatchObject(refused);
  });

  it('the entry\'s own maxFrames bounds it: 145 passes, 153 (on the grid) is refused', async () => {
    await expect(validate(bundle(), { templateId: 'ltx-alpha-hdr', frames: 145 })).resolves.toBeTruthy();
    await expect(validate(bundle(), { templateId: 'ltx-alpha-hdr', frames: 153 })).rejects.toMatchObject(refused);
  });

  it('without maxFrames, the bundle\'s frame bounds apply: 257 passes, 265 is refused', async () => {
    await expect(validate(bundle(), { templateId: 'ltx-layout-hdr', frames: 257 })).resolves.toBeTruthy();
    await expect(validate(bundle(), { templateId: 'ltx-layout-hdr', frames: 265 })).rejects.toMatchObject(refused);
  });

  it('the fps allow-list still applies', async () => {
    await expect(validate(bundle(), { templateId: 'ltx-layout-hdr', frames: 121, fps: 60 })).rejects.toMatchObject(refused);
  });
});

describe('F3 — templates without the flag keep the whole-second rule exactly', () => {
  it('126 frames at 25 fps (5 s) passes; 121 at 25 fps is refused', async () => {
    await expect(validate(bundle(), { templateId: T2V.templateId, templateHash: T2V.templateHash, frames: 126 })).resolves.toBeTruthy();
    await expect(validate(bundle(), { templateId: T2V.templateId, templateHash: T2V.templateHash, frames: 121 })).rejects.toMatchObject(refused);
  });

  it('a flag that is not exactly true is not the flag: the whole-second rule applies', async () => {
    const b = bundle([{ templateId: 'ltx-odd-hdr', templateHash: hash(0xc3), frameGrid: 'true' }]);
    await expect(validate(b, { templateId: 'ltx-odd-hdr', frames: 121 })).rejects.toMatchObject(refused);
    await expect(validate(b, { templateId: 'ltx-odd-hdr', frames: 126 })).resolves.toBeTruthy();
  });
});

it('F4 — a frameGrid entry whose maxFrames is not a positive integer is refused (fail closed, pre-escrow)', async () => {
  for (const maxFrames of ['145', 0, -9, 144.5, null]) {
    const b = bundle([{ templateId: 'ltx-bad-hdr', templateHash: hash(0xd4), frameGrid: true, maxFrames }]);
    await expect(validate(b, { templateId: 'ltx-bad-hdr', frames: 121 })).rejects.toMatchObject(refused);
  }
});
