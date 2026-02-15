// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageGenerationRateLimiter } from '../../src/utils/image-generation-rate-limiter';

describe('ImageGenerationRateLimiter', () => {
  let limiter: ImageGenerationRateLimiter;

  beforeEach(() => {
    limiter = new ImageGenerationRateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('canGenerate() returns true initially', () => {
    expect(limiter.canGenerate()).toBe(true);
  });

  it('getRemainingRequests() returns 5 initially (default max)', () => {
    expect(limiter.getRemainingRequests()).toBe(5);
  });

  it('after 1 request, getRemainingRequests() returns 4', () => {
    limiter.recordRequest();
    expect(limiter.getRemainingRequests()).toBe(4);
  });

  it('after 5 requests, canGenerate() returns false', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }
    expect(limiter.canGenerate()).toBe(false);
  });

  it('after 5 requests, getRemainingRequests() returns 0', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }
    expect(limiter.getRemainingRequests()).toBe(0);
  });

  it('after 5 requests, getTimeUntilNextSlot() returns > 0', () => {
    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }
    expect(limiter.getTimeUntilNextSlot()).toBeGreaterThan(0);
  });

  it('after window expires, canGenerate() returns true again', () => {
    vi.useFakeTimers();

    for (let i = 0; i < 5; i++) {
      limiter.recordRequest();
    }
    expect(limiter.canGenerate()).toBe(false);

    // Advance past the default 60s window
    vi.advanceTimersByTime(60_001);

    expect(limiter.canGenerate()).toBe(true);
  });

  it('getTimeUntilNextSlot() returns 0 when under limit', () => {
    expect(limiter.getTimeUntilNextSlot()).toBe(0);
    limiter.recordRequest();
    expect(limiter.getTimeUntilNextSlot()).toBe(0);
  });

  it('custom maxRequests=2 limits after 2 requests', () => {
    const customLimiter = new ImageGenerationRateLimiter(2);
    expect(customLimiter.getRemainingRequests()).toBe(2);

    customLimiter.recordRequest();
    customLimiter.recordRequest();

    expect(customLimiter.canGenerate()).toBe(false);
    expect(customLimiter.getRemainingRequests()).toBe(0);
  });

  it('custom windowMs=1000 expires after 1 second', () => {
    vi.useFakeTimers();

    const customLimiter = new ImageGenerationRateLimiter(5, 1000);

    for (let i = 0; i < 5; i++) {
      customLimiter.recordRequest();
    }
    expect(customLimiter.canGenerate()).toBe(false);

    // Advance past the 1s window
    vi.advanceTimersByTime(1001);

    expect(customLimiter.canGenerate()).toBe(true);
    expect(customLimiter.getRemainingRequests()).toBe(5);
  });
});
