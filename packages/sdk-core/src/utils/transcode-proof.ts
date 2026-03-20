// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1

/** Merkle tree verification and S5 GOP proof parsing. Browser-first: ethers.js keccak256. */

import { keccak256, getBytes, concat } from 'ethers';
import type { GOPProof } from '../types/transcode.types';

const ZERO_HASH = new Uint8Array(32);

/** Compute Merkle root from 32-byte leaf hashes. Odd layers pad by duplicating last node. */
export function computeMerkleRoot(leaves: Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return new Uint8Array(ZERO_HASH);
  if (leaves.length === 1) return new Uint8Array(leaves[0]);
  let layer = leaves.map((l) => new Uint8Array(l));
  while (layer.length > 1) {
    if (layer.length % 2 !== 0) layer.push(new Uint8Array(layer[layer.length - 1]));
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(getBytes(keccak256(concat([layer[i], layer[i + 1]]))));
    }
    layer = next;
  }
  return layer[0];
}

/** Verify a Merkle inclusion proof for a leaf at the given index against the expected root. */
export function verifyMerkleProof(
  leaf: Uint8Array, proof: Uint8Array[], index: number, root: Uint8Array,
): boolean {
  let hash = new Uint8Array(leaf);
  let idx = index;
  for (const sibling of proof) {
    hash = idx % 2 === 0
      ? getBytes(keccak256(concat([hash, sibling])))
      : getBytes(keccak256(concat([sibling, hash])));
    idx = Math.floor(idx / 2);
  }
  if (hash.length !== root.length) return false;
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] !== root[i]) return false;
  }
  return true;
}

/**
 * Parse a GOP proof blob from S5 storage.
 * Format: [4-byte big-endian u32 JSON length][JSON bytes][STARK proof bytes]
 * JSON uses snake_case from node; mapped to camelCase GOPProof.
 */
export function parseGopProof(proofBytes: Uint8Array): {
  metadata: GOPProof;
  starkProof: Uint8Array;
} {
  if (proofBytes.length < 4) {
    throw new Error('GOP proof too short: need at least 4 bytes for length prefix');
  }
  const view = new DataView(proofBytes.buffer, proofBytes.byteOffset, proofBytes.byteLength);
  const jsonLen = view.getUint32(0, false); // big-endian
  if (4 + jsonLen > proofBytes.length) {
    throw new Error(`JSON length ${jsonLen} exceeds proof size ${proofBytes.length - 4}`);
  }
  const raw = JSON.parse(new TextDecoder().decode(proofBytes.slice(4, 4 + jsonLen)));
  const metadata: GOPProof = {
    gopIndex: raw.gop_index,
    inputGOPHash: raw.input_gop_hash,
    outputGOPHash: raw.output_gop_hash,
    psnrDB: raw.psnr_db,
    ssim: raw.ssim,
    actualBitrate: raw.actual_bitrate,
    starkProofHash: raw.stark_proof_hash,
  };
  return { metadata, starkProof: proofBytes.slice(4 + jsonLen) };
}
