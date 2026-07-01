// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.1 — standard-RPC gas-fee estimation (RED → GREEN).
 *
 * `getUserOpGasFees` uses ONLY standard RPC: `eth_maxPriorityFeePerGas` + the
 * latest block's `baseFeePerGas` (no vendor-specific bundler gas-price method).
 * Formula: maxFeePerGas = baseFeePerGas × 2 + priority. Throws (no fallback
 * constant) when the RPC does not support `eth_maxPriorityFeePerGas`.
 */

import { describe, it, expect, vi } from 'vitest';
import { getUserOpGasFees } from '../../src/wallet/userop/gasFees';

const ONE_GWEI = 1_000_000_000n;

function makeProvider(opts: { priority?: string; base?: bigint | null; sendThrows?: boolean } = {}) {
  return {
    send: opts.sendThrows
      ? vi.fn().mockRejectedValue(Object.assign(new Error('method not found'), { code: -32601 }))
      : vi.fn().mockResolvedValue(opts.priority ?? '0x3b9aca00'), // 1 gwei
    getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: opts.base === undefined ? ONE_GWEI : opts.base }),
  } as any;
}

describe('getUserOpGasFees', () => {
  it('returns base×2 + priority using only standard RPC', async () => {
    const provider = makeProvider({ priority: '0x3b9aca00', base: ONE_GWEI });
    const fees = await getUserOpGasFees(provider);
    expect(fees.maxPriorityFeePerGas).toBe(ONE_GWEI);
    expect(fees.maxFeePerGas).toBe(ONE_GWEI * 2n + ONE_GWEI);
    expect(provider.send).toHaveBeenCalledWith('eth_maxPriorityFeePerGas', []);
    expect(provider.getBlock).toHaveBeenCalledWith('latest');
  });

  it('throws a typed SDKError (no fallback) when eth_maxPriorityFeePerGas is unsupported', async () => {
    const provider = makeProvider({ sendThrows: true });
    await expect(getUserOpGasFees(provider)).rejects.toMatchObject({ code: 'GAS_FEES_UNSUPPORTED' });
  });

  it('throws when the latest block has no baseFeePerGas (no fallback)', async () => {
    const provider = makeProvider({ base: null });
    await expect(getUserOpGasFees(provider)).rejects.toThrow();
  });
});
