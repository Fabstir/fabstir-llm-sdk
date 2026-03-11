// Copyright (c) 2025 Fabstir — BUSL-1.1
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { X402PaymentRequired } from '../../src/x402/types';

const B402: X402PaymentRequired = { x402Version: 1, error: 'Payment required', accepts: [{
  scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '1000000', resource: '/v1/orchestrate',
  description: 'test', payTo: '0x1234567890abcdef1234567890abcdef12345678',
  asset: '0xUSDC0000000000000000000000000000000000000', maxTimeoutSeconds: 30,
}] };
const r402 = () => ({ status: 402, json: vi.fn().mockResolvedValue(B402), headers: new Headers() } as unknown as Response);
const r200 = () => ({ status: 200, headers: new Headers() } as unknown as Response);
const cli = () => ({ createPayment: vi.fn().mockResolvedValue('cGF5') });

describe('x402Fetch', () => {
  let orig: typeof globalThis.fetch;
  beforeEach(() => { orig = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = orig; });

  it('returns response directly if status is not 402', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    const ok = r200();
    globalThis.fetch = vi.fn().mockResolvedValue(ok);
    expect(await x402Fetch('https://x.co/a', { method: 'POST' })).toBe(ok);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('on 402, signs payment and retries with X-PAYMENT header', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    const ok = r200(), mf = vi.fn().mockResolvedValueOnce(r402()).mockResolvedValueOnce(ok);
    globalThis.fetch = mf;
    const c = { createPayment: vi.fn().mockResolvedValue('dGVzdA==') };
    expect(await x402Fetch('https://x.co/a', { method: 'POST' }, c)).toBe(ok);
    expect(c.createPayment).toHaveBeenCalledWith(B402.accepts[0]);
    expect(mf.mock.calls[1][1].headers['X-PAYMENT']).toBe('dGVzdA==');
  });

  it('throws on second 402 (no infinite retry)', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    globalThis.fetch = vi.fn().mockResolvedValue(r402());
    await expect(x402Fetch('https://x.co/a', { method: 'POST' }, cli())).rejects.toThrow('x402 payment rejected after retry');
  });

  it('throws if no x402Client provided and response is 402', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    globalThis.fetch = vi.fn().mockResolvedValue(r402());
    await expect(x402Fetch('https://x.co/a', { method: 'POST' })).rejects.toThrow('x402 payment required but no client configured');
  });

  it('checks budget before signing payment', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    globalThis.fetch = vi.fn().mockResolvedValue(r402());
    const c = { createPayment: vi.fn() };
    const b = { checkBudget: vi.fn(() => { throw new Error('budget exceeded'); }), recordSpend: vi.fn() };
    await expect(x402Fetch('https://x.co/a', { method: 'POST' }, c, b)).rejects.toThrow('budget exceeded');
    expect(c.createPayment).not.toHaveBeenCalled();
  });

  it('records spend after successful retry', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(r402()).mockResolvedValueOnce(r200());
    const b = { checkBudget: vi.fn(), recordSpend: vi.fn() };
    await x402Fetch('https://x.co/a', { method: 'POST' }, cli(), b);
    expect(b.recordSpend).toHaveBeenCalledWith('1000000');
  });

  it('passes original fetch options on retry', async () => {
    const { x402Fetch } = await import('../../src/x402/x402Fetch');
    const mf = vi.fn().mockResolvedValueOnce(r402()).mockResolvedValueOnce(r200());
    globalThis.fetch = mf;
    const opts: RequestInit = { method: 'POST', body: '{"p":"hi"}',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' } };
    await x402Fetch('https://x.co/a', opts, cli());
    const r = mf.mock.calls[1];
    expect(r[0]).toBe('https://x.co/a');
    expect(r[1].method).toBe('POST');
    expect(r[1].body).toBe('{"p":"hi"}');
    expect(r[1].headers['Content-Type']).toBe('application/json');
    expect(r[1].headers['X-PAYMENT']).toBe('cGF5');
  });
});
