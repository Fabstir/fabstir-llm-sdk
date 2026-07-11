// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LTX 2.3 sidecar conformance primitives — every value conforms to docs/node-reference/vectors.json.
import { AbiCoder, keccak256, sha256, toUtf8Bytes, getBytes, hexlify, verifyMessage } from 'ethers';
import { computeMerkleRoot } from './transcode-proof';

/** Structural input for the LTX input commitment. LtxJob (ltx.types) is assignable. */
export interface LtxCommitmentInput {
  prompt: string;
  /** Decimal string (float64-safe above 2^53); encoded as uint256. */
  seed: string;
  frames: number;
  fps: number;
  resolution: { w: number; h: number };
  lora: string;
}

/** abi.encode field order for inputCommitment — MUST match the node (vectors.json). */
const INPUT_TYPES = ['string', 'uint256', 'uint32', 'uint32', 'uint32', 'uint32', 'string'];

/** The seven M0 values, shared by both encoders (the TYPE LISTS stay separate — see dispatcher). */
const inputValues = (job: LtxCommitmentInput) =>
  [job.prompt, BigInt(job.seed), job.frames, job.fps, job.resolution.w, job.resolution.h, job.lora];

/**
 * ABI-encode the LTX job fields for the input-commitment preimage.
 * Order: prompt, seed(uint256), frames, fps, w, h, lora. Canonical by construction.
 */
export function ltxInputEncoded(job: LtxCommitmentInput): string {
  return AbiCoder.defaultAbiCoder().encode(INPUT_TYPES, inputValues(job));
}

/** inputCommitment = keccak256(abi.encode(...)) — the live M0 input-binding value. */
export function ltxInputCommitment(job: LtxCommitmentInput): string {
  return keccak256(ltxInputEncoded(job));
}

/** keccak256 over the PLAINTEXT image bytes — the content identity bound by commitment v2 (M1a). */
export function ltxImageHash(plaintext: Uint8Array): string {
  return keccak256(plaintext);
}

/** keccak256 over the PLAINTEXT video bytes — the content identity bound by commitment v3 (BL3, IC-LoRA). */
export function ltxVideoHash(plaintext: Uint8Array): string {
  return keccak256(plaintext);
}

/** v2 field order = the M0 seven + bytes32[] imageHashes. ONLY for image templates (imageInputs>0). */
const INPUT_TYPES_V2 = [...INPUT_TYPES, 'bytes32[]'];

/** ABI-encode the v2 (image-template) input-commitment preimage. */
export function ltxInputEncodedV2(job: LtxCommitmentInput, imageHashes: string[]): string {
  return AbiCoder.defaultAbiCoder().encode(INPUT_TYPES_V2, [...inputValues(job), imageHashes]);
}

/** inputCommitment v2 = keccak256(8-field abi.encode) — binds the plaintext image hashes, in job order. */
export function ltxInputCommitmentV2(job: LtxCommitmentInput, imageHashes: string[]): string {
  return keccak256(ltxInputEncodedV2(job, imageHashes));
}

/** v3 field order = the M0 seven + bytes32[] imageHashes + bytes32[] videoHashes. ONLY for video templates (videoInputs>0). */
const INPUT_TYPES_V3 = [...INPUT_TYPES_V2, 'bytes32[]'];

/** ABI-encode the v3 (video-template) input-commitment preimage. imageHashes may be empty; videoHashes must not. */
export function ltxInputEncodedV3(job: LtxCommitmentInput, imageHashes: string[], videoHashes: string[]): string {
  return AbiCoder.defaultAbiCoder().encode(INPUT_TYPES_V3, [...inputValues(job), imageHashes, videoHashes]);
}

/** inputCommitment v3 = keccak256(9-field abi.encode) — binds plaintext image AND video hashes, in job order. */
export function ltxInputCommitmentV3(job: LtxCommitmentInput, imageHashes: string[], videoHashes: string[]): string {
  return keccak256(ltxInputEncodedV3(job, imageHashes, videoHashes));
}

/**
 * Format dispatcher (frozen seam). Selector by the TEMPLATE's bundle entry, most-specific first:
 *   videoInputs>0 → v3 (nine-field, images may be empty); else imageInputs>0 → v2 (eight-field);
 *   else the M0 SEVEN-field. NEVER "vN with an empty trailing array" — a trailing dynamic field shifts
 *   the earlier offset words, so enc7 !== enc8-empty !== enc9-empty. Each level count-checks fail-closed.
 */
export function ltxInputCommitmentFor(
  job: LtxCommitmentInput, imageInputs: number, imageHashes: string[],
  videoInputs = 0, videoHashes: string[] = [],
): string {
  if (videoInputs > 0) {
    if (videoHashes.length !== videoInputs) throw new Error(`template requires ${videoInputs} video(s), got ${videoHashes.length}`);
    if (imageHashes.length !== imageInputs) throw new Error(`template requires ${imageInputs} image(s), got ${imageHashes.length}`);
    return ltxInputCommitmentV3(job, imageHashes, videoHashes);
  }
  if (videoHashes.length > 0) throw new Error(`template takes no videos but got ${videoHashes.length} video hash(es)`);
  if (imageInputs === 0) {
    if (imageHashes.length > 0) throw new Error(`template takes no images but got ${imageHashes.length} image hash(es)`);
    return ltxInputCommitment(job);
  }
  if (imageHashes.length !== imageInputs) throw new Error(`template requires ${imageInputs} image(s), got ${imageHashes.length}`);
  return ltxInputCommitmentV2(job, imageHashes);
}

/**
 * Megapixel-frame token count = ceil(frames·w·h / 1000), computed in bigint.
 * Deterministic (frame count known up front) — sizes the exact USDC deposit.
 * Byte-identical to the node's integer formula.
 */
export function ltxTokens(job: { frames: number; resolution: { w: number; h: number } }): number {
  const tokens = (BigInt(job.frames) * BigInt(job.resolution.w) * BigInt(job.resolution.h) + 999n) / 1000n;
  return Number(tokens);
}

/** Attestation fields needed for the provenance hashes (LtxManifest/attestation types are assignable). */
export interface LtxAttestationFields {
  modelId: string;
  templateHash: string;
  envHash: string;
  inputCommitment: string;
  outputCID: string;
  sessionId: string | number | bigint;
  host: string;
  timestamp: number | string | bigint;
  signature?: string | null;
}

/** outputCommitment = keccak256(utf8 bytes of the outputCID string) — derived for the digest, not stored. */
export function ltxOutputCommitment(cid: string): string {
  return keccak256(toUtf8Bytes(cid));
}

/** Merkle root over raw 32-byte hex leaves: keccak(left‖right), duplicate-last on odd layers. */
export function ltxMerkleRoot(frameHashes: string[]): string {
  return hexlify(computeMerkleRoot(frameHashes.map((h) => getBytes(h))));
}

/** abi.encode field order for the attestation signature digest — MUST match the node. */
const SIG_TYPES = ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'address', 'uint256'];

/** ABI-encode the attestation for the signature digest (outputCommitment derived from outputCID). */
export function ltxSigDigestEncoded(att: LtxAttestationFields): string {
  return AbiCoder.defaultAbiCoder().encode(SIG_TYPES, [
    att.modelId,
    att.templateHash,
    att.envHash,
    att.inputCommitment,
    ltxOutputCommitment(att.outputCID),
    BigInt(att.sessionId),
    att.host,
    BigInt(att.timestamp),
  ]);
}

/** sigDigest = keccak256(abi.encode(...)) — the EIP-191 personalSign preimage. */
export function ltxSigDigest(att: LtxAttestationFields): string {
  return keccak256(ltxSigDigestEncoded(att));
}

/** Recover the attestation signer via EIP-191 over the 32-byte digest; null when unsigned (Constraint 4). */
export function recoverLtxSigner(att: LtxAttestationFields): string | null {
  if (!att.signature) return null;
  try {
    return verifyMessage(getBytes(ltxSigDigest(att)), att.signature);
  } catch {
    return null; // malformed-but-present signature — advisory in M0, never abort verification
  }
}

/** proofHash = SHA256 over the exact stored attestation bytes (our layer atop S5's BLAKE3 CID). */
export function ltxProofHash(rawBytes: Uint8Array): string {
  return sha256(rawBytes);
}

/** Recursively sort object keys; array order is preserved (mirrors utils/signature.ts sortObjectKeys). */
function sortKeysDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
    return out;
  }
  return value;
}

/**
 * bundleHash = keccak256(utf8(compact JSON of the key-sorted bundle, with `bundleHash` removed)).
 * Reproduces the node's canonicalisation exactly (Constraint 8) — authenticates fetched bundles.
 */
export function canonicalBundleHash(bundle: Record<string, unknown>): string {
  const { bundleHash: _omit, ...rest } = bundle as Record<string, unknown>;
  return keccak256(toUtf8Bytes(JSON.stringify(sortKeysDeep(rest))));
}
