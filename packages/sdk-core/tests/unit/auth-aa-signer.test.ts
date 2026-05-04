// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FabstirSDKCore.authenticate('aa-signer') unit tests (Phase 2 RED → GREEN).
 *
 * Validates the new auth branch: AASigner instance creation, asymmetric
 * getSigner() return (EOA wallet for off-chain), s5Seed priority logic
 * mirroring privatekey mode, disconnect cleanup, missing-field validation,
 * and the switchChain guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { AASigner, type SendUserOpFn } from '../../src/wallet/AASigner';
import { SDKError } from '../../src/types';
import { generateS5SeedFromPrivateKey } from '../../src/utils/s5-seed-derivation';

const TEST_EOA_PRIVATE_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_EOA_ADDRESS = ethers.computeAddress(TEST_EOA_PRIVATE_KEY);
const TEST_SMART_ACCOUNT_ADDRESS = '0x1111111111111111111111111111111111111111';
const TEST_CHAIN_ID = 84532;

function baseConfig() {
  return {
    mode: 'production' as const,
    chainId: TEST_CHAIN_ID,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
      usdcToken: process.env.CONTRACT_USDC_TOKEN!,
      modelRegistry: process.env.CONTRACT_MODEL_REGISTRY!,
      fabToken: process.env.CONTRACT_FAB_TOKEN!,
    },
  };
}

function aaOptions(overrides: Record<string, unknown> = {}) {
  return {
    smartAccountAddress: TEST_SMART_ACCOUNT_ADDRESS,
    eoaPrivateKey: TEST_EOA_PRIVATE_KEY,
    sendUserOp: vi.fn().mockResolvedValue({ transactionHash: '0xabc' }) as unknown as SendUserOpFn,
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
    chainId: TEST_CHAIN_ID,
    ...overrides,
  };
}

function makeSDK(configOverrides: Record<string, unknown> = {}) {
  const sdk = new FabstirSDKCore({ ...baseConfig(), ...configOverrides });
  // Stub heavyweight manager init so tests focus on auth-state plumbing.
  (sdk as any).initializeManagers = vi.fn().mockResolvedValue(undefined);
  return sdk;
}

describe('FabstirSDKCore.authenticate("aa-signer")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticate("aa-signer", validOptions) succeeds and sets authenticated = true', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    expect((sdk as any).authenticated).toBe(true);
  });

  it('this.signer is an AASigner instance after auth (duck-type: getAddress returns SA, has signMessage)', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    const innerSigner = (sdk as any).signer;
    expect(innerSigner).toBeInstanceOf(AASigner);
    expect(await innerSigner.getAddress()).toBe(TEST_SMART_ACCOUNT_ADDRESS);
    expect(typeof innerSigner.signMessage).toBe('function');
  });

  it('userAddress === smartAccountAddress after auth', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    expect(await sdk.getAddress()).toBe(TEST_SMART_ACCOUNT_ADDRESS);
  });

  it('eoaWallet is set; eoaWallet.address === computeAddress(eoaPrivateKey)', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    const eoaWallet = (sdk as any).eoaWallet as ethers.Wallet;
    expect(eoaWallet).toBeDefined();
    expect(eoaWallet.address).toBe(TEST_EOA_ADDRESS);
  });

  it('getSigner() returns the EOA Wallet (NOT the AASigner) — getSigner().address !== sdk.getAddress()', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    const returned = sdk.getSigner() as ethers.Wallet;
    expect(returned).toBeDefined();
    expect((returned as any).address).toBe(TEST_EOA_ADDRESS);
    expect((returned as any).address).not.toBe(await sdk.getAddress());
  });

  it('s5Seed derivation matches privatekey mode for the same eoaPrivateKey input (deterministic)', async () => {
    const sdk = makeSDK(); // hostOnly: false → derive seed
    await sdk.authenticate('aa-signer', aaOptions());
    const expectedSeed = await generateS5SeedFromPrivateKey(TEST_EOA_PRIVATE_KEY);
    expect((sdk as any).s5Seed).toBe(expectedSeed);
  });

  it('disconnect() clears authMode and eoaWallet', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('aa-signer', aaOptions());
    expect((sdk as any).authMode).toBe('aa-signer');
    expect((sdk as any).eoaWallet).toBeDefined();
    await sdk.disconnect();
    expect((sdk as any).authMode).toBeUndefined();
    expect((sdk as any).eoaWallet).toBeUndefined();
  });

  it('missing smartAccountAddress throws SDKError with code AA_SMART_ACCOUNT_MISSING', async () => {
    const sdk = makeSDK({ hostOnly: true });
    const opts = aaOptions({ smartAccountAddress: undefined });
    await expect((sdk as any).authenticateWithAASigner(opts)).rejects.toMatchObject({
      name: 'SDKError',
      code: 'AA_SMART_ACCOUNT_MISSING',
    });
  });

  it('missing eoaPrivateKey throws SDKError with code AA_EOA_KEY_MISSING', async () => {
    const sdk = makeSDK({ hostOnly: true });
    const opts = aaOptions({ eoaPrivateKey: undefined });
    await expect((sdk as any).authenticateWithAASigner(opts)).rejects.toMatchObject({
      name: 'SDKError',
      code: 'AA_EOA_KEY_MISSING',
    });
  });

  it('missing sendUserOp throws SDKError with code AA_SEND_USEROP_MISSING', async () => {
    const sdk = makeSDK({ hostOnly: true });
    const opts = aaOptions({ sendUserOp: undefined });
    await expect((sdk as any).authenticateWithAASigner(opts)).rejects.toMatchObject({
      name: 'SDKError',
      code: 'AA_SEND_USEROP_MISSING',
    });
  });

  it('missing rpcUrl throws SDKError with code AA_RPC_URL_MISSING', async () => {
    const sdk = makeSDK({ hostOnly: true });
    const opts = aaOptions({ rpcUrl: undefined });
    await expect((sdk as any).authenticateWithAASigner(opts)).rejects.toMatchObject({
      name: 'SDKError',
      code: 'AA_RPC_URL_MISSING',
    });
  });

  it('switchChain() in aa-signer mode throws SDKError with code AA_SWITCH_CHAIN_UNSUPPORTED', async () => {
    const sdk = makeSDK({ hostOnly: true });
    (sdk as any).authMode = 'aa-signer';
    await expect(sdk.switchChain(5611)).rejects.toMatchObject({
      name: 'SDKError',
      code: 'AA_SWITCH_CHAIN_UNSUPPORTED',
    });
  });

  it('failed authenticate(...) does NOT leak authMode (so subsequent switchChain works)', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await expect(
      sdk.authenticate('aa-signer', aaOptions({ smartAccountAddress: undefined })),
    ).rejects.toThrow();
    expect((sdk as any).authMode).toBeUndefined();
    expect((sdk as any).authenticated).toBe(false);
  });

  it('re-authenticate from privatekey to aa-signer swaps state cleanly', async () => {
    const sdk = makeSDK({ hostOnly: true });
    await sdk.authenticate('privatekey', { privateKey: TEST_EOA_PRIVATE_KEY });
    expect((sdk as any).authMode).toBe('privatekey');
    expect((sdk as any).eoaWallet).toBeUndefined();

    await sdk.authenticate('aa-signer', aaOptions());
    expect((sdk as any).authMode).toBe('aa-signer');
    expect((sdk as any).signer).toBeInstanceOf(AASigner);
    expect((sdk as any).eoaWallet).toBeDefined();
  });
});
