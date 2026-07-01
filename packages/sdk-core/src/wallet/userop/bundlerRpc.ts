// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Isomorphic ERC-4337 + ERC-7677 JSON-RPC wrapper (`fetch`-only, Constraint 6).
 *
 * `jsonRpc` POSTs a JSON-RPC 2.0 envelope and throws (preserving the server
 * message — no swallow, no fallback) on `error`. The typed wrappers cover the
 * bundler (`eth_estimateUserOperationGas`/`eth_sendUserOperation`/
 * `eth_getUserOperationReceipt`) and the ERC-7677 paymaster service
 * (`pm_getPaymasterStubData`/`pm_getPaymasterData`). The `pm_*` methods send the
 * 4-element params `[userOp, entryPoint, hexChainId, context]` — chainId MUST be
 * a 0x-hex string and `context` is a provider object (default `{}` for CDP's
 * default policy; supply a non-empty context for Pimlico/Alchemy policy IDs).
 */

import { SDKError } from '../../types';

let rpcId = 1;

/** Hard timeout so a hung bundler/paymaster fails fast instead of blocking the daemon. */
const RPC_TIMEOUT_MS = 30_000;

/** POST a JSON-RPC 2.0 call; return `result` or throw (server error / timeout). */
export async function jsonRpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs: number = RPC_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') throw new SDKError(`${method} timed out after ${timeoutMs}ms (bundler/paymaster unresponsive)`, 'BUNDLER_RPC_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
  if (body.error) {
    throw new SDKError(
      `${method} failed: ${body.error.message ?? JSON.stringify(body.error)}`,
      'BUNDLER_RPC_ERROR',
      body.error,
    );
  }
  return body.result as T;
}

const hexChainId = (chainId: number): string => '0x' + chainId.toString(16);

export function estimateUserOperationGas<T = unknown>(url: string, userOp: unknown, entryPoint: string) {
  return jsonRpc<T>(url, 'eth_estimateUserOperationGas', [userOp, entryPoint]);
}

export function sendUserOperation(url: string, userOp: unknown, entryPoint: string) {
  return jsonRpc<string>(url, 'eth_sendUserOperation', [userOp, entryPoint]);
}

export function getUserOperationReceipt<T = unknown>(url: string, userOpHash: string) {
  return jsonRpc<T>(url, 'eth_getUserOperationReceipt', [userOpHash]);
}

export function pmGetPaymasterStubData<T = unknown>(
  url: string,
  userOp: unknown,
  entryPoint: string,
  chainId: number,
  context: object = {},
) {
  return jsonRpc<T>(url, 'pm_getPaymasterStubData', [userOp, entryPoint, hexChainId(chainId), context]);
}

export function pmGetPaymasterData<T = unknown>(
  url: string,
  userOp: unknown,
  entryPoint: string,
  chainId: number,
  context: object = {},
) {
  return jsonRpc<T>(url, 'pm_getPaymasterData', [userOp, entryPoint, hexChainId(chainId), context]);
}
