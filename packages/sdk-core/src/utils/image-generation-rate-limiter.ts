// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Client-side sliding window rate limiter for image generation.
 * Prevents unnecessary network round trips.
 */
export class ImageGenerationRateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  private prune(): void {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
  }

  canGenerate(): boolean {
    this.prune();
    return this.timestamps.length < this.maxRequests;
  }

  recordRequest(): void {
    this.prune();
    this.timestamps.push(Date.now());
  }

  getTimeUntilNextSlot(): number {
    this.prune();
    if (this.timestamps.length < this.maxRequests) return 0;
    return this.windowMs - (Date.now() - this.timestamps[0]);
  }

  getRemainingRequests(): number {
    this.prune();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }
}
