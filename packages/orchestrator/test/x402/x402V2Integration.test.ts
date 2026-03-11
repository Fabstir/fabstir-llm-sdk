import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrchestratorA2AServer } from '../../src/a2a/server/OrchestratorA2AServer';
import type { X402PricingConfig } from '../../src/x402/types';

function createMockManager() {
  return {
    orchestrate: vi.fn().mockResolvedValue({
      taskGraphId: 'test-id', synthesis: 'test result',
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

const mockReq = (overrides: any) => ({
  headers: { ...overrides.headers },
  body: { goal: 'test goal' },
  on: vi.fn(),
  ...overrides,
});

const mockRes = () => {
  const res: any = { statusCode: 200, headers: {} as Record<string, string> };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((data: any) => { res.data = data; return res; });
  res.setHeader = vi.fn((key: string, val: string) => { res.headers[key] = val; });
  return res;
};

function makeSessionServer(mgr: any) {
  return new OrchestratorA2AServer(mgr, {
    publicUrl: 'http://localhost:3000', port: 0,
    x402Pricing: PRICING,
    x402SessionDurationSec: 3600,
    x402MaxRequestsPerSession: 10,
  });
}

describe('x402 V2 Session Integration', () => {
  let mgr: ReturnType<typeof createMockManager>;
  beforeEach(() => { mgr = createMockManager(); });

  it('session token auth bypasses payment', async () => {
    const srv = makeSessionServer(mgr);
    const sessionMgr = srv.getSessionManager();
    expect(sessionMgr).not.toBeNull();
    const session = sessionMgr!.createSession('0xPayer', '1000000', 3600, 10);

    const handler = srv.getRouteHandler('/v1/orchestrate');
    const req = mockReq({ headers: { authorization: `Bearer session:${session.token}` } });
    const res = mockRes();
    await handler(req as any, res as any);

    expect(mgr.orchestrate).toHaveBeenCalledWith('test goal');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ synthesis: 'test result' }));
  });

  it('expired session token falls through to payment required', async () => {
    const srv = makeSessionServer(mgr);
    const sessionMgr = srv.getSessionManager()!;
    // Create session with 0 duration (immediately expired)
    const session = sessionMgr.createSession('0xPayer', '1000000', 0);

    const handler = srv.getRouteHandler('/v1/orchestrate');
    const req = mockReq({ headers: { authorization: `Bearer session:${session.token}` } });
    const res = mockRes();
    // Small delay to ensure expiry
    await new Promise(r => setTimeout(r, 10));
    await handler(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('X-PAYMENT creates session token in response', async () => {
    const srv = makeSessionServer(mgr);
    const handler = srv.getRouteHandler('/v1/orchestrate');
    const req = mockReq({ headers: { 'x-payment': validPaymentHeader() } });
    const res = mockRes();
    await handler(req as any, res as any);

    expect(res.setHeader).toHaveBeenCalledWith('X-PAYMENT-RESPONSE', expect.any(String));
    const b64 = res.setHeader.mock.calls.find((c: any[]) => c[0] === 'X-PAYMENT-RESPONSE')![1] as string;
    const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    expect(parsed.sessionToken).toBeDefined();
    expect(typeof parsed.sessionToken).toBe('string');
  });

  it('session token with maxRequests limit works', async () => {
    const srv = makeSessionServer(mgr);
    const sessionMgr = srv.getSessionManager()!;
    const session = sessionMgr.createSession('0xPayer', '1000000', 3600, 2);

    const handler = srv.getRouteHandler('/v1/orchestrate');

    // First request: should succeed
    const res1 = mockRes();
    await handler(mockReq({ headers: { authorization: `Bearer session:${session.token}` } }) as any, res1 as any);
    expect(mgr.orchestrate).toHaveBeenCalledTimes(1);

    // Second request: should succeed
    const res2 = mockRes();
    await handler(mockReq({ headers: { authorization: `Bearer session:${session.token}` } }) as any, res2 as any);
    expect(mgr.orchestrate).toHaveBeenCalledTimes(2);

    // Third request: maxRequests reached, should require payment
    const res3 = mockRes();
    await handler(mockReq({ headers: { authorization: `Bearer session:${session.token}` } }) as any, res3 as any);
    expect(res3.status).toHaveBeenCalledWith(402);
  });

  it('no session manager when session options not provided', () => {
    const srv = new OrchestratorA2AServer(mgr as any, {
      publicUrl: 'http://localhost:3000', port: 0,
      x402Pricing: PRICING,
    });
    expect(srv.getSessionManager()).toBeNull();
  });
});
