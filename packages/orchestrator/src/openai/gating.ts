// Authorize-gating + loopback-default bind (Constraint 6, Spec §4.1/§5.5).
// Until the delegate is authorized WITH remaining allowance, /v1/* (chat/images/
// responses) return 402 with the authorize URL. /v1/models and /v1/delegate/* are
// not gated. The daemon binds 127.0.0.1 by default; 0.0.0.0 needs explicit confirm.

export interface AuthGate {
  /** Live authorization read (delegate authorized + remaining USDC allowance). */
  check: () => Promise<{ authorized: boolean; allowanceRemaining: bigint }>;
  /** UI URL the user opens to authorize the delegate / set an allowance. */
  authorizeUrl?: string;
}

/** Express middleware that blocks gated routes until authorized with allowance. */
export function makeAuthGate(gate: AuthGate) {
  return async (_req: any, res: any, next: () => void): Promise<void> => {
    let authorized: boolean;
    let allowanceRemaining: bigint;
    try {
      ({ authorized, allowanceRemaining } = await gate.check());
    } catch (err: any) {
      // Live authorization read failed (e.g. RPC) — fail closed, don't hang.
      res.status(503).json({ error: { message: `Authorization check failed: ${err?.message || 'unavailable'}`, type: 'server_error' } });
      return;
    }
    if (!authorized || allowanceRemaining <= 0n) {
      res.status(402).json({
        error: {
          message: 'Delegate not authorized or allowance exhausted. Authorize the delegate and set a USDC allowance to proceed.',
          type: 'authorization_required',
          authorize_url: gate.authorizeUrl,
        },
      });
      return;
    }
    next();
  };
}

/**
 * Resolve the daemon bind host. Loopback by default; 0.0.0.0 is an explicit,
 * confirmed opt-in (FABSTIR_BIND=0.0.0.0 + FABSTIR_BIND_CONFIRM=1).
 */
export function resolveBindHost(env: Record<string, string | undefined>): string {
  const bind = env.FABSTIR_BIND;
  if (!bind || bind === '127.0.0.1' || bind === 'localhost') return '127.0.0.1';
  if (bind === '0.0.0.0') {
    if (env.FABSTIR_BIND_CONFIRM !== '1') {
      throw new Error(
        'FABSTIR_BIND=0.0.0.0 exposes the daemon beyond loopback and requires FABSTIR_BIND_CONFIRM=1 to confirm',
      );
    }
    return '0.0.0.0';
  }
  return bind;
}
