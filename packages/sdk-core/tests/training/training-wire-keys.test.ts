/**
 * Phase 1 — exact wire-key pins (constraint 3). Literal objects only, never a serialiser: a
 * camelCase pass turns `manifestCID` into `manifestCid` and the node rejects the WHOLE session
 * init rather than silently serving base-model output on a paid fine-tune (what-is-owed).
 */
import { describe, it, expect } from 'vitest';
import {
  buildTrainAction, buildTrainCancelAction, buildLoraSessionField,
  type TrainingJob, type LoraSessionField,
} from '../../src/types/training.types';

const JOB: TrainingJob = {
  templateId: 'train-qlora-qwen38-27b-v1',
  templateHash: '0x' + 'ab'.repeat(32),
  dataset: {
    manifestCID: 'uDatasetManifestCap',
    manifestSha256: '0x' + 'cd'.repeat(32),
    declaredTokens: 3_200_000,
    samples: 5000,
  },
  epochs: 3,
  hyper: { rank: 16, alpha: 32, lr: '0.000200', seed: '18446744073709551629', seqLen: 2048 },
  output: 'adapter-v1',
};

describe('the `train` action', () => {
  it('spreads the TrainingJob fields at TOP LEVEL beside action (never nested under a job key)', () => {
    const sent = buildTrainAction(JOB);
    expect(sent.action).toBe('train');
    expect(Object.keys(sent).sort()).toEqual(
      ['action', 'dataset', 'epochs', 'hyper', 'output', 'templateHash', 'templateId'],
    );
    expect(sent).not.toHaveProperty('job');
  });
  it('pins the dataset and hyper key strings exactly, manifestCID casing included', () => {
    const sent = buildTrainAction(JOB);
    expect(Object.keys(sent.dataset).sort())
      .toEqual(['declaredTokens', 'manifestCID', 'manifestSha256', 'samples']);
    expect(Object.keys(sent.hyper).sort())
      .toEqual(['alpha', 'lr', 'rank', 'seed', 'seqLen']);
    // The exact defect the node named: a camelCase serialiser yields manifestCid.
    expect(JSON.stringify(sent)).toContain('"manifestCID"');
    expect(JSON.stringify(sent)).not.toContain('manifestCid"');
  });
  it('carries requestId only when given — absent, never null', () => {
    expect('requestId' in buildTrainAction(JOB)).toBe(false);
    expect(buildTrainAction(JOB, 'req-7').requestId).toBe('req-7');
  });
  it('NEVER emits resumeFrom — M0 clients must not send it ([CK-6])', () => {
    expect(JSON.stringify(buildTrainAction(JOB, 'req-7'))).not.toContain('resumeFrom');
  });
  it('preserves lr byte-for-byte and keeps seed a decimal STRING (no Number round-trip)', () => {
    const sent = buildTrainAction(JOB);
    expect(sent.hyper.lr).toBe('0.000200');          // trailing zeros survive
    expect(sent.hyper.seed).toBe('18446744073709551629');
    expect(typeof sent.hyper.seed).toBe('string');
    // > 2^53 and not a power of two: a float path corrupts it, a u64 path overflows it.
    expect(BigInt(sent.hyper.seed) > 2n ** 64n).toBe(true);
    expect(JSON.parse(JSON.stringify(sent)).hyper.lr).toBe('0.000200');
  });
  it('round-trips through JSON with every present numeric finite and non-null', () => {
    const wire = JSON.parse(JSON.stringify(buildTrainAction(JOB)));
    for (const [k, v] of Object.entries({ ...wire.hyper, ...wire.dataset, epochs: wire.epochs })) {
      if (typeof v === 'number') expect(Number.isFinite(v), `numeric ${k}`).toBe(true);
      expect(v, `field ${k}`).not.toBeNull();
    }
  });
});

describe('the `train_cancel` action', () => {
  it('is exactly { action: "train_cancel" } — no other fields (A.1 tail)', () => {
    expect(buildTrainCancelAction()).toEqual({ action: 'train_cancel' });
    expect(Object.keys(buildTrainCancelAction())).toEqual(['action']);
  });
});

describe('the session-init `lora` field (E.2)', () => {
  const LORA: LoraSessionField = {
    manifestCID: 'uAdapterManifestCap',
    manifestSha256: '0x' + 'ef'.repeat(32),
    file: 'adapter.gguf',
  };

  it('emits exactly the three frozen keys, manifestCID capitalised, values unrenamed', () => {
    const f = buildLoraSessionField(LORA);
    expect(Object.keys(f).sort()).toEqual(['file', 'manifestCID', 'manifestSha256']);
    expect(JSON.stringify(f)).toContain('"manifestCID"');
    expect(JSON.stringify(f)).not.toContain('manifestCid');
    expect(f).toEqual(LORA);
  });
});

describe('entry-surface pins (the build:types `|| true` hazard)', () => {
  it('reaches the training wire builders and code sets from the package root', async () => {
    const sdk = (await import('../../src/index')) as Record<string, unknown>;
    expect(typeof sdk.buildTrainAction).toBe('function');
    expect(typeof sdk.buildLoraSessionField).toBe('function');
    // toBeDefined() would pass on an empty or entirely wrong array, which is exactly the
    // `build:types || true` hazard this block exists to catch. Assert CONTENT at the entry.
    expect(sdk.TRAINING_PROGRESS_STAGES).toEqual([
      'staging', 'scanning', 'counting', 'training', 'checkpointing', 'uploading', 'finalising',
    ]);
    expect((sdk.TRAINING_WIRE_VISIBLE_CODES as readonly string[]).length).toBe(11);
    expect(sdk.TRAINING_ERROR_CODES).toContain('DECLARED_TOKENS_MISMATCH');
  });
  it('reaches the Phases 4-7 surface — the calls that CHECK the node\'s arithmetic', async () => {
    const sdk = (await import('../../src/index')) as Record<string, unknown>;
    // Every one of these exists so a client can recompute something the node claims. An export
    // silently dropped by a refactor removes the CHECK while leaving the call site compiling
    // against a stale .d.ts — the `build:types || true` hazard, one layer out.
    for (const fn of [
      'splitShardSizes', 'splitShards', 'reassembleShards', 'validateJsonlTextV1',
      'canonicaliseManifest', 'manifestSha256', 'verifyPlausibility',
      'assertTokenizerPin', 'loadTrainingTokenizer', 'countSampleTokens', 'countDatasetTokens',
      'toServeBackError', 'serveBackAvailable',
    ]) expect(typeof sdk[fn], fn).toBe('function');
    // Constants asserted by VALUE: a wrong shard size is a rejected upload, and 24 MiB exactly
    // (25,165,824) is the v0.1 bug the pinned chunk scheme refuses to encrypt or fetch.
    expect(sdk.SHARD_PLAINTEXT_MAX_BYTES).toBe(25_161_728);
    expect(sdk.AEAD_CHUNK_BYTES).toBe(262_144);
    expect(sdk.PLAUSIBILITY_MAX_BYTES_PER_TOKEN).toBe(8);
  });
});

describe('A.1 numeric wire rule, enforced BEFORE the socket (F4)', () => {
  // A NaN becomes `null` under JSON.stringify; the node's types are non-Option, so that null
  // fails deserialisation POST-ESCROW, which consumes the session (C.3) and forces the retry
  // onto a fresh one (A.3). Throwing locally turns a burned session into a caught bug.
  it('rejects a non-finite numeric on any A.1 field', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => buildTrainAction({ ...JOB, epochs: bad }), String(bad)).toThrow(/finite/i);
    }
    expect(() => buildTrainAction({ ...JOB, dataset: { ...JOB.dataset, declaredTokens: NaN } }))
      .toThrow(/declaredTokens/);
    expect(() => buildTrainAction({ ...JOB, hyper: { ...JOB.hyper, seqLen: NaN } })).toThrow(/seqLen/);
  });
  it('rejects a missing numeric rather than sending null', () => {
    expect(() => buildTrainAction({ ...JOB, epochs: undefined as never })).toThrow(/finite/i);
    expect(() => buildTrainAction({ ...JOB, epochs: null as never })).toThrow(/finite/i);
  });
  it('rejects an lr the A.1 regex forbids — exponent, sign, or bare trailing dot', () => {
    for (const lr of ['2e-4', '-0.5', '0.', '.5', '', ' 0.1']) {
      expect(() => buildTrainAction({ ...JOB, hyper: { ...JOB.hyper, lr } }), lr).toThrow(/lr/);
    }
    // ...but the mandated trailing-zero form is legal and must survive untouched.
    expect(buildTrainAction({ ...JOB, hyper: { ...JOB.hyper, lr: '0.000200' } }).hyper.lr).toBe('0.000200');
  });
  it('rejects a seed that is not a decimal uint256 string', () => {
    for (const seed of ['-5', '1e20', '0x10', '']) {
      expect(() => buildTrainAction({ ...JOB, hyper: { ...JOB.hyper, seed } }), seed).toThrow(/seed/);
    }
    expect(buildTrainAction({ ...JOB, hyper: { ...JOB.hyper, seed: '0' } }).hyper.seed).toBe('0');
  });
  it('lets a wholly valid job through untouched', () => {
    expect(() => buildTrainAction(JOB)).not.toThrow();
  });
});
