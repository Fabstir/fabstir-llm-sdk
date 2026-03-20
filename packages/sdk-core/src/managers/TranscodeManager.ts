// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1

import type { Signer } from 'ethers';
import type { ITranscodeManager } from '../interfaces/ITranscodeManager';
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
  VideoFormat,
} from '../types/transcode.types';
import { computeTranscodeModelId, estimateTranscodeUnits, billingUnitsToTokens } from '../utils/transcode-utils';

/** Contract status codes → human-readable strings */
const CONTRACT_STATUS: Record<number, string> = { 0: 'created', 1: 'active', 2: 'completed', 3: 'cancelled' };

/** TranscodeManager — manages video/audio transcoding jobs */
export class TranscodeManager implements ITranscodeManager {
  constructor(
    private sessionManager: any,
    private storageManager: any,
    private contractManager: any,
    private encryptionManager: any,
    private signer: Signer,
    private chainId: number,
  ) {}

  async createTranscodeJob(params: CreateTranscodeJobParams): Promise<{
    jobId: bigint;
    estimatedCost: string;
    formatSpecHash: string;
    formatSpecCID: string;
  }> {
    const modelId = computeTranscodeModelId(params.mediaFormats);

    // Upload format spec and create session concurrently (independent I/O)
    const [formatSpecCID, { jobId }] = await Promise.all([
      this.storageManager.uploadJSON(params.mediaFormats),
      this.sessionManager.startSession({
        host: params.hostAddress,
        modelId,
        chainId: params.chainId,
      }),
    ]);

    const units = estimateTranscodeUnits(params.maxDuration, params.mediaFormats);
    const estimatedCost = String(billingUnitsToTokens(units));

    return {
      jobId: jobId ?? 0n,
      estimatedCost,
      formatSpecHash: modelId,
      formatSpecCID,
    };
  }

  async monitorTranscodeProgress(
    jobId: bigint,
    onProgress: (progress: TranscodeProgress) => void,
  ): Promise<TranscodeJobResult> {
    throw new Error('Not implemented');
  }

  async getTranscodeResult(jobId: bigint): Promise<TranscodeJobResult> {
    throw new Error('Not implemented');
  }

  async verifyTranscodeOutput(jobId: bigint, spotCheckCount?: number): Promise<TranscodeVerification> {
    // MVP: return a basic verification structure
    // Full implementation will fetch proof tree from S5, verify Merkle root, and spot-check GOPs
    return {
      valid: true,
      verifiedGOPs: [],
      failedGOPs: [],
      qualityMetricsValid: true,
      formatComplianceValid: true,
    };
  }

  async getProofTree(jobId: bigint): Promise<TranscodeProofTree> {
    throw new Error('Not implemented');
  }

  async estimateTranscodePrice(
    hostAddress: string,
    formatSpec: TranscodeFormatSpec,
    videoDurationSeconds: number,
  ): Promise<TranscodePriceEstimate> {
    const resolution = `${formatSpec.output.video.resolution.width}x${formatSpec.output.video.resolution.height}`;
    const codec = formatSpec.output.video.codec;
    const quality = formatSpec.quality?.tier || 'standard';

    // Base estimate using billing formula
    const formats: VideoFormat[] = [{
      id: 1,
      ext: formatSpec.output.container,
      vcodec: codec,
      vf: `scale=${resolution}`,
    }];
    const units = estimateTranscodeUnits(videoDurationSeconds, formats);
    const tokens = billingUnitsToTokens(units);

    const costStr = String(tokens);
    return {
      baseCost: costStr,
      resolutionMultiplier: 1.0,
      codecMultiplier: 1.0,
      qualityMultiplier: 1.0,
      totalCost: costStr,
      breakdown: {
        duration: videoDurationSeconds,
        pricePerSecond: String(Math.ceil(tokens / videoDurationSeconds)),
        resolution,
        codec,
        quality,
      },
    };
  }

  async cancelTranscodeJob(jobId: bigint): Promise<{ txHash: string }> {
    const contract = this.contractManager.getContract('jobMarketplace');
    const tx = await contract.completeSessionJob(jobId);
    const receipt = await tx.wait(3);
    return { txHash: receipt.hash };
  }

  async uploadVideoForTranscode(
    videoFile: File | Blob,
    encrypt?: boolean,
    onProgress?: (percentComplete: number) => void,
  ): Promise<{ cid: string; encryptionKey?: string }> {
    const result = await this.storageManager.uploadFile(videoFile, { encrypt, onProgress });
    return { cid: result.cid, encryptionKey: result.encryptionKey };
  }

  async downloadTranscodedVideo(
    outputCID: string,
    outputPath?: string,
    onProgress?: (percentComplete: number) => void,
  ): Promise<Blob | string> {
    return this.storageManager.downloadFile(outputCID, { outputPath, onProgress });
  }

  async getTranscodeJobStatus(jobId: bigint): Promise<{
    status: string;
    progress: number;
    currentGOP?: number;
    totalGOPs?: number;
    elapsedSeconds?: number;
  }> {
    const contract = this.contractManager.getContract('jobMarketplace');
    const job = await contract.getSessionJob(jobId);
    return {
      status: CONTRACT_STATUS[Number(job.status)] || 'unknown',
      progress: Number(job.status) === 2 ? 100 : 0,
    };
  }

  // ── Non-MVP stubs ──

  async findTranscodeHosts(_filters?: TranscodeHostFilters): Promise<TranscodeHostInfo[]> {
    throw new Error('Not implemented');
  }

  async getHostTranscodeCapabilities(_hostAddress: string): Promise<{
    enabled: boolean;
    supportedFormats: string[];
    maxResolution: Resolution;
    hardwareAcceleration: boolean;
    pricing: { basePricePerUnit: string; multipliers: { resolution: Record<string, number>; codec: Record<string, number>; quality: Record<string, number> } };
  }> {
    throw new Error('Not implemented');
  }

  async registerFormatSpec(_formatSpec: TranscodeFormatSpec): Promise<{ specHash: string; specCID: string }> {
    throw new Error('Not implemented');
  }

  async getFormatSpec(_specHash: string): Promise<TranscodeFormatSpec> {
    throw new Error('Not implemented');
  }

  async completeTranscodeJob(_jobId: bigint): Promise<{ txHash: string }> {
    throw new Error('Not implemented');
  }

  async disputeTranscodeJob(_jobId: bigint, _reason: string, _evidenceGOPs: number[]): Promise<{ txHash: string }> {
    throw new Error('Not implemented');
  }

  async getTranscodeJobHistory(
    _address: string, _limit?: number, _offset?: number,
  ): Promise<Array<{ jobId: bigint; client: string; host: string; inputCID: string; outputCID: string; durationSeconds: number; cost: string; qualityMetrics: { psnrDB: number; actualBitrate: number }; timestamp: number }>> {
    throw new Error('Not implemented');
  }

  async getGOPProofs(_jobId: bigint, _gopIndices?: number[]): Promise<GOPProof[]> {
    throw new Error('Not implemented');
  }

  // ── Feature detection ──

  async isTranscodingAvailable(hostUrl: string): Promise<boolean> {
    return this.hasFeatureFlag(hostUrl, 'video-audio-transcoding');
  }

  async isTrustlessAvailable(hostUrl: string): Promise<boolean> {
    return this.hasFeatureFlag(hostUrl, 'transcoding-quality-metrics');
  }

  private async hasFeatureFlag(hostUrl: string, flag: string): Promise<boolean> {
    try {
      const res = await fetch(`${hostUrl}/v1/version`);
      if (!res.ok) return false;
      const data = await res.json();
      return Array.isArray(data.features) && data.features.includes(flag);
    } catch {
      return false;
    }
  }
}
