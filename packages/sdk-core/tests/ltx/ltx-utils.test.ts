// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 1.1 conformance: inputCommitment + megapixel-frame token formula.
// Oracle: tests/ltx/vectors.json (node-generated; do not hand-edit).
import { describe, it, expect } from 'vitest';
import { keccak256 } from 'ethers';
import vectors from './vectors.json';
import { ltxInputCommitment, ltxInputEncoded, ltxTokens } from '../../src/utils/ltx-utils';

describe('ltx-utils: inputCommitment (Constraint 1, 9)', () => {
  it('abi-encodes the job to vectors.inputCommitment.abiEncoded (encoder localisation)', () => {
    expect(ltxInputEncoded(vectors.job)).toBe(vectors.inputCommitment.abiEncoded);
  });

  it('keccak256 of the encoding === inputCommitment.hash === attestation.inputCommitment', () => {
    const hash = ltxInputCommitment(vectors.job);
    expect(hash).toBe(vectors.inputCommitment.hash);
    expect(hash).toBe(vectors.attestation.inputCommitment);
    // hasher localisation: hash is exactly keccak256 of the encoded bytes
    expect(hash).toBe(keccak256(ltxInputEncoded(vectors.job)));
  });

  it('encodes seed as uint256 from the decimal string ("007" === "7")', () => {
    const a = ltxInputCommitment({ ...vectors.job, seed: '7' });
    const b = ltxInputCommitment({ ...vectors.job, seed: '007' });
    expect(a).toBe(b);
  });

  it('handles a large seed above 2^53 without float64 loss', () => {
    const big = '9007199254740993'; // 2^53 + 1
    const commit = ltxInputCommitment({ ...vectors.job, seed: big });
    // a one-off change in the seed must change the commitment
    expect(commit).not.toBe(ltxInputCommitment({ ...vectors.job, seed: '9007199254740992' }));
  });
});

describe('ltx-utils: megapixel-frame token formula (Constraint 6)', () => {
  it('ltxTokens(vectors.job) === vectors.tokens.value (111514)', () => {
    expect(ltxTokens(vectors.job)).toBe(vectors.tokens.value);
    expect(ltxTokens(vectors.job)).toBe(111514);
  });

  it('is ceil(frames*w*h/1000) in bigint (exact, integer)', () => {
    // 121 * 1280 * 720 = 111513600 -> +999 -> /1000 = 111514
    expect(ltxTokens({ frames: 121, resolution: { w: 1280, h: 720 } })).toBe(111514);
    // 1 * 1000 * 1000 = 1000000 -> exactly 1000 (no rounding)
    expect(ltxTokens({ frames: 1, resolution: { w: 1000, h: 1000 } })).toBe(1000);
    // 1 * 1 * 1 = 1 -> ceil(1/1000) = 1
    expect(ltxTokens({ frames: 1, resolution: { w: 1, h: 1 } })).toBe(1);
  });

  it('a realistic tiny clip still clears MIN_PROVEN_TOKENS (100)', () => {
    // 1 frame @ 1280x720 = 921600 -> 922 tokens
    expect(ltxTokens({ frames: 1, resolution: { w: 1280, h: 720 } })).toBe(922);
    expect(ltxTokens({ frames: 1, resolution: { w: 1280, h: 720 } })).toBeGreaterThanOrEqual(100);
  });
});
