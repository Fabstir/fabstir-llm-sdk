// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M3 moderation publish gate — strict ModerationReport validator.
// Spec: docs/node-reference/HANDOFF-SDK-SEAM3-M3.md §3 (validation table);
// wire shape: docs/node-reference/CONTRACT-MODERATION-SERVICE.md §3.
import { describe, it, expect } from 'vitest';
import { validateModerationReport } from '../../src/moderation/validate';
import fixture from './report-fixture.json';

const TOP_LEVEL_KEYS = [
  'schemaVersion', 'contentId', 'bundleHash', 'bundleVersion', 'samplerVersion',
  'verdict', 'rating', 'descriptors', 'category', 'stats',
  'scoreFileCid', 'scoreDigest', 'hashMatchModule', 'hostAddress', 'signature',
] as const;

const base = (): any => structuredClone(fixture);

/** Mutate a clone of the worked example and assert the validator refuses it. */
function invalid(mutate: (r: any) => void): void {
  const r = base();
  mutate(r);
  const v = validateModerationReport(r);
  expect(v.ok).toBe(false);
  if (!v.ok) expect(v.errors.length).toBeGreaterThan(0);
}

/** Mutate a clone of the worked example and assert the validator accepts it. */
function valid(mutate: (r: any) => void): void {
  const r = base();
  mutate(r);
  const v = validateModerationReport(r);
  expect(v).toEqual({ ok: true, report: r });
}

/** A canonical PASS report (rating/descriptors/category cleared per the table). */
function asPass(r: any): void {
  r.verdict = 'PASS';
  r.rating = null;
  r.descriptors = [];
  r.category = null;
}

describe('validateModerationReport — CONTRACT §3 worked example', () => {
  it('accepts the fully-literal worked example verbatim', () => {
    const v = validateModerationReport(base());
    expect(v).toEqual({ ok: true, report: fixture });
  });
});

describe('validateModerationReport — non-report bodies (normalisation: all refuse as invalid)', () => {
  it.each([
    ['null', null],
    ['an array', []],
    ['a string (truncated/unparseable body passed through unchanged)', '{"verdict":"PA'],
    ['a number', 42],
    ['a boolean', true],
    ['undefined', undefined],
  ])('rejects %s', (_name, body) => {
    const v = validateModerationReport(body);
    expect(v.ok).toBe(false);
  });

  it('rejects a relayed no-verdict error envelope (CONTRACT §3 D4 shape)', () => {
    const v = validateModerationReport({ error: { kind: 'PIPELINE_FAILURE', detail: 'model exploded' } });
    expect(v.ok).toBe(false);
  });

  it('rejects the differently-shaped FastAPI 422 body (CONTRACT §3: {"detail":[…]}, not the error envelope)', () => {
    const v = validateModerationReport({ detail: [{ loc: ['body', 'sourcePath'], msg: 'field required', type: 'value_error.missing' }] });
    expect(v.ok).toBe(false);
  });

  it('rejects a body carrying both verdict and error keys (a body is a verdict iff verdict AND no error)', () => {
    invalid(r => { r.error = { kind: 'PIPELINE_FAILURE', detail: 'x' }; });
  });
});

describe('validateModerationReport — closed top-level key set (exactly 15 keys)', () => {
  it.each(TOP_LEVEL_KEYS.map(k => [k]))('rejects when required key %s is missing', (key) => {
    invalid(r => { delete r[key]; });
  });

  it('rejects unknown extra keys', () => {
    invalid(r => { r.extraKey = 1; });
  });

  it('rejects a minimal forged {verdict:"PASS"} body — strict validation, not a bare verdict read', () => {
    const v = validateModerationReport({ verdict: 'PASS' });
    expect(v.ok).toBe(false);
  });
});

describe('validateModerationReport — scalar field rules', () => {
  it('schemaVersion must be exactly 1', () => {
    invalid(r => { r.schemaVersion = 2; });
    invalid(r => { r.schemaVersion = '1'; });
    invalid(r => { r.schemaVersion = null; });
  });

  it('contentId must match /^[0-9a-f]{64}$/ (SDK-side defence-in-depth)', () => {
    invalid(r => { r.contentId = r.contentId.toUpperCase(); });
    invalid(r => { r.contentId = r.contentId.slice(0, 63); });
    invalid(r => { r.contentId = r.contentId + 'a'; });
    invalid(r => { r.contentId = ''; });
    invalid(r => { r.contentId = 123; });
  });

  it('bundleHash must match /^sha256:[0-9a-f]{64}$/', () => {
    invalid(r => { r.bundleHash = r.bundleHash.slice('sha256:'.length); });
    invalid(r => { r.bundleHash = r.bundleHash.toUpperCase(); });
    invalid(r => { r.bundleHash = 'sha256:' + 'a'.repeat(63); });
    invalid(r => { r.bundleHash = 'sha1:' + 'a'.repeat(64); });
    invalid(r => { r.bundleHash = null; });
  });

  it('samplerVersion / bundleVersion must be integers ≥ 1', () => {
    invalid(r => { r.samplerVersion = 0; });
    invalid(r => { r.samplerVersion = -1; });
    invalid(r => { r.samplerVersion = 1.5; });
    invalid(r => { r.samplerVersion = '1'; });
    invalid(r => { r.bundleVersion = 0; });
    invalid(r => { r.bundleVersion = 2.5; });
    invalid(r => { r.bundleVersion = null; });
    valid(r => { r.samplerVersion = 2; r.bundleVersion = 3; });
  });

  it('verdict is a closed enum of 4', () => {
    invalid(r => { r.verdict = 'pass'; });
    invalid(r => { r.verdict = 'BLOCKED'; });
    invalid(r => { r.verdict = null; });
    invalid(r => { r.verdict = 7; });
  });
});

describe('validateModerationReport — verdict-dependent rules (HANDOFF §3 table)', () => {
  it('PASS: rating null, descriptors [], category null', () => {
    valid(asPass);
    invalid(r => { asPass(r); r.rating = '18'; });
    invalid(r => { asPass(r); r.descriptors = ['sex']; });
    invalid(r => { asPass(r); r.category = 'csam_suspected'; });
  });

  it('PASS_RATED: rating must be exactly "15" or "18"', () => {
    valid(r => { r.rating = '15'; });
    valid(r => { r.rating = '18'; });
    invalid(r => { r.rating = null; });
    invalid(r => { r.rating = 18; });
    invalid(r => { r.rating = '16'; });
    invalid(r => { r.rating = 'adult'; });
  });

  it('PASS_RATED: descriptors must be non-empty', () => {
    invalid(r => { r.descriptors = []; });
  });

  it('PASS_RATED: accepts all 7 ordered subsets — shape/order/no-duplicates only, deliberately NOT reachability', () => {
    // ["strong gore","violence"] and the 3-element set are unreachable today
    // (decide rules 6/7) but must validate — do not independently tighten.
    const subsets = [
      ['sex'], ['strong gore'], ['violence'],
      ['sex', 'strong gore'], ['sex', 'violence'], ['strong gore', 'violence'],
      ['sex', 'strong gore', 'violence'],
    ];
    for (const d of subsets) valid(r => { r.descriptors = d; });
  });

  it('PASS_RATED: rejects wrong order, duplicates, unknown descriptors, non-arrays', () => {
    invalid(r => { r.descriptors = ['violence', 'sex']; });
    invalid(r => { r.descriptors = ['strong gore', 'sex']; });
    invalid(r => { r.descriptors = ['violence', 'strong gore']; });
    invalid(r => { r.descriptors = ['sex', 'sex']; });
    invalid(r => { r.descriptors = ['gore']; });
    invalid(r => { r.descriptors = ['Sex']; });
    invalid(r => { r.descriptors = 'sex'; });
    invalid(r => { r.descriptors = null; });
  });

  it('PASS_RATED: category must be null', () => {
    invalid(r => { r.category = 'extreme_pornography'; });
  });

  it('BLOCK_ILLEGAL: category is a closed enum of 2; rating null; descriptors []', () => {
    const asBlockIllegal = (r: any, category: string) => {
      r.verdict = 'BLOCK_ILLEGAL'; r.rating = null; r.descriptors = []; r.category = category;
    };
    valid(r => asBlockIllegal(r, 'csam_suspected'));
    valid(r => asBlockIllegal(r, 'extreme_pornography'));
    invalid(r => { asBlockIllegal(r, 'csam_suspected'); r.category = null; });
    invalid(r => { asBlockIllegal(r, 'csam_suspected'); r.category = 'other'; });
    invalid(r => { asBlockIllegal(r, 'csam_suspected'); r.rating = '18'; });
    invalid(r => { asBlockIllegal(r, 'csam_suspected'); r.descriptors = ['sex']; });
  });

  it('BLOCK_UNRESOLVED: rating null, descriptors [], category null', () => {
    const asBlockUnresolved = (r: any) => {
      r.verdict = 'BLOCK_UNRESOLVED'; r.rating = null; r.descriptors = []; r.category = null;
    };
    valid(asBlockUnresolved);
    invalid(r => { asBlockUnresolved(r); r.category = 'csam_suspected'; });
    invalid(r => { asBlockUnresolved(r); r.rating = '15'; });
  });
});

describe('validateModerationReport — stats (closed set of exactly 3 keys)', () => {
  it('rejects missing/extra keys and non-object stats', () => {
    invalid(r => { delete r.stats.framesSampled; });
    invalid(r => { delete r.stats.maxScore; });
    invalid(r => { delete r.stats.escalated; });
    invalid(r => { r.stats.extra = 1; });
    invalid(r => { r.stats = null; });
    invalid(r => { r.stats = []; });
    invalid(r => { r.stats = 'stats'; });
  });

  it('framesSampled/escalated are integer counts with 0 ≤ escalated ≤ framesSampled', () => {
    invalid(r => { r.stats.framesSampled = -1; r.stats.escalated = 0; });
    invalid(r => { r.stats.framesSampled = 1.5; r.stats.escalated = 0; });
    invalid(r => { r.stats.framesSampled = '7212'; });
    invalid(r => { r.stats.escalated = -1; });
    invalid(r => { r.stats.escalated = 39.5; });
    invalid(r => { r.stats.escalated = r.stats.framesSampled + 1; });
    valid(r => { r.stats.framesSampled = 0; r.stats.escalated = 0; });
    valid(r => { r.stats.escalated = r.stats.framesSampled; });
  });

  it('maxScore is a float in [0, 1]', () => {
    valid(r => { r.stats.maxScore = 0; });
    valid(r => { r.stats.maxScore = 1; });
    invalid(r => { r.stats.maxScore = -0.1; });
    invalid(r => { r.stats.maxScore = 1.000001; });
    invalid(r => { r.stats.maxScore = '0.5'; });
    invalid(r => { r.stats.maxScore = NaN; });
    invalid(r => { r.stats.maxScore = Infinity; });
    invalid(r => { r.stats.maxScore = null; });
  });

  it('maxScore ≤ 6 decimal places via exactly Number(value.toFixed(6)) === value — NOT an epsilon', () => {
    valid(r => { r.stats.maxScore = 0.123456; });
    valid(r => { r.stats.maxScore = 0.000001 ; }); // 1e-6: representable at 6 dp
    // 0.9100001 is the documented 7-dp value an epsilon comparison wrongly accepts.
    invalid(r => { r.stats.maxScore = 0.9100001; });
    invalid(r => { r.stats.maxScore = 0.1234567; });
    invalid(r => { r.stats.maxScore = 1e-7; });
  });
});

describe('validateModerationReport — collects every violation (shadow-mode logging contract)', () => {
  it('reports key-set AND field violations together — one drift must not mask another', () => {
    const r = base();
    r.extraKey = 1;                 // key-set violation
    r.stats.maxScore = 0.9100001;   // field violation (7 dp)
    const v = validateModerationReport(r);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.some(e => e.includes('unknown key'))).toBe(true);
      expect(v.errors.some(e => e.includes('maxScore'))).toBe(true);
    }
  });

  it('reports stats key-set AND other stats field violations together', () => {
    const r = base();
    r.stats.extra = 1;
    r.stats.escalated = r.stats.framesSampled + 1;
    const v = validateModerationReport(r);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.some(e => e.includes('stats unknown key'))).toBe(true);
      expect(v.errors.some(e => e.includes('escalated'))).toBe(true);
    }
  });

  it('never throws on exotic descriptor entries (BigInt, circular) — refuses instead', () => {
    const circular: any = {};
    circular.self = circular;
    for (const exotic of [1n, circular]) {
      const r = base();
      r.descriptors = [exotic];
      const v = validateModerationReport(r);
      expect(v.ok).toBe(false);
    }
  });

  it('never throws on a body with a throwing property getter — refuses instead', () => {
    const r = base();
    Object.defineProperty(r, 'contentId', {
      get() { throw new Error('hostile getter'); },
      enumerable: true,
    });
    const v = validateModerationReport(r);
    expect(v.ok).toBe(false);
  });

  it('returns a detached plain-data copy — Symbol/non-enumerable smuggled extras do not survive', () => {
    const r = base();
    r[Symbol('smuggle')] = 'payload';
    Object.defineProperty(r, 'smuggled', { value: 'payload', enumerable: false });
    const v = validateModerationReport(r);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(Object.getOwnPropertySymbols(v.report)).toHaveLength(0);
      expect('smuggled' in v.report).toBe(false);
      expect(v.report).not.toBe(r); // never the live input object
    }
  });

  it('validates a single stable read: a stateful getter cannot swap values after validation', () => {
    const r = base();
    let reads = 0;
    Object.defineProperty(r, 'rating', {
      get() { reads++; return reads === 1 ? '18' : 'FORGED'; },
      enumerable: true,
    });
    const v = validateModerationReport(r);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.report.rating).toBe('18'); // the value that was validated
  });
});

describe('validateModerationReport — reserved and M5 forward-typed fields', () => {
  it('hashMatchModule must be null at M3 (reserved slot)', () => {
    invalid(r => { r.hashMatchModule = 'phash-v1'; });
  });

  it('hostAddress: string | null with deliberately NO format check at M3', () => {
    valid(r => { r.hostAddress = null; });
    valid(r => { r.hostAddress = '0x' + '1'.repeat(40); }); // synthetic — no real addresses in tests
    valid(r => { r.hostAddress = 'not-an-address'; }); // a 0x format check now would reject legitimate reports
    invalid(r => { r.hostAddress = 42; });
  });

  it('D6/D8 fields (scoreFileCid, scoreDigest, signature) must be null with default M3 checks', () => {
    invalid(r => { r.signature = 'deadbeef'; });
    invalid(r => { r.scoreFileCid = 'bafy123'; });
    invalid(r => { r.scoreDigest = 'sha256:' + 'a'.repeat(64); });
  });

  it('with m3NullFieldChecks: false (the droppable M5 flag) those fields accept strings, still not other types', () => {
    const opts = { m3NullFieldChecks: false };
    const r = base();
    r.signature = 'deadbeef';
    r.scoreFileCid = 'bafy123';
    r.scoreDigest = 'sha256:' + 'a'.repeat(64);
    expect(validateModerationReport(r, opts).ok).toBe(true);

    const bad = base();
    bad.signature = 42;
    expect(validateModerationReport(bad, opts).ok).toBe(false);
  });
});
