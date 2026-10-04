/**
 * Phase 1 — training type + error surface, pinned against DESIGN-TRAINING-M0-INTERFACE.md v0.3.8
 * FROZEN. The capacity table has 8 ROWS carrying 10 CODES and `VALIDATION_FAILED` is in neither
 * count (it lives in A.3/C.3): the member set is arrived at by NAMING, never by counting the table.
 */
import { TrainingError } from '../../src/errors/training-errors';
import { buildTrainAction } from '../../src/types/training.types';
import { describe, it, expect } from 'vitest';
import {
  TRAINING_WIRE_ERROR_CODES, TRAINING_CLIENT_ERROR_CODES, TRAINING_SERVE_BACK_ERROR_CODES,
  TRAINING_ERROR_CODES, TRAINING_WIRE_VISIBLE_CODES, TrainingError, CAPACITY_REASONS,
  LORA_STAGING_FAILED_REASONS, VALIDATION_FAILED_REASONS,
} from '../../src/errors/training-errors';
import {
  TRAINING_PROGRESS_STAGES, toJobModerationStatus, type TrainingModerationStatus,
} from '../../src/types/training.types';
import { MODERATION_HOLD_CODES } from '../../src/types/moderation.types';

describe('the closed wire error set (capacity table + A.3/C.3)', () => {
  it('names the 8 non-moderation wire codes explicitly', () => {
    expect([...TRAINING_WIRE_ERROR_CODES]).toEqual([
      'VALIDATION_FAILED', 'CAPACITY', 'SIDECAR_UNAVAILABLE', 'DATASET_INTEGRITY',
      'DECLARED_TOKENS_MISMATCH', 'CANCELLED', 'TRAIN_FAILED', 'TIMEOUT',
    ]);
  });
  it('composes the 3 ModerationHoldCode members in, for 11 wire-visible codes total', () => {
    for (const hold of MODERATION_HOLD_CODES) expect(TRAINING_ERROR_CODES).toContain(hold);
    const wireVisible = new Set([...TRAINING_WIRE_ERROR_CODES, ...MODERATION_HOLD_CODES]);
    expect(wireVisible.size).toBe(11);
  });
  it('exports the 11-code WIRE-VISIBLE set separately from the full 17-code set', () => {
    // A consumer validating an inbound train_error must not accept client-side or serve-back
    // codes the node can never send on that frame.
    expect(TRAINING_WIRE_VISIBLE_CODES.length).toBe(11);
    expect(TRAINING_WIRE_VISIBLE_CODES).not.toContain('ESTIMATE_MISMATCH');
    expect(TRAINING_WIRE_VISIBLE_CODES).not.toContain('LORA_NOT_STAGED');
    expect(TRAINING_ERROR_CODES.length).toBe(17);
  });
  it('EXCLUDES the two sidecar-internal codes (doc:112 TEMPLATE_BOUNDS, doc:123 SCAN_FAILURE)', () => {
    // Both are sidecar 4xx/no-verdict responses that MAP to a wire code; neither is one.
    expect(TRAINING_ERROR_CODES).not.toContain('TEMPLATE_BOUNDS');
    expect(TRAINING_ERROR_CODES).not.toContain('SCAN_FAILURE');
  });
  it('carries the 4 client-side codes and the 2 serve-back codes as distinct groups', () => {
    expect([...TRAINING_CLIENT_ERROR_CODES]).toEqual([
      'TRAINING_BUNDLE_STALE', 'ESTIMATE_MISMATCH', 'INPUT_BINDING_MISMATCH', 'POINTER_PERSIST_FAILED',
    ]);
    expect([...TRAINING_SERVE_BACK_ERROR_CODES]).toEqual(['LORA_STAGING_FAILED', 'LORA_NOT_STAGED']);
  });
});

describe('capacity reasons — the consumed/not-consumed discriminator', () => {
  it('pins the closed 4-value vocabulary', () => {
    expect([...CAPACITY_REASONS]).toEqual(['chainUnavailable', 'slotBusy', 'addressBusy', 'cooldown']);
  });
  it('chainUnavailable alone permits a SAME-session retry; the rest burn the session', () => {
    const same = (r: string) => new TrainingError('x', 'CAPACITY', { reason: r }).requiresFreshSession;
    expect(same('chainUnavailable')).toBe(false);
    expect(same('slotBusy')).toBe(true);
    expect(same('addressBusy')).toBe(true);
    expect(same('cooldown')).toBe(true);
  });
  it('an UNKNOWN reason defaults conservatively to presumed-consumed (XCHECK commitment)', () => {
    expect(new TrainingError('x', 'CAPACITY', { reason: 'somethingNew' }).requiresFreshSession).toBe(true);
    expect(new TrainingError('x', 'CAPACITY').requiresFreshSession).toBe(true);
  });
  it('SIDECAR_UNAVAILABLE consumes the session too — N retries means N FRESH sessions (doc:79)', () => {
    const e = new TrainingError('x', 'SIDECAR_UNAVAILABLE');
    expect(e.isRetryable).toBe(true);
    expect(e.requiresFreshSession).toBe(true);
  });
});
describe('the retry law (constraint 8)', () => {
  it('moderation holds are terminal and never re-shopped (WP-S1)', () => {
    for (const hold of MODERATION_HOLD_CODES) {
      const e = new TrainingError('held', hold);
      expect(e.isRetryable, hold).toBe(false);
      expect(e.isReshoppable(0), hold).toBe(false);
    }
  });
  it('DATASET_INTEGRITY, DECLARED_TOKENS_MISMATCH and CANCELLED are terminal for this job', () => {
    for (const code of ['DATASET_INTEGRITY', 'DECLARED_TOKENS_MISMATCH', 'CANCELLED'] as const) {
      expect(new TrainingError('x', code).isRetryable, code).toBe(false);
      expect(new TrainingError('x', code).isReshoppable(0), code).toBe(false);
    }
  });
  it('VALIDATION_FAILED is REASON-dependent: pinned reasons recur everywhere, drift does not', () => {
    // The four pinned reasons describe the job or the session, so another host rejects identically.
    for (const reason of VALIDATION_FAILED_REASONS) {
      expect(new TrainingError('x', 'VALIDATION_FAILED', { reason }).isReshoppable(0), reason).toBe(false);
    }
    // A.4's mid-flight allowlist drift (doc:418-421) is a fact about THAT host and carries no
    // pinned reason — a blanket false would retire a good job in the one case the doc describes.
    expect(new TrainingError('x', 'VALIDATION_FAILED').isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'VALIDATION_FAILED', { reason: 'allowListBumped' }).isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'VALIDATION_FAILED').isRetryable).toBe(false);
  });
  it('moderation holds are never RE-HOSTED, which is stronger than merely terminal (WP-S1)', () => {
    for (const hold of MODERATION_HOLD_CODES) {
      expect(new TrainingError('h', hold).isReshoppable(0), hold).toBe(false);
      expect(new TrainingError('h', hold).isReshoppable(9), hold).toBe(false);
    }
  });
  it('TRAIN_FAILED/TIMEOUT are re-shoppable ONLY at k=0 (a k=0 death is the SIDECAR class)', () => {
    for (const code of ['TRAIN_FAILED', 'TIMEOUT'] as const) {
      expect(new TrainingError('x', code).isReshoppable(0), `${code} k=0`).toBe(true);
      expect(new TrainingError('x', code).isReshoppable(1), `${code} k=1`).toBe(false);
      expect(new TrainingError('x', code).isReshoppable(5), `${code} k=5`).toBe(false);
    }
  });
  it('CAPACITY is re-shoppable at any k', () => {
    expect(new TrainingError('x', 'CAPACITY').isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'CAPACITY').isReshoppable(3)).toBe(true);
  });
});
describe('reason vocabularies that are pinned, and the one that is NOT closed', () => {
  it('pins the 6 LORA_STAGING_FAILED reasons', () => {
    expect([...LORA_STAGING_FAILED_REASONS])
      .toEqual(['invalid', 'fetch', 'write', 'cancelled', 'budget', 'chain']);
  });
  it('pins the 4 doc-cited VALIDATION_FAILED reasons but leaves the type open', () => {
    // doc:371/391/630. The template-shape reject carries NO pinned reason string — a closed
    // union here would invent one, so the TYPE stays open while the known values are named.
    expect([...VALIDATION_FAILED_REASONS])
      .toEqual(['sessionParams', 'sessionReused', 'trainActive', 'datasetFormat']);
  });
});

describe('TrainingError shape', () => {
  it('is an Error subclass carrying code + detail, with instanceof intact', () => {
    const e = new TrainingError('boom', 'TIMEOUT', { settledSlices: 2 });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(TrainingError);
    expect(e.name).toBe('TrainingError');
    expect(e.message).toBe('boom');
    expect(e.code).toBe('TIMEOUT');
    expect(e.detail).toEqual({ settledSlices: 2 });
  });
});
describe('progress stages', () => {
  it('pins all 7 in order, with the BRITISH finalising spelling', () => {
    expect([...TRAINING_PROGRESS_STAGES]).toEqual([
      'staging', 'scanning', 'counting', 'training', 'checkpointing', 'uploading', 'finalising',
    ]);
    expect(TRAINING_PROGRESS_STAGES).not.toContain('finalizing');
  });
});

describe('the training moderation object uses the WIRE key `status`, not `verdict` (F1)', () => {
  it('types the frozen wire shape — doc:476 and doc:816 both spell it `status`', () => {
    const wire: TrainingModerationStatus = { status: 'cleared', policyVersion: 'p-2026-08' };
    expect(wire.status).toBe('cleared');
    expect(wire.policyVersion).toBe('p-2026-08');
    // The transcode/publish-gate surface spells the same concept `verdict`. Reusing that type
    // here left `.verdict` undefined on every real frame, so a client checking
    // `verdict === 'cleared'` REFUSED an honest, fully-paid, cleared run.
    expect('verdict' in wire).toBe(false);
  });
  it('maps onto the generalised type explicitly, because the keys do not overlap (doc:293)', () => {
    expect(toJobModerationStatus({ status: 'cleared' })).toEqual({ verdict: 'cleared' });
    expect(toJobModerationStatus({ status: 'blocked', policyVersion: 'p1' }).verdict).toBe('blocked');
  });
});

describe('client-minted reasons must not INVERT re-shopping', () => {
  it('a malformed lr/seed and a broken dependency are TERMINAL, not re-shoppable', () => {
    // `isReshoppable` treats any reason outside A.3's pinned four as re-shoppable, which is
    // right for a HOST-specific reason and exactly wrong for a JOB-specific one. A malformed
    // `lr` recurs identically on every host, and a missing dependency method is our own wiring
    // — neither gets better elsewhere, and the load balancer would burn three hosts finding out.
    for (const reason of ['numericWireRule', 'missingDependencyMethod']) {
      const e = new TrainingError('x', 'VALIDATION_FAILED', { reason });
      expect(e.isReshoppable(0), reason).toBe(false);
    }
  });
  it('OUR OWN faults are never re-shoppable, whatever code carries them', () => {
    // The governing principle: if the fault is ours, another host cannot fix it. A missing
    // dependency method is our wiring and a failed pointer write is our storage — re-shopping
    // either one just burns a second deposit to reach the identical failure.
    expect(new TrainingError('x', 'ESTIMATE_MISMATCH', { reason: 'missingDependencyMethod' }).isReshoppable(0)).toBe(false);
    expect(new TrainingError('x', 'POINTER_PERSIST_FAILED').isReshoppable(0)).toBe(false);
  });
  it('but a HOST-specific fault stays re-shoppable — that is the whole distinction', () => {
    // These three are all "THIS host did something wrong", and another host is exactly the fix.
    expect(new TrainingError('x', 'ESTIMATE_MISMATCH').isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'TRAINING_BUNDLE_STALE').isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'INPUT_BINDING_MISMATCH').isReshoppable(0)).toBe(true);
    expect(new TrainingError('x', 'VALIDATION_FAILED', { reason: 'hostBundle' }).isReshoppable(0)).toBe(true);
  });
  it('and A.3\'s four pinned reasons remain terminal', () => {
    for (const reason of ['sessionParams', 'sessionReused', 'trainActive', 'datasetFormat']) {
      expect(new TrainingError('x', 'VALIDATION_FAILED', { reason }).isReshoppable(0), reason).toBe(false);
    }
  });
});

describe('A.1 numeric rule — integer-ness and the epochs floor (rev-wire D-2)', () => {
  const J: any = {
    templateId: 't', templateHash: `0x${'ab'.repeat(32)}`,
    dataset: { manifestCID: 'u', manifestSha256: `0x${'cd'.repeat(32)}`, declaredTokens: 100, samples: 1 },
    epochs: 3, hyper: { rank: 16, alpha: 32, lr: '0.1', seed: '1', seqLen: 2048 }, output: 'adapter-v1',
  };
  it('rejects FRACTIONAL numerics — the guard claimed integer-ness and never checked it', () => {
    // A.1's fields are u32/u64 on the node. A fractional value serialises fine, so the client
    // gate passes and the node's non-Option deserialisation rejects it POST-ESCROW.
    for (const f of [{ epochs: 2.5 }, { hyper: { ...J.hyper, rank: 16.5 } }, { hyper: { ...J.hyper, seqLen: 2048.1 } }]) {
      expect(() => buildTrainAction({ ...J, ...f }), JSON.stringify(f)).toThrow(/whole number|integer/i);
    }
  });
  it('rejects epochs < 1 — zero produces a slice of ZERO tokens', () => {
    // doc pins `1..=bounds.maxEpochs` and only the upper bound was checked. epochs 0 makes
    // totalTokens 0, and the schedule then yields a single zero-token slice — below the
    // minimum provable size, i.e. exactly the unsubmittable-final-slice shape B.1 was
    // rewritten in v0.2 to eliminate.
    expect(() => buildTrainAction({ ...J, epochs: 0 })).toThrow(/at least 1|epochs/i);
    expect(() => buildTrainAction({ ...J, epochs: -1 })).toThrow(/at least 1|epochs/i);
  });
  it('still accepts a legitimate whole-number job', () => {
    expect(() => buildTrainAction(J)).not.toThrow();
  });
});
