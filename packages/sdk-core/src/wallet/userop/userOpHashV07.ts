// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * EntryPoint v0.7 `userOpHash` + packing helpers (pure, ethers-only). Mirrors
 * EntryPoint v0.7 `getUserOpHash`: inner = keccak256(abi.encode(sender, nonce,
 * keccak(initCode), keccak(callData), accountGasLimits, preVerificationGas,
 * gasFees, keccak(paymasterAndData))); hash = keccak256(abi.encode(inner,
 * entryPoint, chainId)) with accountGasLimits = verificationGasLimit<<128 |
 * callGasLimit, gasFees = maxPriorityFeePerGas<<128 | maxFeePerGas. Validated
 * against the deployed EntryPoint in the gated oracle test (Constraint 3, 6).
 */

import { ethers } from 'ethers';

/** v0.7 UserOp in unpacked (RPC) shape; gas limits packed at hash time. */
export interface UnpackedUserOpV07 {
  sender: string;
  nonce: bigint;
  factory?: string | null;
  factoryData?: string | null;
  callData: string;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: string | null;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: string | null;
  signature?: string;
}

/** (hi << 128) | lo — the EntryPoint's two-uint128 packing. */
export function pack2x128(hi: bigint, lo: bigint): bigint {
  return (hi << 128n) | lo;
}
/** initCode = factory(20) + factoryData, else `0x`. */
export function getInitCode(op: UnpackedUserOpV07): string {
  if (!op.factory || op.factory === '0x') return '0x';
  return ethers.concat([op.factory, op.factoryData ?? '0x']);
}
/** paymasterAndData = paymaster(20) + pmVerGasLimit(16) + pmPostOpGasLimit(16) + data. */
export function getPaymasterAndData(op: UnpackedUserOpV07): string {
  if (!op.paymaster || op.paymaster === '0x') return '0x';
  return ethers.concat([
    op.paymaster,
    ethers.toBeHex(op.paymasterVerificationGasLimit ?? 0n, 16),
    ethers.toBeHex(op.paymasterPostOpGasLimit ?? 0n, 16),
    op.paymasterData ?? '0x',
  ]);
}

/** Compute the v0.7 userOpHash exactly as EntryPoint.getUserOpHash. */
export function userOpHashV07(
  op: UnpackedUserOpV07,
  entryPoint: string,
  chainId: number | bigint,
): string {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const inner = ethers.keccak256(
    abi.encode(
      ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        op.sender,
        op.nonce,
        ethers.keccak256(getInitCode(op)),
        ethers.keccak256(op.callData),
        pack2x128(op.verificationGasLimit, op.callGasLimit),
        op.preVerificationGas,
        pack2x128(op.maxPriorityFeePerGas, op.maxFeePerGas),
        ethers.keccak256(getPaymasterAndData(op)),
      ],
    ),
  );
  return ethers.keccak256(
    abi.encode(['bytes32', 'address', 'uint256'], [inner, entryPoint, chainId]),
  );
}
