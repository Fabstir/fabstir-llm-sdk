/**
 * x402 End-to-End Base Sepolia Integration Test
 *
 * Full round-trip: request → 402 → sign → retry → settlement → session token → reuse
 *
 * SKIPPED by default — requires funded Base Sepolia testnet account with USDC.
 * To run: SKIP_E2E="" pnpm vitest run test/x402/x402E2EBaseSepolia.test.ts
 */
import { describe, it, expect, afterAll } from 'vitest';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { OrchestratorA2AServer, type A2AServerOptions } from '../../src/a2a/server/OrchestratorA2AServer';
import type { X402PricingConfig } from '../../src/x402/types';
import { X402Client } from '@fabstir/sdk-core';

const SKIP = process.env.SKIP_E2E !== '';

describe.skipIf(SKIP)('x402 E2E Base Sepolia', () => {
  const rpcUrl = process.env.RPC_URL_BASE_SEPOLIA;
  const userPrivateKey = process.env.TEST_USER_1_PRIVATE_KEY;
  const usdcAddress = process.env.CONTRACT_USDC_TOKEN;

  let server: OrchestratorA2AServer;
  let serverUrl: string;

  afterAll(async () => {
    if (server) await server.stop();
  });

  it('full x402 round-trip on Base Sepolia', async () => {
    if (!rpcUrl || !userPrivateKey || !usdcAddress) {
      throw new Error('Missing env vars: RPC_URL_BASE_SEPOLIA, TEST_USER_1_PRIVATE_KEY, CONTRACT_USDC_TOKEN');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(userPrivateKey, provider);
    const payerAddress = await signer.getAddress();

    // Check USDC balance
    const usdc = new ethers.Contract(usdcAddress, [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ], provider);
    const balance = await usdc.balanceOf(payerAddress);
    const decimals = await usdc.decimals();
    expect(balance).toBeGreaterThan(0n);

    // Price: 0.01 USDC
    const price = (10n ** BigInt(decimals)) / 100n;
    const emitter = new EventEmitter();
    const events: Record<string, any[]> = {};
    for (const evt of ['x402:payment-received', 'x402:payment-settled', 'x402:payment-failed', 'x402:session-created']) {
      events[evt] = [];
      emitter.on(evt, (d: any) => events[evt].push(d));
    }

    const pricing: X402PricingConfig = {
      orchestratePrice: price.toString(),
      payTo: payerAddress, // pay to self for testing
      asset: usdcAddress,
      network: 'base-sepolia',
      maxTimeoutSeconds: 300,
    };

    const mockManager = {
      orchestrate: async () => ({
        taskGraphId: 'e2e-test',
        synthesis: 'E2E test result',
        proofCIDs: [],
        totalTokensUsed: 42,
      }),
    } as any;

    const options: A2AServerOptions = {
      publicUrl: 'http://localhost:0',
      port: 0, // OS-assigned port
      x402Pricing: pricing,
      x402Signer: signer,
      x402UsdcAddress: usdcAddress,
      x402SessionDurationSec: 3600,
      x402MaxRequestsPerSession: 10,
      eventEmitter: emitter,
    };

    server = new OrchestratorA2AServer(mockManager, options);
    await server.start();

    // Get the assigned port
    const addr = (server as any).server.address();
    serverUrl = `http://localhost:${addr.port}`;

    // Step 1: Request without payment → get 402
    const res402 = await fetch(`${serverUrl}/v1/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'test e2e' }),
    });
    expect(res402.status).toBe(402);
    const paymentRequired = await res402.json();
    expect(paymentRequired.x402Version).toBe(1);
    expect(paymentRequired.accepts).toHaveLength(1);
    const requirement = paymentRequired.accepts[0];
    expect(requirement.payTo).toBe(payerAddress);
    expect(requirement.asset).toBe(usdcAddress);

    // Step 2: Sign EIP-3009 TransferWithAuthorization
    const client = new X402Client(signer);
    const authorization = await client.signPayment(requirement);
    const paymentPayload = {
      x402Version: 1 as const,
      scheme: 'exact' as const,
      network: 'base-sepolia',
      payload: { signature: authorization.signature, authorization: authorization.authorization },
    };
    const xPaymentHeader = btoa(JSON.stringify(paymentPayload));

    // Step 3: Retry with X-PAYMENT header → settlement on-chain
    const balanceBefore = await usdc.balanceOf(payerAddress);
    const resOk = await fetch(`${serverUrl}/v1/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': xPaymentHeader,
      },
      body: JSON.stringify({ goal: 'test e2e' }),
    });
    expect(resOk.status).toBe(200);
    const result = await resOk.json();
    expect(result.taskGraphId).toBe('e2e-test');

    // Step 4: Verify payment response header with session token
    const payRespHeader = resOk.headers.get('X-PAYMENT-RESPONSE');
    expect(payRespHeader).toBeTruthy();
    const payResp = JSON.parse(atob(payRespHeader!));
    expect(payResp.success).toBe(true);
    expect(payResp.sessionToken).toBeTruthy();

    // Step 5: Verify USDC moved on-chain (self-transfer so balance unchanged, but tx hash exists)
    expect(events['x402:payment-received']).toHaveLength(1);
    expect(events['x402:payment-settled']).toHaveLength(1);
    expect(events['x402:session-created']).toHaveLength(1);

    // Step 6: Reuse session token — no payment needed
    const sessionToken = payResp.sessionToken;
    const resSession = await fetch(`${serverUrl}/v1/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer session:${sessionToken}`,
      },
      body: JSON.stringify({ goal: 'test session reuse' }),
    });
    expect(resSession.status).toBe(200);
    const sessionResult = await resSession.json();
    expect(sessionResult.taskGraphId).toBe('e2e-test');
  }, 60_000); // 60s timeout for blockchain ops
});
