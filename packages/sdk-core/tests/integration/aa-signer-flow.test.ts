// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * AASigner end-to-end integration (Phase 3).
 *
 * Drives the SDK in 'aa-signer' mode and exercises the same on-chain code
 * paths SessionManager.startSession / PaymentManager.approveToken would —
 * via direct Contract method calls bound to the SDK's AASigner-routed signer.
 * Validates that every chain-mutating call routes through the injected
 * sendUserOp callback with the right encoded (to, data) pair, that the
 * EOA address never appears in any UserOp argument, and that the receipt's
 * SessionJobCreated event correctly yields the {sessionId, jobId} the SDK
 * surfaces to callers.
 *
 * Spec: docs/fabstir-v2-reference/IMPLEMENTATION-AA-TRANSCODE-PAYMENT.md A.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { AASigner, type SendUserOpFn } from '../../src/wallet/AASigner';
import { PaymentManager as PaymentManagerMultiChain } from '../../src/managers/PaymentManagerMultiChain';
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import ERC20ABI from '../../src/contracts/abis/ERC20-ABI.json';

const TEST_EOA_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_EOA_ADDRESS = ethers.computeAddress(TEST_EOA_PRIVATE_KEY);
const TEST_SMART_ACCOUNT_ADDRESS = '0x1111111111111111111111111111111111111111';
const TEST_HOST_ADDRESS = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
const TEST_TX_HASH =
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const TEST_BLOCK_HASH = '0x' + '11'.repeat(32);
const TEST_CHAIN_ID = 84532;
const TEST_JOB_ID = 12345n;
const TEST_DEPOSIT = 1_000_000n; // 1 USDC (6 decimals)

const USDC_ADDRESS = process.env.CONTRACT_USDC_TOKEN!;
const JOB_MARKETPLACE_ADDRESS = process.env.CONTRACT_JOB_MARKETPLACE!;
const RPC_URL = process.env.RPC_URL_BASE_SEPOLIA!;

function makeReceipt(logs: any[]) {
  return {
    blockNumber: 100,
    blockHash: TEST_BLOCK_HASH,
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
    logs,
    confirmations: () => Promise.resolve(11),
  };
}

function makeSessionJobCreatedLog(jobId: bigint, depositor: string, host: string, deposit: bigint) {
  const iface = ethers.Interface.from(JobMarketplaceABI as any);
  const { topics, data } = iface.encodeEventLog('SessionJobCreated', [jobId, depositor, host, deposit]);
  return {
    address: JOB_MARKETPLACE_ADDRESS,
    topics,
    data,
    blockNumber: 100,
    transactionHash: TEST_TX_HASH,
    transactionIndex: 0,
    logIndex: 0,
    blockHash: TEST_BLOCK_HASH,
    removed: false,
  };
}

function patchProvider(sdk: FabstirSDKCore, receiptQueue: any[] | null) {
  const provider = (sdk as any).provider as ethers.JsonRpcProvider;
  const queue = receiptQueue ? [...receiptQueue] : null;
  const stubReceipt = makeReceipt([]);
  const spies: Record<string, any> = {
    getTransactionReceipt: queue
      ? async () => (queue.length ? queue.shift() : null)
      : async () => stubReceipt,
    waitForTransaction: async () => stubReceipt,
    getBlockNumber: async () => 110,
    getNetwork: async () => ({ chainId: BigInt(TEST_CHAIN_ID), name: 'base-sepolia' }),
    estimateGas: async () => 100_000n,
    getCode: async () => '0x',
    getTransactionCount: async () => 0,
    getFeeData: async () => ({ gasPrice: 1_000_000_000n, maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 0n }),
  };
  for (const [k, v] of Object.entries(spies)) vi.spyOn(provider, k as any).mockImplementation(v);
  return provider;
}

function baseConfig() {
  return {
    mode: 'production' as const,
    chainId: TEST_CHAIN_ID,
    rpcUrl: RPC_URL,
    contractAddresses: {
      jobMarketplace: JOB_MARKETPLACE_ADDRESS,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
      usdcToken: USDC_ADDRESS,
      modelRegistry: process.env.CONTRACT_MODEL_REGISTRY!,
      fabToken: process.env.CONTRACT_FAB_TOKEN!,
    },
    hostOnly: true,
  };
}

async function authedSDK(sendUserOp: ReturnType<typeof vi.fn>) {
  const sdk = new FabstirSDKCore(baseConfig());
  (sdk as any).initializeManagers = vi.fn().mockResolvedValue(undefined);
  await sdk.authenticate('aa-signer', {
    smartAccountAddress: TEST_SMART_ACCOUNT_ADDRESS,
    eoaPrivateKey: TEST_EOA_PRIVATE_KEY,
    sendUserOp: sendUserOp as unknown as SendUserOpFn,
    rpcUrl: RPC_URL,
    chainId: TEST_CHAIN_ID,
  });
  return sdk;
}

describe('AASigner end-to-end flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Spec A.4 #1: createSessionJob via Contract — sendUserOp called twice (approve + createSessionJobForModelWithToken); jobId parsed from receipt', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    const receipt = makeReceipt([
      makeSessionJobCreatedLog(TEST_JOB_ID, TEST_SMART_ACCOUNT_ADDRESS, TEST_HOST_ADDRESS, TEST_DEPOSIT),
    ]);
    patchProvider(sdk, null);
    vi.spyOn((sdk as any).provider, 'getTransactionReceipt').mockResolvedValue(receipt as any);

    const signer = (sdk as any).signer as AASigner;
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20ABI, signer);
    const market = new ethers.Contract(JOB_MARKETPLACE_ADDRESS, JobMarketplaceABI, signer);

    const approveTx = await usdc.approve(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT);
    const sessionTx = await market.createSessionJobForModelWithToken(
      TEST_HOST_ADDRESS,
      ethers.id('test-model'),
      USDC_ADDRESS,
      TEST_DEPOSIT,
      1n,
      3600n,
      300n,
      300n,
    );
    const sessionReceipt = await sessionTx.wait();

    expect(sendUserOp).toHaveBeenCalledTimes(2);
    const [approveCall, createCall] = sendUserOp.mock.calls.map((c) => c[0]);

    const erc20Iface = ethers.Interface.from(ERC20ABI as any);
    const approveDecoded = erc20Iface.parseTransaction({ data: approveCall.data });
    expect(approveCall.to).toBe(USDC_ADDRESS);
    expect(approveDecoded?.name).toBe('approve');
    expect(approveDecoded?.args[0]).toBe(JOB_MARKETPLACE_ADDRESS);

    const marketIface = ethers.Interface.from(JobMarketplaceABI as any);
    const createDecoded = marketIface.parseTransaction({ data: createCall.data });
    expect(createCall.to).toBe(JOB_MARKETPLACE_ADDRESS);
    expect(createDecoded?.name).toBe('createSessionJobForModelWithToken');

    const sessionCreatedTopic = ethers.id('SessionJobCreated(uint256,address,address,uint256)');
    const eventLog = sessionReceipt!.logs.find((log: any) => log.topics[0] === sessionCreatedTopic);
    expect(eventLog).toBeTruthy();
    const parsed = marketIface.parseLog({ topics: eventLog.topics, data: eventLog.data });
    expect(parsed?.args.jobId).toBe(TEST_JOB_ID);

    expect(approveTx.hash).toBe(TEST_TX_HASH);
  });

  it('Spec A.4 #2: standalone approve via Contract.approve routes through sendUserOp with correct (to, data)', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    patchProvider(sdk, null);

    const signer = (sdk as any).signer as AASigner;
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20ABI, signer);
    await usdc.approve(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT);

    expect(sendUserOp).toHaveBeenCalledTimes(1);
    const call = sendUserOp.mock.calls[0][0];
    expect(call.to).toBe(USDC_ADDRESS);
    const decoded = ethers.Interface.from(ERC20ABI as any).parseTransaction({ data: call.data });
    expect(decoded?.name).toBe('approve');
    expect(decoded?.args[0]).toBe(JOB_MARKETPLACE_ADDRESS);
    expect(decoded?.args[1]).toBe(TEST_DEPOSIT);
  });

  it('Spec A.4 #3a: EOA address never appears in any sendUserOp call argument or implicit from', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    patchProvider(sdk, null);

    const signer = (sdk as any).signer as AASigner;
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20ABI, signer);
    await usdc.approve(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT);

    const eoaLower = TEST_EOA_ADDRESS.toLowerCase();
    for (const call of sendUserOp.mock.calls) {
      const arg = call[0] as { to: string; data: string; value: bigint };
      expect(arg.to.toLowerCase()).not.toBe(eoaLower);
      expect(arg.data.toLowerCase()).not.toContain(eoaLower.slice(2));
      expect((arg as any).from).toBeUndefined();
    }
  });

  it('Spec A.4 #3b: signMessage on getSigner() returns signature that recovers EOA address', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    const eoa = sdk.getSigner() as ethers.Wallet;
    expect(eoa.address).toBe(TEST_EOA_ADDRESS);
    const message = 'fabstir-aa-signer-integration';
    const sig = await eoa.signMessage(message);
    expect(ethers.verifyMessage(message, sig)).toBe(TEST_EOA_ADDRESS);
  });

  it('cross-RPC race: 2 nulls then receipt → flow succeeds, sendUserOp not retried', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    const receipt = makeReceipt([]);
    patchProvider(sdk, [null, null, receipt]);

    const signer = (sdk as any).signer as AASigner;
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20ABI, signer);
    const tx = await usdc.approve(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT);

    expect(tx.hash).toBe(TEST_TX_HASH);
    expect(sendUserOp).toHaveBeenCalledTimes(1);
    expect((sdk as any).provider.getTransactionReceipt).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('Spec A.4 #2 (verbatim): pm.approveToken via PaymentManagerMultiChain routes through sendUserOp with to=USDC, data=approve(spender,amount)', async () => {
    const sendUserOp = vi.fn().mockResolvedValue({ transactionHash: TEST_TX_HASH });
    const sdk = await authedSDK(sendUserOp);
    patchProvider(sdk, null);

    const pm = new PaymentManagerMultiChain(undefined, TEST_CHAIN_ID);
    await (pm as any).initialize((sdk as any).signer);
    await pm.approveToken(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT, USDC_ADDRESS);

    expect(sendUserOp).toHaveBeenCalledTimes(1);
    const call = sendUserOp.mock.calls[0][0];
    expect(call.to).toBe(USDC_ADDRESS);
    const decoded = ethers.Interface.from(ERC20ABI as any).parseTransaction({ data: call.data });
    expect(decoded?.name).toBe('approve');
    expect(decoded?.args[0]).toBe(JOB_MARKETPLACE_ADDRESS);
    expect(decoded?.args[1]).toBe(TEST_DEPOSIT);
  });

  it('sendUserOp rejection mid-flow propagates as bundler error (no swallowing)', async () => {
    const bundlerError = new Error('UserOp reverted: AA23 reverted');
    const sendUserOp = vi.fn().mockRejectedValue(bundlerError);
    const sdk = await authedSDK(sendUserOp);
    patchProvider(sdk, null);

    const signer = (sdk as any).signer as AASigner;
    const usdc = new ethers.Contract(USDC_ADDRESS, ERC20ABI, signer);
    await expect(usdc.approve(JOB_MARKETPLACE_ADDRESS, TEST_DEPOSIT)).rejects.toThrow(/AA23 reverted/);
  });
});
