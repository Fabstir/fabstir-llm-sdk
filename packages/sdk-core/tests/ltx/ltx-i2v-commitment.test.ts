// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M1a SP-A: inputCommitment v2 (image templates) + the format dispatcher.
// Oracle: tests/ltx/vectors-i2v.json (node-generated; do not hand-edit).
import { describe, it, expect } from 'vitest';
import { getBytes } from 'ethers';
import v2 from './vectors-i2v.json';
import m0 from './vectors.json';
import {
  ltxImageHash,
  ltxInputEncodedV2,
  ltxInputCommitmentV2,
  ltxInputCommitmentFor,
  ltxInputCommitment,
} from '../../src/utils/ltx-utils';

describe('ltxImageHash = keccak256(plaintext bytes)', () => {
  it('reproduces every fixture image hash', () => {
    for (const c of [v2.singleImage, v2.dualImage]) {
      c.imagePlaintext.forEach((p: any, i: number) => {
        expect(ltxImageHash(getBytes(p.hex))).toBe(c.imageHashes[i]);
      });
    }
  });
});

describe('inputCommitment v2 (8-field, bytes32[] imageHashes)', () => {
  it('singleImage: abiEncoded + hash byte-exact', () => {
    expect(ltxInputEncodedV2(v2.singleImage.job, v2.singleImage.imageHashes)).toBe(v2.singleImage.inputCommitment.abiEncoded);
    expect(ltxInputCommitmentV2(v2.singleImage.job, v2.singleImage.imageHashes)).toBe(v2.singleImage.inputCommitment.hash);
  });

  it('dualImage: abiEncoded + hash byte-exact; image ORDER binds', () => {
    expect(ltxInputEncodedV2(v2.dualImage.job, v2.dualImage.imageHashes)).toBe(v2.dualImage.inputCommitment.abiEncoded);
    expect(ltxInputCommitmentV2(v2.dualImage.job, v2.dualImage.imageHashes)).toBe(v2.dualImage.inputCommitment.hash);
    expect(ltxInputCommitmentV2(v2.dualImage.job, v2.dualImage.orderMatters.swappedImageHashes)).toBe(v2.dualImage.orderMatters.swappedHash);
    expect(v2.dualImage.inputCommitment.hash).not.toBe(v2.dualImage.orderMatters.swappedHash);
  });
});

describe('format dispatcher — the "tidy-up" trap stays locked', () => {
  it('imageInputs=0 uses the SEVEN-field M0 path (byte-identical to deployed t2v)', () => {
    // formatGuard derives from singleImage.job (verified in the freeze packet)
    expect(ltxInputCommitmentFor(v2.singleImage.job, 0, [])).toBe(v2.formatGuard.v1SevenField);
    expect(ltxInputCommitmentFor(v2.singleImage.job, 0, [])).toBe(ltxInputCommitment(v2.singleImage.job));
    // and the M0 job still reproduces the M0 fixture through the dispatcher
    expect(ltxInputCommitmentFor(m0.job, 0, [])).toBe(m0.inputCommitment.hash);
  });

  it('8-field with EMPTY array is NOT the 7-field encoding (offset-shift trap)', () => {
    expect(ltxInputCommitmentV2(v2.singleImage.job, [])).toBe(v2.formatGuard.v2EmptyArray);
    expect(v2.formatGuard.v2EmptyArray).not.toBe(v2.formatGuard.v1SevenField);
    expect(v2.formatGuard.equal).toBe(false);
  });

  it('imageInputs>0 routes to v2 and REJECTS a count mismatch (fail-closed)', () => {
    expect(ltxInputCommitmentFor(v2.singleImage.job, 1, v2.singleImage.imageHashes)).toBe(v2.singleImage.inputCommitment.hash);
    expect(ltxInputCommitmentFor(v2.dualImage.job, 2, v2.dualImage.imageHashes)).toBe(v2.dualImage.inputCommitment.hash);
    expect(() => ltxInputCommitmentFor(v2.singleImage.job, 1, [])).toThrow(/image/i);
    expect(() => ltxInputCommitmentFor(v2.singleImage.job, 0, v2.singleImage.imageHashes)).toThrow(/image/i);
  });
});
