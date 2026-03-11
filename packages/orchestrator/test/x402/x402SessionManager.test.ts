import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { X402SessionManager } from '../../src/x402/server/X402SessionManager';

describe('X402SessionManager', () => {
  let mgr: X402SessionManager;
  beforeEach(() => { mgr = new X402SessionManager(); });
  afterEach(() => { vi.useRealTimers(); });

  it('createSession returns a valid token with correct fields', () => {
    const session = mgr.createSession('0xPayer', '1000000', 3600);
    expect(session.token).toBeDefined();
    expect(typeof session.token).toBe('string');
    expect(session.token.length).toBeGreaterThan(0);
    expect(session.payer).toBe('0xPayer');
    expect(session.amountPaid).toBe('1000000');
    expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    expect(session.expiresAt).toBeGreaterThan(session.createdAt);
    expect(session.expiresAt).toBe(session.createdAt + 3600 * 1000);
    expect(session.requestCount).toBe(0);
    expect(session.maxRequests).toBeUndefined();
  });

  it('createSession with maxRequests stores the limit', () => {
    const session = mgr.createSession('0xPayer', '1000000', 3600, 10);
    expect(session.maxRequests).toBe(10);
  });

  it('validateSession returns true for valid session', () => {
    const session = mgr.createSession('0xPayer', '1000000', 3600);
    expect(mgr.validateSession(session.token)).toBe(true);
  });

  it('validateSession returns false for unknown token', () => {
    expect(mgr.validateSession('nonexistent-token')).toBe(false);
  });

  it('validateSession returns false for expired session', () => {
    vi.useFakeTimers();
    const session = mgr.createSession('0xPayer', '1000000', 1); // 1 second duration
    vi.advanceTimersByTime(2000); // advance 2 seconds
    expect(mgr.validateSession(session.token)).toBe(false);
  });

  it('consumeRequest increments requestCount and returns true', () => {
    const session = mgr.createSession('0xPayer', '1000000', 3600);
    expect(mgr.consumeRequest(session.token)).toBe(true);
    expect(mgr.consumeRequest(session.token)).toBe(true);
    // After 2 calls, validate still works
    expect(mgr.validateSession(session.token)).toBe(true);
  });

  it('consumeRequest returns false when maxRequests reached', () => {
    const session = mgr.createSession('0xPayer', '1000000', 3600, 2);
    expect(mgr.consumeRequest(session.token)).toBe(true);
    expect(mgr.consumeRequest(session.token)).toBe(true);
    // 3rd request should fail
    expect(mgr.consumeRequest(session.token)).toBe(false);
  });

  it('consumeRequest returns false for invalid token', () => {
    expect(mgr.consumeRequest('invalid-token')).toBe(false);
  });

  it('cleanup removes expired sessions and returns count', () => {
    vi.useFakeTimers();
    mgr.createSession('0xPayer1', '1000000', 1); // expires in 1s
    mgr.createSession('0xPayer2', '2000000', 1); // expires in 1s
    const longSession = mgr.createSession('0xPayer3', '3000000', 3600); // expires in 1h
    vi.advanceTimersByTime(2000); // advance 2 seconds
    const removed = mgr.cleanup();
    expect(removed).toBe(2);
    // Long session should still be valid
    expect(mgr.validateSession(longSession.token)).toBe(true);
  });
});
