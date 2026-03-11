/** Per-payer rate limiter using sliding window counters */
export class X402RateLimiter {
  private readonly windows = new Map<string, { count: number; startMs: number }>();

  constructor(
    private readonly maxRequestsPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if request is within limit, false if rate limited */
  checkLimit(payerAddress: string): boolean {
    const now = Date.now();
    const key = payerAddress.toLowerCase();
    const entry = this.windows.get(key);

    if (!entry || now - entry.startMs >= this.windowMs) {
      this.windows.set(key, { count: 1, startMs: now });
      return true;
    }

    if (entry.count >= this.maxRequestsPerWindow) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Remove expired window entries */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now - entry.startMs >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
