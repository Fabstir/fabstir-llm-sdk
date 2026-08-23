// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Training M0 error surface. Wire codes frozen in
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.8 (FROZEN; the code set is
// unchanged since v0.3.6, at which it was written — v0.3.7 folded in E.3, v0.3.8 D.1).
// Pre-MVP: no fallbacks — fail fast with a typed TrainingError.

import { MODERATION_HOLD_CODES, type ModerationHoldCode } from '../types/moderation.types';

/**
 * The 8 non-moderation codes the node puts in `train_error.error.code`, NAMED rather than
 * derived: §Capacity-semantics' table has 8 ROWS carrying 10 CODES, and `VALIDATION_FAILED`
 * is in neither count (it is pinned in A.1/A.3/A.4/C.3/C.4). With the 3 `ModerationHoldCode`
 * members composed in, the wire-visible set is 11.
 *
 * Deliberately EXCLUDED — sidecar-internal, never on this wire:
 *  · `TEMPLATE_BOUNDS` — a TRAIN-ONLY sidecar 4xx (changelog v0.3.5 corrects v0.3.4's
 *    mis-attribution to the scan/count path); maps to SIDECAR_UNAVAILABLE or VALIDATION_FAILED.
 *  · `SCAN_FAILURE` — the sidecar's explicit no-verdict response; maps to MODERATION_UNAVAILABLE.
 * A 4xx request-rejection is NEVER a moderation code: the pipeline never ran (C.4, third clause).
 */
export const TRAINING_WIRE_ERROR_CODES = [
  'VALIDATION_FAILED', 'CAPACITY', 'SIDECAR_UNAVAILABLE', 'DATASET_INTEGRITY',
  'DECLARED_TOKENS_MISMATCH', 'CANCELLED', 'TRAIN_FAILED', 'TIMEOUT',
] as const;

/** Client-side (SDK) failures: bundle drift, estimate divergence, verification mismatches. */
export const TRAINING_CLIENT_ERROR_CODES = [
  'TRAINING_BUNDLE_STALE', 'ESTIMATE_MISMATCH', 'INPUT_BINDING_MISMATCH', 'POINTER_PERSIST_FAILED',
] as const;

/** Serve-back (E.2) codes. These ride the LLM SESSION surface, not `train_error`. */
export const TRAINING_SERVE_BACK_ERROR_CODES = ['LORA_STAGING_FAILED', 'LORA_NOT_STAGED'] as const;

/** The 11 codes that can appear in `train_error.error.code` — the 8 wire codes plus the 3
 *  moderation holds. This is what a consumer validates an inbound frame against; the wider
 *  `TRAINING_ERROR_CODES` also carries CLIENT-side and serve-back codes that never ride
 *  `train_error`, so validating against that one would accept codes the node cannot send. */
export const TRAINING_WIRE_VISIBLE_CODES = [
  ...TRAINING_WIRE_ERROR_CODES, ...MODERATION_HOLD_CODES,
] as const;

/** Every training code the SDK knows: wire + moderation holds + client-side + serve-back. */
export const TRAINING_ERROR_CODES = [
  ...TRAINING_WIRE_ERROR_CODES, ...MODERATION_HOLD_CODES,
  ...TRAINING_CLIENT_ERROR_CODES, ...TRAINING_SERVE_BACK_ERROR_CODES,
] as const;

/**
 * `CAPACITY.detail.reason`. Closed vocabulary — the node made it an enum on its side so its
 * compiler finds every construction site. The node's commitment, verbatim: "Nothing consumed
 * is chainUnavailable and only chainUnavailable. Any reason added later will be a consumed
 * class one, freeable by the node, and if that ever needs to change it will arrive as a named
 * addition with a changelog entry rather than silently." That is what makes presuming an
 * UNKNOWN reason consumed correct by construction rather than merely prudent.
 */
export const CAPACITY_REASONS = ['chainUnavailable', 'slotBusy', 'addressBusy', 'cooldown'] as const;

/**
 * `LORA_STAGING_FAILED.detail.reason` — arrives AFTER `session_init_ack` (the ack means
 * accepted, not ready) and is UNCORRELATED: no request is in flight and the init's own id has
 * already been consumed by the ack, so a handler keyed on `requestId` will never see it.
 * Semantics pinned in E.3 (folded into the frozen doc at v0.3.7):
 *  · `invalid`   — the client's own claim is wrong: bad shape, unknown file, or a
 *                  `baseServingModelId` mismatch. Not retryable; fix the request.
 *  · `fetch`     — the node could not retrieve the adapter.
 *  · `write`     — node-side storage failure.
 *  · `budget`    — the stage exceeded the node's wall-clock bound; a SMALLER adapter would succeed.
 *  · `chain`     — a node-side chain read failed ⇒ **re-shop**, do NOT retry this host.
 *                  ⚠️ Note the inversion: `CapacityReason.chainUnavailable` on the TRAINING wire
 *                  means the opposite — nothing consumed, retry the SAME session. Similar words,
 *                  adjacent surfaces, opposite action.
 *  · `cancelled` — the session ended mid-stage.
 * Forward-compatibility commitment (E.3, matching the CAPACITY one): any reason added later
 * arrives named and changelogged; an UNKNOWN reason must be treated as NOT retryable on this
 * host; and no future reason will ever mean "the adapter is staged after all".
 */
export const LORA_STAGING_FAILED_REASONS =
  ['invalid', 'fetch', 'write', 'cancelled', 'budget', 'chain'] as const;

/** The `VALIDATION_FAILED` reasons the frozen doc pins (A.3 doc:371/391, C.4 doc:630). */
export const VALIDATION_FAILED_REASONS =
  ['sessionParams', 'sessionReused', 'trainActive', 'datasetFormat'] as const;

export type TrainingWireErrorCode = (typeof TRAINING_WIRE_ERROR_CODES)[number] | ModerationHoldCode;
export type TrainingClientErrorCode = (typeof TRAINING_CLIENT_ERROR_CODES)[number];
export type TrainingServeBackErrorCode = (typeof TRAINING_SERVE_BACK_ERROR_CODES)[number];
export type TrainingErrorCode = (typeof TRAINING_ERROR_CODES)[number];
export type CapacityReason = (typeof CAPACITY_REASONS)[number];
export type LoraStagingFailedReason = (typeof LORA_STAGING_FAILED_REASONS)[number];
/** OPEN by design: a template-shape reject carries no pinned reason string. */
export type ValidationFailedReason = (typeof VALIDATION_FAILED_REASONS)[number] | (string & {});

export interface TrainingErrorDetail {
  reason?: CapacityReason | LoraStagingFailedReason | ValidationFailedReason;
  /** k EXECUTED slices (C.1). On-chain settles LANDED proofs, which may be fewer. */
  settledSlices?: number;
  billedTokens?: number;
  lastCheckpoint?: { manifestCID: string; manifestSha256: string };
  declared?: number; actual?: number;
  [key: string]: unknown;
}

/** Trying again may succeed with no user action. */
const RETRYABLE_CODES: readonly string[] = ['CAPACITY', 'SIDECAR_UNAVAILABLE'];
/** Re-hosting is FORBIDDEN, not merely futile: a held job must never reach another host (WP-S1). */
const NEVER_REHOSTED: readonly string[] = [...MODERATION_HOLD_CODES];
/** Terminal for THIS attempt, and re-shopping cannot help because the cause travels with the
 *  job: the dataset must be re-prepared (`DATASET_INTEGRITY`) or re-manifested
 *  (`DECLARED_TOKENS_MISMATCH`, C.3 recourse), or the user cancelled. A fresh user-initiated
 *  submission is legal and rides a FRESH session — that is a new job, not a re-shop. */
const TERMINAL_FOR_THIS_JOB: readonly string[] = [
  'DATASET_INTEGRITY', 'DECLARED_TOKENS_MISMATCH', 'CANCELLED',
];
/** Money moved at k ≥ 1; a k = 0 death is the SIDECAR_UNAVAILABLE class (zero-settle, re-shoppable). */
const RESHOPPABLE_ONLY_AT_K_ZERO: readonly string[] = ['TRAIN_FAILED', 'TIMEOUT'];

export class TrainingError extends Error {
  readonly code: TrainingErrorCode;
  readonly detail?: TrainingErrorDetail;

  constructor(message: string, code: TrainingErrorCode, detail?: TrainingErrorDetail) {
    super(message);
    this.name = 'TrainingError';
    this.code = code;
    this.detail = detail;
    Object.setPrototypeOf(this, TrainingError.prototype);
  }

  get isRetryable(): boolean {
    return RETRYABLE_CODES.includes(this.code);
  }

  /**
   * Whether the retry must ride a FRESH session. `chainUnavailable` is the ONLY case where the
   * node consumed and settled nothing — it could not read the session at all, so a straight
   * retry on the SAME session is safe once the read succeeds (v0.3.6 changelog carve-out (1),
   * doc:71-77).
   *
   * Everything else needs a fresh session, but NOT all for the same reason, and the difference
   * matters to a caller waiting on a refund:
   *  · `SIDECAR_UNAVAILABLE` and the busy `CAPACITY` classes consume the session and zero-settle
   *    it (doc:79), so "retry this host N times" means N FRESH sessions.
   *  · `sessionReused`/`trainActive` schedule NO second completion (carve-out (2), doc:76-79) —
   *    on `sessionReused` the settle was already scheduled by the EARLIER reject, and on
   *    `trainActive` a paid run is still executing and will settle normally. Do not wait for a
   *    refund event on THIS reject, and never treat a `trainActive` session as dead: that would
   *    abandon a live multi-hour paid run.
   *
   * An unknown reason is presumed CONSUMED: the opposite default would strand a funded session
   * in escrow until it timed out.
   */
  get requiresFreshSession(): boolean {
    return !(this.code === 'CAPACITY' && this.detail?.reason === 'chainUnavailable');
  }

  /**
   * Whether a load balancer may re-shop this job to ANOTHER host. `k` = settled slices (C.1).
   *
   * `VALIDATION_FAILED` is reason-dependent, and the distinction is load-bearing. The four
   * reasons the doc pins — `sessionParams`, `sessionReused`, `trainActive`, `datasetFormat` —
   * describe the JOB or the SESSION, so they recur identically on every host and re-shopping
   * only burns another deposit. But the one post-escrow scenario A.4 actually describes is
   * mid-flight ALLOWLIST DRIFT ("a host can bump its allowlist while a client sits between
   * validate and `train`", doc:418-421), which is a fact about THAT HOST and carries no pinned
   * reason string. The job is still valid and another host will run it, so a blanket `false`
   * would retire a good job in precisely the case the frozen doc bothers to write down.
   */
  isReshoppable(k: number): boolean {
    if (NEVER_REHOSTED.includes(this.code)) return false;
    if (TERMINAL_FOR_THIS_JOB.includes(this.code)) return false;
    if (this.code === 'VALIDATION_FAILED') {
      return !VALIDATION_FAILED_REASONS.includes(this.detail?.reason as never);
    }
    if (RESHOPPABLE_ONLY_AT_K_ZERO.includes(this.code)) return k === 0;
    return true;
  }
}
