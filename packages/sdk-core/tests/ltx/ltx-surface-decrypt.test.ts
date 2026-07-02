// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Sub-phase 4.2 (Linchpin B): StorageManager.downloadDecryptedByCID / getRawBytes + LtxManager.downloadFrames.
import { describe, it, expect, vi } from 'vitest';
import { keccak256 } from 'ethers';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import capability from './capability-fixture.json';
import { StorageManager } from '../../src/managers/StorageManager';
import { LtxManager } from '../../src/managers/LtxManager';

const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

// Stand-in for s5js downloadAndDecryptBlob: real 256 KiB-chunk XChaCha20-Poly1305 (mirrors fs5.js:684).
function s5DownloadAndDecrypt(ct: Uint8Array, key: Uint8Array, size: number): Uint8Array {
  const CHUNK = 262144, TAG = 16;
  const chunkCount = Math.ceil(size / CHUNK);
  const parts: Uint8Array[] = []; let off = 0;
  for (let i = 0; i < chunkCount; i++) {
    const len = i < chunkCount - 1 ? CHUNK + TAG : ct.length - off;
    const ctChunk = ct.slice(off, off + len); off += len;
    const nonce = new Uint8Array(24); let n = i, b = 0; while (n > 0) { nonce[b++] = n & 0xff; n = Math.floor(n / 256); }
    parts.push(xchacha20poly1305(key, nonce).decrypt(ctChunk));
  }
  const combined = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { combined.set(p, o); o += p.length; }
  return combined.slice(0, size);
}

describe('StorageManager.downloadDecryptedByCID (Constraint 5, Linchpin B)', () => {
  it('parses the 0xae envelope and decrypts the real fixture frame byte-for-byte', async () => {
    const ct = b64(capability.ciphertextBase64);
    const expectedPt = b64(capability.plaintextBase64);
    const seen: any = {};
    const sm = new StorageManager();
    // downloadAndDecryptBlob lives on the FS5 sub-object (s5.fs), NOT the S5 root — mirror the real shape.
    (sm as any).s5Client = {
      fs: {
        downloadAndDecryptBlob: (hash: Uint8Array, key: Uint8Array, size: number) => {
          seen.hash = hash; seen.key = key; seen.size = size;
          return s5DownloadAndDecrypt(ct, key, size); // uses the PARSED key + size
        },
      },
    };
    const pt = await sm.downloadDecryptedByCID(capability.capabilityCid);
    expect(pt.length).toBe(expectedPt.length);
    expect(Buffer.from(pt).equals(Buffer.from(expectedPt))).toBe(true);
    // the parse extracted the right envelope fields
    expect(seen.size).toBe(capability.envelope.size);
    expect('0x' + Buffer.from(seen.hash).toString('hex')).toBe(capability.envelope.blobHashBlake3OfCiphertext);
    expect('0x' + Buffer.from(seen.key).toString('hex')).toBe(capability.envelope.key);
    // leaf binding is keccak256(ciphertext), NOT blake3 (the embedded fetch hash)
    expect(keccak256(ct)).toBe(capability.frameHashKeccak256OfCiphertext);
  });

  it('throws on a non-u-prefix or non-0xae CID (no fallback)', async () => {
    const sm = new StorageManager();
    (sm as any).s5Client = { fs: { downloadAndDecryptBlob: () => new Uint8Array() } };
    await expect(sm.downloadDecryptedByCID('bNotEncrypted')).rejects.toThrow();
    await expect(sm.downloadDecryptedByCID('u' + Buffer.from([0x26, 0x1f, 0, 0]).toString('base64url'))).rejects.toThrow();
  });

  it('throws on a 0xae CID with a truncated body — no silent size=0/empty frame', async () => {
    const sm = new StorageManager();
    (sm as any).s5Client = { fs: { downloadAndDecryptBlob: () => new Uint8Array() } };
    const shortBody = new Uint8Array(40); shortBody[0] = 0xae; shortBody[2] = 0x12; // valid magic, far too short
    const shortCid = 'u' + Buffer.from(shortBody).toString('base64url');
    await expect(sm.downloadDecryptedByCID(shortCid)).rejects.toThrow(/too short/);
  });

  it('getRawBytes returns raw downloadByCID bytes (no decode)', async () => {
    const raw = new Uint8Array([1, 2, 3, 4]);
    const sm = new StorageManager();
    (sm as any).s5Client = { downloadByCID: vi.fn(async () => raw) };
    expect(await sm.getRawBytes('bProof')).toBe(raw);
  });
});

describe('LtxManager.downloadFrames (surface, index-aligned)', () => {
  it('decrypts frames index-aligned; count === manifest.frameCount', async () => {
    const downloadDecryptedByCID = vi.fn(async (cid: string) => new Uint8Array([cid === 'uF0' ? 0 : 1]));
    const manager = new LtxManager({ storageManager: { downloadDecryptedByCID }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
    const result: any = { frames: ['uF0', 'uF1'], manifest: { frameCount: 2, frameHashes: ['0xaa', '0xbb'] } };
    const frames = await manager.downloadFrames(result);
    expect(frames.length).toBe(2);
    expect(frames[0][0]).toBe(0);
    expect(frames[1][0]).toBe(1);
    expect(downloadDecryptedByCID).toHaveBeenCalledWith('uF0');
  });

  it('throws when frame count does not match the manifest (integrity)', async () => {
    const downloadDecryptedByCID = vi.fn(async () => new Uint8Array([0]));
    const manager = new LtxManager({ storageManager: { downloadDecryptedByCID }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
    const result: any = { frames: ['uF0'], manifest: { frameCount: 2, frameHashes: ['0xaa', '0xbb'] } };
    await expect(manager.downloadFrames(result)).rejects.toBeInstanceOf(Error);
  });
});
