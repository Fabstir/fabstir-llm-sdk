// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * createBundlerSendUserOp — the full ERC-4337 v0.7 + ERC-7677 SendUserOpFn
 * (isomorphic: fetch + ethers only, Constraint 6). Flow (order matters): encode
 * execute → EntryPoint nonce → deploy-once factory/factoryData (iff getCode == 0x)
 * → gas fees → ERC-7677 stub (NON-ZERO placeholder gas so CDP can trace + 65-byte
 * dummy sig) → eth_estimateUserOperationGas → paymaster gas limits FROM the paymaster
 * + BUFFER preVerificationGas ×125/100 (Base L2 L1-DA) → pm_getPaymasterData → v0.7
 * userOpHash over the final op → real owner sig → eth_sendUserOperation → receipt.
 */

import { ethers } from 'ethers';
import { SDKError } from '../../types';
import type { SendUserOpFn } from '../AASigner';
import { encodeExecute, encodeFactoryData } from './SimpleAccountV07';
import { userOpHashV07, type UnpackedUserOpV07 } from './userOpHashV07';
import { getUserOpGasFees, type FeeProvider } from './gasFees';
import {
  pmGetPaymasterStubData,
  pmGetPaymasterData,
  estimateUserOperationGas,
  sendUserOperation,
  getUserOperationReceipt,
} from './bundlerRpc';

/** Valid-shaped (not owner) 65-byte ECDSA sig so estimation's ecrecover/paymaster gas is measured. */
export const ESTIMATION_DUMMY_SIG =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';

const RECEIPT_ATTEMPTS = 12;
const RECEIPT_DELAY_MS = 2000;
// Base L2 folds the L1-DA fee into preVerificationGas (hashed RAW, not bumpable) — buffer +25%.
const PREVERIFICATION_BUFFER = { num: 125n, den: 100n };
// CDP TRACES the op at pm_getPaymasterStubData — 0x0 gas → "failed to trace calls" (the deploy+call
// can't execute). Non-zero placeholders let it simulate; the real estimate replaces these.
const STUB_GAS = {
  callGasLimit: 2_000_000n, verificationGasLimit: 2_000_000n, preVerificationGas: 100_000n,
  paymasterVerificationGasLimit: 300_000n, paymasterPostOpGasLimit: 150_000n,
};

export interface BundlerSendUserOpConfig {
  bundlerUrl: string;
  paymasterUrl: string;
  entryPoint: string;
  chainId: number;
  accountAddress: string;
  owner: ethers.Wallet;
  rpcProvider: ethers.JsonRpcProvider | (FeeProvider & ethers.Provider);
  factory: string;
  salt?: bigint;
  paymasterContext?: object;
}

const EP_NONCE_IFACE = new ethers.Interface(['function getNonce(address,uint192) view returns (uint256)']);
const hex = (v: bigint): string => '0x' + v.toString(16);
const reqBig = (v: unknown, f: string): bigint => {
  if (v == null) throw new SDKError(`bundler estimate missing ${f}`, 'BUNDLER_ESTIMATE_INCOMPLETE');
  return BigInt(v as string);
};
const optBig = (v: unknown, fb: bigint): bigint => (v == null ? fb : BigInt(v as string)); // 0x0 valid; never throws
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Serialize the v0.7 UserOp to its unpacked RPC JSON shape (bigints → hex). */
function toRpc(op: UnpackedUserOpV07): Record<string, string> {
  const out: Record<string, string> = {
    sender: op.sender,
    nonce: hex(op.nonce),
    callData: op.callData,
    callGasLimit: hex(op.callGasLimit),
    verificationGasLimit: hex(op.verificationGasLimit),
    preVerificationGas: hex(op.preVerificationGas),
    maxFeePerGas: hex(op.maxFeePerGas),
    maxPriorityFeePerGas: hex(op.maxPriorityFeePerGas),
    signature: op.signature ?? '0x',
  };
  if (op.factory && op.factory !== '0x') {
    out.factory = op.factory;
    out.factoryData = op.factoryData ?? '0x';
  }
  if (op.paymaster && op.paymaster !== '0x') {
    out.paymaster = op.paymaster;
    out.paymasterVerificationGasLimit = hex(op.paymasterVerificationGasLimit ?? 0n);
    out.paymasterPostOpGasLimit = hex(op.paymasterPostOpGasLimit ?? 0n);
    out.paymasterData = op.paymasterData ?? '0x';
  }
  return out;
}

async function getNonce(provider: ethers.Provider, entryPoint: string, account: string): Promise<bigint> {
  const res = await provider.call({
    to: entryPoint,
    data: EP_NONCE_IFACE.encodeFunctionData('getNonce', [account, 0]),
  });
  return EP_NONCE_IFACE.decodeFunctionResult('getNonce', res)[0] as bigint;
}

function mapBundlerError(err: unknown): never {
  if (err instanceof SDKError && err.code !== 'BUNDLER_RPC_ERROR') throw err;
  const msg = (err as Error)?.message ?? String(err);
  const aa = msg.match(/AA\d\d/)?.[0];
  throw new SDKError(`bundler rejected UserOp${aa ? ` (${aa})` : ''}: ${msg}`, aa ? `BUNDLER_${aa}` : 'BUNDLER_ERROR', err);
}

async function pollReceipt(bundlerUrl: string, userOpHash: string): Promise<{ receipt: { transactionHash: string } }> {
  for (let i = 0; i < RECEIPT_ATTEMPTS; i++) {
    const r = (await getUserOperationReceipt(bundlerUrl, userOpHash)) as { receipt?: { transactionHash: string } } | null;
    if (r?.receipt?.transactionHash) return r as { receipt: { transactionHash: string } };
    if (i < RECEIPT_ATTEMPTS - 1) await sleep(RECEIPT_DELAY_MS);
  }
  throw new SDKError(`UserOp receipt for ${userOpHash} not available after ${RECEIPT_ATTEMPTS} polls`, 'BUNDLER_RECEIPT_TIMEOUT');
}

export function createBundlerSendUserOp(config: BundlerSendUserOpConfig): SendUserOpFn {
  const { bundlerUrl, paymasterUrl, entryPoint, chainId, accountAddress, owner, rpcProvider } = config;
  const context = config.paymasterContext ?? {};
  return async (call) => {
    const provider = rpcProvider as ethers.Provider & FeeProvider;
    const op: UnpackedUserOpV07 = {
      sender: accountAddress,
      nonce: await getNonce(provider, entryPoint, accountAddress),
      callData: encodeExecute(call.to, call.value ?? 0n, call.data),
      callGasLimit: STUB_GAS.callGasLimit,
      verificationGasLimit: STUB_GAS.verificationGasLimit,
      preVerificationGas: STUB_GAS.preVerificationGas,
      ...(await getUserOpGasFees(provider)),
      signature: ESTIMATION_DUMMY_SIG,
    };
    const code = await provider.getCode(accountAddress);
    if (!code || code === '0x') {
      op.factory = config.factory;
      op.factoryData = encodeFactoryData(owner.address, config.salt ?? 0n);
    }
    // ERC-7677 stub — non-zero gas placeholders so CDP can trace the deploy+call (STUB_GAS).
    const stubOp = { ...toRpc(op), paymasterVerificationGasLimit: hex(STUB_GAS.paymasterVerificationGasLimit), paymasterPostOpGasLimit: hex(STUB_GAS.paymasterPostOpGasLimit) };
    const stub = (await pmGetPaymasterStubData(paymasterUrl, stubOp, entryPoint, chainId, context).catch(sponsorshipDenied)) as PmFields;
    op.paymaster = stub.paymaster;
    op.paymasterVerificationGasLimit = BigInt(stub.paymasterVerificationGasLimit ?? '0x0');
    op.paymasterPostOpGasLimit = BigInt(stub.paymasterPostOpGasLimit ?? '0x0');
    op.paymasterData = stub.paymasterData;

    // Bundler estimate is authoritative for call/verification/preVerification only. Paymaster gas limits
    // come from the PAYMASTER (ERC-7677/v0.7) — CDP omits them, may be 0x0; prefer estimate, else stub.
    const est = (await estimateUserOperationGas(bundlerUrl, toRpc(op), entryPoint).catch(mapBundlerError)) as EstFields;
    op.callGasLimit = reqBig(est.callGasLimit, 'callGasLimit');
    op.verificationGasLimit = reqBig(est.verificationGasLimit, 'verificationGasLimit');
    op.preVerificationGas = (reqBig(est.preVerificationGas, 'preVerificationGas') * PREVERIFICATION_BUFFER.num) / PREVERIFICATION_BUFFER.den;
    op.paymasterVerificationGasLimit = optBig(est.paymasterVerificationGasLimit, op.paymasterVerificationGasLimit);
    op.paymasterPostOpGasLimit = optBig(est.paymasterPostOpGasLimit, op.paymasterPostOpGasLimit);
    // ERC-7677 final data — paymaster + paymasterData (+ refreshed paymaster gas limits if returned).
    const pm = (await pmGetPaymasterData(paymasterUrl, toRpc(op), entryPoint, chainId, context).catch(sponsorshipDenied)) as PmFields;
    op.paymaster = pm.paymaster;
    op.paymasterData = pm.paymasterData;
    op.paymasterVerificationGasLimit = optBig(pm.paymasterVerificationGasLimit, op.paymasterVerificationGasLimit);
    op.paymasterPostOpGasLimit = optBig(pm.paymasterPostOpGasLimit, op.paymasterPostOpGasLimit);

    // Hash over the final merged/buffered op, then replace the dummy sig with the real owner sig.
    const userOpHash = userOpHashV07(op, entryPoint, chainId);
    op.signature = await owner.signMessage(ethers.getBytes(userOpHash));

    const submittedHash = (await sendUserOperation(bundlerUrl, toRpc(op), entryPoint).catch(mapBundlerError)) as string;
    const receipt = await pollReceipt(bundlerUrl, submittedHash || userOpHash);
    return { transactionHash: receipt.receipt.transactionHash };
  };
}

interface PmFields {
  paymaster: string; paymasterData: string;
  paymasterVerificationGasLimit?: string; paymasterPostOpGasLimit?: string;
}
interface EstFields {
  callGasLimit: string; verificationGasLimit: string; preVerificationGas: string;
  paymasterVerificationGasLimit?: string; paymasterPostOpGasLimit?: string; // CDP omits these
}

function sponsorshipDenied(err: unknown): never {
  const msg = (err as Error)?.message ?? String(err);
  throw new SDKError(`paymaster declined sponsorship: ${msg}`, 'DELEGATE_SPONSORSHIP_DENIED', err);
}
