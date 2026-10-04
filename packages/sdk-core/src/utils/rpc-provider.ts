// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * One JSON-RPC provider per (chain, url) for the whole process, its network fixed
 * (docs/development/IMPLEMENTATION-RPC-USAGE.md R1–R3).
 *
 * ethers finds a provider's network with `eth_chainId` and, while the RPC does not answer, retries every second — per
 * provider, forever. With the network fixed nothing is detected, so an RPC outage cannot become a retry storm, and every
 * SDK instance and sign-in shares one provider. Because a fixed network is never checked, the chain is verified
 * explicitly, once per provider (`verifyRpcChain`): a dead or wrong `rpcUrl` is still caught at sign-in.
 */

import { ethers } from 'ethers';
import { SDKError } from '../types';
import { withTimeout } from './with-timeout';

/** How long the RPC may take to answer the chain check — the sign-in's network bound (§24 EE4). */
export const NETWORK_TIMEOUT_MS = 30_000;

export const networkUnreachable = (cause?: unknown) =>
  new SDKError('The chain did not answer network detection in time', 'NETWORK_UNREACHABLE', {
    retryable: true, ...(cause !== undefined ? { cause } : {}),
  });

const providers = new Map<string, ethers.JsonRpcProvider>();
const verified = new WeakMap<ethers.JsonRpcProvider, Promise<void>>();

/** The process's provider for `rpcUrl` on `chainId`, built once with that network fixed. Nothing may destroy it. */
export function sharedRpcProvider(rpcUrl: string, chainId: number): ethers.JsonRpcProvider {
  const key = `${chainId}@${rpcUrl}`;
  let provider = providers.get(key);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(rpcUrl, ethers.Network.from(chainId), { staticNetwork: true });
    providers.set(key, provider);
  }
  return provider;
}

/**
 * Ask the RPC which chain it serves — one `eth_chainId`, remembered once it succeeds; a check in flight is shared.
 * @throws SDKError NETWORK_UNREACHABLE (retryable) when it does not answer within the bound or refuses;
 *   RPC_CHAIN_MISMATCH (not retryable) when it serves another chain
 */
export function verifyRpcChain(provider: ethers.JsonRpcProvider, chainId: number, opts: { timeoutMs?: number } = {}): Promise<void> {
  const known = verified.get(provider);
  if (known) return known;
  const check = (async () => {
    let answer: unknown;
    try {
      answer = await withTimeout(provider.send('eth_chainId', []), opts.timeoutMs ?? NETWORK_TIMEOUT_MS, () => networkUnreachable());
    } catch (error: any) {
      throw error?.code === 'NETWORK_UNREACHABLE' ? error : networkUnreachable(error);
    }
    const actual = Number(answer);
    if (actual !== chainId) {
      throw new SDKError(
        `The RPC serves chain ${actual}, not ${chainId}: point rpcUrl at chain ${chainId}`,
        'RPC_CHAIN_MISMATCH',
        { expected: chainId, actual, retryable: false },
      );
    }
  })();
  verified.set(provider, check);
  // Only a success is remembered: the next sign-in asks again after a failure.
  check.catch(() => { if (verified.get(provider) === check) verified.delete(provider); });
  return check;
}

/** Tests only: forget every shared provider. */
export function __resetSharedProvidersForTests(): void {
  providers.clear();
}
