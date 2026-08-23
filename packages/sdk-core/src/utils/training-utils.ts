// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Training M0 conformance primitives — pure maths, no I/O. Every shape conforms to
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.8 §§B.1/B.4/B.5/C.1 (all four
// re-verified byte-identical to v0.3.6, at which this was written).
import { AbiCoder, keccak256, getBytes, verifyMessage } from 'ethers';

/** Structural input for the B.4 input commitment. `TrainingJob` fields map onto it. */
export interface TrainingCommitmentInput {
  templateHash: string;
  /** SHA256 of the exact stored dataset-manifest bytes — the commitment binds BYTES, not the CID. */
  datasetManifestSha256: string;
  declaredTokens: number;
  epochs: number;
  rank: number;
  alpha: number;
  /** The EXACT wire string, byte-for-byte. Never parse-and-reserialise: "0.0002" and "0.000200"
   *  are the same number and different bytes, and the vector uses the trailing-zero form. */
  lr: string;
  /** Decimal string; encoded as uint256 via BigInt. Never Number() — the vector exceeds 2^64
   *  and is deliberately not a power of two, so a float path corrupts it silently. */
  seed: string;
  seqLen: number;
}

/** The B.3 attestation fields that feed the B.5 signature digest. */
export interface TrainingAttestationFields {
  modelId: string;
  templateHash: string;
  /** Keccak of empty environment strings today (B.6) — a constant, not evidence of anything. */
  envHash: string;
  inputCommitment: string;
  checkpointManifestSha256: string;
  sliceIndex: number;
  tokensDelta: number;
  /** uint256 in the digest, but a "0x…" hex STRING in the B.3 attestation JSON. */
  sessionId: string;
  host: string;
  timestamp: number;
  signature?: string;
}

/**
 * abi.encode field order for `inputCommitment` — MUST match the node (B.4).
 * The widths are NOT size-derived: `declaredTokens` is uint256 despite being capped at
 * 15,000,000, while `epochs`/`rank`/`alpha`/`seqLen` are uint32 beside it. Copy the list;
 * "tidying" it to a uniform width in either direction changes every hash. `string lr` is the
 * only DYNAMIC member across both digests, so this head carries an offset word — which is why
 * the encoding goes through a real ABI coder and never hand-assembled bytes.
 */
export const TRAINING_INPUT_TYPES = [
  'bytes32', 'bytes32', 'uint256', 'uint32', 'uint32', 'uint32', 'string', 'uint256', 'uint32',
] as const;

/** abi.encode field order for the B.5 signature digest — 10 FLAT static words, no offsets.
 *  Every numeric is uint256 here, unlike B.4's uint32s: the two lists share no convention. */
export const TRAINING_SIG_TYPES = [
  'bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes32',
  'uint256', 'uint256', 'uint256', 'address', 'uint256',
] as const;

/**
 * `trainingTokens(job) = declaredTokens × epochs` (C.1). The ONLY two wire fields that feed
 * billing. NOTE: the LTX guard's `ltxTokens` CALL SITE must not be reused — this is its
 * analogue, not its caller. Needs no tokenizer: the tokenizer produces `declaredTokens` upstream.
 */
export function trainingTokens(job: { dataset: { declaredTokens: number }; epochs: number }): number {
  return job.dataset.declaredTokens * job.epochs;
}

/**
 * The pinned slice schedule (B.1). `sliceTokens` is an explicit parameter because the
 * `TrainingJob` does not carry it — it lives in the bundle at `perTemplate.<id>.sliceTokens`,
 * which is also what makes the `train_accepted` echo-equality check meaningful.
 *
 * `slices = max(1, FLOOR(total / sliceTokens))` and the LAST slice absorbs the remainder by
 * GROWING. A ceil here is the v0.1 money bug: 1,000,050 would become [1,000,000, 50] and that
 * 50 is below the contract's MIN_PROVEN_TOKENS = 100, making the final slice — the one binding
 * the adapter hash — unsubmittable on an honest run.
 */
export function trainingSliceSchedule(totalTokens: number, sliceTokens: number): number[] {
  const slices = Math.max(1, Math.floor(totalTokens / sliceTokens));
  const deltas = new Array<number>(slices).fill(sliceTokens);
  deltas[slices - 1] = totalTokens - (slices - 1) * sliceTokens;
  return deltas;
}

const commitmentValues = (j: TrainingCommitmentInput) => [
  j.templateHash, j.datasetManifestSha256, BigInt(j.declaredTokens),
  j.epochs, j.rank, j.alpha, j.lr, BigInt(j.seed), j.seqLen,
];

/** ABI-encode the B.4 preimage. Canonical by construction — identical type list both sides. */
export function trainingInputEncoded(job: TrainingCommitmentInput): string {
  return AbiCoder.defaultAbiCoder().encode([...TRAINING_INPUT_TYPES], commitmentValues(job));
}

/** `inputCommitment = keccak256(abi.encode(...))` — the highest-value client check: proof the
 *  host trained our exact job on our exact dataset. */
export function trainingInputCommitment(job: TrainingCommitmentInput): string {
  return keccak256(trainingInputEncoded(job));
}

/** ABI-encode the B.5 digest preimage. `sessionId` accepts the attestation's hex string form. */
export function trainingSigDigestEncoded(att: TrainingAttestationFields): string {
  return AbiCoder.defaultAbiCoder().encode([...TRAINING_SIG_TYPES], [
    att.modelId, att.templateHash, att.envHash, att.inputCommitment,
    att.checkpointManifestSha256, BigInt(att.sliceIndex), BigInt(att.tokensDelta),
    BigInt(att.sessionId), att.host, BigInt(att.timestamp),
  ]);
}

/** `sigDigest = keccak256(abi.encode(...))` — the EIP-191 personalSign preimage. */
export function trainingSigDigest(att: TrainingAttestationFields): string {
  return keccak256(trainingSigDigestEncoded(att));
}

/**
 * Recover the attestation signer via EIP-191 over the 32-byte digest; null when unsigned.
 * ⚠️ Recovery authenticates only the TEN digest fields. `adapterManifestSha256`,
 * `cumulativeTokens`, `stepFrom`/`stepTo` and `moderation` are in the attestation JSON and NOT
 * in the digest — they are bound only by `proofHash = SHA256(exact stored bytes)` matching the
 * on-chain proof, which per E.1(a) never lands if the final slice's proof forfeits.
 */
export function recoverTrainingSigner(att: TrainingAttestationFields): string | null {
  if (!att.signature) return null;
  try {
    return verifyMessage(getBytes(trainingSigDigest(att)), att.signature);
  } catch {
    return null; // malformed-but-present signature — advisory, never aborts verification
  }
}
