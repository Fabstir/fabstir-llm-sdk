// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Training M0 serve-back (E.1/E.2/E.3) — pure frame mapping and the client-side gate, no I/O.
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.11 §§E.1/E.2/E.3.
//
// Appendix A DEVIATION, recorded with cause: the plan's Phase 6 row named only
// SessionManager.ts + training.types.ts. These two helpers are PURE and belong at neither
// altitude — SessionManager would own wire-frame mapping it cannot unit-test in isolation,
// and training.types.ts is ALREADY over its ≤260 budget (344) with a Phase 10 item open to
// split it. Adding a third home is the smaller debt. See the Phase 6 execution record.
import { TrainingError, LORA_STAGING_FAILED_REASONS } from '../errors/training-errors';

/**
 * `ADAPTER_STAGE_BUDGET_SECS` = 300 s (doc, v0.3.10), the node's wall-clock cap on ONE staging
 * attempt, after which it fails with `reason: "budget"`.
 *
 * v0.3.10 also settled the question this constant was useless without: the concurrency permit
 * is acquired INSIDE the timed future, so a stage queued behind another spends its OWN budget
 * rather than deferring the start of it. There is no queue-depth term — 300 s is the whole
 * bound, and the client's timeout becomes arithmetic instead of a guess.
 */
export const ADAPTER_STAGE_BUDGET_MS = 300_000;

/**
 * The first-response timeout for a session, given the caller's base cold-start allowance.
 *
 * A prompt sent DURING staging is neither refused nor served from the base model — the node's
 * message loop is strictly sequential, so it waits in the socket buffer and is answered
 * afterwards WITH the adapter. The first response on a lora session can therefore need the
 * whole stage budget PLUS the inference the base allowance already covers. Timing out below
 * that aborts a session that was going to answer, on a run the user has already paid for.
 *
 * Non-lora sessions are unchanged: same number in, same number out.
 */
export function firstResponseTimeoutMs(baseMs: number, hasStagedAdapter: boolean): number {
  return hasStagedAdapter ? baseMs + ADAPTER_STAGE_BUDGET_MS : baseMs;
}

/** The two wire codes E.3 defines. Everything else on the socket is somebody else's frame. */
const SERVE_BACK_CODES = ['LORA_STAGING_FAILED', 'LORA_NOT_STAGED'] as const;
type ServeBackCode = (typeof SERVE_BACK_CODES)[number];

/**
 * Map a node frame to a typed serve-back error, or null when it is not one.
 *
 * `LORA_STAGING_FAILED` is post-ack and UNCORRELATED — no request is in flight and the
 * init's id was already consumed by the ack, so a handler keyed on `requestId` never sees
 * it. `LORA_NOT_STAGED` is per-prompt and correlated, and it NEVER means "still staging":
 * the node's message loop is strictly sequential, so a prompt sent during staging is
 * answered afterwards WITH the adapter. Both are terminal for the attempt.
 *
 * An UNKNOWN reason is carried through rather than rejected. E.3's forward-compatibility
 * commitment says any later addition arrives named and changelogged and that an unknown
 * reason must be treated as NOT retryable on this host — which `TrainingError.isRetryable`
 * already delivers for both codes, so the conservative default is correct by construction.
 */
export function toServeBackError(frame: {
  type?: string;
  code?: string;
  reason?: string;
  message?: string;
  requestId?: string;
} | null | undefined): TrainingError | null {
  const code = frame?.code;
  if (!code || !SERVE_BACK_CODES.includes(code as ServeBackCode)) return null;
  const reason = typeof frame?.reason === 'string' ? frame.reason : undefined;
  const known = reason !== undefined && LORA_STAGING_FAILED_REASONS.includes(reason as never);
  const message = frame?.message
    ?? (code === 'LORA_NOT_STAGED'
      ? 'the adapter is not staged for this session; staging failed or the session ended'
      : `adapter staging failed${reason ? ` (${known ? reason : `unrecognised reason "${reason}"`})` : ''}`);
  return new TrainingError(message, code as ServeBackCode, reason ? { reason } : undefined);
}

/**
 * Whether this run can be served back at all. TWO gates, and they fail for different
 * reasons a caller should be able to tell a user apart:
 *  · the host bundle must carry a `training` section (E.2 — unknown-field tolerance means an
 *    old node silently IGNORES `lora`, so its absence is the only signal we get); and
 *  · the session's model must equal the template's `baseServingModelId` — E.2's third
 *    precondition, checkable by a client only since v0.3.10 put the field in A.4's
 *    `perTemplate` block. Before that a mismatch could ONLY surface as `LORA_STAGING_FAILED`
 *    reason `invalid`: post-ack, uncorrelated, on a session already funded. Skipped when
 *    either value is absent, so an older bundle degrades to the previous two gates rather
 *    than failing closed on a field it cannot supply; and
 *  · the adapter manifest must actually contain `adapter.gguf`. GGUF conversion is
 *    BEST-EFFORT (E.1, Open item 5 ruled at sign-off): on failure the run ships
 *    safetensors-only plus `warnings: ["gguf-conversion-failed"]`. That artifact is still
 *    owned and usable — it simply cannot be served back in M0.
 */
export function serveBackAvailable(opts: {
  bundleHasTraining: boolean;
  manifestFiles: readonly string[];
  sessionModelId?: string;
  baseServingModelId?: string;
}): { ok: boolean; reason?: 'noTrainingSection' | 'noGguf' | 'baseModelMismatch' } {
  if (!opts.bundleHasTraining) return { ok: false, reason: 'noTrainingSection' };
  if (opts.sessionModelId !== undefined && opts.baseServingModelId !== undefined
      && opts.sessionModelId.toLowerCase() !== opts.baseServingModelId.toLowerCase()) {
    return { ok: false, reason: 'baseModelMismatch' };
  }
  if (!opts.manifestFiles.includes('adapter.gguf')) return { ok: false, reason: 'noGguf' };
  return { ok: true };
}
