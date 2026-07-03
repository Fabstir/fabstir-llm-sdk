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
  pricePerToken?: string;
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
  /** Node endpoint (http(s):// or ws(s)://). Stored on the session; submitLtx derives the WS URL from it. */
  endpoint?: string;
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
