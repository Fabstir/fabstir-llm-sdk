// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Interface for LtxManager — LTX 2.3 text-to-video sidecar (M0).
 * Text-to-video generation settling on the existing compute contracts (no contract change).
 *
 * @module ILtxManager
 */
import type {
  LtxJob, LtxResult, LtxPriceEstimate, LtxBundle, LtxBundleMetadata,
  LtxSubmitOptions, LtxVerification,
} from '../types/ltx.types';

export interface ILtxManager {
  /** Estimate the exact USDC cost (megapixel-frame tokens × on-chain price). Priced on the LTX model id. */
  estimateCost(job: LtxJob, hostAddress: string, paymentToken?: string): Promise<LtxPriceEstimate>;

  /** Pre-escrow validation against the host's versioned allow-list bundle. Returns the authenticated bundle. */
  validateJob(job: LtxJob, hostMetadata: LtxBundleMetadata): Promise<LtxBundle>;

  /** Validate (pre-escrow) then create the session with an exact USDC deposit. */
  createLtxSession(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata, options?: LtxSubmitOptions,
  ): Promise<{ sessionId: bigint; jobId: bigint }>;

  /** Full flow: validate → estimate → session → submit → ltx_complete (with drift + over-claim guards). */
  generate(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata, options?: LtxSubmitOptions,
  ): Promise<LtxResult>;

  /** Fetch + decrypt the private capability CIDs, index-aligned to manifest.frameHashes. */
  downloadFrames(result: LtxResult): Promise<Uint8Array[]>;

  /** Decrypt the single playable container (frameCount === 1) to bytes; throws for an N-frame sequence. */
  downloadOutputVideo(result: LtxResult): Promise<Uint8Array>;

  /** Discover the host's CURRENT LTX bundle metadata from on-chain NodeRegistry (drift self-heal). */
  getLtxBundleMetadata(hostAddress: string): Promise<LtxBundleMetadata>;

  /** The authenticated bundle CONTENTS (templates + input counts/semantics + bounds) — drives a client form. */
  getLtxBundle(hostMetadata: LtxBundleMetadata): Promise<LtxBundle>;

  /** Verify provenance (input-binding live; integrity live when a proof exists on-chain; signature/merkle advisory). */
  verifyAttestation(job: LtxJob, result: LtxResult, options?: { sessionId?: bigint; proofIndex?: number }): Promise<LtxVerification>;

  /** Reclaim a reserved deposit after proof timeout (GENERATION_FAILED/TIMEOUT). */
  triggerSessionTimeout(jobId: number): Promise<any>;
}
