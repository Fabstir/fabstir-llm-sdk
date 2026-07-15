// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1

/**
 * M3 moderation publish gate (docs/node-reference/HANDOFF-SDK-SEAM3-M3.md).
 *
 * ⚠️ NOT A SECURITY CONTROL. M3 reports are UNSIGNED (`signature: null`, D6):
 * an unsigned `{"verdict":"PASS"}` is trivially forgeable by anyone who can
 * inject a report, so this gate is a PLAIN VERDICT CHECK with zero
 * cryptographic binding. Signature verification arrives at M5. That is
 * acceptable at M3 only because everything ships dark: the `moderationGate`
 * config option defaults to false and no publish may fail because of the
 * gate until the documented go-live (CONTRACT-MODERATION-SERVICE.md
 * Appendix A), flipped together with the node's `MODERATION_ENFORCE`.
 */

import type {
  ModerationFetchOutcome,
  ModerationGateResult,
  ModerationGateEvaluation,
} from '../types/moderation.types';
import { validateModerationReport, type ValidateModerationReportOptions } from './validate';

export interface EvaluateModerationGateOptions {
  /** The `moderationGate` config value. Enforcement only — evaluation always runs. */
  enabled: boolean;
  /** On-chain job id, included in the log line when provided. */
  jobId?: bigint | string;
  /** Defaults to `console.log`. */
  logger?: (line: string) => void;
  validation?: ValidateModerationReportOptions;
}

/**
 * The publish-time verdict check (HANDOFF §3 behaviour table). Named for what
 * it is — a verdict CHECK, not verification (nothing cryptographic exists to
 * verify at M3; see the module caveat).
 *
 * - `PASS` / `PASS_RATED` → allowed, rating/descriptors surfaced for the storefront
 * - `BLOCK_ILLEGAL` / `BLOCK_UNRESOLVED` → refused, category surfaced for BLOCK_ILLEGAL
 * - no report → refused `NO_REPORT` (default-hold: absence of evidence is not a pass)
 * - anything failing strict validation → refused `INVALID_REPORT` (one case, not two)
 *
 * Never throws on any report body: refusal reasons carry an optional
 * `detail` string for logging instead.
 */
export function checkModerationVerdict(
  outcome: ModerationFetchOutcome,
  options?: ValidateModerationReportOptions,
): ModerationGateResult {
  if (outcome.kind === 'no-report') {
    return {
      allowed: false, reason: 'NO_REPORT', category: null,
      detail: 'no moderation report exists for this job (default-hold)',
    };
  }

  const validation = validateModerationReport(outcome.body, options);
  if (!validation.ok) {
    return {
      allowed: false, reason: 'INVALID_REPORT', category: null,
      detail: `report failed validation: ${validation.errors.join('; ')}`,
    };
  }

  const report = validation.report;
  if (report.verdict === 'PASS' || report.verdict === 'PASS_RATED') {
    return { allowed: true, rating: report.rating, descriptors: report.descriptors };
  }
  return {
    allowed: false, reason: report.verdict, category: report.category,
    detail: `moderation verdict ${report.verdict}`,
  };
}

/**
 * One publish-time gate evaluation implementing "disabled ≠ skipped" (D1):
 * the verdict check runs and its result is logged on EVERY call; the
 * `enabled` flag gates only `refusePublish`, the single field enforcement
 * may act on. Rating/descriptor pass-through on an allowed result is
 * independent of the flag.
 *
 * ⚠️ NOT A SECURITY CONTROL at M3 — see the module caveat.
 */
export function evaluateModerationGate(
  outcome: ModerationFetchOutcome,
  options: EvaluateModerationGateOptions,
): ModerationGateEvaluation {
  const result = checkModerationVerdict(outcome, options.validation);
  const refusePublish = options.enabled && !result.allowed;

  const log = options.logger ?? console.log;
  const job = options.jobId !== undefined ? ` job=${options.jobId}` : '';
  // detail carries body-derived text — JSON.stringify escapes control chars so
  // a hostile body can never forge additional lines in the shadow log.
  const verdictPart = result.allowed
    ? `allowed rating=${result.rating} descriptors=[${result.descriptors.join(', ')}]`
    : `refused reason=${result.reason}${result.detail ? ` detail=${JSON.stringify(result.detail)}` : ''}`;
  const enforcementPart = options.enabled
    ? refusePublish ? 'enforcement=on → publish refused' : 'enforcement=on'
    : `enforcement=off (dark)${result.allowed ? '' : ' → publish proceeds anyway'}`;
  log(`[ModerationGate]${job} ${verdictPart} | ${enforcementPart}`);

  return { result, enabled: options.enabled, refusePublish };
}
