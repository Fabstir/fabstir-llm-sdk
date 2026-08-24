// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Interface for TrainingManager — LoRA/QLoRA fine-tune (Training M0).
 * Mirrors ILtxManager: a sidecar workload settling on the existing compute contracts with no
 * contract change. Wire shapes frozen in
 * docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.11.
 *
 * @module ITrainingManager
 */
import type {
  TrainingJob, TrainingBundleSection, TrainingSliceAttestation, ManifestPointer,
  ArtifactManifestV1, ManifestFileEntry,
} from '../types/training.types';
import type { TrainingHandle, TrainingPointerRecord } from '../utils/training-ws';
import type { TrainingPriceEstimate } from '../managers/TrainingManager';
import type { TrainingTokenizer } from '../utils/training-count';
import type { TrainingCommitmentInput } from '../utils/training-utils';
import type { DatasetManifestV1 } from '../types/training.types';

export interface ITrainingManager {
  /** `floor(trainingTokens × pricePerToken / 1000)` (C.1). Pure — no chain read. */
  estimateTrainingPrice(
    job: Pick<TrainingJob, 'epochs'> & { dataset: Pick<TrainingJob['dataset'], 'declaredTokens'> },
    pricePerToken: bigint,
  ): bigint;

  /** `max(on-chain floor, ceil(gross × 1.05))` — the uplift applies to the ALREADY-FLOORED gross. */
  computeTrainingDeposit(gross: bigint, minDeposit: bigint): bigint;

  /** Price against the host's ON-CHAIN registered price for the training model id, and size the deposit. */
  estimateTrainingCost(
    job: Pick<TrainingJob, 'epochs'> & { dataset: Pick<TrainingJob['dataset'], 'declaredTokens'> },
    hostAddress: string,
    paymentToken?: string,
  ): Promise<TrainingPriceEstimate>;

  /**
   * A.4 pre-validation against the host's bundle. Throws `VALIDATION_FAILED`/`sessionParams`.
   * MUST be run pre-escrow: after the deposit the same failure is a funded session waiting on
   * the C.3 zero-proof settle. A bundle with no `training` section means the host cannot train.
   */
  validateAgainstBundle(job: TrainingJob, bundle?: TrainingBundleSection): void;

  /** Pre-validate → estimate → fund a training-parameterised session → submit. */
  submitTraining(opts: {
    job: TrainingJob;
    bundle?: TrainingBundleSection;
    hostAddress: string;
    endpoint?: string;
    paymentToken?: string;
    requestId?: string;
    onProgress?: (progress: unknown) => void;
    onSlice?: (slice: unknown) => void;
    persistPointer?: (record: TrainingPointerRecord) => void | Promise<void>;
  }): Promise<TrainingHandle>;

  /**
   * Recompute §B.5's digest and recover the signer; with `binding`, also recompute §B.4's
   * `inputCommitment` — the doc's "highest-value client check". Unsigned is ADVISORY in M0.
   * `inputBindingValid` is `undefined` when no binding is supplied: "not checked" must never
   * be mistaken for "checked and fine".
   */
  verifyTrainingSlice(att: TrainingSliceAttestation, binding?: TrainingCommitmentInput): {
    digest: string; signer: string | null; signatureValid: boolean; inputBindingValid?: boolean;
  };

  /**
   * Pre-escrow assembly: size bound → validate → count → plausibility → shard → encrypt+upload
   * → manifest. Everything here is free and reversible; everything after it costs a deposit.
   */
  prepareDataset(opts: {
    jsonl: string;
    tokenizer: TrainingTokenizer;
    specialsPerSample: number;
    tokenizerSha256: string;
    maxDatasetBytes?: number;
  }): Promise<{
    manifest: DatasetManifestV1; manifestBytes: Uint8Array; manifestSha256: string;
    declaredTokens: number; samples: number; totalBytes: number;
  }>;

  /** The §C.3 `DECLARED_TOKENS_MISMATCH` recourse in ONE round trip: same shards, new count. */
  remanifestWithActual(manifest: DatasetManifestV1, actualTokens: number): {
    manifest: DatasetManifestV1; manifestBytes: Uint8Array; manifestSha256: string;
  };

  /** Cancel, and report what the user still OWNS — settled checkpoints are their property. */
  cancelTraining(handle: TrainingHandle): Promise<{
    settledSlices: number; pointers: TrainingPointerRecord[]; forfeitedSlices: number[];
  }>;

  /** Fetch a slice attestation by `proofCID` (PLAINTEXT on S5) and verify it. `proofHash` is
   *  SHA256 over the EXACT fetched bytes. */
  getTrainingResult(proofCID: string, binding?: TrainingCommitmentInput): Promise<{
    attestation: TrainingSliceAttestation; proofHash: string;
    digest: string; signer: string | null; signatureValid: boolean; inputBindingValid?: boolean;
  }>;

  /** Wire the ranked-host source used by {@link submitTrainingWithLoadBalancing}. */
  setHostSelectionService(service: {
    getRankedHostsForModel(modelId: string, mode?: unknown): Promise<{ host: { address: string; apiUrl: string } }[]>;
  }): void;

  /** Try ranked hosts until one accepts. ⚠️ A moderation hold is NEVER re-shopped (WP-S1), and
   *  nothing is re-shopped once money has moved (k >= 1). Validates ONCE, before any host. */
  submitTrainingWithLoadBalancing(
    opts: Parameters<ITrainingManager['submitTraining']>[0],
    lb?: { maxHostRetries?: number; hostSelectionMode?: unknown },
  ): Promise<TrainingHandle>;

  /** Fetch an artifact manifest AND the named file, verifying all three hops §E.2 names:
   *  manifest bytes vs the committed sha256, the file is named, and its shards reassemble to
   *  the claimed sha256. `manifestOnly` stops after hop 2. Throws `DATASET_INTEGRITY` on drift. */
  downloadAdapter(
    pointer: ManifestPointer, fileName: string, options?: { manifestOnly?: boolean },
  ): Promise<{ manifest: ArtifactManifestV1; file: ManifestFileEntry; bytes?: Uint8Array }>;

  /**
   * The contract's `minTokensFee`, read live (Open 8).
   * ⚠️ NOT a cancellation fee: `train_cancel` settles through the HOST, and the fee applies
   * only when a DEPOSITOR completes their own zero-proof session. Never show it beside a
   * cancel control — users would read it as precisely the opposite of what it is.
   */
  getEarlySelfCompleteFee(): Promise<bigint>;

  /** Reclaim a funded session whose settle never landed (the lost-zero-settle backstop). */
  triggerSessionTimeout(jobId: number): Promise<unknown>;
}
