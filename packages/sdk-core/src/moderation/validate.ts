// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1

/**
 * Strict ModerationReport validator (M3).
 *
 * Wire shape: docs/node-reference/CONTRACT-MODERATION-SERVICE.md §3.
 * Validation table: docs/node-reference/HANDOFF-SDK-SEAM3-M3.md §3.
 *
 * ⚠️ NOT A SECURITY CONTROL AT M3: reports are unsigned until M5 (D6) — a
 * valid-shaped report proves nothing about who produced it. This validator
 * enforces shape only.
 *
 * All sets are closed: exactly the 15 top-level keys, exactly the 3 stats
 * keys, exact enums. Anything else — including a relayed `{error:{…}}`
 * envelope or a truncated body — is invalid: "malformed" IS "fails
 * validation", one case, not two.
 */

import type {
  ModerationReport,
  ModerationDescriptor,
} from '../types/moderation.types';

export type ModerationReportValidation =
  | { ok: true; report: ModerationReport }
  | { ok: false; errors: string[] };

export interface ValidateModerationReportOptions {
  /**
   * Additionally assert the D6/D8 fields (`scoreFileCid`, `scoreDigest`,
   * `signature`) are null — true today at M3, droppable when M5 fills them.
   * Default: true.
   */
  m3NullFieldChecks?: boolean;
}

const TOP_LEVEL_KEYS = [
  'schemaVersion', 'contentId', 'bundleHash', 'bundleVersion', 'samplerVersion',
  'verdict', 'rating', 'descriptors', 'category', 'stats',
  'scoreFileCid', 'scoreDigest', 'hashMatchModule', 'hostAddress', 'signature',
] as const;

const STATS_KEYS = ['framesSampled', 'maxScore', 'escalated'] as const;

const VERDICTS = ['PASS', 'PASS_RATED', 'BLOCK_ILLEGAL', 'BLOCK_UNRESOLVED'] as const;
const RATINGS = ['15', '18'] as const;
const CATEGORIES = ['csam_suspected', 'extreme_pornography'] as const;
/** Canonical wire order — descriptors must appear in this order, no duplicates. */
const DESCRIPTORS: readonly ModerationDescriptor[] = ['sex', 'strong gore', 'violence'];

// Deliberate SDK-side defence-in-depth: the service always emits a sha256
// hexdigest, but its own type only requires a non-empty string (HANDOFF §3).
const CONTENT_ID_RE = /^[0-9a-f]{64}$/;
const BUNDLE_HASH_RE = /^sha256:[0-9a-f]{64}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/**
 * ≤ 6 decimal places, exactly as pinned by HANDOFF §3:
 * `Number(value.toFixed(6)) === value` — empirically exact for doubles in
 * [0, 1]. NOT an epsilon comparison: eps = 1e-6/1e-7 demonstrably accepts
 * out-of-spec 7-decimal values such as 0.9100001.
 */
const isSixDp = (v: number): boolean => Number(v.toFixed(6)) === v;

/**
 * Strictly validate a received report body against the M3 validation table.
 * Collects every violation (shadow-mode logging needs the full picture, not
 * the first failure).
 *
 * The body is first normalised to a DETACHED plain-JSON copy (one read of
 * the input): hostile getters, BigInt, and circular structures refuse as
 * invalid instead of throwing, and the returned `report` is the copy that
 * was actually validated — never the live input object, so post-validation
 * getter tricks and Symbol/non-enumerable smuggling cannot reach consumers.
 */
export function validateModerationReport(
  input: unknown,
  options?: ValidateModerationReportOptions,
): ModerationReportValidation {
  const m3NullFieldChecks = options?.m3NullFieldChecks ?? true;
  const errors: string[] = [];

  // `value` is the detached copy — nothing below ever touches `input` again.
  // Known consequence: a body with a custom toJSON() validates as whatever it
  // serialises to. That grants nothing beyond handing over a forged plain
  // report directly, which the D6 unsigned-report caveat already covers.
  let value: unknown;
  try {
    value = JSON.parse(JSON.stringify(input));
  } catch {
    return { ok: false, errors: ['report body is not plain JSON data (throwing getter/toJSON, BigInt, circular, or other unserialisable input)'] };
  }
  if (!isPlainObject(value)) {
    return { ok: false, errors: [`report body must be a JSON object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`] };
  }

  // Key-set violations do NOT short-circuit field checks: each field below is
  // guarded on its own presence, so one schema drift never masks another in
  // the shadow logs. Key names come from the body — always safeKey() them.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(value, k);
  for (const k of TOP_LEVEL_KEYS) {
    if (!has(k)) errors.push(`missing key: ${k}`);
  }
  for (const k of Object.keys(value)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(k)) errors.push(`unknown key: ${safeKey(k)}`);
  }

  const r = value as Record<string, unknown>;

  if (has('schemaVersion') && r.schemaVersion !== 1) errors.push('schemaVersion must be exactly 1');
  if (has('contentId') && (typeof r.contentId !== 'string' || !CONTENT_ID_RE.test(r.contentId))) {
    errors.push('contentId must match /^[0-9a-f]{64}$/');
  }
  if (has('bundleHash') && (typeof r.bundleHash !== 'string' || !BUNDLE_HASH_RE.test(r.bundleHash))) {
    errors.push('bundleHash must match /^sha256:[0-9a-f]{64}$/');
  }
  for (const k of ['bundleVersion', 'samplerVersion'] as const) {
    if (has(k) && (!Number.isInteger(r[k]) || (r[k] as number) < 1)) errors.push(`${k} must be an integer ≥ 1`);
  }

  if (has('verdict')) {
    const verdict = r.verdict;
    if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) {
      errors.push(`verdict must be one of ${VERDICTS.join('|')}`);
    } else {
      // Verdict-dependent closed rows (HANDOFF §3 table).
      if (verdict === 'PASS_RATED') {
        if (has('rating') && (typeof r.rating !== 'string' || !(RATINGS as readonly string[]).includes(r.rating))) {
          errors.push('PASS_RATED requires rating "15" or "18" (exact string enum)');
        }
        if (has('descriptors')) errors.push(...validateDescriptors(r.descriptors, true));
      } else {
        if (has('rating') && r.rating !== null) errors.push(`${verdict} requires rating null`);
        if (has('descriptors')) errors.push(...validateDescriptors(r.descriptors, false));
      }
      if (verdict === 'BLOCK_ILLEGAL') {
        if (has('category') && (typeof r.category !== 'string' || !(CATEGORIES as readonly string[]).includes(r.category))) {
          errors.push(`BLOCK_ILLEGAL requires category ${CATEGORIES.join(' or ')}`);
        }
      } else if (has('category') && r.category !== null) {
        errors.push(`${verdict} requires category null`);
      }
    }
  }

  if (has('stats')) errors.push(...validateStats(r.stats));

  if (has('hashMatchModule') && r.hashMatchModule !== null) {
    errors.push('hashMatchModule is reserved and must be null at M3');
  }
  // hostAddress: string | null with deliberately NO format check at M3 — the
  // service enforces none; a 0x-shape check now would reject legitimate reports.
  if (has('hostAddress') && r.hostAddress !== null && typeof r.hostAddress !== 'string') {
    errors.push('hostAddress must be a string or null');
  }
  for (const k of ['scoreFileCid', 'scoreDigest', 'signature'] as const) {
    if (!has(k)) continue;
    if (m3NullFieldChecks) {
      if (r[k] !== null) errors.push(`${k} must be null at M3 (D6/D8 — filled at M5)`);
    } else if (r[k] !== null && typeof r[k] !== 'string') {
      errors.push(`${k} must be a string or null`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, report: value as unknown as ModerationReport };
}

/**
 * Body-derived text embedded in error strings (which end up in single-line
 * shadow logs) must never smuggle newlines/control characters, and must never
 * make the validator throw (BigInt/circular values break JSON.stringify).
 */
function safeKey(k: unknown): string {
  return typeof k === 'string' ? JSON.stringify(k) : `(non-string ${typeof k})`;
}

/** Shape + canonical order + no duplicates ONLY — deliberately NOT reachability (HANDOFF §3). */
function validateDescriptors(value: unknown, nonEmpty: boolean): string[] {
  if (!Array.isArray(value)) return ['descriptors must be an array'];
  if (nonEmpty && value.length === 0) return ['PASS_RATED requires non-empty descriptors'];
  if (!nonEmpty && value.length !== 0) return ['descriptors must be [] unless verdict is PASS_RATED'];
  const errors: string[] = [];
  let last = -1;
  for (const d of value) {
    const i = typeof d === 'string' ? DESCRIPTORS.indexOf(d as ModerationDescriptor) : -1;
    if (i === -1) errors.push(`unknown descriptor: ${safeKey(d)}`);
    else if (i <= last) errors.push(`descriptors out of canonical order or duplicated at ${safeKey(d)}`);
    else last = i;
  }
  return errors;
}

function validateStats(value: unknown): string[] {
  if (!isPlainObject(value)) return ['stats must be an object'];
  const errors: string[] = [];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(value, k);
  for (const k of STATS_KEYS) {
    if (!has(k)) errors.push(`stats missing key: ${k}`);
  }
  for (const k of Object.keys(value)) {
    if (!(STATS_KEYS as readonly string[]).includes(k)) errors.push(`stats unknown key: ${safeKey(k)}`);
  }
  // Presence-guarded like the top level: key-set drift must not mask field drift.
  if (has('framesSampled') && !isCount(value.framesSampled)) {
    errors.push('stats.framesSampled must be an integer ≥ 0');
  }
  if (has('escalated')) {
    if (!isCount(value.escalated)) errors.push('stats.escalated must be an integer ≥ 0');
    else if (isCount(value.framesSampled) && value.escalated > value.framesSampled) {
      errors.push('stats.escalated must be ≤ stats.framesSampled');
    }
  }
  if (has('maxScore')) {
    const s = value.maxScore;
    if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 1 || !isSixDp(s)) {
      errors.push('stats.maxScore must be a float in [0, 1] with at most 6 decimal places');
    }
  }
  return errors;
}
