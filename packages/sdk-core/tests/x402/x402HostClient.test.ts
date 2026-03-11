// Copyright (c) 2025 Fabstir — BUSL-1.1
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { X402HostClient } from '../../src/x402/X402HostClient';
import type { X402FetchClient } from '../../src/x402/x402Fetch';

const originalFetch = globalThis.fetch;

function mockResponse(status: number, body: any, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers?.[name] ?? null },
  } as unknown as Response;
}

const COMPLETION_BODY = {
  choices: [{ message: { content: 'Hello world' } }],
  usage: { total_tokens: 42 },
};

const mockX402Client: X402FetchClient = {
  createPayment: vi.fn().mockResolvedValue('payment-header-value'),
};

describe('X402HostClient', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('infer sends POST to /v1/chat/completions', async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, COMPLETION_BODY));
    const client = new X402HostClient({ hostUrl: 'http://host:8080', x402Client: mockX402Client });
    await client.infer({ model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://host:8080/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('infer parses response text and tokens', async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(200, COMPLETION_BODY));
    const client = new X402HostClient({ hostUrl: 'http://host:8080', x402Client: mockX402Client });
    const result = await client.infer({ model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] });
    expect(result.text).toBe('Hello world');
    expect(result.tokensUsed).toBe(42);
  });

  it('infer handles x402 payment (402 then success)', async () => {
    const paymentRequired = {
      x402Version: 1,
      accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: '100000', resource: '/v1/chat/completions', description: 'fee', payTo: '0xP', asset: '0xU', maxTimeoutSeconds: 300 }],
      error: 'Payment required',
    };
    (globalThis.fetch as any)
      .mockResolvedValueOnce(mockResponse(402, paymentRequired))
      .mockResolvedValueOnce(mockResponse(200, COMPLETION_BODY));
    const client = new X402HostClient({ hostUrl: 'http://host:8080', x402Client: mockX402Client });
    const result = await client.infer({ model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] });
    expect(result.text).toBe('Hello world');
    expect(mockX402Client.createPayment).toHaveBeenCalled();
  });

  it('infer throws on non-ok response', async () => {
    (globalThis.fetch as any).mockResolvedValue(mockResponse(500, { error: 'server error' }));
    const client = new X402HostClient({ hostUrl: 'http://host:8080', x402Client: mockX402Client });
    await expect(client.infer({ model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] }))
      .rejects.toThrow('Host inference failed: 500');
  });

  it('infer parses X-PAYMENT-RESPONSE header', async () => {
    const paymentResp = { success: true, transaction: '0xTx', network: 'base' };
    const encoded = btoa(JSON.stringify(paymentResp));
    (globalThis.fetch as any).mockResolvedValue(
      mockResponse(200, COMPLETION_BODY, { 'X-PAYMENT-RESPONSE': encoded }),
    );
    const client = new X402HostClient({ hostUrl: 'http://host:8080', x402Client: mockX402Client });
    const result = await client.infer({ model: 'llama3', messages: [{ role: 'user', content: 'Hi' }] });
    expect(result.paymentResponse).toEqual(paymentResp);
  });

  it('constructor trims trailing slash from hostUrl', () => {
    const client = new X402HostClient({ hostUrl: 'http://host:8080/', x402Client: mockX402Client });
    expect(client.getHostUrl()).toBe('http://host:8080');
  });
});
