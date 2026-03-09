import { describe, it, expect, vi, beforeEach } from 'vitest';
import { A2AClientPool } from '../../src/a2a/client/A2AClientPool';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const card = { name: 'Paid', description: 'x402', url: 'http://a:3000', version: '0.1.0', skills: [{ id: 's', name: 'S', description: 'S', tags: [] }], securitySchemes: [] };
const payReq = { x402Version: 1, accepts: [{ scheme: 'exact', network: 'base-sepolia', maxAmountRequired: '1000000', resource: '/', description: 'Fee', payTo: '0xP', asset: '0xU', maxTimeoutSeconds: 300 }], error: 'Pay' };
const okResult = { result: { status: { state: 'completed' }, artifacts: [{ parts: [{ type: 'text', text: 'Paid result' }] }] } };

const cardRes = () => ({ ok: true, status: 200, json: async () => card });
const payRes = () => ({ ok: false, status: 402, json: async () => payReq });
const okRes = () => ({ ok: true, status: 200, json: async () => okResult });

const handler = { isPaymentRequired: vi.fn((r: any) => r.status === 402), parseRequirements: vi.fn().mockResolvedValue(payReq), createPaymentHeader: vi.fn().mockResolvedValue('base64pay') };
const budget = { checkBudget: vi.fn(), recordSpend: vi.fn() };

function pool(opts?: any) { return new A2AClientPool(opts); }
function poolX402() { return pool({ paymentHandler: handler as any, budgetTracker: budget as any }); }
const URL = 'http://a:3000';

describe('x402 A2AClientPool integration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    handler.parseRequirements.mockReset().mockResolvedValue(payReq);
    handler.createPaymentHeader.mockReset().mockResolvedValue('base64pay');
    budget.checkBudget.mockReset();
    budget.recordSpend.mockReset();
  });

  it('delegate without payment handler throws on 402', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes());
    await expect(pool().delegate(URL, 'Do')).rejects.toThrow('x402 payment required but no handler configured');
  });

  it('delegate with handler handles 402 -> payment -> retry -> success', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes()).mockResolvedValueOnce(okRes());
    const r = await poolX402().delegate(URL, 'Do');
    expect(r.summary).toBe('Paid result');
    expect(r.model).toBe('external:http://a:3000');
  });

  it('delegate budget check rejects over-budget payment', async () => {
    budget.checkBudget.mockImplementation(() => { throw new Error('x402 budget exceeded'); });
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes());
    await expect(poolX402().delegate(URL, 'Do')).rejects.toThrow('x402 budget exceeded');
  });

  it('delegate records spend after successful payment', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes()).mockResolvedValueOnce(okRes());
    await poolX402().delegate(URL, 'Do');
    expect(budget.recordSpend).toHaveBeenCalledWith('1000000');
  });

  it('delegate still works for non-402 responses (backward compat)', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(okRes());
    const r = await poolX402().delegate(URL, 'Do');
    expect(r.summary).toBe('Paid result');
    expect(budget.recordSpend).not.toHaveBeenCalled();
  });

  it('delegate retries exactly once (no infinite loop)', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes()).mockResolvedValueOnce(payRes());
    await expect(poolX402().delegate(URL, 'Do')).rejects.toThrow('x402 payment retry failed');
  });

  it('delegate propagates errors from payment handler', async () => {
    handler.createPaymentHeader.mockRejectedValueOnce(new Error('Signing failed'));
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes());
    await expect(poolX402().delegate(URL, 'Do')).rejects.toThrow('Signing failed');
  });

  it('delegate sends X-PAYMENT header on retry', async () => {
    mockFetch.mockResolvedValueOnce(cardRes()).mockResolvedValueOnce(payRes()).mockResolvedValueOnce(okRes());
    await poolX402().delegate(URL, 'Do');
    const retryCall = mockFetch.mock.calls[2];
    expect(retryCall[1].headers['X-PAYMENT']).toBe('base64pay');
  });
});
