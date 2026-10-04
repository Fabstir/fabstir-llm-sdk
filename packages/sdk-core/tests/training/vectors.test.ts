/**
 * Phase 8 — T1 VECTOR CONFORMANCE. The node's own bytes are the oracle for every value here.
 *
 * Until these files landed, our encoding tests compared our computation against our computation.
 * They agreed with themselves. These assert the exact bytes the node commits, produced on the
 * node side with real ethers encoding and reproduced by its Rust implementation — so agreement
 * here is cross-side parity, not self-consistency.
 *
 * NOTE the deliberate placeholders (`uVECTORDATASETMANIFEST…`, `tokenizerSha256: 0x1111…`,
 * `checkpointManifestSha256: 0x7777…`). They pin the ENCODING, not the inputs: what matters is
 * that both sides commit the same bytes for the same inputs. The REAL tokenizerSha256 is the one
 * in the counting fixture — do not cross-wire them.
 */
import { describe, it, expect } from 'vitest';
import ic from './vectors/input-commitment.json';
import sd from './vectors/sig-digest.json';
import mf from './vectors/manifests.json';
import sched from './vectors/slice-schedule.json';
import {
  TRAINING_INPUT_TYPES, TRAINING_SIG_TYPES, trainingInputEncoded, trainingInputCommitment,
  trainingSigDigestEncoded, trainingSigDigest, recoverTrainingSigner, trainingSliceSchedule,
  trainingTokens,
} from '../../src/utils/training-utils';
import { canonicaliseManifest, manifestSha256, splitShardSizes } from '../../src/utils/training-shard';

const bindingOf = (j: any) => ({
  templateHash: j.templateHash, datasetManifestSha256: j.dataset.manifestSha256,
  declaredTokens: j.dataset.declaredTokens, epochs: j.epochs,
  rank: j.hyper.rank, alpha: j.hyper.alpha, lr: j.hyper.lr,
  seed: j.hyper.seed, seqLen: j.hyper.seqLen,
});

describe('B.4 input-commitment.json — the highest-value client check, byte-exact', () => {
  it('uses the SAME nine ABI types, in the same order', () => {
    expect([...TRAINING_INPUT_TYPES]).toEqual(ic.commitTypes);
  });
  it('produces byte-identical abi.encode output', () => {
    // The preimage, not just the hash: a hash match with different bytes would mean we had
    // found a different way to be right, which is not the same as agreeing.
    expect(trainingInputEncoded(bindingOf(ic.job) as never)).toBe(ic.abiEncoded);
  });
  it('produces the node’s exact inputCommitment', () => {
    expect(trainingInputCommitment(bindingOf(ic.job) as never)).toBe(ic.inputCommitment);
  });
  it('survives the 2^64+13 seed — a Number anywhere in the path corrupts it', () => {
    // 18,446,744,073,709,551,629 exceeds 2^53, so a JS Number round-trip silently rounds it and
    // the commitment changes. The vector is aimed at exactly that failure.
    expect(ic.job.hyper.seed).toBe('18446744073709551629');
    // The hazard shown as a STRING round-trip. Comparing against a numeric literal cannot show
    // it: `18446744073709551629` written in source is itself parsed as a Number and rounds to
    // the same wrong value, so both sides of the comparison would be equally corrupted.
    expect(String(Number(ic.job.hyper.seed))).not.toBe(ic.job.hyper.seed);
    expect(String(Number(ic.job.hyper.seed))).toBe('18446744073709552000');   // rounded UP by 371
    const viaNumber = { ...bindingOf(ic.job), seed: String(Number(ic.job.hyper.seed)) };
    expect(trainingInputCommitment(viaNumber as never)).not.toBe(ic.inputCommitment);
  });
  it('binds the REAL dataset manifest — the vectors are internally coherent', () => {
    expect(ic.job.dataset.manifestSha256).toBe(mf.dataset.manifestSha256);
  });
});

describe('B.5 sig-digest.json — digest and signer recovery', () => {
  it('uses the SAME ten ABI types, in the same order', () => {
    expect([...TRAINING_SIG_TYPES]).toEqual(sd.digestTypes);
  });
  it('produces byte-identical abi.encode output and the node’s exact digest', () => {
    expect(trainingSigDigestEncoded(sd.values as never)).toBe(sd.abiEncoded);
    expect(trainingSigDigest(sd.values as never)).toBe(sd.sigDigest);
  });
  it('recovers the vector’s signer from the vector’s signature (EIP-191)', () => {
    const recovered = recoverTrainingSigner({ ...sd.values, signature: sd.signature } as never);
    expect(recovered?.toLowerCase()).toBe(sd.signer.address.toLowerCase());
  });
  it('returns null for a MISSING signature and for a malformed one — advisory, never fatal', () => {
    expect(recoverTrainingSigner(sd.values as never)).toBeNull();
    expect(recoverTrainingSigner({ ...sd.values, signature: '0xdeadbeef' } as never)).toBeNull();
  });
});

describe('D.2/D.3 manifests.json — canonical bytes and their sha256', () => {
  for (const key of ['dataset', 'adapter', 'shiftedRemainder'] as const) {
    it(`${key}: canonicalises to the node’s exact bytes and hash`, () => {
      const entry = (mf as any)[key];
      const bytes = canonicaliseManifest(entry.object);
      // The BYTES first: D.2 says the stored bytes ARE the canonical form, so matching the hash
      // while producing different bytes would mean we agree by accident.
      expect(new TextDecoder().decode(bytes)).toBe(entry.canonicalBytes);
      expect(manifestSha256(bytes)).toBe(entry.manifestSha256);
    });
  }
  it('shiftedRemainder’s shard sizes are what OUR splitter produces (the D.1 branch)', () => {
    // This entry exists to pin the exception branch: a remainder that is an exact chunk
    // multiple becomes (remainder-1) plus a trailing 1-byte shard.
    const shards = (mf as any).shiftedRemainder.object.files[0].shards as { sizeBytes: number }[];
    const total = shards.reduce((a, s) => a + s.sizeBytes, 0);
    expect(splitShardSizes(total)).toEqual(shards.map((s) => s.sizeBytes));
    expect(shards.at(-1)!.sizeBytes).toBe(1);
  });
});

describe('B.1 slice-schedule.json — the floor rule, against the node’s own cases', () => {
  it('reproduces every case: slice COUNT and every DELTA', () => {
    for (const [name, c] of Object.entries(sched.cases as Record<string, any>)) {
      expect(trainingTokens({ dataset: { declaredTokens: c.declaredTokens }, epochs: c.epochs }),
        `${name} total`).toBe(c.totalTokens);
      const deltas = trainingSliceSchedule(c.totalTokens, c.sliceTokens);
      expect(deltas.length, `${name} slices`).toBe(c.slices);
      expect(deltas, `${name} deltas`).toEqual(c.deltas);
      expect(deltas.reduce((a, b) => a + b, 0), `${name} sums to total`).toBe(c.totalTokens);
    }
  });
  it('pins the two regimes the floor rule exists for', () => {
    // `subSliceTokens` is the ONLY case where max(1, .) binds — a total below one slice still
    // yields one slice. `tinyRemainder` is where floor() swallows a remainder into the last
    // slice rather than emitting a second one.
    const s = sched.cases as any;
    expect(s.subSliceTokens.slices).toBe(1);
    expect(s.subSliceTokens.deltas).toEqual([10_000]);
    expect(s.tinyRemainder.slices).toBe(1);
    expect(s.tinyRemainder.deltas).toEqual([1_000_050]);
    expect(s.worked.deltas.at(-1)).toBe(1_600_000);   // the last slice ABSORBS
  });
});
