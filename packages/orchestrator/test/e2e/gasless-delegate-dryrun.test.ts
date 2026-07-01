// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 4.2 — gated 0-ETH gasless delegate E2E dry-run (RUN_GASLESS_E2E=1).
 *
 * The design's verification gate (Spec §10): a delegate holding ZERO ETH lands a
 * sponsored createSessionForModelAsDelegate and only USDC moves. Requires REAL
 * Base-Sepolia infra (.env.test accounts, a registered host on the approved
 * model, the payer's authorizeDelegate(SA) + USDC approve, and a sponsorship
 * policy allow-listing the one contract+selector with caps sized to absorb the
 * one-time SA deploy — Constraint 9). Gated + SKIPPED otherwise — never faked
 * green. Run once on Base Sepolia:
 *   RUN_GASLESS_E2E=1 pnpm exec vitest run test/e2e/gasless-delegate-dryrun.test.ts
 */

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { buildDelegateContext } from '../../src/cli/orchestrate';

const RUN = process.env.RUN_GASLESS_E2E === '1';
const APPROVED_MODEL = 'CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf';
const CHAIN_ID = 84532;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set in .env.test for the gasless E2E`);
  return v;
}

function makeSdk(rpcUrl: string) {
  return new FabstirSDKCore({
    mode: 'production',
    chainId: CHAIN_ID,
    rpcUrl,
    skipS5: true,
    contractAddresses: {
      jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
      nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
      proofSystem: process.env.CONTRACT_PROOF_SYSTEM,
      hostEarnings: process.env.CONTRACT_HOST_EARNINGS,
      usdcToken: process.env.CONTRACT_USDC_TOKEN,
    },
  } as any);
}

async function usdcBalance(provider: ethers.Provider, usdc: string, who: string): Promise<bigint> {
  const erc20 = new ethers.Contract(usdc, ['function balanceOf(address) view returns (uint256)'], provider);
  return erc20.balanceOf(who);
}

describe.skipIf(!RUN)('gasless delegate 0-ETH dry-run (RUN_GASLESS_E2E=1)', () => {
  it('a 0-ETH delegate lands a sponsored session; only USDC moves', async () => {
    const rpcUrl = requireEnv('RPC_URL_BASE_SEPOLIA');
    const usdc = requireEnv('CONTRACT_USDC_TOKEN');
    const payer = requireEnv('FABSTIR_PAYER');
    requireEnv('FABSTIR_ACCOUNT_FACTORY');
    requireEnv('ENTRY_POINT_ADDRESS');
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Build the gasless (SimpleAccount) delegate — FABSTIR_GASLESS forced on for this run.
    const ctx = await buildDelegateContext({
      payer,
      rpcUrl,
      chainId: CHAIN_ID,
      provider,
      env: { ...process.env, FABSTIR_GASLESS: '1' },
    });
    expect(ctx.gasless).toBe(true);

    // The whole point: the delegate (SA) holds ZERO ETH.
    const delegateEthBefore = await provider.getBalance(ctx.address);
    expect(delegateEthBefore).toBe(0n);
    const payerUsdcBefore = await usdcBalance(provider, usdc, payer);

    const sdk = makeSdk(rpcUrl);
    await sdk.authenticateAsDelegate({ signer: ctx.signer, payer });

    const sessionManager = await (sdk as any).getSessionManager();
    const { sessionId, jobId } = await sessionManager.startSession({
      modelId: APPROVED_MODEL,
      chainId: CHAIN_ID,
      paymentMethod: 'deposit',
      depositAmount: process.env.FABSTIR_SESSION_DEPOSIT || '0.5',
      paymentToken: usdc,
    });
    expect(typeof sessionId).toBe('bigint'); // sponsored UserOp landed
    expect(typeof jobId).toBe('bigint');

    // Sponsored: delegate ETH unchanged (still 0); payer USDC decreased.
    const delegateEthAfter = await provider.getBalance(ctx.address);
    expect(delegateEthAfter).toBe(0n);
    const payerUsdcAfter = await usdcBalance(provider, usdc, payer);
    expect(payerUsdcAfter).toBeLessThan(payerUsdcBefore);

    // Delegate must NOT settle (Constraint 2) — end the WS and let the host settle.
    await sessionManager.endSession(sessionId);
  }, 240_000);
});
