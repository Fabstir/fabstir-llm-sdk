// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LtxManager — LTX 2.3 video sidecar (M0). Mirrors TranscodeManager over the same encrypted rail.
import { formatUnits } from 'ethers';
import { ltxTokens, canonicalBundleHash, ltxInputCommitmentFor, ltxImageHash, ltxMerkleRoot, ltxProofHash, recoverLtxSigner } from '../utils/ltx-utils';
import { tokensToUsdc } from '../utils/transcode-utils';
import { LtxError } from '../errors/ltx-errors';
import type { LtxJob, LtxPriceEstimate, LtxBundle, LtxBundleMetadata, LtxSubmitOptions, LtxResult, LtxVerification } from '../types/ltx.types';

/** Dependencies for LtxManager. Managers are typed loosely to avoid import cycles. */
export interface LtxManagerDeps {
  sessionManager?: any;
  storageManager?: any;
  paymentManager?: any;
  jobMarketplace?: any;
  /** Registered LTX model id (bytes32) — the price key. Never the templateHash (Constraint 6). */
  ltxModelId: string;
  /** USDC token address (payment token) for this chain. */
  usdcAddress: string;
  chainId?: number;
}

export class LtxManager {
  private readonly sessionManager: any;
  private readonly storageManager: any;
  private readonly paymentManager: any;
  private readonly jobMarketplace: any;
  private readonly ltxModelId: string;
  private readonly usdcAddress: string;
  private readonly chainId?: number;
  private bundleCache?: LtxBundle;
  private readonly imageHashCache = new Map<string, string>(); // capability CID → keccak(plaintext), filled by uploadImages

  constructor(deps: LtxManagerDeps) {
    this.sessionManager = deps.sessionManager;
    this.storageManager = deps.storageManager;
    this.paymentManager = deps.paymentManager;
    this.jobMarketplace = deps.jobMarketplace;
    this.ltxModelId = deps.ltxModelId;
    this.usdcAddress = deps.usdcAddress;
    this.chainId = deps.chainId;
  }

  /**
   * Estimate the exact USDC cost of an LTX job: megapixel-frame tokens × on-chain price / precision.
   * Priced on the LTX model id (not the templateHash). Deterministic — frame count is known up front.
   */
  async estimateCost(job: LtxJob, hostAddress: string, paymentToken?: string): Promise<LtxPriceEstimate> {
    if (!this.sessionManager) {
      throw new LtxError('SessionManager not available for estimateCost', 'LTX_PREVALIDATION_FAILED');
    }
    const token = paymentToken ?? this.usdcAddress;
    const tokens = ltxTokens(job);
    const pricePerToken: bigint = await this.sessionManager.resolveModelPricePerToken(
      hostAddress, this.ltxModelId, token,
    );
    if (!pricePerToken || pricePerToken <= 0n) {
      throw new LtxError(
        `No on-chain LTX price for model ${this.ltxModelId} (token ${token})`,
        'LTX_PREVALIDATION_FAILED',
      );
    }
    const base = tokensToUsdc(tokens, pricePerToken);
    return {
      totalCost: formatUnits(base, 6),
      totalCostBaseUnits: base.toString(),
      tokens,
      pricePerToken,
      paymentToken: token,
    };
  }

  /**
   * Pre-escrow validation of a job against the host's versioned allow-list bundle (Constraint 8).
   * Authenticates the fetched bundle to the advertised bundleHash, then runs the node's exact checks.
   * `loras` is ADVISORY — never hard-gate job.lora. Returns the authenticated bundle. Throws on any miss.
   */
  async validateJob(job: LtxJob, hostMetadata: LtxBundleMetadata): Promise<LtxBundle> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for validateJob', 'LTX_PREVALIDATION_FAILED');
    }
    // Sampler-range invariant (node's RandomNoise seed is u64): decimal digits only, ≤ 2^64-1.
    // The COMMITMENT could encode uint256, but an oversize seed fails node-side AFTER escrow — gate it here.
    if (!/^\d+$/.test(job.seed) || BigInt(job.seed) > 0xffffffffffffffffn) {
      throw new LtxError(`seed must be a decimal integer in [0, 2^64-1], got "${job.seed}"`, 'LTX_PREVALIDATION_FAILED');
    }
    const bundle = await this.resolveBundle(hostMetadata);

    const tpl = bundle.templates.find((t) => t.templateId === job.templateId);
    if (!tpl || tpl.templateHash.toLowerCase() !== job.templateHash.toLowerCase()) {
      throw new LtxError(
        `Template ${job.templateId} not allow-listed or templateHash mismatch`, 'LTX_PREVALIDATION_FAILED',
      );
    }
    const requiredImages = tpl.imageInputs ?? 0;
    const suppliedImages = job.images?.length ?? 0;
    if (suppliedImages !== requiredImages) {
      throw new LtxError(`template ${job.templateId} requires ${requiredImages} image(s), got ${suppliedImages}`, 'LTX_PREVALIDATION_FAILED');
    }
    const { frames, fps, resolutions } = bundle.bounds;
    if (job.frames < frames.min || job.frames > frames.max) {
      throw new LtxError(`frames ${job.frames} out of bounds [${frames.min},${frames.max}]`, 'LTX_PREVALIDATION_FAILED');
    }
    if (!fps.includes(job.fps)) {
      throw new LtxError(`fps ${job.fps} not in allow-list`, 'LTX_PREVALIDATION_FAILED');
    }
    if (!resolutions.some((r) => r.w === job.resolution.w && r.h === job.resolution.h)) {
      throw new LtxError(`resolution ${job.resolution.w}x${job.resolution.h} not in allow-list`, 'LTX_PREVALIDATION_FAILED');
    }
    // loras is ADVISORY — job.lora is NOT gated (baked into the pinned template).
    return bundle;
  }

  /**
   * Create the session for the LTX model id with an EXACT USDC deposit = estimateCost.
   * Validates pre-escrow (Constraint 8) so a bad job never locks funds. Works across direct + delegate paths.
   */
  async createLtxSession(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata, options?: LtxSubmitOptions,
  ): Promise<{ sessionId: bigint; jobId: bigint }> {
    if (!this.sessionManager || !this.paymentManager) {
      throw new LtxError('SessionManager/PaymentManager not available for createLtxSession', 'LTX_PREVALIDATION_FAILED');
    }
    await this.validateJob(job, hostMetadata); // pre-escrow — no funds locked on failure
    const est = await this.estimateCost(job, hostAddress);
    // Contract enforces a per-token minimum deposit ("Low deposit"); admin-mutable → read on-chain, clamp up.
    // Overage is a refundable balance: settlement charges actual tokens×price and refunds the rest.
    const floor: bigint = await this.paymentManager.getTokenMinDeposit(est.paymentToken, options?.chainId ?? this.chainId);
    const estBase = BigInt(est.totalCostBaseUnits);
    const depositBase = estBase > floor ? estBase : floor;
    return this.sessionManager.startSession({
      chainId: options?.chainId ?? this.chainId,
      host: hostAddress,
      endpoint: options?.endpoint, // node URL — submitLtx reads session.endpoint for the WS connect
      modelId: this.ltxModelId,
      paymentMethod: 'deposit',
      paymentToken: est.paymentToken,
      depositAmount: formatUnits(depositBase, 6), // DECIMAL USDC string — startSession parseUnits() it back
      encryption: true,
    });
  }

  /** Reclaim a reserved deposit after proof timeout (GENERATION_FAILED/TIMEOUT) — Constraint 8. */
  async triggerSessionTimeout(jobId: number): Promise<any> {
    if (!this.paymentManager) {
      throw new LtxError('PaymentManager not available for triggerSessionTimeout', 'LTX_PREVALIDATION_FAILED');
    }
    return this.paymentManager.triggerSessionTimeout(jobId, this.chainId);
  }

  /**
   * Full orchestration: validate (pre-escrow) → estimate → session → submit → await ltx_complete.
   * Post-escrow tripwires: allowListVersion drift (LTX_BUNDLE_STALE) and billing over-claim (GENERATION_FAILED).
   */
  async generate(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata, options?: LtxSubmitOptions,
  ): Promise<LtxResult> {
    const { sessionId, jobId } = await this.createLtxSession(job, hostAddress, hostMetadata, options);
    try { // post-escrow: re-throw ANY failure with {sessionId, jobId} so the caller can triggerSessionTimeout(jobId) to reclaim
      const handle = await this.sessionManager.submitLtx(String(sessionId), job, options);
      const result: LtxResult = await handle.result;
      if (result.allowListVersion !== undefined && Number(result.allowListVersion) !== Number(hostMetadata.allowListVersion)) {
        throw new LtxError(`allowListVersion drift: accepted ${result.allowListVersion} != validated ${hostMetadata.allowListVersion}`, 'LTX_BUNDLE_STALE');
      }
      const expectedTokens = ltxTokens(job);
      if (result.billing && result.billing.tokens > expectedTokens) {
        throw new LtxError(`billing over-claim: ${result.billing.tokens} > estimated ${expectedTokens}`, 'GENERATION_FAILED');
      }
      return result;
    } catch (err: any) {
      throw new LtxError(err?.message ?? 'LTX generation failed', err instanceof LtxError ? err.code : 'GENERATION_FAILED', { sessionId, jobId });
    }
  }

  /**
   * Encrypt + upload input images to S5 (M1a). Returns capability CIDs (for job.images, order
   * preserved) and their keccak plaintext hashes (cached for verifyAttestation). Enforces the
   * bundle's imageMaxBytes fail-closed BEFORE any upload when host metadata is supplied.
   */
  async uploadImages(images: Uint8Array[], hostMetadata?: LtxBundleMetadata): Promise<{ cids: string[]; hashes: string[] }> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for uploadImages', 'LTX_PREVALIDATION_FAILED');
    }
    // Transport invariant (node-confirmed): the 256 KiB chunk scheme cannot represent an EXACT
    // chunk-multiple plaintext (and an empty image is meaningless) — fail closed before any upload.
    for (const [i, img] of images.entries()) {
      if (img.length === 0 || img.length % 262144 === 0) {
        throw new LtxError(`image[${i}] is ${img.length} bytes — an exact 256 KiB multiple (or empty) cannot be encrypted; re-encode the image (±1 byte)`, 'LTX_PREVALIDATION_FAILED');
      }
    }
    if (hostMetadata) {
      const maxBytes = (await this.resolveBundle(hostMetadata)).bounds.imageMaxBytes;
      if (maxBytes !== undefined) {
        for (const [i, img] of images.entries()) {
          if (img.length > maxBytes) {
            throw new LtxError(`image[${i}] is ${img.length} bytes > imageMaxBytes ${maxBytes}`, 'LTX_PREVALIDATION_FAILED');
          }
        }
      }
    }
    const cids: string[] = [];
    const hashes: string[] = [];
    for (const img of images) {
      const cid = await this.storageManager.uploadEncryptedBlob(img);
      const hash = ltxImageHash(img);
      this.imageHashCache.set(cid, hash);
      cids.push(cid);
      hashes.push(hash);
    }
    return { cids, hashes };
  }

  /** Fetch + decrypt the PRIVATE capability CIDs (result.frames), index-aligned to manifest.frameHashes. */
  async downloadFrames(result: LtxResult): Promise<Uint8Array[]> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for downloadFrames', 'LTX_PROOF_MISMATCH');
    }
    if (result.frames.length !== result.manifest.frameCount) {
      throw new LtxError(
        `frame count ${result.frames.length} != manifest.frameCount ${result.manifest.frameCount}`,
        'LTX_PROOF_MISMATCH',
      );
    }
    return Promise.all(result.frames.map((cid) => this.storageManager.downloadDecryptedByCID(cid)));
  }

  /**
   * Verify M0 provenance. Input-binding is the LIVE check (throws LTX_INPUT_BINDING_MISMATCH);
   * integrity is inert until on-chain proof lands (Constraint 3); signature optional (Constraint 4);
   * merkle advisory. Pass options.sessionId to exercise the (inert) on-chain integrity compare.
   */
  async verifyAttestation(job: LtxJob, result: LtxResult, options?: { sessionId?: bigint }): Promise<LtxVerification> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for verifyAttestation', 'LTX_INPUT_BINDING_MISMATCH');
    }
    const att = await this.storageManager.getByCID(result.proofCID);

    // (1) input-binding — the live check. Image templates (M1a): re-derive imageHashes from the
    // job's own capability CIDs (decrypt → keccak of plaintext) so verification is self-contained.
    const imgs = job.images ?? [];
    const imageHashes = await Promise.all(imgs.map(async (cid) =>
      this.imageHashCache.get(cid) ?? ltxImageHash(await this.storageManager.downloadDecryptedByCID(cid))));
    if (ltxInputCommitmentFor(job, imgs.length, imageHashes).toLowerCase() !== String(att.inputCommitment).toLowerCase()
      || String(att.templateHash).toLowerCase() !== job.templateHash.toLowerCase()) {
      throw new LtxError('inputCommitment/templateHash does not match the submitted job (params or images)', 'LTX_INPUT_BINDING_MISMATCH');
    }

    // (2) integrity — wired but inert until the node submits proof on chain (Constraint 3)
    let integrity: 'ok' | 'skipped' = 'skipped';
    if (options?.sessionId != null && this.jobMarketplace) {
      const proof = await this.jobMarketplace.getProofSubmission(options.sessionId, 0);
      const onChain: string | undefined = proof?.proofHash;
      if (onChain && !/^0x0*$/.test(onChain)) {
        const raw = await this.storageManager.getRawBytes(result.proofCID);
        if (ltxProofHash(raw).toLowerCase() !== onChain.toLowerCase()) {
          throw new LtxError('proofHash mismatch: sha256(stored bytes) != on-chain', 'LTX_PROOF_MISMATCH');
        }
        integrity = 'ok';
      }
    }

    // (3) signature — optional (runtime attestation is unsigned in M0)
    const signer = att.signature ? recoverLtxSigner(att) : null;
    const signatureValid = att.signature ? signer?.toLowerCase() === String(att.host).toLowerCase() : null;

    // (4) merkle — advisory conformance
    const merkleValid = ltxMerkleRoot(result.manifest.frameHashes).toLowerCase() === String(result.manifest.merkleRoot).toLowerCase();
    return { inputBinding: true, merkleValid, integrity, signer, signatureValid };
  }

  /** Fetch + authenticate the advertised bundle; cache by bundleHash (refetch only on drift). */
  private async resolveBundle(meta: LtxBundleMetadata): Promise<LtxBundle> {
    if (this.bundleCache && this.bundleCache.bundleHash.toLowerCase() === meta.bundleHash.toLowerCase()) {
      return this.bundleCache;
    }
    if (!meta.bundleCID) {
      throw new LtxError('Host advertises no bundleCID (bundle transport pending)', 'LTX_BUNDLE_STALE');
    }
    const fetched = await this.storageManager.getByCID(meta.bundleCID);
    if (canonicalBundleHash(fetched).toLowerCase() !== meta.bundleHash.toLowerCase()) {
      throw new LtxError('Fetched bundle does not authenticate to advertised bundleHash', 'LTX_BUNDLE_STALE');
    }
    if (Number(fetched.allowListVersion) !== Number(meta.allowListVersion)) throw new LtxError('Advertised allowListVersion does not match the authenticated bundle', 'LTX_BUNDLE_STALE');
    if (!Array.isArray(fetched.templates) || !fetched.bounds) throw new LtxError('Authenticated bundle is structurally malformed', 'LTX_PREVALIDATION_FAILED');
    const bundle: LtxBundle = { ...(fetched as LtxBundle), bundleHash: meta.bundleHash };
    this.bundleCache = bundle;
    return bundle;
  }
}
