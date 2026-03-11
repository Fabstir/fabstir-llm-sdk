import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { OrchestratorA2AServer } from '../../src/a2a/server/OrchestratorA2AServer';
import type { X402PricingConfig } from '../../src/x402/types';

const PRICING: X402PricingConfig = { orchestratePrice: '1000000', payTo: '0xRecipient', asset: '0xUSDC', network: 'base-sepolia', maxTimeoutSeconds: 300 };
const mockMgr = () => ({ orchestrate: vi.fn().mockResolvedValue({ taskGraphId: 'id', synthesis: 'ok', proofCIDs: [], totalTokensUsed: 1 }) } as any);
function encodePayment(): string {
  const p = { x402Version: 1, scheme: 'exact', network: 'base-sepolia', payload: { signature: '0xdeadbeef',
    authorization: { from: '0xPayer', to: '0xRecipient', value: '1000000', validAfter: '0',
      validBefore: String(Math.floor(Date.now() / 1000) + 3600), nonce: '0x' + Math.random().toString(16).slice(2, 10) } } };
  return Buffer.from(JSON.stringify(p)).toString('base64');
}
function mockRes(): any {
  const r: any = { statusCode: 200 }; r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn().mockReturnValue(r); r.setHeader = vi.fn().mockReturnValue(r); return r;
}
const makeServer = (mgr: any, emitter: EventEmitter, extra: any = {}) =>
  new OrchestratorA2AServer(mgr, { publicUrl: 'http://localhost', x402Pricing: PRICING, eventEmitter: emitter, ...extra });
const req = () => ({ headers: { 'x-payment': encodePayment() }, body: { goal: 'test' } } as any);

describe('x402 Observability Events', () => {
  let emitter: EventEmitter; let mgr: any;
  beforeEach(() => { emitter = new EventEmitter(); mgr = mockMgr(); });

  it('emits x402:payment-received after successful field validation', async () => {
    const events: any[] = []; emitter.on('x402:payment-received', (d) => events.push(d));
    await makeServer(mgr, emitter).getRouteHandler('/v1/orchestrate')(req(), mockRes());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payer: '0xPayer', amount: '1000000', network: 'base-sepolia' });
  });

  it('emits x402:payment-settled after on-chain settlement succeeds', async () => {
    const srv = makeServer(mgr, emitter);
    (srv as any).validator = { validate: vi.fn().mockResolvedValue({ success: true, network: 'base-sepolia', transaction: '0xTxHash' }) };
    const events: any[] = []; emitter.on('x402:payment-settled', (d) => events.push(d));
    await srv.getRouteHandler('/v1/orchestrate')(req(), mockRes());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payer: '0xPayer', amount: '1000000', transaction: '0xTxHash' });
  });

  it('emits x402:payment-failed when settlement fails', async () => {
    const srv = makeServer(mgr, emitter);
    (srv as any).validator = { validate: vi.fn().mockResolvedValue({ success: false, network: 'base-sepolia', errorReason: 'Settlement failed' }) };
    const events: any[] = []; emitter.on('x402:payment-failed', (d) => events.push(d));
    await srv.getRouteHandler('/v1/orchestrate')(req(), mockRes());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payer: '0xPayer', error: 'Settlement failed' });
  });

  it('emits x402:session-created when session token is issued', async () => {
    const events: any[] = []; emitter.on('x402:session-created', (d) => events.push(d));
    await makeServer(mgr, emitter, { x402SessionDurationSec: 3600 }).getRouteHandler('/v1/orchestrate')(req(), mockRes());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ payer: '0xPayer', token: expect.any(String) });
  });
});
