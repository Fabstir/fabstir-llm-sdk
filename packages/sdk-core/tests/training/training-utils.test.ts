/**
 * Phase 2 — the pure maths, against DESIGN-TRAINING-M0-INTERFACE.md v0.3.8 §§B.1/B.4/B.5/C.1.
 *
 * Phase 8 UPDATE (2026-08-24): every case below is now VECTOR-BACKED by
 * `vectors/slice-schedule.json`, asserted case-by-case in `vectors.test.ts`. They are kept here
 * as readable named regressions — the vector suite proves cross-side parity, these say what the
 * rule MEANS. No provisional labels remain anywhere in this build.
 *
 * (Historic note: the provisional marker meant a value the FROZEN DOC ITSELF pinned, awaiting
 * T1 vector at Phase 8. Cases labelled DERIVED are formula properties the doc does NOT number
 * (its "remainder-free case" has no figures anywhere) — they are permanent, not swapped.
 * Commitment HASHES cannot be pinned until input-commitment.json/sig-digest.json land, so this
 * phase pins the ABI type lists, determinism and per-field sensitivity instead.
 */
import { describe, it, expect } from 'vitest';
import { Wallet, AbiCoder, keccak256 } from 'ethers';
import {
  trainingTokens, trainingSliceSchedule, trainingInputEncoded, trainingInputCommitment,
  trainingSigDigest, trainingSigDigestEncoded, recoverTrainingSigner,
  TRAINING_INPUT_TYPES, TRAINING_SIG_TYPES,
  type TrainingCommitmentInput, type TrainingAttestationFields,
} from '../../src/utils/training-utils';

const SLICE = 1_000_000;
const COMMIT: TrainingCommitmentInput = {
  templateHash: '0x' + 'a1'.repeat(32),
  datasetManifestSha256: '0x' + 'b2'.repeat(32),
  declaredTokens: 3_200_000,
  epochs: 3,
  rank: 16,
  alpha: 32,
  lr: '0.000200',                    // trailing-zero form: a parse-and-reserialise impl must fail
  seed: '18446744073709551629',      // 2^64+13 — beats BOTH a u64 path and a float path
  seqLen: 2048,
};

describe('trainingTokens (C.1)', () => {
  it('is declaredTokens x epochs — VECTOR-BACKED (slice-schedule.json, every case)', () => {
    expect(trainingTokens({ dataset: { declaredTokens: 3_200_000 }, epochs: 3 })).toBe(9_600_000);
  });
  it('ignores every field that is not declaredTokens or epochs', () => {
    const base = { dataset: { declaredTokens: 1000 }, epochs: 2 };
    expect(trainingTokens({ ...base, dataset: { declaredTokens: 1000, samples: 7 } } as never)).toBe(2000);
  });
});

describe('trainingSliceSchedule (B.1) — FLOOR, and the LAST slice absorbs', () => {
  it('VECTOR-BACKED `worked`: 9,600,000 -> 9 slices of 8x1,000,000 + 1,600,000', () => {
    const d = trainingSliceSchedule(9_600_000, SLICE);
    expect(d.length).toBe(9);
    expect(d.slice(0, 8)).toEqual(Array(8).fill(1_000_000));
    expect(d[8]).toBe(1_600_000);
  });
  it('VECTOR-BACKED `tinyRemainder`: 1,000,050 -> ONE slice of 1,000,050', () => {
    // The exact shape that broke v0.1: a ceil here yields [1,000,000, 50] and that 50 is below
    // MIN_PROVEN_TOKENS = 100, making the FINAL slice — the one binding the adapter — unsubmittable.
    expect(trainingSliceSchedule(1_000_050, SLICE)).toEqual([1_000_050]);
  });
  it('VECTOR-BACKED `subSliceTokens`: 10,000 -> 1 slice (the only regime max(1,.) binds)', () => {
    expect(trainingSliceSchedule(10_000, SLICE)).toEqual([10_000]);
  });
  it('DERIVED: a remainder-free total yields all-equal deltas (the doc names this case, numbers it never gives)', () => {
    expect(trainingSliceSchedule(8_000_000, SLICE)).toEqual(Array(8).fill(1_000_000));
  });
  it('DERIVED: deltas always sum to the total, across the whole M0 range', () => {
    for (const t of [10_000, 999_999, 1_000_000, 1_000_001, 2_500_000, 9_600_000, 15_000_000]) {
      expect(trainingSliceSchedule(t, SLICE).reduce((a, b) => a + b, 0), `total ${t}`).toBe(t);
    }
  });
  it('DERIVED: every delta >= min(total, sliceTokens) and the last is < 2x sliceTokens (B.1 invariants)', () => {
    for (const t of [10_000, 1_000_050, 1_999_999, 9_600_000, 15_000_000]) {
      const d = trainingSliceSchedule(t, SLICE);
      const floor = Math.min(t, SLICE);
      for (const x of d) expect(x, `total ${t}`).toBeGreaterThanOrEqual(floor);
      expect(d[d.length - 1], `total ${t}`).toBeLessThan(2 * SLICE);
      expect(d.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('DERIVED: the non-last branch is exactly sliceTokens — catches an off-by-one loop bound', () => {
    // Only the worked example is multi-slice among the doc's own cases, so the bound is
    // otherwise untested: i <= slices-1 would duplicate the tail, i < slices would drop it.
    const d = trainingSliceSchedule(3_500_000, SLICE);
    expect(d).toEqual([1_000_000, 1_000_000, 1_500_000]);
  });
});

describe('trainingInputCommitment (B.4) — 9 fields, mixed widths, one dynamic member', () => {
  it('pins the ABI type list IN ORDER — the constraint-1 stability pin: it can never widen silently', () => {
    expect([...TRAINING_INPUT_TYPES]).toEqual([
      'bytes32', 'bytes32', 'uint256', 'uint32', 'uint32', 'uint32', 'string', 'uint256', 'uint32',
    ]);
  });
  it('is keccak256 over the abi.encode of exactly those 9 values in that order', () => {
    const expected = keccak256(AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'uint256', 'uint32', 'uint32', 'uint32', 'string', 'uint256', 'uint32'],
      [COMMIT.templateHash, COMMIT.datasetManifestSha256, 3_200_000n, 3, 16, 32, '0.000200',
        18446744073709551629n, 2048],
    ));
    expect(trainingInputCommitment(COMMIT)).toBe(expected);
    expect(trainingInputCommitment(COMMIT)).toBe(keccak256(trainingInputEncoded(COMMIT)));
  });
  it('treats lr BYTE-FOR-BYTE: "0.0002" and "0.000200" are the SAME number, DIFFERENT commitments', () => {
    expect(trainingInputCommitment({ ...COMMIT, lr: '0.0002' }))
      .not.toBe(trainingInputCommitment({ ...COMMIT, lr: '0.000200' }));
  });
  it('carries seed through BigInt — a value above 2^64 that is not a power of two survives exactly', () => {
    expect(trainingInputCommitment(COMMIT))
      .toBe(trainingInputCommitment({ ...COMMIT, seed: String(2n ** 64n + 13n) }));
    expect(trainingInputCommitment({ ...COMMIT, seed: String(2n ** 64n) }))
      .not.toBe(trainingInputCommitment(COMMIT));
  });
  it('changes when ANY of the nine fields changes (per-field sensitivity)', () => {
    const base = trainingInputCommitment(COMMIT);
    const mutations: TrainingCommitmentInput[] = [
      { ...COMMIT, templateHash: '0x' + 'ff'.repeat(32) },
      { ...COMMIT, datasetManifestSha256: '0x' + 'ff'.repeat(32) },
      { ...COMMIT, declaredTokens: 3_200_001 },
      { ...COMMIT, epochs: 4 }, { ...COMMIT, rank: 8 }, { ...COMMIT, alpha: 64 },
      { ...COMMIT, lr: '0.0003' }, { ...COMMIT, seed: '7' }, { ...COMMIT, seqLen: 4096 },
    ];
    expect(new Set(mutations.map(trainingInputCommitment)).size).toBe(9);
    for (const m of mutations) expect(trainingInputCommitment(m)).not.toBe(base);
  });
});

describe('trainingSigDigest (B.5) — 10 flat static words, EIP-191', () => {
  const ATT: TrainingAttestationFields = {
    modelId: '0x' + '11'.repeat(32),
    templateHash: COMMIT.templateHash,
    envHash: '0x' + '00'.repeat(32),
    inputCommitment: '0x' + '22'.repeat(32),
    checkpointManifestSha256: '0x' + '33'.repeat(32),
    sliceIndex: 0,
    tokensDelta: 1_000_000,
    sessionId: '0x1f3',
    host: '0xA1A1a1a1A1A1A1A1A1a1a1a1a1a1A1A1a1A1a1a1',  // synthetic: this digest test is structural
    timestamp: 1790000000,
  };

  it('pins the ABI type list IN ORDER — all numerics uint256 here, unlike B.4s uint32s', () => {
    expect([...TRAINING_SIG_TYPES]).toEqual([
      'bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes32',
      'uint256', 'uint256', 'uint256', 'address', 'uint256',
    ]);
  });
  it('maps the attestation hex-string sessionId to the digests uint256 (the v0.3.2 vector note)', () => {
    expect(trainingSigDigest(ATT)).toBe(trainingSigDigest({ ...ATT, sessionId: '499' }));
    expect(trainingSigDigest({ ...ATT, sessionId: '0x1f4' })).not.toBe(trainingSigDigest(ATT));
  });
  it('is keccak256 over the encoded form and is deterministic', () => {
    expect(trainingSigDigest(ATT)).toBe(keccak256(trainingSigDigestEncoded(ATT)));
    expect(trainingSigDigest(ATT)).toBe(trainingSigDigest({ ...ATT }));
  });
  it('recovers the signer over the 32-byte digest (EIP-191 personalSign)', async () => {
    const w = Wallet.createRandom();
    const signature = await w.signMessage(Buffer.from(trainingSigDigest(ATT).slice(2), 'hex'));
    expect(recoverTrainingSigner({ ...ATT, signature })?.toLowerCase()).toBe(w.address.toLowerCase());
  });
  it('returns null for an absent signature and for a malformed one (never throws)', () => {
    expect(recoverTrainingSigner(ATT)).toBeNull();
    expect(recoverTrainingSigner({ ...ATT, signature: '0xdeadbeef' })).toBeNull();
  });
});
