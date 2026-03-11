import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { X402RateLimiter } from '../../src/x402/server/X402RateLimiter';

describe('X402RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within rate limit', () => {
    const limiter = new X402RateLimiter(5, 60000);
    const payer = '0xPayer1';
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkLimit(payer)).toBe(true);
    }
  });

  it('rejects requests exceeding rate limit', () => {
    const limiter = new X402RateLimiter(3, 60000);
    const payer = '0xPayer2';
    expect(limiter.checkLimit(payer)).toBe(true);
    expect(limiter.checkLimit(payer)).toBe(true);
    expect(limiter.checkLimit(payer)).toBe(true);
    // 4th request should be rejected
    expect(limiter.checkLimit(payer)).toBe(false);
  });

  it('rate limit resets after window expires', () => {
    const limiter = new X402RateLimiter(2, 1000);
    const payer = '0xPayer3';
    expect(limiter.checkLimit(payer)).toBe(true);
    expect(limiter.checkLimit(payer)).toBe(true);
    // At limit
    expect(limiter.checkLimit(payer)).toBe(false);
    // Advance time past window
    vi.advanceTimersByTime(1001);
    // Should be allowed again
    expect(limiter.checkLimit(payer)).toBe(true);
  });

  it('independent payers have independent limits', () => {
    const limiter = new X402RateLimiter(2, 60000);
    const payerA = '0xPayerA';
    const payerB = '0xPayerB';
    // Payer A uses both slots
    expect(limiter.checkLimit(payerA)).toBe(true);
    expect(limiter.checkLimit(payerA)).toBe(true);
    // Payer A at limit
    expect(limiter.checkLimit(payerA)).toBe(false);
    // Payer B should still be allowed
    expect(limiter.checkLimit(payerB)).toBe(true);
  });
});
