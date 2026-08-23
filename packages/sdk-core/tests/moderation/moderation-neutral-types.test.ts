// Sub-phase 1.1 (IMPLEMENTATION-TRAINING-RESERVATIONS-1.38.md Phase 1): the WP-S1
// verdict-carriage surface re-homed under neutral Job-prefixed names in
// src/types/moderation.types.ts, with transcode.types re-exporting BY REFERENCE.
// These tests pin: entry exports, runtime identity across every import path, the
// hold-code union, and the guard/clone behaviour contract. Deliberate overlap, kept small:
// the full behaviour suites are tests/transcode/moderation-metadata-passthrough.test.ts and
// tests/exports/moderation-passthrough-exports.test.ts (which pin the same vectors on the
// same function objects) — these vectors exercise the CANONICAL names directly so behaviour
// stays covered even if the alias structure is ever restructured.
// NOTE: tests/ are outside tsconfig include, so the type-level lines below are enforced
// by the alias-by-construction implementation + the dist/types .d.ts diff, not by tsc.
import { describe, it, expect } from 'vitest';
import * as sdk from '../../src/index';
import {
  MODERATION_HOLD_CODES,
  isJobModerationStatus,
  cloneJobModerationStatus,
  isTranscodeModerationStatus,
  cloneTranscodeModerationStatus,
} from '../../src/index';
import {
  isTranscodeModerationStatus as deepTranscodeGuard,
  cloneTranscodeModerationStatus as deepTranscodeClone,
} from '../../src/types/transcode.types';
import {
  isJobModerationStatus as deepJobGuard,
  cloneJobModerationStatus as deepJobClone,
} from '../../src/types/moderation.types';
import type {
  JobModerationVerdict,
  JobModerationStatus,
  ModerationHoldCode,
  TranscodeModerationVerdict,
} from '../../src/index';
import type { TranscodeErrorCode } from '../../src/errors/transcode-errors';

describe('neutral moderation types (Phase 1 re-home)', () => {
  it('entry exports the Job-prefixed guards as functions', () => {
    expect(typeof isJobModerationStatus).toBe('function');
    expect(typeof cloneJobModerationStatus).toBe('function');
  });

  it('transcode-named guards are the SAME references as the Job-prefixed canonicals', () => {
    // Re-export, not duplicate (constraint 4): identity must hold on every path.
    expect(Object.is(isTranscodeModerationStatus, isJobModerationStatus)).toBe(true);
    expect(Object.is(cloneTranscodeModerationStatus, cloneJobModerationStatus)).toBe(true);
    expect(Object.is(deepTranscodeGuard, isJobModerationStatus)).toBe(true);
    expect(Object.is(deepTranscodeClone, cloneJobModerationStatus)).toBe(true);
    expect(Object.is(deepJobGuard, isJobModerationStatus)).toBe(true);
    expect(Object.is(deepJobClone, cloneJobModerationStatus)).toBe(true);
    // Namespace vs DEEP import — a genuine barrel tripwire: a silent star-export drop
    // (TS2308) leaves sdk.X undefined while the deep import stays a function, failing here.
    expect(sdk.isJobModerationStatus).toBe(deepJobGuard);
    expect(sdk.cloneJobModerationStatus).toBe(deepJobClone);
  });

  it('vocabularies interoperate at the type level and the hold codes are pinned', () => {
    // Mutual assignability (alias by construction) — compile-level, erased at runtime.
    const a: JobModerationVerdict = 'cleared' as TranscodeModerationVerdict;
    const b: TranscodeModerationVerdict = 'blocked' as JobModerationVerdict;
    // A hold code IS a TranscodeErrorCode (union composition, constraint 6).
    const c: TranscodeErrorCode = 'CONTENT_BLOCKED' as ModerationHoldCode;
    // The union's exact members, pinned as an array literal typed by ModerationHoldCode.
    const holds: readonly ModerationHoldCode[] = MODERATION_HOLD_CODES;
    expect([a, b, c].every((s) => typeof s === 'string')).toBe(true);
    // Pins the EXPORTED runtime list, not a test-local literal.
    expect([...holds]).toEqual(['CONTENT_BLOCKED', 'CONTENT_FLAGGED', 'MODERATION_UNAVAILABLE']);
  });

  it('guard: accepts verdict-only and verdict+reason; rejects structural garbage', () => {
    expect(isJobModerationStatus({ verdict: 'cleared', reason: 'r1' })).toBe(true);
    expect(isJobModerationStatus({ verdict: 'flagged' })).toBe(true);
    // Unknown future verdicts must survive (open set — never narrowed by the guard).
    expect(isJobModerationStatus({ verdict: 'quarantined-v2' })).toBe(true);
    expect(isJobModerationStatus({ verdict: 7 })).toBe(false);
    expect(isJobModerationStatus(null)).toBe(false);
    expect(isJobModerationStatus(['cleared'])).toBe(false);
    expect(isJobModerationStatus({})).toBe(false);
  });

  it('clone: copies verdict+reason only, stripping anything else the node attached', () => {
    const dirty = { verdict: 'blocked', reason: 'hash-list-match', matchedHash: '0xdead', frame: 3 };
    const clean = cloneJobModerationStatus(dirty as JobModerationStatus);
    expect(clean).toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
    expect(Object.prototype.hasOwnProperty.call(clean, 'matchedHash')).toBe(false);
    // verdict-only input yields verdict-only output — no phantom reason key.
    const minimal = cloneJobModerationStatus({ verdict: 'flagged' });
    expect(Object.prototype.hasOwnProperty.call(minimal, 'reason')).toBe(false);
    expect(minimal).toEqual({ verdict: 'flagged' });
  });
});
