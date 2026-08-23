// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Training M0 (LoRA/QLoRA fine-tune) types. Wire shapes frozen in
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.8 (FROZEN; every section this
// file depends on re-verified byte-identical to v0.3.6, at which it was written).
export * from '../errors/training-errors';
import { TrainingError } from '../errors/training-errors';

import type { JobModerationStatus, JobModerationVerdict } from './moderation.types';

/** A capability CID + the SHA256 of the exact stored manifest bytes. Casing is load-bearing. */
export interface ManifestPointer {
  manifestCID: string;
  manifestSha256: string;
}

/**
 * The moderation object AS IT APPEARS ON THE TRAINING WIRE (B.3 attestation doc:476,
 * `train_complete` doc:816).
 *
 * ⚠️ Its key is **`status`**, NOT `verdict`. The training surface and the transcode/publish-gate
 * surface spell this differently, and `verdict` never appears as a JSON key anywhere in the
 * frozen doc. Typing this as the generalised `JobModerationStatus` leaves `.verdict` undefined
 * on every real frame — so a client checking `verdict === 'cleared'` would REFUSE an honest,
 * fully-paid, cleared run, which is precisely the failure C.4's fail-closed rule must not cause.
 * The VALUE vocabulary is shared with the generalised type; only the key differs.
 *
 * `policyVersion` is the [CK-4] record of which policy cleared the dataset.
 */
export interface TrainingModerationStatus {
  status: JobModerationVerdict;
  policyVersion?: string;
}

/**
 * Map the training wire object onto the SDK's generalised moderation type for consumer
 * surfacing (doc:293 — "verdict/hold surfacing on the generalised moderation types").
 * The step is EXPLICIT because the keys differ: there is no structural overlap to lean on.
 * `policyVersion` has no slot on the generalised type, so callers that need it read the wire
 * object — it is deliberately not folded into `reason`, which is a rule id, not a version.
 */
export function toJobModerationStatus(w: TrainingModerationStatus): JobModerationStatus {
  return { verdict: w.status };
}

/** The wire job (Contract A.1). EVERY numeric is required, non-null and finite — there are
 *  deliberately no optional numeric knobs; a `null` (what JSON.stringify makes of NaN) fails
 *  the node's deserialisation and rejects VALIDATION_FAILED. `lr`/`seed` are regex-pinned
 *  strings and immune by construction. */
export interface TrainingJob {
  /** Allow-listed template name, validated against the bundle. The doc's literal is ILLUSTRATIVE. */
  templateId: string;
  /** "0x" + keccak256 of the canonical template JSON. */
  templateHash: string;
  dataset: {
    /** "u…" capability CID of the encrypted dataset manifest (D.2). */
    manifestCID: string;
    manifestSha256: string;
    /** count-v1 total over all samples (C.2); ≤ bounds, < 2^53. */
    declaredTokens: number;
    /** JSONL line count; cross-checked against the manifest. */
    samples: number;
  };
  /** 1..=bounds.maxEpochs. */
  epochs: number;
  hyper: {
    rank: number;
    alpha: number;
    /** DECIMAL STRING, regex ^[0-9]+(\.[0-9]+)?$ — committed BYTE-FOR-BYTE as sent. Never
     *  normalise: the vector uses a trailing-zero form so a parse-and-reserialise impl fails. */
    lr: string;
    /** DECIMAL STRING (uint256 in the commitment). Exceeds 2^64 and is not a power of two,
     *  so both a u64 path and a float path corrupt it — keep it a string, parse to BigInt. */
    seed: string;
    seqLen: number;
  };
  /** Fixed in M0: safetensors adapter + GGUF conversion (E.1). */
  output: 'adapter-v1';
}

export type TrainAction = { action: 'train'; requestId?: string } & TrainingJob;
export type TrainCancelAction = { action: 'train_cancel' };

/** The session-scoped adapter field (E.2), carried INSIDE the encrypted session-init payload
 *  alongside jobId and modelName. A camelCase serialiser produces `manifestCid` and the node
 *  rejects the WHOLE init — deliberately, since silently dropping it would serve base-model
 *  output on a session the customer is paying for and believes runs their fine-tune. */
export interface LoraSessionField extends ManifestPointer {
  /** Which manifest entry to load, e.g. "adapter.gguf". */
  file: string;
}

/** All 7 progress stages, in order. Note the BRITISH `finalising`. */
export const TRAINING_PROGRESS_STAGES = [
  'staging', 'scanning', 'counting', 'training', 'checkpointing', 'uploading', 'finalising',
] as const;
export type TrainingProgressStage = (typeof TRAINING_PROGRESS_STAGES)[number];

export interface TrainingCheckpointPointer extends ManifestPointer {
  sizeBytes: number;
}

/** A settled slice. `stepFrom`/`stepTo` are INFORMATIONAL — billing rides the pinned schedule. */
export interface TrainingSliceEvent {
  index: number;
  stepFrom: number;
  stepTo: number;
  tokensDelta: number;
  cumulativeTokens: number;
  checkpoint: TrainingCheckpointPointer;
  /** `submitted: false` = the slice's proof forfeited; its revenue is lost to the HOST and the
   *  on-chain total falls below `billing.tokens`. On the FINAL slice it means the adapter's
   *  on-chain provenance is PARTIAL (bound through the last landed checkpoint) — E.1(a). */
  proof: { proofCID: string; submitted: boolean };
}

export interface TrainingBilling {
  unit: 'training-token';
  /** ALWAYS the schedule total (`trainingTokens(job)`), in accepted and complete alike,
   *  REGARDLESS of forfeits. Reconcile forfeits via each slice's `proof.submitted`. */
  tokens: number;
  /**
   * The verified ON-CHAIN session price (A.3) — not an advertised or env value.
   *
   * Typed as a DECIMAL STRING on three pointers, none contradicting: the ground rule pins
   * "`u64`-and-larger integers as decimal strings on the wire" (doc:277); it is a uint256 on
   * chain with NO upper bound stated anywhere in the frozen doc; and both sibling billing
   * blocks on this node already do it (`ltx.types.ts:73`, `transcode.types.ts:451`).
   * ⚠️ OPEN (asked of the node dev 2026-08-23): the doc prints no JSON type for this field.
   * If the node sends a bare number, the C.1 over-claim guard would compare `"904" === 904`
   * and reject an honest accept — so this is settled BEFORE the T1 vectors land, not after.
   */
  pricePerToken: string;
}

export interface TrainAcceptedFrame {
  type: 'train_accepted';
  status: 'processing';
  sessionId: string;
  allowListVersion: number;
  billing: TrainingBilling;
  schedule: { sliceTokens: number; slices: number };
}

export interface TrainProgressFrame {
  type: 'train_progress';
  stage: TrainingProgressStage;
  pct?: number;
  slice?: TrainingSliceEvent;
  /** Carried by the `uploading` frame BEFORE that slice's proof submits. */
  checkpoint?: TrainingCheckpointPointer;
  /** Carried by the `finalising` frame before the final proof. */
  adapter?: ManifestPointer;
}

export interface TrainCompleteFrame {
  type: 'train_complete';
  adapter: ManifestPointer;
  billing: TrainingBilling;
  proofCIDs: string[];
  moderation: TrainingModerationStatus;
  /** e.g. ["gguf-conversion-failed"] — GGUF conversion is best-effort (E.1(b)). NOT the
   *  serve-back gate: that is `adapter.gguf` actually being present in the manifest. */
  warnings?: string[];
  requestId?: string;
}

export interface TrainErrorFrame {
  type: 'train_error';
  error: { code: string; message: string; detail?: Record<string, unknown> };
}

export type TrainingFrame =
  TrainAcceptedFrame | TrainProgressFrame | TrainCompleteFrame | TrainErrorFrame;

export interface ManifestShardEntry {
  /** Capability CID of the ENCRYPTED shard. Lowercase `cid` here — NOT the wire's `manifestCID`. */
  cid: string;
  /** PLAINTEXT shard hash, verified after decrypt. */
  sha256: string;
  sizeBytes: number;
}

/** D.2. The STORED BYTES are the canonical form (keys sorted, compact, UTF-8) and
 *  `manifestSha256 = SHA256(exact stored bytes)`. Never re-canonicalise on read. */
export interface DatasetManifestV1 {
  schema: 'dataset-manifest-v1';
  format: 'jsonl-text-v1';
  countingRecipe: 'count-v1';
  tokenizerSha256: string;
  samples: number;
  declaredTokens: number;
  totalBytes: number;
  shards: ManifestShardEntry[];
}

export interface ManifestFileEntry {
  name: string;
  sha256: string;
  sizeBytes: number;
  shards: ManifestShardEntry[];
}

/** D.3. Every CHECKPOINT manifest holds a real, usable, owned `adapter_model.safetensors`. */
export interface ArtifactManifestV1 {
  schema: 'artifact-manifest-v1';
  kind: 'checkpoint' | 'adapter';
  /** Checkpoints only — ABSENT (not null) on `kind: "adapter"`. */
  sliceIndex?: number;
  files: ManifestFileEntry[];
}

/** B.3, plaintext on S5; its CID is that slice's `proofCID`. These are PUBLIC: a run's
 *  template, host, sessionId, token volume and cadence are publicly linkable. */
export interface TrainingSliceAttestation {
  modelId: string;
  templateHash: string;
  envHash: string;
  inputCommitment: string;
  sliceIndex: number;
  stepFrom: number;
  stepTo: number;
  tokensDelta: number;
  cumulativeTokens: number;
  checkpointManifestSha256: string;
  /** FINAL slice only — ABSENT, never null, on every other slice. */
  adapterManifestSha256?: string;
  /** FINAL slice only — ABSENT, never null, on every other slice. */
  moderation?: TrainingModerationStatus;
  sessionId: string;
  host: string;
  timestamp: number;
  signature: string;
}

/** A.4 bundle `training` section. Its PRESENCE is the capability advert: a node with
 *  TRAIN_ENABLED=false omits it, and old nodes silently ignore `lora`, so the failure mode
 *  of skipping this gate is PAID BASE-MODEL OUTPUT rather than an error. */
export interface TrainingBundleSection {
  templates: { id: string; hash: string; minAllowListVersion: number; vramGb: number }[];
  bounds: {
    minTotalTokens: number;
    /** Bounds `declaredTokens`. DIFFERENT gate from `maxTotalTokens`, which bounds the product. */
    maxDeclaredTokens: number;
    /** Bounds `declaredTokens × epochs` (C.5 wall-clock coherence). */
    maxTotalTokens: number;
    maxEpochs: number;
    maxSamples: number;
    maxDatasetBytes: number;
    perTemplate: Record<string, {
      ranks: number[]; seqLens: number[]; sliceTokens: number; specialsPerSample: number;
    }>;
  };
}

/** `lr`'s pinned form (A.1): no sign, no exponent, no bare trailing dot. */
const LR_RE = /^[0-9]+(\.[0-9]+)?$/;
/** `seed` is a decimal uint256 string — never negative, never exponent form. */
const SEED_RE = /^[0-9]+$/;

/**
 * Enforce A.1's numeric wire rule locally, BEFORE anything reaches the socket.
 *
 * This is cheap insurance at the one chokepoint every outbound job passes through, and it sits
 * where the failure is still free. A `NaN` from caller arithmetic becomes `null` under
 * `JSON.stringify`; the node's types are non-Option, so that `null` fails deserialisation and
 * rejects `VALIDATION_FAILED` — which, per C.3's universal zero-settle, CONSUMES the session,
 * and per A.3's one-`train`-per-session-ever rule forces the retry onto a fresh session and a
 * fresh deposit. Throwing here turns a burned session into a caught bug.
 *
 * NOTE this checks SHAPE only — presence, finiteness, integer-ness, and the two regexes.
 * The A.4/template BOUNDS check is a separate, bundle-dependent pre-escrow step (constraint 4).
 */
function assertTrainingJobWireShape(job: TrainingJob): void {
  const numerics: [string, number][] = [
    ['dataset.declaredTokens', job.dataset.declaredTokens], ['dataset.samples', job.dataset.samples],
    ['epochs', job.epochs], ['hyper.rank', job.hyper.rank], ['hyper.alpha', job.hyper.alpha],
    ['hyper.seqLen', job.hyper.seqLen],
  ];
  for (const [name, v] of numerics) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TrainingError(
        `TrainingJob.${name} must be a finite number (A.1 numeric wire rule); got ${String(v)}`,
        'VALIDATION_FAILED', { reason: 'numericWireRule', field: name },
      );
    }
  }
  if (!LR_RE.test(job.hyper.lr)) {
    throw new TrainingError(
      `TrainingJob.hyper.lr must match ${LR_RE} and is committed byte-for-byte; got "${job.hyper.lr}"`,
      'VALIDATION_FAILED', { reason: 'numericWireRule', field: 'hyper.lr' },
    );
  }
  if (!SEED_RE.test(job.hyper.seed)) {
    throw new TrainingError(
      `TrainingJob.hyper.seed must be a decimal uint256 string; got "${job.hyper.seed}"`,
      'VALIDATION_FAILED', { reason: 'numericWireRule', field: 'hyper.seed' },
    );
  }
}

/**
 * Build the `train` action. Field-by-field by design (constraint 3): the TrainingJob fields sit
 * at TOP LEVEL beside `action`, never nested, and no serialiser ever touches these key strings.
 * `requestId` is omitted when absent — never sent as null. M0 never sends `resumeFrom`.
 */
export function buildTrainAction(job: TrainingJob, requestId?: string): TrainAction {
  assertTrainingJobWireShape(job);
  const action: TrainAction = {
    action: 'train',
    templateId: job.templateId,
    templateHash: job.templateHash,
    dataset: {
      manifestCID: job.dataset.manifestCID,
      manifestSha256: job.dataset.manifestSha256,
      declaredTokens: job.dataset.declaredTokens,
      samples: job.dataset.samples,
    },
    epochs: job.epochs,
    hyper: {
      rank: job.hyper.rank,
      alpha: job.hyper.alpha,
      lr: job.hyper.lr,
      seed: job.hyper.seed,
      seqLen: job.hyper.seqLen,
    },
    output: job.output,
  };
  if (requestId !== undefined) action.requestId = requestId;
  return action;
}

/** `{ action: "train_cancel" }` — no other fields; the session identifies the run (A.1). */
export function buildTrainCancelAction(): TrainCancelAction {
  return { action: 'train_cancel' };
}

/** Build the session-init `lora` field with its three frozen keys, `manifestCID` capitalised. */
export function buildLoraSessionField(lora: LoraSessionField): LoraSessionField {
  return {
    manifestCID: lora.manifestCID,
    manifestSha256: lora.manifestSha256,
    file: lora.file,
  };
}
