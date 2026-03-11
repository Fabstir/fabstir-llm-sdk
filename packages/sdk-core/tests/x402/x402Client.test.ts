// Copyright (c) 2025 Fabstir — BUSL-1.1
import { describe, it, expect, vi } from 'vitest';
import { X402Client } from '../../src/x402/X402Client';
import type { X402PaymentRequirement } from '../../src/x402/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', CHAIN = 84532;
const ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const makeSigner = (o: Record<string, any> = {}) => ({
  getAddress: vi.fn().mockResolvedValue(ADDR),
  signTypedData: vi.fn().mockResolvedValue('0xmocksig'), ...o,
});
const makeReq = (o: Partial<X402PaymentRequirement> = {}): X402PaymentRequirement => ({
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '1000000',
  resource: '/api/orchestrate', description: 'fee', payTo: '0xRecipient',
  asset: USDC, maxTimeoutSeconds: 300, ...o,
});

describe('X402Client', () => {
  it('constructor accepts signer, usdcAddress, chainId', () => {
    const client = new X402Client(makeSigner(), USDC, CHAIN);
    expect(client).toBeDefined();
    expect(client.isPaymentRequired({ status: 402 })).toBe(true);
  });

  it('isPaymentRequired returns true for 402, false for 200', () => {
    const c = new X402Client(makeSigner(), USDC, CHAIN);
    expect(c.isPaymentRequired({ status: 402 })).toBe(true);
    expect(c.isPaymentRequired({ status: 200 })).toBe(false);
  });

  it('createPayment returns base64-encoded X402PaymentPayload', async () => {
    const decoded = JSON.parse(atob(await new X402Client(makeSigner(), USDC, CHAIN).createPayment(makeReq())));
    expect(decoded.x402Version).toBe(1);
    expect(decoded.scheme).toBe('exact');
    expect(decoded.network).toBe('base-sepolia');
    expect(decoded.payload.signature).toBe('0xmocksig');
    expect(decoded.payload.authorization).toBeDefined();
  });

  it('createPayment uses correct EIP-712 domain (USD Coin v2)', async () => {
    const s = makeSigner();
    await new X402Client(s, USDC, CHAIN).createPayment(makeReq());
    expect(s.signTypedData.mock.calls[0][0]).toEqual(
      { name: 'USD Coin', version: '2', chainId: CHAIN, verifyingContract: USDC });
  });

  it('createPayment uses correct TransferWithAuthorization types', async () => {
    const s = makeSigner();
    await new X402Client(s, USDC, CHAIN).createPayment(makeReq());
    expect(s.signTypedData.mock.calls[0][1]).toEqual({ TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] });
  });

  it('createPayment sets authorization.to from requirement.payTo', async () => {
    const s = makeSigner();
    await new X402Client(s, USDC, CHAIN).createPayment(makeReq({ payTo: '0xCustom' }));
    expect(s.signTypedData.mock.calls[0][2].to).toBe('0xCustom');
  });

  it('createPayment sets authorization.value from requirement.maxAmountRequired', async () => {
    const s = makeSigner();
    await new X402Client(s, USDC, CHAIN).createPayment(makeReq({ maxAmountRequired: '5000000' }));
    expect(s.signTypedData.mock.calls[0][2].value).toBe('5000000');
  });

  it('createPayment generates unique nonce per call', async () => {
    const s = makeSigner(), c = new X402Client(s, USDC, CHAIN);
    await c.createPayment(makeReq());
    await c.createPayment(makeReq());
    const n1 = s.signTypedData.mock.calls[0][2].nonce, n2 = s.signTypedData.mock.calls[1][2].nonce;
    expect(n1).not.toBe(n2);
    expect(n1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(n2).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('handleResponse parses X-PAYMENT-RESPONSE header', () => {
    const data = { success: true, transaction: '0xtx', network: 'base-sepolia', payer: ADDR };
    const resp = { headers: { get: vi.fn().mockReturnValue(JSON.stringify(data)) } };
    expect(new X402Client(makeSigner(), USDC, CHAIN).handleResponse(resp)).toEqual(data);
    expect(resp.headers.get).toHaveBeenCalledWith('X-PAYMENT-RESPONSE');
  });

  it('handleResponse returns null when header is missing', () => {
    const resp = { headers: { get: vi.fn().mockReturnValue(null) } };
    expect(new X402Client(makeSigner(), USDC, CHAIN).handleResponse(resp)).toBeNull();
  });

  it('does not use Node.js Buffer or crypto module', () => {
    const src = readFileSync(join(__dirname, '../../src/x402/X402Client.ts'), 'utf-8');
    for (const pat of [/require\(['"]crypto['"]\)/, /require\(['"]buffer['"]\)/,
      /Buffer\.from/, /import\s+.*\s+from\s+['"]crypto['"]/, /import\s+.*\s+from\s+['"]buffer['"]/])
      expect(src).not.toMatch(pat);
  });
});
