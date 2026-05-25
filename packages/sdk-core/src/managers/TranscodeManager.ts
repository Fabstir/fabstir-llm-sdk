// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1

import { formatUnits, type Signer } from 'ethers';
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
  TranscodeHandle,
  TranscodeLoadBalancedOptions,
} from '../types/transcode.types';
import type { IHostSelectionService } from '../interfaces/IHostSelectionService';
import { TranscodeError } from '../errors/transcode-errors';
import { fetchTranscodeCapacity } from '../utils/transcode-capacity';
import { HostSelectionMode } from '../types/settings.types';
import { computeTranscodeModelId, estimateTranscodeUnits, billingUnitsToTokens, tokensToUsdc } from '../utils/transcode-utils';

/** Contract status codes → human-readable strings */
const CONTRACT_STATUS: Record<number, string> = { 0: 'created', 1: 'active', 2: 'completed', 3: 'cancelled' };

/** TranscodeManager — manages video/audio transcoding jobs */
export class TranscodeManager implements ITranscodeManager {
  private hostSelectionService?: IHostSelectionService;
  /** Tracks in-flight jobs per host so the load balancer doesn't over-assign to a single host */
  private pendingJobs = new Map<string, number>();

  constructor(
    private sessionManager: any,
    private storageManager: any,
    private contractManager: any,
    private encryptionManager: any,
    private signer: Signer,
    private chainId: number,
  ) {}

  setHostSelectionService(service: IHostSelectionService): void {
    this.hostSelectionService = service;
  }

  async submitTranscodeWithLoadBalancing(
    sourceCid: string,
    formats: VideoFormat[],
    modelId: string,
    options?: TranscodeLoadBalancedOptions,
  ): Promise<TranscodeHandle> {
    if (!this.hostSelectionService) {
      throw new Error('HostSelectionService not set — call setHostSelectionService() first');
    }

    const mode = options?.hostSelectionMode ?? HostSelectionMode.AUTO;
    const maxRetries = options?.maxHostRetries ?? 3;
    const ranked = await this.hostSelectionService.getRankedHostsForModel(modelId, mode);
    const maxRounds = 2;
    const retryDelay = options?.retryDelayMs ?? 5000;

    for (let round = 0; round < maxRounds; round++) {
      if (round > 0) {
        console.log(`[TranscodeManager] All hosts exhausted, retrying in ${retryDelay}ms (round ${round + 1}/${maxRounds})`);
        await new Promise(r => setTimeout(r, retryDelay));
      }

      for (const { host } of ranked.slice(0, maxRetries)) {
        try {
          const capacity = await fetchTranscodeCapacity(host.apiUrl);
          const pending = this.pendingJobs.get(host.address) || 0;
          const effectiveAvailable = capacity.available - pending;
          if (!capacity.sidecarConnected || effectiveAvailable <= 0) {
            console.log(`[TranscodeManager] Skipping ${host.address}: no capacity (available=${capacity.available}, pending=${pending}, effective=${effectiveAvailable}, sidecar=${capacity.sidecarConnected})`);
            continue;
          }
        } catch {
          console.log(`[TranscodeManager] Skipping ${host.address}: capacity fetch failed`);
          continue;
        }

        // Track this host as having a pending job
        this.pendingJobs.set(host.address, (this.pendingJobs.get(host.address) || 0) + 1);
        options?.onHostSelected?.(host.address, host.apiUrl);

        try {
          const { sessionId } = await this.sessionManager.startSession({
            host: host.address,
            modelId,
            chainId: this.chainId,
            endpoint: host.apiUrl,
            depositAmount: options?.depositAmount ?? '0.0002',
            duration: options?.duration ?? 3600,
            proofInterval: options?.proofInterval ?? 100,
            encryption: options?.encryption !== false,
          });
          const handle = await this.sessionManager.submitTranscode(
            sessionId.toString(), sourceCid, formats, options,
          );
          // Decrement pending count when job completes or fails
          handle.result.finally(() => {
            const count = this.pendingJobs.get(host.address) || 0;
            if (count > 0) this.pendingJobs.set(host.address, count - 1);
          });
          return handle;
        } catch (err) {
          // Decrement on submission failure
          const count = this.pendingJobs.get(host.address) || 0;
          if (count > 0) this.pendingJobs.set(host.address, count - 1);
          if (err instanceof TranscodeError && err.code === 'CAPACITY_FULL') {
            console.log(`[TranscodeManager] CAPACITY_FULL on ${host.address}, trying next host`);
            continue;
          }
          throw err;
        }
      }
    }

    throw new TranscodeError('No hosts available with transcode capacity', 'NO_AVAILABLE_HOSTS');
  }

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

  /**
   * Estimate the predicted USDC cost for transcoding `formats` (deposit sizing; no margin).
   * Reads the on-chain pricePerToken for the transcode modelId (same price the session charges).
   */
  async estimateTranscodePrice(
    hostAddress: string,
    formats: VideoFormat[],
    videoDurationSeconds: number,
    options?: { isEncrypted?: boolean; paymentToken?: string; modelId?: string },
  ): Promise<TranscodePriceEstimate> {
    // Default: derive the modelId from formats. Override when the session is priced/matched on a
    // named modelId (e.g. getModelId('fabstir/transcoding-hls','480p-720p-1080p-av1')) so the
    // estimate resolves the SAME price the session charges.
    const modelId = options?.modelId ?? computeTranscodeModelId(formats);
    const paymentToken = options?.paymentToken
      ?? await this.contractManager.getContractAddress('usdcToken');
    const pricePerToken: bigint = await this.sessionManager.resolveModelPricePerToken(
      hostAddress, modelId, paymentToken,
    );
    if (!pricePerToken || pricePerToken <= 0n) {
      throw new TranscodeError(
        `No on-chain price for transcode modelId ${modelId} (token ${paymentToken})`,
        'TRANSCODE_FAILED', hostAddress,
      );
    }
    const isEncrypted = options?.isEncrypted ?? true;
    const units = estimateTranscodeUnits(videoDurationSeconds, formats, isEncrypted);
    const tokens = billingUnitsToTokens(units);
    const base = tokensToUsdc(tokens, pricePerToken);
    return {
      totalCost: formatUnits(base, 6), // USDC human-readable (predicted, no margin)
      totalCostBaseUnits: base.toString(), // authoritative integer base units
      tokens,
      pricePerToken: pricePerToken.toString(),
      paymentToken,
      breakdown: { duration: videoDurationSeconds, units, renditions: formats.length, isEncrypted },
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
