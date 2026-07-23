// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LTX 2.3 video sidecar (M0) types. Wire shapes frozen in docs/node-reference/LTX-SIDECAR-M0-INTERFACE.md.
export * from '../errors/ltx-errors';

/** The text-to-video job (Contract A). `seed` is a decimal string (uint256 in inputCommitment). */
export interface LtxJob {
  /** Pinned, allow-listed template name (e.g. "ltx-t2v-hdr"). */
  templateId: string;
  /** "0x" + keccak256 of the canonical API JSON; checked against the allow-list bundle. */
  templateHash: string;
  prompt: string;
  /** DECIMAL STRING (float64-safe above 2^53); bigint internally, uint256 in the commitment. */
  seed: string;
  frames: number;
  fps: number;
  resolution: { w: number; h: number };
  /** Pinned, allow-listed LoRA id (e.g. "ltx-iclora-hdr@v1"). */
  lora: string;
  /** Output format, e.g. "exr-sequence". */
  output: string;
  /**
   * M1a image templates: input images as S5 capability CIDs (u-prefix 0xae), ORDER-significant —
   * images[i] maps to the template's pinned imageSemantics[i]. Absent/empty for t2v (imageInputs 0).
   */
  images?: string[];
  /**
   * BL3 video templates (IC-LoRA): input videos as S5 capability CIDs, ORDER-significant —
   * videos[i] maps to the template's pinned videoSemantics[i]. Absent/empty unless videoInputs>0.
   */
  videos?: string[];
}

/** Public, KEY-LESS manifest at outputCID: content hashes + Merkle root, no decryption keys. */
export interface LtxManifest {
  frameCount: number;
  fps: number;
  resolution: { w: number; h: number };
  colourEncoding: string;
  /** One keccak256(ciphertext) leaf per frame — key-less. */
  frameHashes: string[];
  merkleRoot: string;
}

/** Billing block from ltx_complete (megapixel-frame unit). */
export interface LtxBilling {
  unit: string;
  tokens: number;
  /** Restated by generate() to the authoritative on-chain price (the wire value can read "0"). */
  pricePerToken?: string;
  /** SDK-derived by generate(): floor(tokens × pricePerToken / 1000) in USDC base units (6 dp). */
  gross?: string;
}

/** Resolved ltx_complete result. `frames` are PRIVATE capability CIDs, index-aligned to frameHashes. */
export interface LtxResult {
  outputCID: string;
  proofCID: string;
  manifest: LtxManifest;
  frames: string[];
  billing: LtxBilling;
  requestId?: string;
  allowListVersion?: number;
  /** Echoed by generate(): the seed that conditioned the render (== job.seed; verifyAttestation's inputBinding proves the node used it). */
  seed?: string;
  /** Attached by generate(): the paid session behind this clip — receipts, reclaim, on-chain proof reads. */
  sessionId?: bigint;
  jobId?: bigint;
}

export type LtxStage = 'generating' | 'encrypting' | 'uploading' | 'finalising';

/** Streamed progress from ltx_progress. */
export interface LtxProgress {
  stage: LtxStage;
  pct: number;
}

/** Handle returned by submitLtx for controlling an LTX job. */
export interface LtxHandle {
  requestId?: string;
  cancel(): void;
  result: Promise<LtxResult>;
  onProgress?: (progress: LtxProgress) => void;
}

/** Options for SessionManager.submitLtx / LtxManager.generate. */
export interface LtxSubmitOptions {
  requestId?: string;
  onProgress?: (progress: LtxProgress) => void;
  timeoutMs?: number;
  chainId?: number;
  /**
   * Node endpoint. Stored on the session; submitLtx derives the WS URL from it — an http(s)://
   * base gets '/v1/ws' appended, a ws(s):// value is used verbatim. Prefer the http(s) base;
   * with `existingSession` it is REQUIRED and the ws(s) form is rejected (see below).
   */
  endpoint?: string;
  /**
   * Vault/delegated path: run generate() against a session that already exists — no escrow,
   * no wallet touch, no session creation. `endpoint` is REQUIRED alongside it and must be the
   * http(s):// base (the same `nodeHttpUrl` used for postSessionAuth; ws(s):// is rejected).
   * The caller must have delivered FC1.6 session-auth for this sessionId first.
   */
  existingSession?: { sessionId: bigint; jobId: bigint };
}

/** Cost estimate for an LTX job (USDC). */
export interface LtxPriceEstimate {
  totalCost: string;
  totalCostBaseUnits: string;
  tokens: number;
  pricePerToken: bigint;
  paymentToken: string;
}

/** Frozen allow-list + param bounds (AllowListBundle; v2 adds the image fields) — see bundle schema doc. */
export interface LtxBundle {
  allowListVersion: number;
  bundleHash: string;
  templates: {
    templateId: string;
    templateHash: string;
    /** v2 format selector: 0/absent = t2v (M0 7-field commitment); >0 = image template (v2 commitment). */
    imageInputs?: number;
    /** Pinned semantic order of images[i] (e.g. ["firstFrame","lastFrame"]) — node-authoritative. */
    imageSemantics?: string[];
    /** v3 format selector: >0 = video template (IC-LoRA, 9-field commitment). 0/absent otherwise. */
    videoInputs?: number;
    /** Pinned semantic order of videos[i] (e.g. ["controlVideo"]) — node-authoritative. */
    videoSemantics?: string[];
  }[];
  /** ADVISORY only — never hard-gate job.lora (Constraint 8). */
  loras: string[];
  bounds: {
    frames: { min: number; max: number };
    fps: number[];
    resolutions: { w: number; h: number }[];
    /** v2: per-image byte ceiling — fail-closed client-side, host authoritative. */
    imageMaxBytes?: number;
    /** v2: advisory accepted formats; host authoritative on decode. */
    imageFormats?: string[];
    /** v3: per-video byte ceiling — fail-closed client-side, host authoritative. */
    videoMaxBytes?: number;
    /** v3: accepted video container formats (e.g. ["mp4"]); host authoritative on decode. */
    videoFormats?: string[];
  };
}

/** Host NodeRegistry metadata advertising the LTX bundle (read at discovery, pre-escrow). */
export interface LtxBundleMetadata {
  allowListVersion: number;
  bundleHash: string;
  /** S5 CID of the published bundle (Option A). Pending node transport — inert in M0. */
  bundleCID?: string;
}

/** Result of verifyAttestation. M0: input-binding is LIVE; integrity inert; signature/merkle advisory. */
export interface LtxVerification {
  /** true when it returns (input-binding mismatch throws instead). */
  inputBinding: boolean;
  /** merkleRoot(frameHashes) === manifest.merkleRoot (advisory in M0). */
  merkleValid: boolean;
  /** 'ok' when checked against on-chain proof; 'skipped' while submitProofOfWork is deferred. */
  integrity: 'ok' | 'skipped';
  /** Recovered attestation signer, or null when unsigned. */
  signer: string | null;
  /** true/false when signed; null when unsigned. */
  signatureValid: boolean | null;
}
