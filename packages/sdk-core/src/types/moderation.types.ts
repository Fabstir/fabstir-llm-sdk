// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1

/**
 * M3 moderation publish gate — report + gate types.
 *
 * Wire shape: docs/node-reference/CONTRACT-MODERATION-SERVICE.md §3.
 * Gate behaviour: docs/node-reference/HANDOFF-SDK-SEAM3-M3.md.
 *
 * ⚠️ NOT A SECURITY CONTROL AT M3. Reports are UNSIGNED until M5 lands
 * signing (D6): `signature` is always null and an unsigned
 * `{"verdict":"PASS"}` is trivially forgeable by anyone who can inject a
 * report. The gate is a plain verdict check with zero cryptographic binding.
 * At M5, `signature` becomes an ECDSA signature over the RFC 8785 canonical
 * form of the report minus the `signature` key — these types already carry
 * the M5 fields (`scoreFileCid`, `scoreDigest`, `signature`, `hostAddress`)
 * as `string | null` so verification slots in without a schema change.
 */

export type ModerationVerdict = 'PASS' | 'PASS_RATED' | 'BLOCK_ILLEGAL' | 'BLOCK_UNRESOLVED';

/** Age rating, present only with PASS_RATED. A string on the wire, never a number. */
export type ModerationRating = '15' | '18';

/** Closed descriptor set; on the wire always in exactly this order, no duplicates. */
export type ModerationDescriptor = 'sex' | 'strong gore' | 'violence';

/** Block category, present only with BLOCK_ILLEGAL. */
export type ModerationBlockCategory = 'csam_suspected' | 'extreme_pornography';

/** Nested stats — a closed set of exactly these 3 keys. */
export interface ModerationReportStats {
  /** Integer count of frames sampled (≥ 0). */
  framesSampled: number;
  /**
   * Host-specific margin-class float in [0, 1], ≤ 6 decimal places (D9 —
   * never byte-compare reports across hosts; cross-host agreement is at
   * verdict level only).
   */
  maxScore: number;
  /** Integer count of escalated frames: 0 ≤ escalated ≤ framesSampled. */
  escalated: number;
}

/**
 * The bare ModerationReport body emitted by the moderation service
 * (CONTRACT §3) — exactly these 15 keys, no extras (schemaVersion 1).
 */
export interface ModerationReport {
  schemaVersion: 1;
  /** sha256 hexdigest of the source bytes, lowercase 64-hex. */
  contentId: string;
  /** `sha256:<64-hex>` of the policy bundle. */
  bundleHash: string;
  /** Integer ≥ 1. */
  bundleVersion: number;
  /** Integer ≥ 1. */
  samplerVersion: number;
  verdict: ModerationVerdict;
  /** Non-null only with PASS_RATED. */
  rating: ModerationRating | null;
  /** Non-empty only with PASS_RATED; canonical order, no duplicates. */
  descriptors: ModerationDescriptor[];
  /** Non-null only with BLOCK_ILLEGAL. */
  category: ModerationBlockCategory | null;
  stats: ModerationReportStats;
  /** S5 CID of the score file — null until M5 (D8). */
  scoreFileCid: string | null;
  /** `sha256:<64-hex>` of the score file — null until M5 (D8). */
  scoreDigest: string | null;
  /** Reserved slot for a future hash-match module identifier — always null at M3. */
  hashMatchModule: string | null;
  /** Filled only when the service is configured with a host address; NO format check at M3. */
  hostAddress: string | null;
  /** Hex-encoded ECDSA signature — null until M5 (D6). Exact encoding pinned at M5. */
  signature: string | null;
}

/**
 * Normalised outcome of fetching a job's report (HANDOFF §3 layering note).
 *
 * - Every "nothing found for this job_id" outcome (absent VerdictStore entry,
 *   404-equivalent) maps to `no-report`.
 * - Every OTHER received value — a relayed `{error:{…}}` envelope, a
 *   truncated/unparseable body, any unexpected shape — is passed to the
 *   validator UNCHANGED as `report-body` and refuses as invalid.
 * - Transport-level failures (network error, non-2xx on the fetch itself) are
 *   a fetch-layer concern: retry or fail the fetch, but NEVER synthesise a
 *   report — they must not produce a ModerationFetchOutcome at all.
 */
export type ModerationFetchOutcome =
  | { kind: 'no-report' }
  | { kind: 'report-body'; body: unknown };

/**
 * How the SDK retrieves a job's report from the node.
 *
 * OPEN QUESTION (OQ-M3-1): the node endpoint/envelope/auth is not yet pinned;
 * no implementation ships at M3. Implementations must follow the
 * {@link ModerationFetchOutcome} normalisation contract and throw on
 * transport failure.
 */
export interface ModerationReportFetcher {
  /** Fetch the moderation report for an on-chain job id. */
  fetchModerationReport(jobId: bigint): Promise<ModerationFetchOutcome>;
}

/**
 * Result of the publish-time verdict check (HANDOFF §3 gate result contract).
 *
 * ⚠️ NOT A SECURITY CONTROL AT M3 — see the module-level caveat: the verdict
 * comes from an unsigned report until M5.
 *
 * On `allowed: true`, `rating`/`descriptors` are surfaced for storefront use
 * (nulls/empty included for PASS). On `allowed: false`, `detail` is a
 * never-thrown human-readable diagnostic for logging only.
 */
export type ModerationGateResult =
  | { allowed: true; rating: ModerationRating | null; descriptors: ModerationDescriptor[] }
  | {
      allowed: false;
      reason: 'BLOCK_ILLEGAL' | 'BLOCK_UNRESOLVED' | 'NO_REPORT' | 'INVALID_REPORT';
      category: ModerationBlockCategory | null;
      detail?: string;
    };

/**
 * One publish-time gate evaluation (D1: evaluation and enforcement are
 * separate switches — the gate is evaluated on EVERY publish call even while
 * enforcement is disabled; only `refusePublish` may gate the publish).
 */
export interface ModerationGateEvaluation {
  /** The verdict-check result — always computed, enabled or not. */
  result: ModerationGateResult;
  /** The `moderationGate` config value this evaluation ran under. */
  enabled: boolean;
  /** `enabled && !result.allowed` — the ONLY field enforcement may act on. */
  refusePublish: boolean;
}
