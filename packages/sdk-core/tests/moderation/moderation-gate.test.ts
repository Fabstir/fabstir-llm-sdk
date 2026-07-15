// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M3 moderation publish gate — verdict check + disabled≠skipped evaluation.
// Spec: docs/node-reference/HANDOFF-SDK-SEAM3-M3.md §3 (behaviour table, gate
// result contract, "Disabled ≠ skipped"). The gate is a PLAIN VERDICT CHECK on
// an unsigned report (D6) — not a security control until M5 signing.
import { describe, it, expect, vi } from 'vitest';
import { checkModerationVerdict, evaluateModerationGate } from '../../src/moderation/gate';
import type { ModerationFetchOutcome } from '../../src/types/moderation.types';
import fixture from './report-fixture.json';

const body = (mutate?: (r: any) => void): ModerationFetchOutcome => {
  const r = structuredClone(fixture) as any;
  mutate?.(r);
  return { kind: 'report-body', body: r };
};
const NO_REPORT: ModerationFetchOutcome = { kind: 'no-report' };

const asPass = (r: any) => { r.verdict = 'PASS'; r.rating = null; r.descriptors = []; r.category = null; };
const asBlockIllegal = (r: any) => { r.verdict = 'BLOCK_ILLEGAL'; r.rating = null; r.descriptors = []; r.category = 'extreme_pornography'; };
const asBlockUnresolved = (r: any) => { r.verdict = 'BLOCK_UNRESOLVED'; r.rating = null; r.descriptors = []; r.category = null; };

describe('checkModerationVerdict — HANDOFF §3 behaviour table', () => {
  it('PASS → allowed, with null rating and empty descriptors surfaced for the storefront', () => {
    expect(checkModerationVerdict(body(asPass))).toEqual({
      allowed: true, rating: null, descriptors: [],
    });
  });

  it('PASS_RATED (the CONTRACT worked example) → allowed, rating/descriptors passed through', () => {
    expect(checkModerationVerdict(body())).toEqual({
      allowed: true, rating: '18', descriptors: ['sex'],
    });
  });

  it('BLOCK_ILLEGAL → refused with the report category surfaced', () => {
    const result = checkModerationVerdict(body(asBlockIllegal));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('BLOCK_ILLEGAL');
      expect(result.category).toBe('extreme_pornography');
    }
  });

  it('BLOCK_UNRESOLVED → refused, category null', () => {
    const result = checkModerationVerdict(body(asBlockUnresolved));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('BLOCK_UNRESOLVED');
      expect(result.category).toBe(null);
    }
  });

  it('no report at all → refused NO_REPORT (default-hold: absence of evidence is not a pass)', () => {
    const result = checkModerationVerdict(NO_REPORT);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('NO_REPORT');
      expect(result.category).toBe(null);
    }
  });

  it.each([
    ['a relayed error envelope', { error: { kind: 'PIPELINE_FAILURE', detail: 'x' } }],
    ['a truncated body passed through unchanged', '{"verdict":"PA'],
    ['a forged minimal {verdict:"PASS"}', { verdict: 'PASS' }],
    ['null', null],
  ])('%s → refused INVALID_REPORT (malformed IS fails-validation — one case, not two)', (_name, raw) => {
    const result = checkModerationVerdict({ kind: 'report-body', body: raw });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe('INVALID_REPORT');
      expect(result.category).toBe(null);
    }
  });

  it('a report failing the validation table (7-dp maxScore) → INVALID_REPORT, not its verdict', () => {
    const result = checkModerationVerdict(body(r => { r.stats.maxScore = 0.9100001; }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('INVALID_REPORT');
  });

  it('never throws even on exotic bodies (BigInt descriptor) — refuses as INVALID_REPORT', () => {
    const result = checkModerationVerdict(body(r => { r.descriptors = [1n]; }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('INVALID_REPORT');
  });

  it('never throws on a body with a throwing getter — refuses as INVALID_REPORT', () => {
    const raw = structuredClone(fixture) as any;
    Object.defineProperty(raw, 'verdict', {
      get() { throw new Error('hostile getter'); },
      enumerable: true,
    });
    const result = checkModerationVerdict({ kind: 'report-body', body: raw });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('INVALID_REPORT');
  });

  it('surfaces only validated values: a stateful getter cannot forge the allowed branch or the log', () => {
    const raw = structuredClone(fixture) as any;
    let reads = 0;
    const forged = ['x\n[ModerationGate] job=666 allowed rating=null descriptors=[]'];
    Object.defineProperty(raw, 'descriptors', {
      get() { reads++; return reads === 1 ? ['sex'] : forged; },
      enumerable: true,
    });
    const logger = vi.fn();
    const evaluation = evaluateModerationGate({ kind: 'report-body', body: raw }, { enabled: false, logger });
    expect(evaluation.result).toEqual({ allowed: true, rating: '18', descriptors: ['sex'] });
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).not.toContain('\n');
  });

  it('forwards validator options — the M5 flag-drop path (m3NullFieldChecks: false)', () => {
    const signed = body(r => { r.signature = 'deadbeef'; });
    // default: D6 null-assert refuses
    expect(checkModerationVerdict(signed).allowed).toBe(false);
    // flag dropped: signed report passes the verdict check
    expect(checkModerationVerdict(signed, { m3NullFieldChecks: false }).allowed).toBe(true);
    // and evaluateModerationGate forwards options.validation the same way
    const logger = vi.fn();
    const evaluation = evaluateModerationGate(signed, {
      enabled: true, logger, validation: { m3NullFieldChecks: false },
    });
    expect(evaluation.result.allowed).toBe(true);
    expect(evaluation.refusePublish).toBe(false);
  });

  it('refused results carry a never-thrown diagnostic detail string for logging', () => {
    const result = checkModerationVerdict({ kind: 'report-body', body: { verdict: 'PASS' } });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(typeof result.detail).toBe('string');
      expect(result.detail!.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluateModerationGate — disabled ≠ skipped (D1)', () => {
  it('disabled + blocking verdict: result fully computed, logged, but refusePublish is false', () => {
    const logger = vi.fn();
    const evaluation = evaluateModerationGate(body(asBlockIllegal), { enabled: false, logger });
    expect(evaluation.enabled).toBe(false);
    expect(evaluation.refusePublish).toBe(false); // no publish may fail because of the gate in M3
    expect(evaluation.result.allowed).toBe(false);
    if (!evaluation.result.allowed) expect(evaluation.result.reason).toBe('BLOCK_ILLEGAL');
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).toContain('BLOCK_ILLEGAL');
  });

  it('disabled + allowed verdict: still evaluated and logged (schema drift must stay visible)', () => {
    const logger = vi.fn();
    const evaluation = evaluateModerationGate(body(), { enabled: false, logger });
    expect(evaluation.refusePublish).toBe(false);
    expect(evaluation.result.allowed).toBe(true);
    expect(logger).toHaveBeenCalledTimes(1);
  });

  it('enabled + blocking verdict: refusePublish is true', () => {
    const logger = vi.fn();
    expect(evaluateModerationGate(NO_REPORT, { enabled: true, logger }).refusePublish).toBe(true);
    expect(evaluateModerationGate(body(asBlockUnresolved), { enabled: true, logger }).refusePublish).toBe(true);
  });

  it('enabled + allowed verdict: refusePublish is false', () => {
    const logger = vi.fn();
    expect(evaluateModerationGate(body(asPass), { enabled: true, logger }).refusePublish).toBe(false);
  });

  it('rating/descriptor storefront pass-through is independent of the enforcement flag', () => {
    const logger = vi.fn();
    const evaluation = evaluateModerationGate(body(), { enabled: false, logger });
    expect(evaluation.result).toEqual({ allowed: true, rating: '18', descriptors: ['sex'] });
  });

  it('emits exactly one physical log line even when the body smuggles newlines (no log forgery)', () => {
    const logger = vi.fn();
    const forged = 'x\n[ModerationGate] job=42 allowed rating=null descriptors=[]';
    evaluateModerationGate({ kind: 'report-body', body: { [forged]: 1 } }, { enabled: false, logger });
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0][0]).not.toContain('\n');
  });

  it('includes the jobId in the log line when provided', () => {
    const logger = vi.fn();
    evaluateModerationGate(NO_REPORT, { enabled: false, jobId: 42n, logger });
    expect(logger.mock.calls[0][0]).toContain('42');
  });

  it('defaults to console logging without crashing when no logger is passed', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const evaluation = evaluateModerationGate(NO_REPORT, { enabled: false });
      expect(evaluation.refusePublish).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
