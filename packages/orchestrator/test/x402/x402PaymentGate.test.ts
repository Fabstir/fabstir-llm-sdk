import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { X402PricingConfig, X402PaymentPayload } from '../../src/x402/types';

const DEFAULT_CONFIG: X402PricingConfig = {
  orchestratePrice: '1000000',
  payTo: '0xRecipient',
  asset: '0xUSDC',
  network: 'base-sepolia',
  maxTimeoutSeconds: 300,
};

function validPayload(overrides: Partial<X402PaymentPayload> = {}): X402PaymentPayload {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature: '0xdeadbeef',
      authorization: {
        from: '0xPayer',
        to: '0xRecipient',
        value: '1000000',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: '0x01',
      },
    },
    ...overrides,
  };
}

function encodeHeader(p: X402PaymentPayload): string {
  return Buffer.from(JSON.stringify(p)).toString('base64');
}

function mockReq(headers: Record<string, string> = {}, body: any = {}): any {
  return { headers, body };
}

function mockRes(): any {
  const res: any = { statusCode: 200 };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

describe('x402PaymentGate middleware', () => {
  let x402PaymentGate: typeof import('../../src/x402/server/X402PaymentGate').x402PaymentGate;
  let decodeX402Payment: typeof import('../../src/x402/server/X402PaymentGate').decodeX402Payment;
  let validatePayloadFields: typeof import('../../src/x402/server/X402PaymentGate').validatePayloadFields;

  beforeEach(async () => {
    const mod = await import('../../src/x402/server/X402PaymentGate');
    x402PaymentGate = mod.x402PaymentGate;
    decodeX402Payment = mod.decodeX402Payment;
    validatePayloadFields = mod.validatePayloadFields;
  });

  it('request without X-PAYMENT returns 402 with PaymentRequired body', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    const body = res.json.mock.calls[0][0];
    expect(body.x402Version).toBe(1);
    expect(body.accepts).toHaveLength(1);
    expect(body.error).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('request with valid X-PAYMENT header calls next()', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const header = encodeHeader(validPayload());
    const req = mockReq({ 'x-payment': header });
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.x402Payment).toBeDefined();
    expect(req.x402Payment.scheme).toBe('exact');
  });

  it('request with malformed base64 returns 402 with error', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const req = mockReq({ 'x-payment': '!!!not-base64!!!' });
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('request with wrong network returns 402 with error', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const header = encodeHeader(validPayload({ network: 'ethereum-mainnet' }));
    const req = mockReq({ 'x-payment': header });
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toContain('network');
    expect(next).not.toHaveBeenCalled();
  });

  it('request with insufficient amount returns 402 error', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const p = validPayload();
    p.payload.authorization.value = '100'; // too low
    const header = encodeHeader(p);
    const req = mockReq({ 'x-payment': header });
    const res = mockRes();
    const next = vi.fn();
    await mw(req, res, next);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('PaymentRequired body has correct asset and payTo from config', async () => {
    const mw = x402PaymentGate(DEFAULT_CONFIG);
    const req = mockReq({});
    const res = mockRes();
    await mw(req, res, vi.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.accepts[0].payTo).toBe('0xRecipient');
    expect(body.accepts[0].asset).toBe('0xUSDC');
    expect(body.accepts[0].network).toBe('base-sepolia');
  });

  it('decodeX402Payment correctly decodes base64 JSON', () => {
    const p = validPayload();
    const encoded = encodeHeader(p);
    const decoded = decodeX402Payment(encoded);
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.payload.authorization.from).toBe('0xPayer');
  });

  it('validatePayloadFields rejects expired validBefore', () => {
    const p = validPayload();
    p.payload.authorization.validBefore = '0'; // already expired
    expect(() => validatePayloadFields(p, DEFAULT_CONFIG)).toThrow(/expired|validBefore/i);
  });
});
