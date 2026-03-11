/** Server-side nonce tracking to reject replayed x402 payments */
export class NonceRegistry {
  private readonly used = new Map<string, number>();

  /** Returns true if nonce is new (allowed), false if already used (replay). */
  checkAndRecord(nonce: string): boolean {
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, Date.now());
    return true;
  }

  /** Remove entries older than maxAgeMs. Returns count removed. */
  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [nonce, ts] of this.used) {
      if (ts < cutoff) {
        this.used.delete(nonce);
        removed++;
      }
    }
    return removed;
  }

  /** Current number of tracked nonces. */
  size(): number {
    return this.used.size;
  }
}
