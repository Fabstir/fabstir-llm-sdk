// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Standard-RPC UserOp gas-fee estimation (no vendor-specific method, Constraint 4/6).
 * maxFeePerGas = latest baseFeePerGas × 2 + eth_maxPriorityFeePerGas. Throws a
 * typed SDKError (no fallback constant) when the RPC lacks the standard methods.
 */

import { SDKError } from '../../types';

export interface UserOpGasFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Minimal structural provider — satisfied by ethers JsonRpcProvider. */
export interface FeeProvider {
  send(method: string, params: unknown[]): Promise<unknown>;
  getBlock(tag: string): Promise<{ baseFeePerGas?: bigint | null } | null>;
}

export async function getUserOpGasFees(provider: FeeProvider): Promise<UserOpGasFees> {
  const priorityHex = await provider.send('eth_maxPriorityFeePerGas', []).catch((err) => {
    throw new SDKError(
      `eth_maxPriorityFeePerGas unsupported by RPC: ${(err as Error)?.message ?? String(err)}`,
      'GAS_FEES_UNSUPPORTED',
      err,
    );
  });
  if (priorityHex == null) throw new SDKError('eth_maxPriorityFeePerGas returned null', 'GAS_FEES_UNSUPPORTED');
  const maxPriorityFeePerGas = BigInt(priorityHex as string);
  const block = await provider.getBlock('latest');
  if (block?.baseFeePerGas == null) {
    throw new SDKError('latest block has no baseFeePerGas (pre-EIP-1559 chain?)', 'GAS_FEES_NO_BASE_FEE');
  }
  return { maxPriorityFeePerGas, maxFeePerGas: block.baseFeePerGas * 2n + maxPriorityFeePerGas };
}
