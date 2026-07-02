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

  /** Verify M0 provenance (input-binding live; integrity inert; signature/merkle advisory). */
  verifyAttestation(job: LtxJob, result: LtxResult, options?: { sessionId?: bigint }): Promise<LtxVerification>;

  /** Reclaim a reserved deposit after proof timeout (GENERATION_FAILED/TIMEOUT). */
  triggerSessionTimeout(jobId: number): Promise<any>;
}
