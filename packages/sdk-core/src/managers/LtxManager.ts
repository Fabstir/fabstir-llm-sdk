// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LtxManager — LTX 2.3 video sidecar (M0). Mirrors TranscodeManager over the same encrypted rail.
import { formatUnits } from 'ethers';
import { ltxTokens, canonicalBundleHash, ltxInputCommitmentFor, ltxImageHash, ltxVideoHash, ltxMerkleRoot, ltxProofHash, recoverLtxSigner } from '../utils/ltx-utils';
import { tokensToUsdc } from '../utils/transcode-utils';
import { LtxError } from '../errors/ltx-errors';
import type { LtxJob, LtxPriceEstimate, LtxBundle, LtxBundleMetadata, LtxSubmitOptions, LtxResult, LtxVerification } from '../types/ltx.types';

/** Dependencies for LtxManager. Managers are typed loosely to avoid import cycles. */
export interface LtxManagerDeps {
  sessionManager?: any;
  storageManager?: any;
  paymentManager?: any;
  jobMarketplace?: any;
  /** HostManager — reads the host's on-chain NodeRegistry metadata for bundle discovery. */
  hostManager?: any;
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
  private readonly hostManager: any;
  private readonly ltxModelId: string;
  private readonly usdcAddress: string;
  private readonly chainId?: number;
  private bundleCache?: LtxBundle;
  private readonly imageHashCache = new Map<string, string>(); // capability CID → keccak(plaintext), filled by uploadImages
  private readonly videoHashCache = new Map<string, string>(); // capability CID → keccak(plaintext), filled by uploadVideos

  constructor(deps: LtxManagerDeps) {
    this.sessionManager = deps.sessionManager;
    this.storageManager = deps.storageManager;
    this.paymentManager = deps.paymentManager;
    this.jobMarketplace = deps.jobMarketplace;
    this.hostManager = deps.hostManager;
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
    const requiredVideos = tpl.videoInputs ?? 0;
    const suppliedVideos = job.videos?.length ?? 0;
    if (suppliedVideos !== requiredVideos) {
      throw new LtxError(`template ${job.templateId} requires ${requiredVideos} video(s), got ${suppliedVideos}`, 'LTX_PREVALIDATION_FAILED');
    }
    const { frames, fps, resolutions } = bundle.bounds;
    if (job.frames < frames.min || job.frames > frames.max) {
      throw new LtxError(`frames ${job.frames} out of bounds [${frames.min},${frames.max}]`, 'LTX_PREVALIDATION_FAILED');
    }
    if (!fps.includes(job.fps)) {
      throw new LtxError(`fps ${job.fps} not in allow-list`, 'LTX_PREVALIDATION_FAILED');
    }
    // Node duration rule (v8.34.0): clips are a whole number of seconds — frames = fps × seconds + 1.
    // The node rejects off-grid counts AFTER escrow; gate here so a bad job never locks funds.
    if ((job.frames - 1) % job.fps !== 0) {
      throw new LtxError(
        `frames ${job.frames} is not a whole number of seconds at ${job.fps} fps (frames must be fps × seconds + 1)`, 'LTX_PREVALIDATION_FAILED',
      );
    }
    if (!resolutions.some((r) => r.w === job.resolution.w && r.h === job.resolution.h)) {
      throw new LtxError(`resolution ${job.resolution.w}x${job.resolution.h} not in allow-list`, 'LTX_PREVALIDATION_FAILED');
    }
    // loras is ADVISORY — job.lora is NOT gated (baked into the pinned template).
    return bundle;
  }

  /**
   * Create the session for the LTX model id with deposit = max(floor, ceil(estimateCost × 1.05)).
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
    // Deposit is also the SETTLEMENT CEILING: the proof claim must fit inside it. Billing matches the
    // estimate to the unit, so an unpadded above-floor deposit would test claim == deposit equality on
    // every clip. 5% ceil keeps the claim strictly inside and absorbs a host price move between
    // estimate and session open; the overage refunds at settlement.
    const padded = (estBase * 105n + 99n) / 100n;
    const depositBase = padded > floor ? padded : floor;
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

  /**
   * Vault path: adopt a session created OUTSIDE the SDK (the fiat service minted it against
   * vault deposits) instead of creating one — no estimate, no deposit, no `startSession`, no
   * wallet touch. Guards run BEFORE any network activity; the job is still validated (funds
   * are already locked, so a doomed job would waste vault money and spin a settlement-refund
   * cycle); then the in-memory registry is seeded so `submitLtx`'s `sessions.get` guard passes.
   */
  private async adoptExistingSession(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata,
    existing: { sessionId: bigint; jobId: bigint }, options: LtxSubmitOptions,
  ): Promise<{ sessionId: bigint; jobId: bigint }> {
    // The vault was debited BEFORE generate() was called, so unlike the pre-escrow path every
    // failure here must carry {sessionId, jobId} — that is what the UI relays to the service
    // for reclaim. `existing` is exactly that shape.
    if (!this.sessionManager) {
      throw new LtxError('SessionManager not available for the existingSession path', 'LTX_PREVALIDATION_FAILED', existing);
    }
    if (typeof this.sessionManager.registerExternalSession !== 'function') {
      throw new LtxError(
        'SessionManager does not implement registerExternalSession — the existingSession path needs a newer @fabstir/sdk-core',
        'LTX_PREVALIDATION_FAILED', existing,
      );
    }
    // Q8: ONE nodeHttpUrl must serve both postSessionAuth and this call. postSessionAuth strips
    // trailing slashes and matches the scheme case-INsensitively; submitLtx's WS derivation does
    // neither ('…/' → '…//v1/ws', 'HTTPS://' → unconverted). Normalise to the form the derivation
    // accepts — scheme only, since URL paths are case-sensitive.
    const endpoint = options.endpoint
      ?.replace(/\/+$/, '')
      .replace(/^(https?):\/\//i, (_m, scheme) => `${scheme.toLowerCase()}://`);
    // http(s) base ONLY, and only in a form submitLtx's derivation can actually convert: it is
    // case-SENSITIVE and treats a 'ws://' substring ANYWHERE as "already a WS URL", passing it
    // through verbatim. Anything else would silently mistarget, so reject it before the network.
    if (!endpoint || !/^https?:\/\//.test(endpoint) || endpoint.includes('ws://') || endpoint.includes('wss://')) {
      throw new LtxError(
        `existingSession requires a plain http(s):// node endpoint, got: ${options.endpoint}`,
        'LTX_PREVALIDATION_FAILED', existing,
      );
    }
    const chainId = options.chainId ?? this.chainId;
    if (chainId === undefined) {
      throw new LtxError(
        'existingSession requires a chainId (options.chainId or the SDK default)',
        'LTX_PREVALIDATION_FAILED', existing,
      );
    }
    try {
      await this.validateJob(job, hostMetadata);
    } catch (err: any) {
      // Preserve the precise code (LTX_PREVALIDATION_FAILED / LTX_BUNDLE_STALE) but add the ids.
      // `cause` is kept because this also catches transport failures from the S5 bundle read —
      // those are NOT "your job is invalid", and the distinction is only recoverable from cause.
      throw new LtxError(
        err?.message ?? 'LTX pre-validation failed',
        err instanceof LtxError ? err.code : 'LTX_PREVALIDATION_FAILED',
        { ...existing, cause: err },
      );
    }
    this.sessionManager.registerExternalSession({
      sessionId: existing.sessionId, jobId: existing.jobId, endpoint,
      hostAddress, model: this.ltxModelId, chainId,
    });
    return existing;
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
   *
   * With `options.existingSession` the session is adopted rather than created (vault/card-paid
   * path — no escrow, no wallet touch); everything from the submit onwards is identical.
   */
  async generate(
    job: LtxJob, hostAddress: string, hostMetadata: LtxBundleMetadata, options?: LtxSubmitOptions,
  ): Promise<LtxResult> {
    const { sessionId, jobId } = options?.existingSession
      ? await this.adoptExistingSession(job, hostAddress, hostMetadata, options.existingSession, options)
      : await this.createLtxSession(job, hostAddress, hostMetadata, options);
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
      result.sessionId = sessionId; // receipts / reclaim / getProofSubmission reads
      result.jobId = jobId;
      result.seed = job.seed; // conditioning seed echoed for provenance (inputBinding proves the node used it)
      // Enrich the billing block for downstream clients: the wire pricePerToken can read "0", so restate the
      // authoritative on-chain price and derive gross. Best-effort — a price read must NEVER fail a delivered clip.
      try {
        const { pricePerToken } = await this.estimateCost(job, hostAddress);
        result.billing.pricePerToken = pricePerToken.toString();
        result.billing.gross = tokensToUsdc(result.billing.tokens, pricePerToken).toString();
      } catch { /* billing enrichment is advisory; tokens, proofCID and seed are already surfaced */ }
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

  /**
   * Encrypt + upload input videos to S5 (BL3, IC-LoRA). Mirror of uploadImages: returns capability CIDs
   * (for job.videos, order preserved) and their keccak plaintext hashes (cached for verifyAttestation).
   * Fail-closed BEFORE any upload: the 256 KiB transport guard, the bundle's videoMaxBytes, and — when
   * the bundle constrains formats to mp4 only — an ISO-BMFF `ftyp` sniff.
   */
  async uploadVideos(videos: Uint8Array[], hostMetadata?: LtxBundleMetadata): Promise<{ cids: string[]; hashes: string[] }> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for uploadVideos', 'LTX_PREVALIDATION_FAILED');
    }
    for (const [i, vid] of videos.entries()) {
      if (vid.length === 0 || vid.length % 262144 === 0) {
        throw new LtxError(`video[${i}] is ${vid.length} bytes — an exact 256 KiB multiple (or empty) cannot be encrypted; re-encode the video (±1 byte)`, 'LTX_PREVALIDATION_FAILED');
      }
    }
    if (hostMetadata) {
      const bounds = (await this.resolveBundle(hostMetadata)).bounds;
      if (bounds.videoMaxBytes !== undefined) {
        for (const [i, vid] of videos.entries()) {
          if (vid.length > bounds.videoMaxBytes) {
            throw new LtxError(`video[${i}] is ${vid.length} bytes > videoMaxBytes ${bounds.videoMaxBytes}`, 'LTX_PREVALIDATION_FAILED');
          }
        }
      }
      // Format is host-authoritative on decode; when the bundle lists only mp4, fail closed on a missing ftyp box.
      const formats = bounds.videoFormats;
      if (formats && formats.length === 1 && formats[0] === 'mp4') {
        for (const [i, vid] of videos.entries()) {
          if (!(vid.length >= 8 && vid[4] === 0x66 && vid[5] === 0x74 && vid[6] === 0x79 && vid[7] === 0x70)) {
            throw new LtxError(`video[${i}] is not an mp4 (no ISO-BMFF 'ftyp' box at offset 4); bundle videoFormats=[${formats.join(',')}]`, 'LTX_PREVALIDATION_FAILED');
          }
        }
      }
    }
    const cids: string[] = [];
    const hashes: string[] = [];
    for (const vid of videos) {
      const cid = await this.storageManager.uploadEncryptedBlob(vid);
      const hash = ltxVideoHash(vid);
      this.videoHashCache.set(cid, hash);
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
   * Decrypt the single playable output container (H.264/MP4) to bytes — the helper's <jobId>.mp4.
   * Valid ONLY when the node emitted a single-file output (manifest.frameCount === 1, frames[0] is the
   * container). For an N-frame sequence (e.g. output "exr-sequence") there is NO single artefact — throws
   * with guidance to use downloadFrames() and encode client-side. outputCID is the key-less manifest, not
   * the video, so it is never decrypted here.
   */
  async downloadOutputVideo(result: LtxResult): Promise<Uint8Array> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for downloadOutputVideo', 'LTX_PREVALIDATION_FAILED');
    }
    if (result.manifest.frameCount !== 1 || result.frames.length !== 1) {
      throw new LtxError(
        `output is a ${result.manifest.frameCount}-frame sequence, not a single container — use downloadFrames() and encode client-side`,
        'LTX_PREVALIDATION_FAILED',
      );
    }
    return this.storageManager.downloadDecryptedByCID(result.frames[0]);
  }

  /**
   * Discover a host's CURRENT LTX allow-list bundle from its on-chain NodeRegistry metadata — the
   * authoritative source, so a long-running client can self-heal on LTX_BUNDLE_STALE without a config
   * edit + restart. Requires the node to publish `metadata.ltx = { allowListVersion, bundleHash, bundleCID }`
   * via updateMetadata. Feed the result straight into validateJob / generate / createLtxSession.
   */
  async getLtxBundleMetadata(hostAddress: string): Promise<LtxBundleMetadata> {
    if (!this.hostManager) {
      throw new LtxError('HostManager not available for getLtxBundleMetadata', 'LTX_PREVALIDATION_FAILED');
    }
    const info = await this.hostManager.getHostInfo(hostAddress);
    const ltx = info?.metadata?.ltx;
    if (!ltx || ltx.allowListVersion === undefined || !ltx.bundleHash || !ltx.bundleCID) {
      throw new LtxError(
        `host ${hostAddress} advertises no LTX bundle (metadata.ltx absent/incomplete) — the node must publish { allowListVersion, bundleHash, bundleCID } via updateMetadata`,
        'LTX_PREVALIDATION_FAILED',
      );
    }
    return { allowListVersion: Number(ltx.allowListVersion), bundleHash: ltx.bundleHash, bundleCID: ltx.bundleCID };
  }

  /**
   * The host's CURRENT allow-list bundle, authenticated to the advertised bundleHash — the templates
   * (with each one's imageInputs/videoInputs and their pinned semantic order) and the frames/fps/
   * resolution bounds. This is what a client form is built from: getLtxBundleMetadata returns only the
   * {version, hash, CID} pointer, and validateJob needs a job the caller cannot construct until it knows
   * these values. Feed the metadata from getLtxBundleMetadata straight in.
   */
  async getLtxBundle(hostMetadata: LtxBundleMetadata): Promise<LtxBundle> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for getLtxBundle', 'LTX_PREVALIDATION_FAILED');
    }
    return this.resolveBundle(hostMetadata);
  }

  /**
   * Verify M0 provenance. Input-binding is the LIVE check (throws LTX_INPUT_BINDING_MISMATCH);
   * integrity is inert until on-chain proof lands (Constraint 3); signature optional (Constraint 4);
   * merkle advisory. Pass options.sessionId to exercise the (inert) on-chain integrity compare.
   */
  async verifyAttestation(job: LtxJob, result: LtxResult, options?: { sessionId?: bigint; proofIndex?: number }): Promise<LtxVerification> {
    if (!this.storageManager) {
      throw new LtxError('StorageManager not available for verifyAttestation', 'LTX_INPUT_BINDING_MISMATCH');
    }
    const att = await this.storageManager.getByCID(result.proofCID);

    // (1) input-binding — the live check. Image/video templates: re-derive the plaintext hashes from the
    // job's own capability CIDs (decrypt → keccak) so verification is self-contained. The dispatcher picks
    // v1/v2/v3 from the supplied counts (validateJob already gated them to the template's declared counts).
    const imgs = job.images ?? [];
    const imageHashes = await Promise.all(imgs.map(async (cid) =>
      this.imageHashCache.get(cid) ?? ltxImageHash(await this.storageManager.downloadDecryptedByCID(cid))));
    const vids = job.videos ?? [];
    const videoHashes = await Promise.all(vids.map(async (cid) =>
      this.videoHashCache.get(cid) ?? ltxVideoHash(await this.storageManager.downloadDecryptedByCID(cid))));
    if (ltxInputCommitmentFor(job, imgs.length, imageHashes, vids.length, videoHashes).toLowerCase() !== String(att.inputCommitment).toLowerCase()
      || String(att.templateHash).toLowerCase() !== job.templateHash.toLowerCase()) {
      throw new LtxError('inputCommitment/templateHash does not match the submitted job (params, images, or videos)', 'LTX_INPUT_BINDING_MISMATCH');
    }

    // (2) integrity — live when a proof exists on-chain; skips cleanly otherwise (Constraint 3)
    let integrity: 'ok' | 'skipped' = 'skipped';
    if (options?.sessionId != null && this.jobMarketplace) {
      // one proof per clip: index 0 for the single-clip generate() flow; callers reusing a session pass the ordinal.
      // NB the contract REVERTS ("Bad index") for an empty proof slot — treat any read failure as no-proof-yet.
      let proof: any = null;
      try {
        proof = await this.jobMarketplace.getProofSubmission(options.sessionId, options.proofIndex ?? 0);
      } catch { /* no proof at this index (or read failure) → integrity stays 'skipped' */ }
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
