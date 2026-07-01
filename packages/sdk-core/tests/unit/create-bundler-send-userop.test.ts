// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.2 — createBundlerSendUserOp full v0.7 + ERC-7677 flow (RED → GREEN).
 * bundlerRpc is mocked (canned ERC-7677 stub/data + estimate + receipt); gasFees
 * runs for real against a mocked provider. Asserts the hardened ordering: 0x0
 * gas-limit placeholders + 65-byte dummy sig + stub paymaster → estimate → merge
 * ESTIMATE pm gas limits + buffer preVerificationGas ×125/100 → pm_getPaymasterData
 * → hash over the final merged/buffered op → real owner sig → submit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/wallet/userop/bundlerRpc', () => ({
  pmGetPaymasterStubData: vi.fn(),
  pmGetPaymasterData: vi.fn(),
  estimateUserOperationGas: vi.fn(),
  sendUserOperation: vi.fn(),
  getUserOperationReceipt: vi.fn(),
}));

import {
  pmGetPaymasterStubData,
  pmGetPaymasterData,
  estimateUserOperationGas,
  sendUserOperation,
  getUserOperationReceipt,
} from '../../src/wallet/userop/bundlerRpc';
import {
  createBundlerSendUserOp,
  ESTIMATION_DUMMY_SIG,
  type BundlerSendUserOpConfig,
} from '../../src/wallet/userop/createBundlerSendUserOp';
import { userOpHashV07, type UnpackedUserOpV07 } from '../../src/wallet/userop/userOpHashV07';

const OWNER_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const SA = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x4444444444444444444444444444444444444444';
const PM = '0x3333333333333333333333333333333333333333';
const JOB = '0x2222222222222222222222222222222222222222';
const USEROP_HASH = '0x' + 'ab'.repeat(32);
const L1_HASH = '0x' + 'cd'.repeat(32);

function makeRpc({ code = '0x', nonce = 0n }: { code?: string; nonce?: bigint } = {}) {
  return {
    getCode: vi.fn().mockResolvedValue(code),
    call: vi.fn().mockResolvedValue(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [nonce])),
    send: vi.fn().mockResolvedValue('0x3b9aca00'), // 1 gwei priority
    getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1_000_000_000n }),
  } as any;
}

function makeConfig(over: Partial<BundlerSendUserOpConfig> = {}): BundlerSendUserOpConfig {
  return {
    bundlerUrl: 'https://bundler', paymasterUrl: 'https://pm', entryPoint: ENTRY_POINT, chainId: 84532,
    accountAddress: SA, owner: new ethers.Wallet(OWNER_KEY), rpcProvider: makeRpc(), factory: FACTORY, salt: 0n,
    ...over,
  };
}

function primeHappyPath() {
  // stub pm gas limits (0x1000/0x800) differ from the estimate's (0x1234/0x567) so the merge is observable.
  (pmGetPaymasterStubData as any).mockResolvedValue({
    paymaster: PM, paymasterVerificationGasLimit: '0x1000', paymasterPostOpGasLimit: '0x800', paymasterData: '0xabcd',
  });
  (estimateUserOperationGas as any).mockResolvedValue({
    callGasLimit: '0x5000', verificationGasLimit: '0x6000', preVerificationGas: '0x4000', // ×125/100 → 0x5000
    paymasterVerificationGasLimit: '0x1234', paymasterPostOpGasLimit: '0x567',
  });
  (pmGetPaymasterData as any).mockResolvedValue({ paymaster: PM, paymasterData: '0xbeef' });
  (sendUserOperation as any).mockResolvedValue(USEROP_HASH);
  (getUserOperationReceipt as any).mockResolvedValue({ receipt: { transactionHash: L1_HASH } });
}

const opArg = (mock: any) => mock.mock.calls.at(-1)[1]; // 2nd arg is the serialized userOp

beforeEach(() => {
  vi.clearAllMocks();
  primeHappyPath();
});

describe('createBundlerSendUserOp — happy path', () => {
  it('returns the L1 receipt.transactionHash; execute.to == call.to; send op has paymaster + 65-byte sig', async () => {
    const send = createBundlerSendUserOp(makeConfig());
    const out = await send({ to: JOB, data: '0xdeadbeef', value: 0n });
    expect(out.transactionHash).toBe(L1_HASH);

    const op = opArg(sendUserOperation);
    expect(op.paymaster).toBe(PM);
    expect(op.paymasterData).toBe('0xbeef');
    expect(ethers.dataLength(op.signature)).toBe(65);

    const [dest] = new ethers.Interface(['function execute(address,uint256,bytes)']).decodeFunctionData(
      'execute',
      op.callData,
    );
    expect(dest.toLowerCase()).toBe(JOB.toLowerCase());
  });
});

describe('createBundlerSendUserOp — estimation op shape', () => {
  it('estimate op carries the 65-byte dummy sig + STUB paymaster fields (not 0x sig, not final data)', async () => {
    const send = createBundlerSendUserOp(makeConfig());
    await send({ to: JOB, data: '0x', value: 0n });

    const est = opArg(estimateUserOperationGas);
    expect(est.signature).toBe(ESTIMATION_DUMMY_SIG); // 65-byte dummy (validity asserted below)
    expect(est.paymaster).toBe(PM);
    expect(est.paymasterData).toBe('0xabcd'); // stub, NOT final
    // real sig + final pm data only reach the submitted op
    const sent = opArg(sendUserOperation);
    expect(sent.signature).not.toBe(ESTIMATION_DUMMY_SIG);
    expect(sent.paymasterData).toBe('0xbeef');
  });

  it('ESTIMATION_DUMMY_SIG is an execution-safe ECDSA sig (no AA23 at estimate)', () => {
    // s ≤ N/2, v ∈ {27,28}, and ecrecover → non-zero, else SimpleAccount.ECDSA.recover reverts.
    expect(ethers.dataLength(ESTIMATION_DUMMY_SIG)).toBe(65);
    expect(() => ethers.Signature.from(ESTIMATION_DUMMY_SIG)).not.toThrow();
    expect(ethers.recoverAddress('0x' + '11'.repeat(32), ESTIMATION_DUMMY_SIG)).not.toBe(ethers.ZeroAddress);
  });
});

describe('createBundlerSendUserOp — stub op shape', () => {
  it('stub op carries NON-ZERO gas placeholders (CDP traces the stub) + fees', async () => {
    // 0x0 made CDP fail to trace the deploy+call ("failed to trace calls"); non-zero placeholders
    // let it simulate. The real estimate replaces these afterwards.
    const send = createBundlerSendUserOp(makeConfig());
    await send({ to: JOB, data: '0x', value: 0n });

    const stub = opArg(pmGetPaymasterStubData);
    for (const f of ['callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'paymasterVerificationGasLimit', 'paymasterPostOpGasLimit']) {
      expect(BigInt(stub[f])).toBeGreaterThan(0n); // NOT 0x0
    }
    expect(BigInt(stub.maxFeePerGas)).toBeGreaterThan(0n);
    expect(BigInt(stub.maxPriorityFeePerGas)).toBeGreaterThan(0n);
  });
});

describe('createBundlerSendUserOp — buffered + merged gas', () => {
  it('submitted preVerificationGas is buffered ×125/100, not the raw estimate', async () => {
    const send = createBundlerSendUserOp(makeConfig());
    await send({ to: JOB, data: '0x', value: 0n });
    const op = opArg(sendUserOperation);
    expect(BigInt(op.preVerificationGas)).toBe((0x4000n * 125n) / 100n); // 0x5000
    expect(op.preVerificationGas).not.toBe('0x4000');
  });

  it('uses the ESTIMATE paymaster gas limits when present', async () => {
    const send = createBundlerSendUserOp(makeConfig());
    await send({ to: JOB, data: '0x', value: 0n });
    const op = opArg(sendUserOperation);
    expect(BigInt(op.paymasterVerificationGasLimit)).toBe(0x1234n); // estimate value
    expect(BigInt(op.paymasterPostOpGasLimit)).toBe(0x567n);
    expect(BigInt(op.paymasterVerificationGasLimit)).not.toBe(0x1000n); // not the stub
  });

  it('CDP omits paymaster gas limits from the estimate ⟹ keeps the STUB paymaster values, no throw', async () => {
    (estimateUserOperationGas as any).mockResolvedValue({
      callGasLimit: '0x5000', verificationGasLimit: '0x6000', preVerificationGas: '0x4000',
      // no paymasterVerificationGasLimit / paymasterPostOpGasLimit (CDP)
    });
    const send = createBundlerSendUserOp(makeConfig());
    await expect(send({ to: JOB, data: '0x', value: 0n })).resolves.toBeTruthy(); // does NOT throw
    const op = opArg(sendUserOperation);
    expect(BigInt(op.paymasterVerificationGasLimit)).toBe(0x1000n); // from the stub
    expect(BigInt(op.paymasterPostOpGasLimit)).toBe(0x800n);
  });

  it('tolerates a paymaster returning paymasterPostOpGasLimit = 0x0 (no postOp)', async () => {
    (estimateUserOperationGas as any).mockResolvedValue({
      callGasLimit: '0x5000', verificationGasLimit: '0x6000', preVerificationGas: '0x4000',
      paymasterVerificationGasLimit: '0x1234', paymasterPostOpGasLimit: '0x0',
    });
    const send = createBundlerSendUserOp(makeConfig());
    await send({ to: JOB, data: '0x', value: 0n });
    expect(opArg(sendUserOperation).paymasterPostOpGasLimit).toBe('0x0');
  });
});

describe('createBundlerSendUserOp — deploy-once', () => {
  it('undeployed (getCode 0x) ⟹ op includes factory + factoryData', async () => {
    const send = createBundlerSendUserOp(makeConfig({ rpcProvider: makeRpc({ code: '0x' }) }));
    await send({ to: JOB, data: '0x', value: 0n });
    const op = opArg(sendUserOperation);
    expect(op.factory.toLowerCase()).toBe(FACTORY.toLowerCase());
    expect(op.factoryData).toBeTruthy();
  });

  it('deployed (getCode 0x60..) ⟹ op omits factory + factoryData', async () => {
    const send = createBundlerSendUserOp(makeConfig({ rpcProvider: makeRpc({ code: '0x6080604052' }) }));
    await send({ to: JOB, data: '0x', value: 0n });
    const op = opArg(sendUserOperation);
    expect(op.factory).toBeUndefined();
    expect(op.factoryData).toBeUndefined();
  });
});

describe('createBundlerSendUserOp — errors', () => {
  it('pm_getPaymasterData rejection ⟹ DELEGATE_SPONSORSHIP_DENIED carrying the reason', async () => {
    (pmGetPaymasterData as any).mockRejectedValue(new Error('policy rejected: over cap'));
    const send = createBundlerSendUserOp(makeConfig());
    await expect(send({ to: JOB, data: '0x', value: 0n })).rejects.toMatchObject({ code: 'DELEGATE_SPONSORSHIP_DENIED' });
    await expect(send({ to: JOB, data: '0x', value: 0n })).rejects.toThrow(/over cap/);
  });

  it.each([
    ['estimate', estimateUserOperationGas, 'AA21 didn\'t pay prefund'],
    ['submit', sendUserOperation, 'AA23 reverted'],
  ])('bundler %s AAxx revert ⟹ mapped SDKError', async (_label, fn, msg) => {
    (fn as any).mockRejectedValue(new Error(msg));
    const send = createBundlerSendUserOp(makeConfig());
    const aa = msg.match(/AA\d\d/)![0];
    await expect(send({ to: JOB, data: '0x', value: 0n })).rejects.toMatchObject({ code: `BUNDLER_${aa}` });
  });
});

describe('createBundlerSendUserOp — signature', () => {
  it('signature recovers to the owner via toEthSignedMessageHash(userOpHash) over the final op', async () => {
    const config = makeConfig({ rpcProvider: makeRpc({ code: '0x6080' }) }); // deployed → no factory
    const send = createBundlerSendUserOp(config);
    await send({ to: JOB, data: '0xabcd', value: 0n });
    const op = opArg(sendUserOperation);

    const big = (k: string) => BigInt(op[k]);
    const unpacked: UnpackedUserOpV07 = {
      sender: op.sender, nonce: big('nonce'), callData: op.callData,
      callGasLimit: big('callGasLimit'), verificationGasLimit: big('verificationGasLimit'),
      preVerificationGas: big('preVerificationGas'), maxFeePerGas: big('maxFeePerGas'),
      maxPriorityFeePerGas: big('maxPriorityFeePerGas'), paymaster: op.paymaster,
      paymasterVerificationGasLimit: big('paymasterVerificationGasLimit'),
      paymasterPostOpGasLimit: big('paymasterPostOpGasLimit'), paymasterData: op.paymasterData,
    };
    const hash = userOpHashV07(unpacked, ENTRY_POINT, 84532);
    expect(ethers.verifyMessage(ethers.getBytes(hash), op.signature)).toBe(
      new ethers.Wallet(OWNER_KEY).address,
    );
  });
});
