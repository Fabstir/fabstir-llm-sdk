/**
 * WP-S1 collision guard (IMPLEMENTATION Phase 1.3 / §2b).
 *
 * The moderation types reach consumers through a chain of star exports
 * (`types/transcode.types` → `types/index` → `src/index`). A name that becomes ambiguous
 * across two starred modules is TS2308 *and* is silently dropped from the barrel — and §2b
 * measured that `build:types` runs `tsc … || true`, so such a build still exits 0 and ships a
 * tarball with the name missing. Nothing else in the suite would notice.
 *
 * `isTranscodeModerationStatus` is the runtime half of the passthrough surface, so importing it
 * from the package ROOT is a real, executable check that the chain is intact.
 */
import { describe, it, expect } from 'vitest';
import * as sdk from '../../src/index';
import { isTranscodeModerationStatus, cloneTranscodeModerationStatus } from '../../src/index';

describe('moderation passthrough surface is reachable from the package root', () => {
  it('exports both runtime helpers (IMPLEMENTATION §5)', () => {
    expect(typeof isTranscodeModerationStatus).toBe('function');
    expect(sdk.isTranscodeModerationStatus).toBe(isTranscodeModerationStatus);
    expect(typeof cloneTranscodeModerationStatus).toBe('function');
    expect(sdk.cloneTranscodeModerationStatus).toBe(cloneTranscodeModerationStatus);
  });

  it('the root-exported clone keeps only the declared fields', () => {
    const contaminated = { verdict: 'blocked', reason: 'hash-list-match', matchedHash: 'ab12' };
    expect(cloneTranscodeModerationStatus(contaminated as never))
      .toEqual({ verdict: 'blocked', reason: 'hash-list-match' });
  });

  it('the root-exported guard behaves identically to the module-level one', () => {
    expect(isTranscodeModerationStatus({ verdict: 'cleared' })).toBe(true);
    expect(isTranscodeModerationStatus({ verdict: 'quarantined' })).toBe(true); // unknown is still a status
    expect(isTranscodeModerationStatus(undefined)).toBe(false);
    expect(isTranscodeModerationStatus(null)).toBe(false);
    expect(isTranscodeModerationStatus({})).toBe(false);
    expect(isTranscodeModerationStatus([])).toBe(false);
    expect(isTranscodeModerationStatus('cleared')).toBe(false);
  });

  it('does NOT export a bare ModerationVerdict — that name belongs to the M3 gate (D1a)', () => {
    // A second `ModerationVerdict` in transcode.types.ts would make the name ambiguous the
    // moment feat/moderation-gate-m3 merges, and vanish from the barrel without a build failure.
    expect('ModerationVerdict' in sdk).toBe(false);
  });
});
