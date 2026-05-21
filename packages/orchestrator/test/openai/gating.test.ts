import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeAuthGate, resolveBindHost } from '../../src/openai/gating';

/** Sub-phase 5.3 — authorize-gating of /v1/* + loopback-default bind. */

function res() {
  const r: any = {};
  r.status = vi.fn(() => r); r.json = vi.fn((o: any) => { r.body = o; return r; });
  return r;
}

describe('authorize gating (5.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks /v1/* before authorization with 402 + authorize URL (no next, no session)', async () => {
    const gate = makeAuthGate({ check: async () => ({ authorized: false, allowanceRemaining: 0n }), authorizeUrl: 'http://ui/authorize' });
    const r = res(); const next = vi.fn();
    await gate({} as any, r, next);
    expect(r.status).toHaveBeenCalledWith(402);
    expect(r.body.error.authorize_url).toBe('http://ui/authorize');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows the request once authorized with remaining allowance', async () => {
    const gate = makeAuthGate({ check: async () => ({ authorized: true, allowanceRemaining: 1000n }) });
    const r = res(); const next = vi.fn();
    await gate({} as any, r, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r.status).not.toHaveBeenCalled();
  });

  it('re-engages gating when allowance is zeroed (revocation), even if still "authorized"', async () => {
    const gate = makeAuthGate({ check: async () => ({ authorized: true, allowanceRemaining: 0n }) });
    const r = res(); const next = vi.fn();
    await gate({} as any, r, next);
    expect(r.status).toHaveBeenCalledWith(402);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails CLOSED with 503 (not a hang) when the live authorization read throws', async () => {
    const gate = makeAuthGate({ check: async () => { throw new Error('rpc down'); } });
    const r = res(); const next = vi.fn();
    await gate({} as any, r, next);
    expect(r.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('loopback-default bind (5.3)', () => {
  it('defaults to 127.0.0.1', () => {
    expect(resolveBindHost({})).toBe('127.0.0.1');
    expect(resolveBindHost({ FABSTIR_BIND: '127.0.0.1' })).toBe('127.0.0.1');
    expect(resolveBindHost({ FABSTIR_BIND: 'localhost' })).toBe('127.0.0.1');
  });

  it('refuses 0.0.0.0 without FABSTIR_BIND_CONFIRM=1', () => {
    expect(() => resolveBindHost({ FABSTIR_BIND: '0.0.0.0' })).toThrow(/FABSTIR_BIND_CONFIRM/);
  });

  it('allows 0.0.0.0 only with the explicit confirm', () => {
    expect(resolveBindHost({ FABSTIR_BIND: '0.0.0.0', FABSTIR_BIND_CONFIRM: '1' })).toBe('0.0.0.0');
  });
});
