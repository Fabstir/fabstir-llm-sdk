import { describe, it, expect } from 'vitest';
import { keccak256, getBytes, concat } from 'ethers';
import { computeMerkleRoot, verifyMerkleProof, parseGopProof } from '../../src/utils/transcode-proof';

describe('computeMerkleRoot', () => {
  it('of empty array returns 32 zero bytes', () => {
    const root = computeMerkleRoot([]);
    expect(root).toEqual(new Uint8Array(32));
    expect(root.length).toBe(32);
  });

  it('of single leaf returns the leaf', () => {
    const leaf = getBytes(keccak256(new Uint8Array([1, 2, 3])));
    expect(computeMerkleRoot([leaf])).toEqual(new Uint8Array(leaf));
  });

  it('of two leaves returns keccak256(left + right)', () => {
    const leaf0 = getBytes(keccak256(new Uint8Array([1, 2, 3])));
    const leaf1 = getBytes(keccak256(new Uint8Array([4, 5, 6])));
    const expected = getBytes(keccak256(concat([leaf0, leaf1])));
    expect(computeMerkleRoot([leaf0, leaf1])).toEqual(new Uint8Array(expected));
  });

  it('of three leaves pads with duplicate', () => {
    const leaf0 = getBytes(keccak256(new Uint8Array([1, 2, 3])));
    const leaf1 = getBytes(keccak256(new Uint8Array([4, 5, 6])));
    const leaf2 = getBytes(keccak256(new Uint8Array([7, 8, 9])));
    const left = getBytes(keccak256(concat([leaf0, leaf1])));
    const right = getBytes(keccak256(concat([leaf2, leaf2])));
    const expected = getBytes(keccak256(concat([left, right])));
    expect(computeMerkleRoot([leaf0, leaf1, leaf2])).toEqual(new Uint8Array(expected));
  });

  it('is deterministic', () => {
    const leaf0 = getBytes(keccak256(new Uint8Array([10, 20])));
    const leaf1 = getBytes(keccak256(new Uint8Array([30, 40])));
    expect(computeMerkleRoot([leaf0, leaf1])).toEqual(computeMerkleRoot([leaf0, leaf1]));
  });
});

describe('verifyMerkleProof', () => {
  function build4LeafTree() {
    const leaves = [1, 2, 3, 4].map((n) => getBytes(keccak256(new Uint8Array([n]))));
    const n01 = getBytes(keccak256(concat([leaves[0], leaves[1]])));
    const n23 = getBytes(keccak256(concat([leaves[2], leaves[3]])));
    const root = getBytes(keccak256(concat([n01, n23])));
    return { leaves, n01, n23, root };
  }

  it('returns true for valid proof', () => {
    const { leaves, root, n23 } = build4LeafTree();
    const proof = [new Uint8Array(leaves[1]), new Uint8Array(n23)];
    expect(verifyMerkleProof(leaves[0], proof, 0, root)).toBe(true);
  });

  it('returns false for tampered leaf', () => {
    const { leaves, root, n23 } = build4LeafTree();
    const tampered = getBytes(keccak256(new Uint8Array([99])));
    const proof = [new Uint8Array(leaves[1]), new Uint8Array(n23)];
    expect(verifyMerkleProof(tampered, proof, 0, root)).toBe(false);
  });

  it('handles left and right positions', () => {
    const { leaves, root, n23 } = build4LeafTree();
    // Index 1 is odd: sibling (leaves[0]) goes on the left
    const proof = [new Uint8Array(leaves[0]), new Uint8Array(n23)];
    expect(verifyMerkleProof(leaves[1], proof, 1, root)).toBe(true);
  });
});

describe('parseGopProof', () => {
  function buildProofBytes(json: Record<string, unknown>, stark: Uint8Array): Uint8Array {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const buf = new ArrayBuffer(4 + jsonBytes.length + stark.length);
    new DataView(buf).setUint32(0, jsonBytes.length, false); // big-endian
    const out = new Uint8Array(buf);
    out.set(jsonBytes, 4);
    out.set(stark, 4 + jsonBytes.length);
    return out;
  }

  const sampleJson = {
    gop_index: 0, input_gop_hash: '0xaabbccdd', output_gop_hash: '0x11223344',
    psnr_db: 42.3, ssim: 0.96, actual_bitrate: 4850, stark_proof_hash: '0xdeadbeef',
  };

  it('extracts JSON metadata and STARK proof bytes', () => {
    const stark = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
    const { metadata, starkProof } = parseGopProof(buildProofBytes(sampleJson, stark));
    expect(metadata.gopIndex).toBe(0);
    expect(metadata.inputGOPHash).toBe('0xaabbccdd');
    expect(metadata.outputGOPHash).toBe('0x11223344');
    expect(metadata.psnrDB).toBe(42.3);
    expect(metadata.ssim).toBe(0.96);
    expect(metadata.actualBitrate).toBe(4850);
    expect(metadata.starkProofHash).toBe('0xdeadbeef');
    expect(starkProof).toEqual(stark);
  });

  it('handles big-endian u32 length prefix', () => {
    const stark = new Uint8Array([0xff]);
    const proofBytes = buildProofBytes(sampleJson, stark);
    const view = new DataView(proofBytes.buffer, proofBytes.byteOffset, proofBytes.byteLength);
    const encodedLen = view.getUint32(0, false);
    expect(encodedLen).toBe(new TextEncoder().encode(JSON.stringify(sampleJson)).length);
    const { metadata, starkProof } = parseGopProof(proofBytes);
    expect(metadata.gopIndex).toBe(0);
    expect(starkProof).toEqual(new Uint8Array([0xff]));
  });
});
