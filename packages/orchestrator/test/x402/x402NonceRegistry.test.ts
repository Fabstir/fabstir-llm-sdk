import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NonceRegistry } from '../../src/x402/server/NonceRegistry';

describe('NonceRegistry', () => {
  let registry: NonceRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = new NonceRegistry();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checkAndRecord returns true for new nonce', () => {
    expect(registry.checkAndRecord('0xNonce1')).toBe(true);
  });

  it('checkAndRecord returns false for repeated nonce', () => {
    registry.checkAndRecord('0xNonce1');
    expect(registry.checkAndRecord('0xNonce1')).toBe(false);
  });

  it('cleanup removes entries older than maxAge', () => {
    registry.checkAndRecord('0xOldNonce');
    vi.advanceTimersByTime(60_000); // advance 60s
    registry.checkAndRecord('0xNewNonce');
    const removed = registry.cleanup(30_000); // max age 30s
    expect(removed).toBe(1);
    // Old nonce freed, can be used again
    expect(registry.checkAndRecord('0xOldNonce')).toBe(true);
    // New nonce still tracked
    expect(registry.checkAndRecord('0xNewNonce')).toBe(false);
  });

  it('independent nonces are tracked independently', () => {
    expect(registry.checkAndRecord('0xA')).toBe(true);
    expect(registry.checkAndRecord('0xB')).toBe(true);
    expect(registry.checkAndRecord('0xA')).toBe(false);
    expect(registry.checkAndRecord('0xB')).toBe(false);
  });

  it('size returns current count', () => {
    expect(registry.size()).toBe(0);
    registry.checkAndRecord('0x1');
    registry.checkAndRecord('0x2');
    expect(registry.size()).toBe(2);
    registry.checkAndRecord('0x1'); // duplicate, no new entry
    expect(registry.size()).toBe(2);
  });
});
