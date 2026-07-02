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
