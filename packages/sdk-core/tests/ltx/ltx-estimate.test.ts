// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 3.1: LtxManager.estimateCost — megapixel-frame tokens → USDC (mocked price).
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import { LtxManager } from '../../src/managers/LtxManager';
import { LtxError } from '../../src/errors/ltx-errors';
import { tokensToUsdc } from '../../src/utils/transcode-utils';

const LTX_MODEL_ID = '0x0101010101010101010101010101010101010101010101010101010101010101';
const USDC = '0x00000000000000000000000000000000000000abcd';
const HOST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function makeManager(price: bigint) {
  const resolveModelPricePerToken = vi.fn().mockResolvedValue(price);
  const sessionManager = { resolveModelPricePerToken } as any;
  const manager = new LtxManager({ sessionManager, ltxModelId: LTX_MODEL_ID, usdcAddress: USDC } as any);
  return { manager, resolveModelPricePerToken };
}

describe('LtxManager.estimateCost (SP3.1, Constraint 6)', () => {
  it('tokens === 111514 and totalCostBaseUnits === tokensToUsdc(tokens, price)', async () => {
    const price = 5n;
    const { manager } = makeManager(price);
    const est = await manager.estimateCost(vectors.job, HOST);
    expect(est.tokens).toBe(vectors.tokens.value);
    expect(est.tokens).toBe(111514);
    expect(est.totalCostBaseUnits).toBe(tokensToUsdc(111514, price).toString());
    expect(est.pricePerToken).toBe(price);
    expect(est.paymentToken).toBe(USDC);
  });

  it('prices on the LTX model id, not the templateHash', async () => {
    const { manager, resolveModelPricePerToken } = makeManager(7n);
    await manager.estimateCost(vectors.job, HOST);
    const args = resolveModelPricePerToken.mock.calls[0];
    expect(args).toContain(LTX_MODEL_ID);
    expect(args).not.toContain(vectors.job.templateHash);
  });

  it('throws LtxError on a 0n on-chain price (no zero deposit, no fallback)', async () => {
    const { manager } = makeManager(0n);
    await expect(manager.estimateCost(vectors.job, HOST)).rejects.toBeInstanceOf(LtxError);
  });
});
