// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Interface for TranscodeManager - manages video/audio transcoding jobs
 *
 * @module ITranscodeManager
 * @version 1.0.0
 */

import type {
  CreateTranscodeJobParams,
  TranscodeProgress,
  TranscodeJobResult,
  TranscodeHostFilters,
  TranscodeHostInfo,
  TranscodePriceEstimate,
  TranscodeVerification,
  TranscodeFormatSpec,
  GOPProof,
  TranscodeProofTree,
  Resolution,
  Codec,
  QualityTier,
} from '../types/transcode.types';

/**
 * TranscodeManager interface for managing transcoding jobs
 */
export interface ITranscodeManager {
  /**
   * Create a new transcoding job
   *
   * @param params - Job creation parameters
   * @returns Object containing jobId and estimated cost
   *
   * @example
   * ```typescript
   * const { jobId, estimatedCost } = await transcodeManager.createTranscodeJob({
   *   hostAddress: '0x...',
   *   inputCID: 'bafyb...',
   *   formatSpec: myFormatSpec,
   *   maxDuration: 3600,
   *   proofInterval: 100,
   *   chainId: 84532
   * });
   * ```
   */
  createTranscodeJob(params: CreateTranscodeJobParams): Promise<{
    jobId: bigint;
    estimatedCost: string;
    formatSpecHash: string;
    formatSpecCID: string;
  }>;

  /**
   * Monitor transcode progress via WebSocket
   *
   * @param jobId - The job ID to monitor
   * @param onProgress - Callback function for progress updates
   * @returns Promise that resolves when job completes
   *
   * @example
   * ```typescript
   * const result = await transcodeManager.monitorTranscodeProgress(
   *   jobId,
   *   (progress) => {
   *     console.log(`Progress: ${progress.percentComplete}%`);
   *     console.log(`GOP ${progress.currentGOP}/${progress.totalGOPs}`);
   *   }
   * );
   * console.log('Output CID:', result.outputCID);
   * ```
   */
  monitorTranscodeProgress(
    jobId: bigint,
    onProgress: (progress: TranscodeProgress) => void
  ): Promise<TranscodeJobResult>;

  /**
   * Get transcode job result (for completed jobs)
   *
   * @param jobId - The job ID
   * @returns Job result with output CID and quality metrics
   */
  getTranscodeResult(jobId: bigint): Promise<TranscodeJobResult>;

  /**
   * Verify transcode output quality and format compliance
   *
   * @param jobId - The job ID to verify
   * @param spotCheckCount - Number of random GOPs to verify (default: 5)
   * @returns Verification result
   *
   * @example
   * ```typescript
   * const verification = await transcodeManager.verifyTranscodeOutput(jobId, 10);
   * if (!verification.valid) {
   *   console.error('Verification failed:', verification.errors);
   * }
   * ```
   */
  verifyTranscodeOutput(
    jobId: bigint,
    spotCheckCount?: number
  ): Promise<TranscodeVerification>;

  /**
   * Get GOP proofs for a transcode job
   *
   * @param jobId - The job ID
   * @param gopIndices - Specific GOP indices to retrieve (optional, returns all if not specified)
   * @returns Array of GOP proofs
   */
  getGOPProofs(jobId: bigint, gopIndices?: number[]): Promise<GOPProof[]>;

  /**
   * Get proof tree for a transcode job
   *
   * @param jobId - The job ID
   * @returns Proof tree with Merkle root and spot check hashes
   */
  getProofTree(jobId: bigint): Promise<TranscodeProofTree>;

  /**
   * Calculate price estimate for a transcode job
   *
   * @param hostAddress - The host address
   * @param formatSpec - The format specification
   * @param videoDurationSeconds - Estimated video duration
   * @returns Detailed price estimate
   *
   * @example
   * ```typescript
   * const estimate = await transcodeManager.estimateTranscodePrice(
   *   hostAddress,
   *   formatSpec,
   *   600 // 10 minutes
   * );
   * console.log(`Total cost: ${estimate.totalCost} USDC`);
   * console.log('Breakdown:', estimate.breakdown);
   * ```
   */
  estimateTranscodePrice(
    hostAddress: string,
    formatSpec: TranscodeFormatSpec,
    videoDurationSeconds: number
  ): Promise<TranscodePriceEstimate>;

  /**
   * Find available transcode hosts based on filters
   *
   * @param filters - Search filters (resolution, codecs, price, etc.)
   * @returns Array of matching hosts with their capabilities
   *
   * @example
   * ```typescript
   * const hosts = await transcodeManager.findTranscodeHosts({
   *   minResolution: Resolution.R1080p,
   *   requiredCodecs: [Codec.AV1],
   *   maxPricePerSecond: '0.01',
   *   hardwareAcceleration: true
   * });
   * ```
   */
  findTranscodeHosts(
    filters?: TranscodeHostFilters
  ): Promise<TranscodeHostInfo[]>;

  /**
   * Get transcode capabilities for a specific host
   *
   * @param hostAddress - The host address
   * @returns Host's transcode capabilities and pricing
   */
  getHostTranscodeCapabilities(hostAddress: string): Promise<{
    enabled: boolean;
    supportedFormats: string[];
    maxResolution: Resolution;
    hardwareAcceleration: boolean;
    pricing: {
      basePricePerUnit: string;
      multipliers: {
        resolution: Record<string, number>;
        codec: Record<string, number>;
        quality: Record<string, number>;
      };
    };
  }>;

  /**
   * Register format specification on-chain and upload to S5
   *
   * @param formatSpec - The format specification
   * @returns Object with spec hash and CID
   *
   * @example
   * ```typescript
   * const { specHash, specCID } = await transcodeManager.registerFormatSpec(formatSpec);
   * // Use specHash in createTranscodeJob
   * ```
   */
  registerFormatSpec(formatSpec: TranscodeFormatSpec): Promise<{
    specHash: string;
    specCID: string;
  }>;

  /**
   * Retrieve format specification from S5
   *
   * @param specHash - The format spec hash (from contract)
   * @returns The format specification
   */
  getFormatSpec(specHash: string): Promise<TranscodeFormatSpec>;

  /**
   * Cancel an active transcode job
   *
   * @param jobId - The job ID to cancel
   * @returns Transaction receipt
   *
   * @throws If job is already completed or not cancelable
   */
  cancelTranscodeJob(jobId: bigint): Promise<{ txHash: string }>;

  /**
   * Complete a transcode job and release payment
   *
   * @param jobId - The job ID to complete
   * @returns Transaction receipt
   *
   * @throws If proofs not submitted or verification fails
   */
  completeTranscodeJob(jobId: bigint): Promise<{ txHash: string }>;

  /**
   * Download transcoded output from S5
   *
   * @param outputCID - The S5 CID of transcoded video
   * @param outputPath - Local file path to save to (optional, browser download if not specified)
   * @param onProgress - Progress callback for download
   * @returns Blob or file path
   *
   * @example
   * ```typescript
   * // Browser: Trigger download
   * await transcodeManager.downloadTranscodedVideo(outputCID);
   *
   * // Node.js: Save to file
   * await transcodeManager.downloadTranscodedVideo(
   *   outputCID,
   *   './output.mp4',
   *   (progress) => console.log(`Downloaded ${progress}%`)
   * );
   * ```
   */
  downloadTranscodedVideo(
    outputCID: string,
    outputPath?: string,
    onProgress?: (percentComplete: number) => void
  ): Promise<Blob | string>;

  /**
   * Upload video to S5 for transcoding
   *
   * @param videoFile - File or Blob to upload
   * @param encrypt - Whether to encrypt with Blake3 (default: true)
   * @param onProgress - Progress callback for upload
   * @returns S5 CID and optional encryption key
   *
   * @example
   * ```typescript
   * const { cid, encryptionKey } = await transcodeManager.uploadVideoForTranscode(
   *   videoFile,
   *   true,
   *   (progress) => console.log(`Uploaded ${progress}%`)
   * );
   * // Use cid in formatSpec.input.cid
   * ```
   */
  uploadVideoForTranscode(
    videoFile: File | Blob,
    encrypt?: boolean,
    onProgress?: (percentComplete: number) => void
  ): Promise<{ cid: string; encryptionKey?: string }>;

  /**
   * Get transcode job status
   *
   * @param jobId - The job ID
   * @returns Current job status and progress
   */
  getTranscodeJobStatus(jobId: bigint): Promise<{
    status: string;
    progress: number;
    currentGOP?: number;
    totalGOPs?: number;
    elapsedSeconds?: number;
  }>;

  /**
   * Dispute a transcode job if output quality is insufficient
   *
   * @param jobId - The job ID to dispute
   * @param reason - Dispute reason
   * @param evidenceGOPs - GOP indices with quality issues
   * @returns Dispute transaction hash
   *
   * @throws If dispute window expired or evidence insufficient
   */
  disputeTranscodeJob(
    jobId: bigint,
    reason: string,
    evidenceGOPs: number[]
  ): Promise<{ txHash: string }>;

  /**
   * Get transcode job history for client or host
   *
   * @param address - Client or host address
   * @param limit - Max number of jobs to return (default: 10)
   * @param offset - Pagination offset (default: 0)
   * @returns Array of historical jobs
   */
  getTranscodeJobHistory(
    address: string,
    limit?: number,
    offset?: number
  ): Promise<
    Array<{
      jobId: bigint;
      client: string;
      host: string;
      inputCID: string;
      outputCID: string;
      durationSeconds: number;
      cost: string;
      qualityMetrics: {
        psnrDB: number;
        actualBitrate: number;
      };
      timestamp: number;
    }>
  >;
}
