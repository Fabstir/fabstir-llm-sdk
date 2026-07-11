// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// BL3 IC-LoRA: inputCommitment v3 (video-input templates) + the v1/v2/v3 dispatcher.
// Oracle: tests/ltx/vectors-iclora.json (node-generated; do not hand-edit).
import { describe, it, expect } from 'vitest';
import { getBytes } from 'ethers';
import v3 from './vectors-iclora.json';
import v2 from './vectors-i2v.json';
import {
  ltxImageHash,
  ltxVideoHash,
  ltxInputEncodedV3,
  ltxInputCommitmentV3,
  ltxInputCommitmentV2,
  ltxInputCommitmentFor,
} from '../../src/utils/ltx-utils';

const rc = v3.referencePlusControl;

describe('ltxVideoHash = keccak256(plaintext bytes)', () => {
  it('reproduces every fixture video hash (same rule as image hash)', () => {
    rc.videoPlaintext.forEach((p: any, i: number) => {
      expect(ltxVideoHash(getBytes(p.hex))).toBe(rc.videoHashes[i]);
    });
    rc.imagePlaintext.forEach((p: any, i: number) => {
      expect(ltxImageHash(getBytes(p.hex))).toBe(rc.imageHashes[i]);
    });
  });
});

describe('inputCommitment v3 (9-field: 7 + bytes32[] imageHashes + bytes32[] videoHashes)', () => {
  it('referencePlusControl: abiEncoded + hash byte-exact', () => {
    expect(ltxInputEncodedV3(rc.job, rc.imageHashes, rc.videoHashes)).toBe(rc.inputCommitment.abiEncoded);
    expect(ltxInputCommitmentV3(rc.job, rc.imageHashes, rc.videoHashes)).toBe(rc.inputCommitment.hash);
  });

  it('array slots are distinct — swapping image and video hashes changes the commitment', () => {
    // bind the video hash in the image slot and vice versa
    expect(ltxInputCommitmentV3(rc.job, rc.videoHashes, rc.imageHashes)).toBe(v3.arraySlotGuard.swappedHash);
    expect(v3.arraySlotGuard.swappedHash).not.toBe(rc.inputCommitment.hash);
  });
});

describe('format dispatcher — v3 is NOT "v2 with an empty trailing array"', () => {
  it('v3 with EMPTY videoHashes is not byte-equal to the v2 eight-field (offset-shift trap)', () => {
    expect(ltxInputCommitmentV3(rc.job, rc.imageHashes, [])).toBe(v3.formatGuard.v3EmptyVideos);
    expect(ltxInputCommitmentV2(rc.job, rc.imageHashes)).toBe(v3.formatGuard.v2EightField);
    expect(v3.formatGuard.v3EmptyVideos).not.toBe(v3.formatGuard.v2EightField);
    expect(v3.formatGuard.equal).toBe(false);
  });

  it('videoInputs>0 routes to v3; the earlier image/t2v paths are unaffected', () => {
    // v3 path (iclora: 1 image + 1 video)
    expect(ltxInputCommitmentFor(rc.job, rc.imageInputs, rc.imageHashes, rc.videoInputs, rc.videoHashes))
      .toBe(rc.inputCommitment.hash);
    // v2 path still selected when videoInputs=0 (i2v single-image vector)
    expect(ltxInputCommitmentFor(v2.singleImage.job, 1, v2.singleImage.imageHashes, 0, []))
      .toBe(v2.singleImage.inputCommitment.hash);
  });

  it('fail-closed: wrong video count, and a no-video template routed through v3, both throw', () => {
    expect(() => ltxInputCommitmentFor(rc.job, 1, rc.imageHashes, 1, [])).toThrow(/video/i);
    expect(() => ltxInputCommitmentFor(rc.job, 1, rc.imageHashes, 0, rc.videoHashes)).toThrow(/video/i);
    // v3 also enforces the image count
    expect(() => ltxInputCommitmentFor(rc.job, 1, [], 1, rc.videoHashes)).toThrow(/image/i);
  });
});
