// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 1.1 — ON-CHAIN reference-vector oracle (gated RUN_USEROP_ORACLE=1).
 * Linchpin gate (§1): pure `userOpHashV07` MUST equal the deployed EntryPoint
 * v0.7 `getUserOpHash`. Packs the SAME fixture as the unit test, logs the
 * canonical hash (→ unit test EXPECTED), asserts equality. Skips honestly.
 *   RUN_USEROP_ORACLE=1 pnpm exec vitest run tests/integration/userop-hash-v07-onchain.test.ts
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import {
  getInitCode,
  getPaymasterAndData,
  pack2x128,
  userOpHashV07,
  type UnpackedUserOpV07,
} from '../../src/wallet/userop/userOpHashV07';

const RUN = process.env.RUN_USEROP_ORACLE === '1';

// MUST mirror tests/unit/userop-hash-v07.test.ts FIXTURE exactly.
const FIXTURE: UnpackedUserOpV07 = {
  sender: '0x1111111111111111111111111111111111111111',
  nonce: 7n,
  callData:
    '0xb61d27f6000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000400deadbeef00000000000000000000000000000000000000000000000000000000',
  callGasLimit: 100000n,
  verificationGasLimit: 200000n,
  preVerificationGas: 50000n,
  maxFeePerGas: 1500000000n,
  maxPriorityFeePerGas: 1000000000n,
  paymaster: '0x3333333333333333333333333333333333333333',
  paymasterVerificationGasLimit: 80000n,
  paymasterPostOpGasLimit: 40000n,
  paymasterData: '0xcafe',
};

const ENTRY_POINT_ABI = [
  'function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
];

function toPacked(op: UnpackedUserOpV07) {
  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode: getInitCode(op),
    callData: op.callData,
    accountGasLimits: ethers.toBeHex(pack2x128(op.verificationGasLimit, op.callGasLimit), 32),
    preVerificationGas: op.preVerificationGas,
    gasFees: ethers.toBeHex(pack2x128(op.maxPriorityFeePerGas, op.maxFeePerGas), 32),
    paymasterAndData: getPaymasterAndData(op),
    signature: '0x',
  };
}

describe.skipIf(!RUN)('userOpHashV07 on-chain oracle (RUN_USEROP_ORACLE=1)', () => {
  it('matches EntryPoint v0.7 getUserOpHash for the fixture', async () => {
    const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
    const entryPoint = process.env.ENTRY_POINT_ADDRESS;
    if (!rpcUrl || !entryPoint) {
      throw new Error('RPC_URL_BASE_SEPOLIA and ENTRY_POINT_ADDRESS must be set (.env.test)');
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const { chainId } = await provider.getNetwork();
    const ep = new ethers.Contract(entryPoint, ENTRY_POINT_ABI, provider);

    const onChain: string = await ep.getUserOpHash(toPacked(FIXTURE));
    const local = userOpHashV07(FIXTURE, entryPoint, chainId);

    // eslint-disable-next-line no-console
    console.log(`\n[ORACLE] canonical userOpHash (chainId=${chainId}): ${onChain}\n`);
    expect(local).toBe(onChain);
  }, 30_000);
});
