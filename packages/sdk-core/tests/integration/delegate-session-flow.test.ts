// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LIVE integration: authorize delegate → delegated USDC session → host settles.
 *
 * Requires REAL infrastructure (Base-Sepolia test accounts in .env.test, a registered
 * host running the approved model, and the bridge sub-account funded + authorized on
 * chain). It is gated behind RUN_DELEGATE_E2E=1 and SKIPPED otherwise — we never fake
 * it green (Execution plan §8). Run with:
 *   RUN_DELEGATE_E2E=1 pnpm test tests/integration/delegate-session-flow.test.ts
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ChainId } from '../../src/types/chain.types';

const RUN = process.env.RUN_DELEGATE_E2E === '1';
const APPROVED_MODEL = 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf';

describe.skipIf(!RUN)('delegate session flow (live, RUN_DELEGATE_E2E=1)', () => {
  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA!;
  const delegateKey = process.env.TEST_DELEGATE_PRIVATE_KEY || process.env.TEST_USER_1_PRIVATE_KEY!;
  const payer = process.env.FABSTIR_PAYER || process.env.TEST_USER_1_ADDRESS!;

  function makeSdk() {
    return new FabstirSDKCore({
      mode: 'production', chainId: 84532, rpcUrl,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
        usdcToken: process.env.CONTRACT_USDC_TOKEN,
      },
    } as any);
  }

  it('authenticates as delegate and reports the payer authorization status', async () => {
    const sdk = makeSdk();
    const wallet = new ethers.Wallet(delegateKey, new ethers.JsonRpcProvider(rpcUrl));
    await sdk.authenticateAsDelegate({ signer: wallet, payer });
    expect(sdk.getDelegatePayer()).toBe(payer);

    const pm = sdk.getPaymentManager();
    const status = await pm.getDelegateAuthorization({ payer, delegate: await wallet.getAddress() });
    expect(typeof status.authorized).toBe('boolean');
    expect(typeof status.remaining).toBe('bigint');
  }, 120_000);

  it('creates a delegated USDC session (host settles on disconnect)', async () => {
    const sdk = makeSdk();
    const wallet = new ethers.Wallet(delegateKey, new ethers.JsonRpcProvider(rpcUrl));
    await sdk.authenticateAsDelegate({ signer: wallet, payer });

    const sessionManager = await (sdk as any).getSessionManager();
    const { sessionId, jobId } = await sessionManager.startSession({
      modelId: APPROVED_MODEL, chainId: ChainId.BASE_SEPOLIA, paymentMethod: 'deposit',
      depositAmount: process.env.FABSTIR_SESSION_DEPOSIT || '0.5',
      paymentToken: process.env.CONTRACT_USDC_TOKEN,
    });
    expect(typeof sessionId).toBe('bigint');
    expect(typeof jobId).toBe('bigint');
    // Delegate must NOT settle (Constraint 3) — end the WS and let the host settle.
    await sessionManager.endSession(sessionId);
  }, 180_000);
});
