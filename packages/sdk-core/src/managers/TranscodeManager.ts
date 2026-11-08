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
  TranscodeSessionSize,
  TranscodeOrphanedSession,
} from '../types/transcode.types';
import type { IHostSelectionService } from '../interfaces/IHostSelectionService';
import { TranscodeError } from '../errors/transcode-errors';
import { fetchTranscodeCapacity } from '../utils/transcode-capacity';
import { HostSelectionMode } from '../types/settings.types';
import { computeTranscodeModelId, estimateTranscodeUnits, billingUnitsToTokens, tokensToUsdc, transcodeSessionDuration, isEncryptedTranscode, isCapabilityCid, TRANSCODE_MAX_RELEASABLE_RATE_SECONDS } from '../utils/transcode-utils';

/** A longer setTimeout delay overflows and fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/** JobMarketplace SessionStatus (Active, Completed, TimedOut: types/proof.types.ts, contracts API_REFERENCE). */
const CONTRACT_STATUS: Record<number, string> = { 0: 'active', 1: 'completed', 2: 'timedOut' };

/**
 * A load-balancer failure with the sessions it funded and could not use (Milestone B D40). None → `err` unchanged. An
 * error with a code (TranscodeError, SDKError such as SESSION_FUNDING_UNCERTAIN) is the same error, its details plus
 * `orphanedSessions`, so a caller branching on its class or code still can (review m2). Anything else becomes
 * TRANSCODE_FAILED with `details { reason: 'POST_FUNDING_FAILURE', orphanedSessions, cause }`.
 */
function withOrphanedSessions(err: unknown, orphaned: TranscodeOrphanedSession[], host: string): unknown {
  if (orphaned.length === 0) return err;
  if (err instanceof Error && typeof (err as { code?: unknown }).code === 'string') {
    const coded = err as Error & { details?: unknown };
    const d = coded.details;
    // TranscodeError.details is readonly to callers only; it is a plain property.
    (coded as { details?: unknown }).details = d === undefined ? { orphanedSessions: orphaned }
      : typeof d === 'object' && d !== null ? { ...(d as object), orphanedSessions: orphaned }
      : { detail: d, orphanedSessions: orphaned };
    return coded;
  }
  const message = err instanceof Error ? err.message : String(err);
  return new TranscodeError(message, 'TRANSCODE_FAILED', host, { reason: 'POST_FUNDING_FAILURE', orphanedSessions: orphaned, cause: err });
}

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

    // What can fail comes before the funding. A CID without its network (s5://<cid>) is refused by node 8.62.1+, and
    // earlier nodes dropped it until the 30 min timeout, so no node ever ran one.
    if (!/^[^\s:/]+:\/\/\S+$/.test(sourceCid)) {
      throw new TranscodeError(`sourceCid must name its storage network, e.g. s5://<cid>, got ${sourceCid}`, 'TRANSCODE_FAILED', undefined,
        { reason: 'SOURCE_CID_NO_NETWORK' });
    }
    // The host running an encrypted job sees its keys: only allowlisted hosts are considered, and none configured refuses
    // (1.39.18 K5). SessionManager.submitTranscode enforces it again for every path; this keeps a refused host unfunded.
    let allowed: Set<string> | undefined;
    if (isEncryptedTranscode(sourceCid, options?.isEncrypted)) {
      const list = this.sessionManager.getConfidentialHosts();
      if (!list) {
        throw new TranscodeError('Encrypted transcodes are refused: no confidentialHosts are configured',
          'CONFIDENTIAL_HOST_NOT_ALLOWED', undefined, { reason: 'NO_ALLOWLIST', job: 'transcode' });
      }
      allowed = new Set(list.map((h: string) => h.toLowerCase()));
    }
    let sessionDuration = options?.duration ?? 3600;
    // Over the 5,400 s limit, only a node reporting `transcode-final-wait-uncapped` can release the result (K1).
    let needsUncappedFinalWait = false;
    if (options?.sourceDurationSeconds !== undefined) {
      const sized = await this.sizeFor(options.sourceDurationSeconds, formats, modelId, options.isEncrypted, true);
      needsUncappedFinalWait = sized.tokens > TRANSCODE_MAX_RELEASABLE_RATE_SECONDS * sized.ratePerSecond;
      const requiredSeconds = sized.duration;
      if (options.duration !== undefined && options.duration < requiredSeconds) {
        throw new TranscodeError(
          `A ${options.duration} s session cannot bill a ${options.sourceDurationSeconds} s source before it expires; it needs ${requiredSeconds} s`,
          'TRANSCODE_FAILED', undefined, { reason: 'SESSION_TOO_SHORT', duration: options.duration, requiredSeconds },
        );
      }
      sessionDuration = options.duration ?? requiredSeconds;
    }
    // The wait is the session's lifetime + 300 s (the node developer, 1.39.18): the node keeps only a job it can bill
    // before expiry, so the result arrives by then. The caller's own timeoutMs stands.
    const submitOptions = { ...options, timeoutMs: options?.timeoutMs ?? Math.min((sessionDuration + 300) * 1000, MAX_TIMER_MS) };
    let skippedForFinalWait = 0, skippedOther = 0;
    // Sessions funded on a host that then refused the job: they travel with the outcome (Milestone B D40).
    const orphaned: TranscodeOrphanedSession[] = [];

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

      const candidates = allowed ? ranked.filter(({ host }) => allowed!.has(String(host.address).toLowerCase())) : ranked;
      if (allowed && candidates.length === 0) {
        throw new TranscodeError('No host on confidentialHosts serves this model', 'CONFIDENTIAL_HOST_NOT_ALLOWED', undefined,
          { reason: 'HOST_NOT_ALLOWED', job: 'transcode' });
      }
      // A host that cannot release an over-limit job's result is not one of the maxRetries attempts (review R5).
      let attempts = 0;
      for (const { host } of candidates) {
        if (attempts >= maxRetries) break;
        if (needsUncappedFinalWait && !(await this.hasFeatureFlag(host.apiUrl, 'transcode-final-wait-uncapped'))) {
          console.log(`[TranscodeManager] Skipping ${host.address}: its final claim cannot wait long enough for this source`);
          skippedForFinalWait++;
          continue;
        }
        attempts++;
        try {
          const capacity = await fetchTranscodeCapacity(host.apiUrl);
          const pending = this.pendingJobs.get(host.address) || 0;
          const effectiveAvailable = capacity.available - pending;
          if (!capacity.sidecarConnected || effectiveAvailable <= 0) {
            console.log(`[TranscodeManager] Skipping ${host.address}: no capacity (available=${capacity.available}, pending=${pending}, effective=${effectiveAvailable}, sidecar=${capacity.sidecarConnected})`);
            skippedOther++;
            continue;
          }
        } catch {
          console.log(`[TranscodeManager] Skipping ${host.address}: capacity fetch failed`);
          skippedOther++;
          continue;
        }

        // Track this host as having a pending job
        this.pendingJobs.set(host.address, (this.pendingJobs.get(host.address) || 0) + 1);
        options?.onHostSelected?.(host.address, host.apiUrl);

        let funded: TranscodeOrphanedSession | undefined;
        try {
          const { sessionId, jobId } = await this.sessionManager.startSession({
            host: host.address,
            modelId,
            chainId: this.chainId,
            endpoint: host.apiUrl,
            depositAmount: options?.depositAmount ?? '0.0002',
            duration: sessionDuration,
            proofInterval: options?.proofInterval ?? 100,
            encryption: options?.encryption !== false,
            conversationLog: false, // a transcode has no chat log — and no post-funding S5 write to fail
          });
          funded = { sessionId, jobId, host: host.address };
          const handle: TranscodeHandle = await this.sessionManager.submitTranscode(
            sessionId.toString(), sourceCid, formats, submitOptions,
          );
          // Decrement pending count when job completes or fails. Reassigning (rather than
          // forking a second promise off handle.result) is what keeps a failed job from
          // leaving an unhandled rejection behind — Node terminates the process on those, and
          // a moderation hold makes failure a routine outcome. Same idiom as SessionManager:4004.
          handle.result = handle.result.finally(() => {
            const count = this.pendingJobs.get(host.address) || 0;
            if (count > 0) this.pendingJobs.set(host.address, count - 1);
          });
          if (orphaned.length > 0) handle.orphanedSessions = orphaned;
          return handle;
        } catch (err) {
          // Decrement on submission failure
          const count = this.pendingJobs.get(host.address) || 0;
          if (count > 0) this.pendingJobs.set(host.address, count - 1);
          if (funded) orphaned.push(funded);
          if (err instanceof TranscodeError && err.code === 'CAPACITY_FULL') {
            console.log(`[TranscodeManager] CAPACITY_FULL on ${host.address}, trying next host`);
            skippedOther++;
            continue;
          }
          throw withOrphanedSessions(err, orphaned, host.address);
        }
      }
    }

    // Only when the marker was the sole reason: a host that was merely busy might take the job later (review R5).
    if (skippedForFinalWait > 0 && skippedOther === 0) {
      throw new TranscodeError(
        'No host can bill this source in full and still release its result (none reports transcode-final-wait-uncapped)',
        'TRANSCODE_FAILED', undefined, { reason: 'SOURCE_TOO_LONG' },
      );
    }
    throw new TranscodeError('No hosts available with transcode capacity', 'NO_AVAILABLE_HOSTS', undefined,
      orphaned.length > 0 ? { orphanedSessions: orphaned } : undefined);
  }

  async createTranscodeJob(params: CreateTranscodeJobParams): Promise<{
    jobId: bigint;
    estimatedCost: string;
    formatSpecHash: string;
    formatSpecCID: string;
  }> {
    const modelId = computeTranscodeModelId(params.mediaFormats);

    // Everything that can fail comes before the funding — the estimate (a malformed format throws), then the spec
    // upload — so a funded session's ids always reach the caller (I7, §23 DD3, §24 EE8).
    const units = estimateTranscodeUnits(params.maxDuration, params.mediaFormats);
    const estimatedCost = String(billingUnitsToTokens(units));
    // maxDuration is the source length here (the estimate above reads it so); encrypted is the longer case.
    const { duration } = await this.sizeTranscodeSession(params.maxDuration, params.mediaFormats, { modelId });
    // Encrypted like every StorageManager write by default; the capability CID carries its key (Milestone B D46).
    const formatSpecCID = `s5://${await this.storageManager.uploadEncryptedBlob(new TextEncoder().encode(JSON.stringify(params.mediaFormats)))}`;
    const { jobId } = await this.sessionManager.startSession({
      host: params.hostAddress,
      modelId,
      chainId: params.chainId,
      duration,
      conversationLog: false,
    });

    return {
      jobId,
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
   * The session lifetime a transcode of this source needs, from the model's rate cap on chain (1.39.17). For a caller that
   * funds its own session: pass `duration` as the session's `maxDuration`, and at least `duration × 1000` as the submit's
   * `timeoutMs`. Pass `modelId` if the session is funded on a named model: the default is the formats' own id. A failed
   * chain read throws; no rate is assumed. A source the node is certain to withhold throws SOURCE_TOO_LONG.
   */
  async sizeTranscodeSession(
    sourceSeconds: number, formats: VideoFormat[], options?: { modelId?: string; isEncrypted?: boolean; hostUrl?: string },
  ): Promise<TranscodeSessionSize> {
    // With the host known, a node reporting `transcode-final-wait-uncapped` (8.62.6) lifts SOURCE_TOO_LONG (1.39.18 K1).
    const finalWaitUncapped = options?.hostUrl ? await this.hasFeatureFlag(options.hostUrl, 'transcode-final-wait-uncapped') : false;
    return this.sizeFor(sourceSeconds, formats, options?.modelId ?? computeTranscodeModelId(formats), options?.isEncrypted, finalWaitUncapped);
  }

  private async sizeFor(
    sourceSeconds: number, formats: VideoFormat[], modelId: string, isEncrypted: boolean | undefined, finalWaitUncapped: boolean,
  ): Promise<TranscodeSessionSize> {
    const encrypted = isEncrypted ?? true;
    const ratePerSecond: number = await this.sessionManager.resolveModelRateLimit(modelId);
    return {
      duration: transcodeSessionDuration(sourceSeconds, formats, { ratePerSecond, isEncrypted: encrypted, finalWaitUncapped }),
      tokens: billingUnitsToTokens(estimateTranscodeUnits(sourceSeconds, formats, encrypted)),
      ratePerSecond,
      finalWaitUncapped,
    };
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
    // A transcode keeps no conversation log, so the completion carries an empty CID (Milestone B D46).
    const tx = await this.contractManager.getJobMarketplace().completeSessionJob(jobId, '');
    const receipt = await tx.wait(3);
    return { txHash: receipt.hash };
  }

  /**
   * Encrypt and upload a source video; returns its `s5://` capability CID (the key travels inside it), ready to pass as
   * `sourceCid`. There is no plaintext upload path: `encrypt: false` is refused. Progress reports 100 on completion.
   */
  async uploadVideoForTranscode(
    videoFile: File | Blob,
    encrypt?: boolean,
    onProgress?: (percentComplete: number) => void,
  ): Promise<{ cid: string; encryptionKey?: string }> {
    if (encrypt === false) {
      throw new TranscodeError('uploadVideoForTranscode has no plaintext upload path; sources are uploaded encrypted',
        'TRANSCODE_FAILED', undefined, { reason: 'PLAINTEXT_UPLOAD_UNSUPPORTED' });
    }
    const cid = await this.storageManager.uploadEncryptedBlob(new Uint8Array(await videoFile.arrayBuffer()));
    onProgress?.(100);
    return { cid: `s5://${cid}` };
  }

  /**
   * Fetch a transcoded output as a Blob: a capability CID is decrypted with the key it carries, a plain CID is read as
   * raw bytes. `s5://` is optional. The SDK writes no files: an `outputPath` is refused. Progress reports 100 on completion.
   */
  async downloadTranscodedVideo(
    outputCID: string,
    outputPath?: string,
    onProgress?: (percentComplete: number) => void,
  ): Promise<Blob | string> {
    if (outputPath !== undefined) {
      throw new TranscodeError('downloadTranscodedVideo returns a Blob; it does not write files (outputPath)',
        'TRANSCODE_FAILED', undefined, { reason: 'OUTPUT_PATH_UNSUPPORTED' });
    }
    const cid = outputCID.replace(/^s5:\/\//, '');
    const bytes: Uint8Array = isCapabilityCid(cid)
      ? await this.storageManager.downloadDecryptedByCID(cid)
      : await this.storageManager.getRawBytes(cid);
    onProgress?.(100);
    return new Blob([bytes as unknown as BlobPart]);
  }

  async getTranscodeJobStatus(jobId: bigint): Promise<{
    status: string;
    progress: number;
    currentGOP?: number;
    totalGOPs?: number;
    elapsedSeconds?: number;
  }> {
    const job = await this.contractManager.getJobMarketplace().sessionJobs(jobId);
    const code = Number(job.status);
    const status = CONTRACT_STATUS[code];
    if (!status) {
      throw new TranscodeError(`Unknown session status ${code} for job ${jobId}`, 'TRANSCODE_FAILED', undefined,
        { reason: 'UNKNOWN_SESSION_STATUS', status: code });
    }
    return { status, progress: code === 1 ? 100 : 0 };
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
