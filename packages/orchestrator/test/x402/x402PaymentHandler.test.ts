import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { X402PaymentHandler } from '../../src/x402/client/X402PaymentHandler';
import type { X402PaymentRequirement, X402PaymentPayload } from '../../src/x402/types';

const mockSigner = () => ({
  getAddress: vi.fn().mockResolvedValue('0xSignerAddress'),
  signTypedData: vi.fn().mockResolvedValue('0xSignature123'),
});

const mockRequirement = (): X402PaymentRequirement => ({
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '1000000',
  resource: '/v1/orchestrate',
  description: 'Orchestration fee',
  payTo: '0xRecipientAddress',
  asset: '0xUSDCAddress',
  maxTimeoutSeconds: 300,
});

describe('X402PaymentHandler', () => {
  it('isPaymentRequired returns true for status 402', () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    expect(handler.isPaymentRequired({ status: 402 })).toBe(true);
  });

  it('isPaymentRequired returns false for status 200', () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    expect(handler.isPaymentRequired({ status: 200 })).toBe(false);
  });

  it('parseRequirements extracts X402PaymentRequired from 402 body', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const body = { x402Version: 1, accepts: [mockRequirement()], error: 'Payment required' };
    const response = { json: vi.fn().mockResolvedValue(body) };
    const result = await handler.parseRequirements(response);
    expect(result.x402Version).toBe(1);
    expect(result.accepts).toHaveLength(1);
    expect(result.error).toBe('Payment required');
  });

  it('createPaymentHeader calls signer.getAddress and signer.signTypedData', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    await handler.createPaymentHeader(mockRequirement());
    expect(signer.getAddress).toHaveBeenCalledOnce();
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it('createPaymentHeader produces valid base64-encoded X402PaymentPayload', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const header = await handler.createPaymentHeader(mockRequirement());
    const decoded: X402PaymentPayload = JSON.parse(atob(header));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('base-sepolia');
    expect(decoded.payload.signature).toBe('0xSignature123');
    expect(decoded.payload.authorization).toBeDefined();
  });

  it('authorization has correct from, to, value from requirement', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const req = mockRequirement();
    const header = await handler.createPaymentHeader(req);
    const decoded: X402PaymentPayload = JSON.parse(atob(header));
    const auth = decoded.payload.authorization;
    expect(auth.from).toBe('0xSignerAddress');
    expect(auth.to).toBe(req.payTo);
    expect(auth.value).toBe(req.maxAmountRequired);
  });

  it('nonce is unique per call', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const req = mockRequirement();
    const header1 = await handler.createPaymentHeader(req);
    const header2 = await handler.createPaymentHeader(req);
    const decoded1: X402PaymentPayload = JSON.parse(atob(header1));
    const decoded2: X402PaymentPayload = JSON.parse(atob(header2));
    expect(decoded1.payload.authorization.nonce).not.toBe(decoded2.payload.authorization.nonce);
  });

  it('validBefore respects maxTimeoutSeconds', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const req = mockRequirement();
    const before = Math.floor(Date.now() / 1000);
    const header = await handler.createPaymentHeader(req);
    const after = Math.floor(Date.now() / 1000);
    const decoded: X402PaymentPayload = JSON.parse(atob(header));
    const validBefore = Number(decoded.payload.authorization.validBefore);
    expect(validBefore).toBeGreaterThanOrEqual(before + req.maxTimeoutSeconds);
    expect(validBefore).toBeLessThanOrEqual(after + req.maxTimeoutSeconds + 1);
  });

  it('does not import Node.js crypto module', () => {
    const sourcePath = path.resolve(__dirname, '../../src/x402/client/X402PaymentHandler.ts');
    const source = fs.readFileSync(sourcePath, 'utf-8');
    expect(source).not.toMatch(/from\s+['"]crypto['"]/);
    expect(source).not.toMatch(/require\s*\(\s*['"]crypto['"]\s*\)/);
  });

  it('createPaymentHeader generates valid bytes32 nonce (32 bytes = 64 hex chars)', async () => {
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    const header = await handler.createPaymentHeader(mockRequirement());
    const decoded: X402PaymentPayload = JSON.parse(atob(header));
    const nonce = decoded.payload.authorization.nonce;
    expect(nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('createPaymentHeader uses globalThis.crypto.getRandomValues for nonce', async () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const signer = mockSigner();
    const handler = new X402PaymentHandler(signer, '0xUSDC', 84532);
    await handler.createPaymentHeader(mockRequirement());
    expect(spy).toHaveBeenCalledWith(expect.any(Uint8Array));
    const callArg = spy.mock.calls[0][0] as Uint8Array;
    expect(callArg).toBeInstanceOf(Uint8Array);
    expect(callArg.length).toBe(32);
    spy.mockRestore();
  });
});
