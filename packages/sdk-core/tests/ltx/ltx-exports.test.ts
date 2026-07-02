// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 5.2: public exports + SDK wiring surface.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { LtxManager, FabstirSDKCore } from '../../src';
import type { LtxJob, LtxResult, LtxPriceEstimate, ILtxManager } from '../../src';

describe('LTX SDK exports + wiring (SP5.2)', () => {
  it('LtxManager class is exported from the root and constructible', () => {
    const m = new LtxManager({ ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
    expect(m).toBeInstanceOf(LtxManager);
    expect(typeof m.estimateCost).toBe('function');
    expect(typeof m.validateJob).toBe('function');
    expect(typeof m.generate).toBe('function');
    expect(typeof m.downloadFrames).toBe('function');
    expect(typeof m.verifyAttestation).toBe('function');
    expect(typeof m.triggerSessionTimeout).toBe('function');
  });

  it('FabstirSDKCore exposes getLtxManager()', () => {
    expect(typeof (FabstirSDKCore.prototype as any).getLtxManager).toBe('function');
  });

  it('LtxJob / LtxResult / LtxPriceEstimate / ILtxManager types resolve from ../../src', () => {
    const job: LtxJob = { templateId: 't', templateHash: '0x', prompt: 'p', seed: '1', frames: 1, fps: 24, resolution: { w: 1, h: 1 }, lora: 'l', output: 'exr-sequence' };
    const est: LtxPriceEstimate = { totalCost: '0', totalCostBaseUnits: '0', tokens: 1, pricePerToken: 1n, paymentToken: '0x' };
    expect(job.frames).toBe(1);
    expect(est.tokens).toBe(1);
    // type-only reference to ensure ILtxManager + LtxResult resolve
    const _r: LtxResult | null = null;
    const _i: ILtxManager | null = null;
    expect(_r).toBeNull();
    expect(_i).toBeNull();
  });

  it('preserves config.ltxModelId through validateConfig (regression: getLtxManager wiring)', () => {
    const A = '0x' + '1'.repeat(40);
    const sdk = new FabstirSDKCore({
      chainId: 84532,
      rpcUrl: 'http://localhost:8545',
      ltxModelId: '0xdeadbeef',
      contractAddresses: { jobMarketplace: A, nodeRegistry: A, proofSystem: A, hostEarnings: A, usdcToken: A },
    } as any);
    // validateConfig must carry ltxModelId onto this.config, else the LtxManager construction guard never fires.
    expect((sdk as any).config.ltxModelId).toBe('0xdeadbeef');
  });
});
