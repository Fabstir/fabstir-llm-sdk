// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * AASigner unit tests (Phase 1 RED → GREEN).
 *
 * Validates the custom ethers v6 signer wrapper that routes on-chain mutations
 * through a caller-supplied `sendUserOp` callback while delegating off-chain
 * signing (signMessage, signTypedData) to an internal EOA Wallet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { AASigner, type SendUserOpFn } from '../../src/wallet/AASigner';

const TEST_EOA_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_EOA_ADDRESS = ethers.computeAddress(TEST_EOA_PRIVATE_KEY);
const TEST_SMART_ACCOUNT_ADDRESS = '0x1111111111111111111111111111111111111111';
const TEST_TX_HASH =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const TEST_CHAIN_ID = 84532;
const DEFAULT_TX: ethers.TransactionRequest = {
  to: '0x2222222222222222222222222222222222222222',
  data: '0x',
  value: 0n,
};

function makeReceipt() {
  return {
    blockNumber: 100,
    blockHash: '0x' + '11'.repeat(32),
    hash: TEST_TX_HASH,
    index: 0,
    from: '0x0000000000000000000000000000000000000099',
    to: null,
    contractAddress: null,
    status: 1,
    type: 2,
    gasUsed: 21000n,
    gasPrice: 1000000000n,
    cumulativeGasUsed: 21000n,
    logsBloom: '0x' + '00'.repeat(256),
    logs: [],
    confirmations: () => Promise.resolve(11),
  };
}

function makeProvider(receiptOrSequence: any | any[]) {
  const queue = Array.isArray(receiptOrSequence) ? [...receiptOrSequence] : null;
  const getTransactionReceipt = queue
    ? vi.fn().mockImplementation(async () => (queue.length ? queue.shift() : null))
    : vi.fn().mockResolvedValue(receiptOrSequence);
  return {
    getTransactionReceipt,
    waitForTransaction: vi.fn().mockResolvedValue(receiptOrSequence),
    getBlockNumber: vi.fn().mockResolvedValue(110),
    getNetwork: vi.fn().mockResolvedValue({ chainId: BigInt(TEST_CHAIN_ID), name: 'base-sepolia' }),
    call: vi.fn().mockResolvedValue('0x'),
    estimateGas: vi.fn().mockResolvedValue(21000n),
    getCode: vi.fn().mockResolvedValue('0x'),
    getTransactionCount: vi.fn().mockResolvedValue(0),
    getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1000000000n, maxFeePerGas: null, maxPriorityFeePerGas: null }),
    broadcastTransaction: vi.fn(),
  };
}

function makeSigner(opts: { sendUserOp?: ReturnType<typeof vi.fn>; provider?: any } = {}) {
  const sendUserOp =
    opts.sendUserOp ?? vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
  const provider = opts.provider ?? makeProvider(makeReceipt());
  const signer = new AASigner(
    {
      smartAccountAddress: TEST_SMART_ACCOUNT_ADDRESS,
      eoaPrivateKey: TEST_EOA_PRIVATE_KEY,
      sendUserOp: sendUserOp as unknown as SendUserOpFn,
      chainId: TEST_CHAIN_ID,
    },
    provider as unknown as ethers.Provider,
  );
  return { signer, sendUserOp, provider };
}

describe('AASigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAddress() returns the smartAccountAddress', async () => {
    const { signer } = makeSigner();
    expect(await signer.getAddress()).toBe(TEST_SMART_ACCOUNT_ADDRESS);
  });

  it('signTransaction() throws with descriptive error mentioning sendUserOp', async () => {
    const { signer } = makeSigner();
    await expect(signer.signTransaction(DEFAULT_TX)).rejects.toThrow(/sendUserOp/);
  });

  it('signMessage() delegates to internal EOA wallet (verifyMessage recovers EOA, NOT SA)', async () => {
    const { signer } = makeSigner();
    const message = 'hello';
    const sig = await signer.signMessage(message);
    const recovered = ethers.verifyMessage(message, sig);
    expect(recovered).toBe(TEST_EOA_ADDRESS);
    expect(recovered).not.toBe(TEST_SMART_ACCOUNT_ADDRESS);
  });

  it('signTypedData() delegates to internal EOA wallet — produces valid 65-byte signature', async () => {
    const { signer } = makeSigner();
    const domain = { name: 'Test', version: '1', chainId: TEST_CHAIN_ID };
    const types = { Mail: [{ name: 'contents', type: 'string' }] };
    const value = { contents: 'hello' };
    const sig = await signer.signTypedData(domain, types, value);
    expect(sig).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(ethers.verifyTypedData(domain, types, value, sig)).toBe(TEST_EOA_ADDRESS);
  });

  it('sendTransaction() invokes sendUserOp exactly once with {to, data, value}', async () => {
    const { signer, sendUserOp } = makeSigner();
    const tx = { to: '0x2222222222222222222222222222222222222222', data: '0xabcdef', value: 1000n };
    await signer.sendTransaction(tx);
    expect(sendUserOp).toHaveBeenCalledTimes(1);
    expect(sendUserOp).toHaveBeenCalledWith({ to: tx.to, data: tx.data, value: tx.value });
  });

  it('sendTransaction() returns response with hash field equal to transactionHash from sendUserOp', async () => {
    const { signer } = makeSigner();
    const response = await signer.sendTransaction(DEFAULT_TX);
    expect(response.hash).toBe(TEST_TX_HASH);
  });

  it('returned response.wait() resolves to cached receipt (no-arg and confirms <= 1)', async () => {
    const receipt = makeReceipt();
    const { signer } = makeSigner({ provider: makeProvider(receipt) });
    const response = await signer.sendTransaction(DEFAULT_TX);
    expect(await response.wait!()).toBe(receipt);
    expect(await response.wait!(1)).toBe(receipt);
  });

  it('returned response.wait(3) delegates to provider.waitForTransaction(hash, 3)', async () => {
    const receipt = makeReceipt();
    const provider = makeProvider(receipt);
    const { signer } = makeSigner({ provider });
    const response = await signer.sendTransaction(DEFAULT_TX);
    await response.wait!(3);
    expect(provider.waitForTransaction).toHaveBeenCalledWith(TEST_TX_HASH, 3, undefined);
  });

  it('return value can be wrapped by ContractTransactionResponse and its wait() can fetch receipt via provider', async () => {
    const receipt = makeReceipt();
    const provider = makeProvider(receipt);
    const { signer } = makeSigner({ provider });
    const response = await signer.sendTransaction(DEFAULT_TX);
    const wrapped = new ethers.ContractTransactionResponse(
      new ethers.Interface([]),
      provider as unknown as ethers.Provider,
      response,
    );
    expect(wrapped.hash).toBe(TEST_TX_HASH);
    const r = await wrapped.wait();
    expect(r).toBeTruthy();
    expect(r!.hash).toBe(TEST_TX_HASH);
  });

  it('sendTransaction() retries getTransactionReceipt — 2 nulls then receipt → 3 calls total, succeeds', async () => {
    const receipt = makeReceipt();
    const provider = makeProvider([null, null, receipt]);
    const { signer } = makeSigner({ provider });
    const response = await signer.sendTransaction(DEFAULT_TX);
    expect(response.hash).toBe(TEST_TX_HASH);
    expect(provider.getTransactionReceipt).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('sendTransaction() throws after 5 failed receipt attempts with bundler/RPC race message', async () => {
    const provider = makeProvider([null, null, null, null, null]);
    const { signer } = makeSigner({ provider });
    await expect(signer.sendTransaction(DEFAULT_TX)).rejects.toThrow(/5 attempts|bundler|RPC/i);
    expect(provider.getTransactionReceipt).toHaveBeenCalledTimes(5);
  }, 10_000);

  it('sendUserOp throwing propagates unchanged (no SDK retry on bundler revert)', async () => {
    const bundlerError = new Error('UserOp reverted: AA23 reverted');
    const sendUserOp = vi.fn().mockRejectedValue(bundlerError);
    const { signer } = makeSigner({ sendUserOp });
    await expect(signer.sendTransaction(DEFAULT_TX)).rejects.toBe(bundlerError);
  });

  it('returned response.from === smartAccountAddress (NOT relayer EOA)', async () => {
    const { signer } = makeSigner();
    const response = await signer.sendTransaction(DEFAULT_TX);
    expect(response.from).toBe(TEST_SMART_ACCOUNT_ADDRESS);
    expect(response.from).not.toBe(TEST_EOA_ADDRESS);
  });

  it.each([
    ['bigint', 1000n, 1000n],
    ['number', 1000, 1000n],
    ['string', '1000', 1000n],
    ['null', null, 0n],
    ['undefined', undefined, 0n],
  ])('sendTransaction value coercion: %s → bigint', async (_label, input, expected) => {
    const { signer, sendUserOp } = makeSigner();
    await signer.sendTransaction({ to: '0x2222222222222222222222222222222222222222', data: '0x', value: input as any });
    expect(sendUserOp).toHaveBeenCalledWith(expect.objectContaining({ value: expected }));
  });

  it('view calls (e.g. balanceOf) bypass sendUserOp and read directly from provider', async () => {
    const { signer, sendUserOp, provider } = makeSigner();
    const erc20 = new ethers.Contract(
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      ['function balanceOf(address) view returns (uint256)'],
      signer,
    );
    provider.call = vi
      .fn()
      .mockResolvedValue(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [1234n]));
    const balance = await erc20.balanceOf(TEST_SMART_ACCOUNT_ADDRESS);
    expect(balance).toBe(1234n);
    expect(provider.call).toHaveBeenCalled();
    expect(sendUserOp).not.toHaveBeenCalled();
  });

  it('connect(newProvider) returns new AASigner instance preserving callback + EOA wallet, bound to new provider', async () => {
    const { signer, sendUserOp } = makeSigner();
    const newProvider = makeProvider(makeReceipt());
    const reconnected = signer.connect(newProvider as unknown as ethers.Provider);
    expect(reconnected).toBeInstanceOf(AASigner);
    expect(reconnected).not.toBe(signer);
    expect(await reconnected.getAddress()).toBe(TEST_SMART_ACCOUNT_ADDRESS);
    const message = 'reconnected';
    const sig = await reconnected.signMessage(message);
    expect(ethers.verifyMessage(message, sig)).toBe(TEST_EOA_ADDRESS);
    await reconnected.sendTransaction({ to: '0x3333333333333333333333333333333333333333', data: '0x', value: 0n });
    expect(sendUserOp).toHaveBeenCalledTimes(1);
    expect(newProvider.getTransactionReceipt).toHaveBeenCalled();
  });
});
