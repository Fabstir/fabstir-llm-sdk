// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 4.1 — gasless delegate session integration (mocked RPC, no network).
 *
 * Proves a REAL AASigner built on createBundlerSendUserOp (with bundlerRpc mocked
 * to canned ERC-7677 stub/data + estimate + receipt) drives
 * createSessionForModelAsDelegate through execute(JobMarketplace, 0, …) — exactly
 * one eth_sendUserOperation — and that tx.wait(3) delegates to
 * provider.waitForTransaction(hash, 3) (AASigner reorg protection preserved).
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
import { AASigner } from '../../src/wallet/AASigner';
import { createBundlerSendUserOp } from '../../src/wallet/userop/createBundlerSendUserOp';

const OWNER_KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const SA = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x4444444444444444444444444444444444444444';
const PM = '0x3333333333333333333333333333333333333333';
const JOB = '0x2222222222222222222222222222222222222222';
const HOST = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PAYER = '0x9999999999999999999999999999999999999999';
const USEROP_HASH = '0x' + 'ab'.repeat(32);
const L1_HASH = '0x' + 'cd'.repeat(32);
const CHAIN_ID = 84532;

const SESSION_FRAGMENT =
  'function createSessionForModelAsDelegate(address payer, bytes32 modelId, address host, address paymentToken, uint256 amount, uint256 pricePerToken, uint256 maxDuration, uint256 proofInterval, uint256 proofTimeoutWindow)';
const EXECUTE_IFACE = new ethers.Interface(['function execute(address,uint256,bytes)']);

function makeReceipt() {
  return {
    blockNumber: 100, blockHash: '0x' + '11'.repeat(32), hash: L1_HASH, index: 0,
    from: SA, to: JOB, contractAddress: null, status: 1, type: 2,
    gasUsed: 21000n, gasPrice: 1_000_000_000n, cumulativeGasUsed: 21000n,
    logsBloom: '0x' + '00'.repeat(256), logs: [], confirmations: () => Promise.resolve(11),
  };
}

function makeProvider() {
  const receipt = makeReceipt();
  return {
    getCode: vi.fn().mockResolvedValue('0x'),
    call: vi.fn().mockResolvedValue(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [0n])),
    send: vi.fn().mockResolvedValue('0x3b9aca00'),
    getBlock: vi.fn().mockResolvedValue({ baseFeePerGas: 1_000_000_000n }),
    getTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    waitForTransaction: vi.fn().mockResolvedValue(receipt),
  } as any;
}

function sessionArgs() {
  return [PAYER, '0x' + 'ab'.repeat(32), HOST, USDC, 1_000_000n, 10n, 3600n, 60n, 120n];
}

beforeEach(() => {
  vi.clearAllMocks();
  (pmGetPaymasterStubData as any).mockResolvedValue({
    paymaster: PM, paymasterVerificationGasLimit: '0x1000', paymasterPostOpGasLimit: '0x800', paymasterData: '0xabcd',
  });
  (estimateUserOperationGas as any).mockResolvedValue({
    callGasLimit: '0x5000', verificationGasLimit: '0x6000', preVerificationGas: '0x4000',
    paymasterVerificationGasLimit: '0x1234', paymasterPostOpGasLimit: '0x567',
  });
  (pmGetPaymasterData as any).mockResolvedValue({ paymaster: PM, paymasterData: '0xbeef' });
  (sendUserOperation as any).mockResolvedValue(USEROP_HASH);
  (getUserOperationReceipt as any).mockResolvedValue({ receipt: { transactionHash: L1_HASH } });
});

function makeDelegateSigner(provider: any) {
  const owner = new ethers.Wallet(OWNER_KEY, provider);
  const sendUserOp = createBundlerSendUserOp({
    bundlerUrl: 'https://bundler', paymasterUrl: 'https://pm', entryPoint: ENTRY_POINT,
    chainId: CHAIN_ID, accountAddress: SA, owner, rpcProvider: provider, factory: FACTORY, salt: 0n,
  });
  return new AASigner({ smartAccountAddress: SA, eoaPrivateKey: OWNER_KEY, sendUserOp, chainId: CHAIN_ID }, provider);
}

describe('gasless delegate session (mocked bundler/paymaster)', () => {
  it('createSessionForModelAsDelegate calldata reaches execute(JobMarketplace, 0, …); exactly one eth_sendUserOperation', async () => {
    const provider = makeProvider();
    const contract = new ethers.Contract(JOB, [SESSION_FRAGMENT], makeDelegateSigner(provider));
    const inner = contract.interface.encodeFunctionData('createSessionForModelAsDelegate', sessionArgs());

    const resp = await contract.createSessionForModelAsDelegate(...sessionArgs());
    expect(resp.hash).toBe(L1_HASH);
    expect(sendUserOperation).toHaveBeenCalledTimes(1);

    const op = (sendUserOperation as any).mock.calls.at(-1)[1];
    const [dest, value, func] = EXECUTE_IFACE.decodeFunctionData('execute', op.callData);
    expect(dest.toLowerCase()).toBe(JOB.toLowerCase());
    expect(value).toBe(0n);
    expect(func.toLowerCase()).toBe(inner.toLowerCase());
  });

  it('the AASigner response.wait(3) delegates to provider.waitForTransaction(hash, 3) (reorg protection)', async () => {
    const provider = makeProvider();
    const signer = makeDelegateSigner(provider);
    const iface = new ethers.Interface([SESSION_FRAGMENT]);
    const inner = iface.encodeFunctionData('createSessionForModelAsDelegate', sessionArgs());
    const resp = await signer.sendTransaction({ to: JOB, data: inner });
    await resp.wait!(3);
    expect(provider.waitForTransaction).toHaveBeenCalledWith(L1_HASH, 3, undefined);
  });

  it('the delegate (SA) address — not the owner EOA — is the UserOp sender', async () => {
    const provider = makeProvider();
    const signer = makeDelegateSigner(provider);
    expect(await signer.getAddress()).toBe(SA);
    const contract = new ethers.Contract(JOB, [SESSION_FRAGMENT], signer);
    await contract.createSessionForModelAsDelegate(...sessionArgs());
    const op = (sendUserOperation as any).mock.calls.at(-1)[1];
    expect(op.sender).toBe(SA);
    expect(op.sender).not.toBe(new ethers.Wallet(OWNER_KEY).address);
  });
});
