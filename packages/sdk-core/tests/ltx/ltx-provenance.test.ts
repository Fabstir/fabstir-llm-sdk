// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 1.2 conformance: outputCommitment, merkleRoot, sigDigest + recover, proofHash.
// Oracle: tests/ltx/vectors.json (node-generated; do not hand-edit).
import { describe, it, expect } from 'vitest';
import { getBytes } from 'ethers';
import vectors from './vectors.json';
import {
  ltxOutputCommitment,
  ltxMerkleRoot,
  ltxSigDigest,
  ltxSigDigestEncoded,
  recoverLtxSigner,
  ltxProofHash,
} from '../../src/utils/ltx-utils';

describe('ltx-utils: outputCommitment (Constraint 1)', () => {
  it('keccak256(utf8(outputCID)) === vectors.outputCommitment', () => {
    expect(ltxOutputCommitment(vectors.outputCID)).toBe(vectors.outputCommitment);
  });
});

describe('ltx-utils: merkleRoot (raw 32B leaves, keccak(l||r), duplicate-last odd)', () => {
  it('ltxMerkleRoot(frameHashes) === merkle.root === manifest.merkleRoot (3-leaf odd path)', () => {
    const root = ltxMerkleRoot(vectors.merkle.frameHashes);
    expect(root).toBe(vectors.merkle.root);
    expect(root).toBe(vectors.attestation.manifest.merkleRoot);
  });

  it('single-leaf tree returns the leaf itself', () => {
    const leaf = vectors.merkle.frameHashes[0];
    expect(ltxMerkleRoot([leaf])).toBe(leaf);
  });
});

describe('ltx-utils: sigDigest + signer recovery (Constraint 1, 4)', () => {
  it('abi-encodes to sigDigest.abiEncoded (encoder localisation), keccaks to sigDigest.hash', () => {
    expect(ltxSigDigestEncoded(vectors.attestation)).toBe(vectors.sigDigest.abiEncoded);
    expect(ltxSigDigest(vectors.attestation)).toBe(vectors.sigDigest.hash);
  });

  it('recoverLtxSigner recovers the signer === attestation.host', () => {
    const recovered = recoverLtxSigner(vectors.attestation);
    expect(recovered?.toLowerCase()).toBe(vectors.signer.toLowerCase());
    expect(recovered?.toLowerCase()).toBe(vectors.attestation.host.toLowerCase());
  });

  it('recoverLtxSigner returns null when signature is absent (unsigned runtime)', () => {
    expect(recoverLtxSigner({ ...vectors.attestation, signature: undefined })).toBeNull();
    expect(recoverLtxSigner({ ...vectors.attestation, signature: null })).toBeNull();
  });

  it('recoverLtxSigner returns null (never throws) for a malformed but present signature', () => {
    expect(recoverLtxSigner({ ...vectors.attestation, signature: '0xdeadbeef' })).toBeNull();
  });
});

describe('ltx-utils: proofHash = sha256(raw stored bytes) (Constraint 3)', () => {
  it('ltxProofHash(getBytes(proofHashInput)) === vectors.proofHash', () => {
    expect(ltxProofHash(getBytes(vectors.proofHashInput))).toBe(vectors.proofHash);
  });
});
