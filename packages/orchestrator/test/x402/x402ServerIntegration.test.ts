import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorA2AServer } from '../../src/a2a/server/OrchestratorA2AServer';
import type { X402PricingConfig } from '../../src/x402/types';

function createMockManager() {
  return {
    orchestrate: vi.fn().mockResolvedValue({
      taskGraphId: 'graph-1', synthesis: 'Final answer',
      subTaskResults: new Map(), proofCIDs: [], totalTokensUsed: 100,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

const PRICING: X402PricingConfig = {
  orchestratePrice: '1000000', payTo: '0xRecipient1234567890abcdef12345678',
  asset: 'USDC', network: 'base-sepolia', maxTimeoutSeconds: 30,
};

function validPaymentHeader(): string {
  const p = {
    x402Version: 1, scheme: 'exact', network: PRICING.network,
    payload: { signature: '0xsig', authorization: {
      from: '0xPayer', to: PRICING.payTo, value: PRICING.orchestratePrice,
      validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 3600), nonce: '0xabc',
    } },
  };
  return Buffer.from(JSON.stringify(p)).toString('base64');
}

function makeServer(mgr: any, x402?: X402PricingConfig) {
  return new OrchestratorA2AServer(mgr, {
    publicUrl: 'http://localhost:3000', port: 0, ...(x402 && { x402Pricing: x402 }),
  });
}

describe('x402 Server Integration', () => {
  let mgr: ReturnType<typeof createMockManager>;
  beforeEach(() => { mgr = createMockManager(); });

  it('server without x402 config still requires JWT (backward compat)', async () => {
    const handler = makeServer(mgr).getRouteHandler('/v1/orchestrate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: {}, body: { goal: 'test' } } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('server with x402 config returns 402 when no JWT and no X-PAYMENT', async () => {
    const handler = makeServer(mgr, PRICING).getRouteHandler('/v1/orchestrate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: {}, body: { goal: 'test' } } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      x402Version: 1,
      accepts: expect.arrayContaining([expect.objectContaining({ scheme: 'exact', network: 'base-sepolia' })]),
    }));
  });

  it('server with x402 config proceeds with valid X-PAYMENT', async () => {
    const handler = makeServer(mgr, PRICING).getRouteHandler('/v1/orchestrate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
    await handler({ headers: { 'x-payment': validPaymentHeader() }, body: { goal: 'test' } } as any, res as any);
    expect(mgr.orchestrate).toHaveBeenCalledWith('test');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ synthesis: 'Final answer' }));
  });

  it('server with x402 config still accepts JWT auth', async () => {
    const srv = makeServer(mgr, PRICING);
    srv.setJwtVerifier(() => true);
    const handler = srv.getRouteHandler('/v1/orchestrate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ headers: { authorization: 'Bearer valid-jwt' }, body: { goal: 'test' } } as any, res as any);
    expect(mgr.orchestrate).toHaveBeenCalledWith('test');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ synthesis: 'Final answer' }));
  });

  it('server returns X-PAYMENT-RESPONSE header on x402-paid request', async () => {
    const handler = makeServer(mgr, PRICING).getRouteHandler('/v1/orchestrate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
    await handler({ headers: { 'x-payment': validPaymentHeader() }, body: { goal: 'test' } } as any, res as any);
    expect(res.setHeader).toHaveBeenCalledWith('X-PAYMENT-RESPONSE', expect.any(String));
    const b64 = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'X-PAYMENT-RESPONSE')![1] as string;
    const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    expect(parsed.success).toBe(true);
    expect(parsed.network).toBe(PRICING.network);
  });

  it('agent card includes x402 accepts when pricing configured', () => {
    const card = makeServer(mgr, PRICING).getAgentCard();
    expect(card.x402).toBeDefined();
    expect(card.x402!.accepts).toHaveLength(1);
    expect(card.x402!.accepts[0]).toMatchObject({
      scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '1000000',
      payTo: PRICING.payTo, asset: 'USDC',
    });
  });

  it('agent card excludes x402 when no pricing configured', () => {
    const card = makeServer(mgr).getAgentCard();
    expect(card.x402).toBeUndefined();
  });
});
