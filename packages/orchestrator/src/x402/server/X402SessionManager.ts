// Copyright (c) 2025 Fabstir — BUSL-1.1

export interface X402SessionToken {
  token: string;
  payer: string;
  amountPaid: string;
  createdAt: number;
  expiresAt: number;
  maxRequests?: number;
  requestCount: number;
}

export class X402SessionManager {
  private readonly sessions = new Map<string, X402SessionToken>();

  createSession(payer: string, amountPaid: string, durationSec: number, maxRequests?: number): X402SessionToken {
    const token = globalThis.crypto.randomUUID();
    const now = Date.now();
    const session: X402SessionToken = {
      token,
      payer,
      amountPaid,
      createdAt: now,
      expiresAt: now + durationSec * 1000,
      maxRequests,
      requestCount: 0,
    };
    this.sessions.set(token, session);
    return session;
  }

  validateSession(token: string): boolean {
    const session = this.sessions.get(token);
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return false;
    }
    if (session.maxRequests !== undefined && session.requestCount >= session.maxRequests) {
      return false;
    }
    return true;
  }

  consumeRequest(token: string): boolean {
    if (!this.validateSession(token)) return false;
    const session = this.sessions.get(token)!;
    session.requestCount++;
    return true;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [token, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
        removed++;
      }
    }
    return removed;
  }
}
