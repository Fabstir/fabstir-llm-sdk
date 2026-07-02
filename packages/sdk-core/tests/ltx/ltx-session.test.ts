// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 3.3: createLtxSession — validate pre-escrow, then exact USDC deposit. + triggerSessionTimeout.
import { describe, it, expect, vi } from 'vitest';
import vectors from './vectors.json';
import bundleFixture from './bundle-fixture.json';
import { LtxManager } from '../../src/managers/LtxManager';
import { tokensToUsdc } from '../../src/utils/transcode-utils';
import { parseUnits } from 'ethers';

const LTX_MODEL_ID = '0x0101010101010101010101010101010101010101010101010101010101010101';
const USDC = '0x00000000000000000000000000000000000000abcd';
const HOST = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PRICE = 5n;
const validJob = { ...vectors.job, templateHash: bundleFixture.templates[0].templateHash };
const meta = { allowListVersion: 1, bundleHash: bundleFixture.bundleHash, bundleCID: 'bBundleCid' };

function makeManager(order?: string[], minDeposit: bigint = 0n) {
  const resolveModelPricePerToken = vi.fn().mockResolvedValue(PRICE);
  const startSession = vi.fn(async () => { order?.push('startSession'); return { sessionId: 5n, jobId: 5n }; });
  const getByCID = vi.fn(async () => { order?.push('getByCID'); return bundleFixture; });
  const triggerSessionTimeout = vi.fn(async () => ({ success: true, transactionHash: '0xtx' }));
  const getTokenMinDeposit = vi.fn(async () => minDeposit);
  const manager = new LtxManager({
    sessionManager: { resolveModelPricePerToken, startSession },
    storageManager: { getByCID },
    paymentManager: { triggerSessionTimeout, getTokenMinDeposit },
    ltxModelId: LTX_MODEL_ID, usdcAddress: USDC, chainId: 84532,
  } as any);
  return { manager, startSession, getByCID, triggerSessionTimeout, getTokenMinDeposit };
}

describe('LtxManager.createLtxSession (SP3.3, Constraint 8)', () => {
  it('validates BEFORE escrow (getByCID precedes startSession)', async () => {
    const order: string[] = [];
    const { manager } = makeManager(order);
    await manager.createLtxSession(validJob, HOST, meta);
    expect(order.indexOf('getByCID')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('getByCID')).toBeLessThan(order.indexOf('startSession'));
  });

  it('escrows exactly estimateCost on the LTX model id', async () => {
    const { manager, startSession } = makeManager();
    const res = await manager.createLtxSession(validJob, HOST, meta);
    expect(res).toEqual({ sessionId: 5n, jobId: 5n });
    const cfg = startSession.mock.calls[0][0];
    expect(cfg.modelId).toBe(LTX_MODEL_ID);
    // depositAmount is a DECIMAL USDC string; startSession/createSessionJob parseUnits() it back to base units.
    expect(parseUnits(cfg.depositAmount, 6)).toBe(tokensToUsdc(111514, PRICE));
    expect(cfg.host).toBe(HOST);
    expect(cfg.paymentToken).toBe(USDC);
  });

  it('does NOT escrow when pre-validation fails (no funds locked)', async () => {
    const { manager, startSession } = makeManager();
    await expect(manager.createLtxSession({ ...validJob, fps: 60 }, HOST, meta))
      .rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(startSession).not.toHaveBeenCalled();
  });

  it('triggerSessionTimeout(jobId) delegates to the payment manager (reclaim path)', async () => {
    const { manager, triggerSessionTimeout } = makeManager();
    await manager.triggerSessionTimeout(42);
    expect(triggerSessionTimeout.mock.calls[0]).toContain(42);
  });

  it('clamps the deposit UP to the on-chain token minimum when the estimate is below the floor', async () => {
    // estimate = 111514 × 5 / 1000 = 557 base units; contract floor 500000 (0.50 USDC) → escrow the floor.
    const { manager, startSession, getTokenMinDeposit } = makeManager(undefined, 500000n);
    await manager.createLtxSession(validJob, HOST, meta);
    expect(getTokenMinDeposit).toHaveBeenCalledWith(USDC, 84532);
    const cfg = startSession.mock.calls[0][0];
    expect(parseUnits(cfg.depositAmount, 6)).toBe(500000n);
  });

  it('keeps the exact estimate when it already exceeds the floor', async () => {
    const { manager, startSession } = makeManager(undefined, 100n);
    await manager.createLtxSession(validJob, HOST, meta);
    const cfg = startSession.mock.calls[0][0];
    expect(parseUnits(cfg.depositAmount, 6)).toBe(tokensToUsdc(111514, PRICE));
  });

  it('threads options.endpoint into startSession (submitLtx derives the node WS from session.endpoint)', async () => {
    const { manager, startSession } = makeManager();
    await manager.createLtxSession(validJob, HOST, meta, { endpoint: 'ws://10.0.0.7:8080/v1/ws' });
    expect(startSession.mock.calls[0][0].endpoint).toBe('ws://10.0.0.7:8080/v1/ws');
  });
});
