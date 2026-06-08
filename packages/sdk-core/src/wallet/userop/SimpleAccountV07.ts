// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * SimpleAccount v0.7 calldata + counterfactual address helpers (pure, ethers-only).
 * `encodeExecute` → `execute(address,uint256,bytes)`; `encodeFactoryData` → the
 * factory's `createAccount(address,uint256)`; `getInitCodeFor` concatenates them.
 * `getCounterfactualAddress` derives the undeployed SA address via the EntryPoint
 * `getSenderAddress(initCode)` revert-trick (parses `SenderAddressResult(address)`).
 * No fallback: any other revert (or no revert) throws (Constraint 10, 6).
 */

import { ethers } from 'ethers';
import { SDKError } from '../../types';

const SA_IFACE = new ethers.Interface(['function execute(address dest, uint256 value, bytes func)']);
const FACTORY_IFACE = new ethers.Interface(['function createAccount(address owner, uint256 salt)']);
const EP_IFACE = new ethers.Interface([
  'function getSenderAddress(bytes initCode)',
  'error SenderAddressResult(address sender)',
]);

/** SimpleAccount `execute(dest, value, func)` calldata. */
export function encodeExecute(to: string, value: bigint, data: string): string {
  return SA_IFACE.encodeFunctionData('execute', [to, value, data]);
}
/** SimpleAccountFactory `createAccount(owner, salt)` calldata. */
export function encodeFactoryData(owner: string, salt: bigint = 0n): string {
  return FACTORY_IFACE.encodeFunctionData('createAccount', [owner, salt]);
}
/** initCode = factory(20) ++ createAccount calldata. */
export function getInitCodeFor(factory: string, owner: string, salt: bigint = 0n): string {
  return ethers.concat([factory, encodeFactoryData(owner, salt)]);
}
function extractRevertData(err: unknown): string | null {
  const e = err as { data?: unknown; info?: { error?: { data?: unknown } } };
  const direct = e?.data;
  if (typeof direct === 'string' && direct.startsWith('0x')) return direct;
  const nested = e?.info?.error?.data;
  if (typeof nested === 'string' && nested.startsWith('0x')) return nested;
  return null;
}

/** Counterfactual SimpleAccount address via EntryPoint.getSenderAddress revert-trick. */
export async function getCounterfactualAddress(
  provider: ethers.Provider,
  params: { entryPoint: string; factory: string; owner: string; salt?: bigint },
): Promise<string> {
  const initCode = getInitCodeFor(params.factory, params.owner, params.salt ?? 0n);
  try {
    await provider.call({
      to: params.entryPoint,
      data: EP_IFACE.encodeFunctionData('getSenderAddress', [initCode]),
    });
  } catch (err) {
    const revertData = extractRevertData(err);
    const parsed = revertData ? EP_IFACE.parseError(revertData) : null;
    if (parsed?.name === 'SenderAddressResult') {
      return ethers.getAddress(parsed.args[0] as string);
    }
    throw new SDKError(
      `EntryPoint.getSenderAddress reverted without SenderAddressResult: ${(err as Error)?.message ?? String(err)}`,
      'AA_SENDER_ADDRESS_UNRESOLVED',
    );
  }
  throw new SDKError(
    'EntryPoint.getSenderAddress did not revert as expected (cannot derive SA address)',
    'AA_SENDER_ADDRESS_NO_REVERT',
  );
}
