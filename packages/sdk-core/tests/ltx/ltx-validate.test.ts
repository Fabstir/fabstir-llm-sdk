// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 3.2: validateJob against the versioned allow-list bundle (pre-escrow).
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import bundleFixture from './bundle-fixture.json';
import { canonicalBundleHash } from '../../src/utils/ltx-utils';
import { LtxManager } from '../../src/managers/LtxManager';

const BUNDLE_CID = 'bBundleCidPlaceholder';
const TEMPLATE_HASH = bundleFixture.templates[0].templateHash;
const validJob = { ...vectors.job, templateHash: TEMPLATE_HASH };

const meta = (o: Record<string, unknown> = {}) => ({
  allowListVersion: bundleFixture.allowListVersion,
  bundleHash: bundleFixture.bundleHash,
  bundleCID: BUNDLE_CID,
  ...o,
});

function makeManager(getByCID: any) {
  const storageManager = { getByCID } as any;
  return new LtxManager({ storageManager, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
}

describe('canonicalBundleHash (Constraint 8)', () => {
  it('reproduces the node bundleHash (remove field → key-sort → compact JSON → keccak)', () => {
    const { bundleHash, ...rest } = bundleFixture as any;
    expect(canonicalBundleHash(rest)).toBe(bundleFixture.bundleHash);
    // passing the full object (with bundleHash) is identical — the field is removed internally
    expect(canonicalBundleHash(bundleFixture)).toBe(bundleFixture.bundleHash);
  });
});

describe('LtxManager.validateJob (SP3.2, Constraint 8)', () => {
  it('accepts a valid job (templateHash matched case-insensitively)', async () => {
    const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    const bundle = await m.validateJob(validJob, meta());
    expect(bundle.allowListVersion).toBe(1);
    // case-insensitive templateHash still passes
    const m2 = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    await expect(m2.validateJob({ ...validJob, templateHash: TEMPLATE_HASH.toUpperCase() }, meta())).resolves.toBeTruthy();
  });

  it('rejects out-of-allow-list / out-of-bounds jobs with LTX_PREVALIDATION_FAILED', async () => {
    const cases = [
      { ...validJob, templateId: 'ltx-unknown' },
      { ...validJob, templateHash: '0x' + 'de'.repeat(32) },
      { ...validJob, frames: 258 },
      { ...validJob, frames: 0 },
      { ...validJob, fps: 60 },
      { ...validJob, resolution: { w: 1920, h: 1080 } },
    ];
    for (const bad of cases) {
      const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
      await expect(m.validateJob(bad, meta())).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    }
  });

  it('fails closed on empty fps or empty resolutions', async () => {
    for (const bounds of [{ fps: [] }, { resolutions: [] }]) {
      const b = { ...bundleFixture, bounds: { ...bundleFixture.bounds, ...bounds } } as any;
      delete b.bundleHash;
      const h = canonicalBundleHash(b);
      const m = makeManager(vi.fn().mockResolvedValue(b));
      await expect(m.validateJob(validJob, meta({ bundleHash: h }))).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    }
  });

  it('rejects seeds outside the sampler u64 range BEFORE escrow (LTX_PREVALIDATION_FAILED)', async () => {
    const U64_MAX = (1n << 64n) - 1n;
    // the exact UI-doc bug: two u32 decimal strings concatenated → ~half exceed u64
    const concatBug = '42949672954294967295';
    const bad = [concatBug, (U64_MAX + 1n).toString(), '-1', '1.5', 'abc', '', '0x10'];
    for (const seed of bad) {
      const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
      await expect(m.validateJob({ ...validJob, seed }, meta())).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    }
    // boundary: u64 max and 0 are valid
    for (const seed of [U64_MAX.toString(), '0']) {
      const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
      await expect(m.validateJob({ ...validJob, seed }, meta())).resolves.toBeTruthy();
    }
  });

  it('rejects off-grid frame counts pre-escrow — frames must be fps × whole-seconds + 1 (node v8.34.0 duration rule)', async () => {
    // The node rejects (frames−1) % fps !== 0 AFTER escrow; Constraint 8 says the SDK gates it BEFORE.
    for (const frames of [122, 200, 120]) {
      const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
      await expect(m.validateJob({ ...validJob, frames }, meta())).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    }
    // on-grid multi-second counts within bounds pass: 241 @ 24 fps = 10 s
    const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    await expect(m.validateJob({ ...validJob, frames: 241 }, meta())).resolves.toBeTruthy();
  });

  it('does NOT gate on loras — an unlisted lora still passes (advisory)', async () => {
    const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    await expect(m.validateJob({ ...validJob, lora: 'some-other-lora@v9' }, meta())).resolves.toBeTruthy();
  });

  it('throws LTX_BUNDLE_STALE when the fetched bundle does not authenticate to the advertised hash', async () => {
    const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    await expect(m.validateJob(validJob, meta({ bundleHash: '0x' + '00'.repeat(32) })))
      .rejects.toMatchObject({ code: 'LTX_BUNDLE_STALE' });
  });

  it('refetches on version/hash drift and caches when unchanged', async () => {
    const bundle2 = { ...bundleFixture, allowListVersion: 2 } as any;
    delete bundle2.bundleHash;
    const h2 = canonicalBundleHash(bundle2);
    const getByCID = vi.fn().mockResolvedValueOnce(bundleFixture).mockResolvedValueOnce(bundle2);
    const m = makeManager(getByCID);
    await m.validateJob(validJob, meta());                                   // fetch #1
    await m.validateJob(validJob, meta());                                   // cache hit (same hash) — no fetch
    const b2 = await m.validateJob(validJob, meta({ allowListVersion: 2, bundleHash: h2 })); // drift → fetch #2
    expect(getByCID).toHaveBeenCalledTimes(2);
    expect(b2.allowListVersion).toBe(2);
  });

  it('throws LTX_BUNDLE_STALE when advertised allowListVersion != the authenticated bundle version', async () => {
    // bundleHash authenticates the content (version 1), but metadata advertises version 999.
    const m = makeManager(vi.fn().mockResolvedValue(bundleFixture));
    await expect(m.validateJob(validJob, meta({ allowListVersion: 999 }))).rejects.toMatchObject({ code: 'LTX_BUNDLE_STALE' });
  });

  it('throws LTX_PREVALIDATION_FAILED on a structurally malformed but hash-authenticated bundle', async () => {
    const malformed: any = { allowListVersion: 1 }; // no templates/bounds
    const h = canonicalBundleHash(malformed);
    const m = makeManager(vi.fn().mockResolvedValue(malformed));
    await expect(m.validateJob(validJob, meta({ bundleHash: h, allowListVersion: 1 }))).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });
});

describe('validateJob v2 — imageInputs count gate (M1a, fail-closed)', async () => {
  const bundleV2 = (await import('./bundle-fixture-v2.json')).default as any;
  const metaV2 = { allowListVersion: 2, bundleHash: bundleV2.bundleHash, bundleCID: 'bBundleV2' };
  const i2vJob = {
    templateId: 'ltx-i2v-hdr', templateHash: bundleV2.templates.find((t: any) => t.templateId === 'ltx-i2v-hdr').templateHash,
    prompt: 'p', seed: '1', frames: 126, fps: 25, resolution: { w: 1280, h: 720 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
  };
  const t2vJob = {
    templateId: 'ltx-t2v-hdr', templateHash: bundleV2.templates.find((t: any) => t.templateId === 'ltx-t2v-hdr').templateHash,
    prompt: 'p', seed: '1', frames: 121, fps: 24, resolution: { w: 768, h: 512 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
  };

  it('i2v with exactly 1 image passes; 0 or 2 images fail pre-escrow', async () => {
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob({ ...i2vJob, images: ['u0'] } as any, metaV2)).resolves.toBeTruthy();
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob(i2vJob as any, metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob({ ...i2vJob, images: ['u0', 'u1'] } as any, metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });

  it('t2v (imageInputs 0/absent) rejects a job that carries images', async () => {
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob(t2vJob as any, metaV2)).resolves.toBeTruthy();
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob({ ...t2vJob, images: ['u0'] } as any, metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });

  it('flf2v requires exactly 2 images', async () => {
    const flfJob = {
      templateId: 'ltx-flf2v-hdr', templateHash: bundleV2.templates.find((t: any) => t.templateId === 'ltx-flf2v-hdr').templateHash,
      prompt: 'p', seed: '1', frames: 121, fps: 24, resolution: { w: 768, h: 512 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
    };
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob({ ...flfJob, images: ['u0', 'u1'] } as any, metaV2)).resolves.toBeTruthy();
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV2)).validateJob({ ...flfJob, images: ['u0'] } as any, metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });
});

describe('validateJob v6 — videoInputs count gate (BL3, IC-LoRA)', async () => {
  const bundleV6 = (await import('./bundle-fixture-v6.json')).default as any;
  const metaV6 = { allowListVersion: 6, bundleHash: bundleV6.bundleHash, bundleCID: 'bBundleV6' };
  const th = (id: string) => bundleV6.templates.find((t: any) => t.templateId === id).templateHash;
  const icloraJob = {
    templateId: 'ltx-iclora-hdr', templateHash: th('ltx-iclora-hdr'),
    prompt: 'p', seed: '1', frames: 126, fps: 25, resolution: { w: 768, h: 512 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
  };
  const t2vJob = {
    templateId: 'ltx-t2v-hdr', templateHash: th('ltx-t2v-hdr'),
    prompt: 'p', seed: '1', frames: 121, fps: 24, resolution: { w: 768, h: 512 }, lora: 'ltx-iclora-hdr@v1', output: 'exr-sequence',
  };

  it('iclora with exactly 1 image + 1 video passes; missing/extra video fails pre-escrow', async () => {
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV6)).validateJob({ ...icloraJob, images: ['ui'], videos: ['uv'] } as any, metaV6)).resolves.toBeTruthy();
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV6)).validateJob({ ...icloraJob, images: ['ui'] } as any, metaV6)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV6)).validateJob({ ...icloraJob, images: ['ui'], videos: ['uv', 'uv2'] } as any, metaV6)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });

  it('the three existing templates carry videoInputs 0 — a job with a video is rejected', async () => {
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV6)).validateJob(t2vJob as any, metaV6)).resolves.toBeTruthy();
    await expect(makeManager(vi.fn().mockResolvedValue(bundleV6)).validateJob({ ...t2vJob, videos: ['uv'] } as any, metaV6)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });
});
