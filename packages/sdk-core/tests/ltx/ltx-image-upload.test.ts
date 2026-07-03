// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M1a SP-D: StorageManager.uploadEncryptedBlob — encrypt+upload via s5js, rebuild the 0xae
// capability CID s5js computes but drops. Oracle: capability-fixture.json (real node envelope).
import { describe, it, expect, vi } from 'vitest';
import { getBytes } from 'ethers';
import capability from './capability-fixture.json';
import { StorageManager } from '../../src/managers/StorageManager';

const fixtureUploadResult = {
  // exactly what s5js uploadBlobEncrypted returns, populated from the fixture's envelope fields
  hash: getBytes(capability.envelope.ptHashBlake3OfPlaintext),
  size: capability.envelope.size,
  encryptionKey: getBytes(capability.envelope.key),
  encryptedBlobHash: getBytes(capability.envelope.blobHashBlake3OfCiphertext),
  padding: capability.envelope.padding,
};

describe('StorageManager.uploadEncryptedBlob (SP-D)', () => {
  it('rebuilds the EXACT fixture capability CID from s5js upload results (byte-exact oracle)', async () => {
    const sm = new StorageManager();
    (sm as any).s5Client = { fs: { uploadBlobEncrypted: vi.fn(async () => fixtureUploadResult) } };
    const cid = await sm.uploadEncryptedBlob(new Uint8Array([1, 2, 3]));
    expect(cid).toBe(capability.capabilityCid);
  });

  it('round-trips: the CID it builds is accepted by downloadDecryptedByCID with the SAME fields', async () => {
    const seen: any = {};
    const sm = new StorageManager();
    (sm as any).s5Client = {
      fs: {
        uploadBlobEncrypted: vi.fn(async () => fixtureUploadResult),
        downloadAndDecryptBlob: vi.fn(async (hash: Uint8Array, key: Uint8Array, size: number) => {
          seen.hash = hash; seen.key = key; seen.size = size;
          return new Uint8Array([9, 9, 9]);
        },
        ),
      },
    };
    const cid = await sm.uploadEncryptedBlob(new Uint8Array([1, 2, 3]));
    await sm.downloadDecryptedByCID(cid);
    expect(Buffer.from(seen.hash)).toEqual(Buffer.from(fixtureUploadResult.encryptedBlobHash));
    expect(Buffer.from(seen.key)).toEqual(Buffer.from(fixtureUploadResult.encryptionKey));
    expect(seen.size).toBe(capability.envelope.size);
  });

  it('throws without an S5 client (no fallback)', async () => {
    const sm = new StorageManager();
    await expect(sm.uploadEncryptedBlob(new Uint8Array([1]))).rejects.toThrow(/S5/i);
  });
});

describe('LtxManager.uploadImages (SP-E)', async () => {
  const { LtxManager } = await import('../../src/managers/LtxManager');
  const { ltxImageHash, canonicalBundleHash } = await import('../../src/utils/ltx-utils');
  const bundleV2 = (await import('./bundle-fixture-v2.json')).default as any;
  const metaV2 = { allowListVersion: 2, bundleHash: bundleV2.bundleHash, bundleCID: 'bBundleV2' };

  function makeManager() {
    let n = 0;
    const uploadEncryptedBlob = vi.fn(async () => `uCap${n++}`);
    const getByCID = vi.fn(async () => bundleV2);
    const manager = new LtxManager({ storageManager: { uploadEncryptedBlob, getByCID }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
    return { manager, uploadEncryptedBlob };
  }

  it('uploads each image and returns cids + keccak plaintext hashes (order preserved)', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([4, 5, 6]);
    const r = await manager.uploadImages([a, b], metaV2);
    expect(r.cids).toEqual(['uCap0', 'uCap1']);
    expect(r.hashes).toEqual([ltxImageHash(a), ltxImageHash(b)]);
    expect(uploadEncryptedBlob).toHaveBeenCalledTimes(2);
  });

  it('rejects an image over bounds.imageMaxBytes BEFORE uploading (fail-closed)', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    const big = new Uint8Array(bundleV2.bounds.imageMaxBytes + 1);
    await expect(manager.uploadImages([big], metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(uploadEncryptedBlob).not.toHaveBeenCalled();
  });

  it('rejects an exact 256 KiB-multiple plaintext (chunk scheme cannot represent it) — even without metadata', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    await expect(manager.uploadImages([new Uint8Array(262144)])).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(manager.uploadImages([new Uint8Array(262144 * 2)], metaV2)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(manager.uploadImages([new Uint8Array(0)])).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(uploadEncryptedBlob).not.toHaveBeenCalled();
    // one byte either side is fine
    await expect(manager.uploadImages([new Uint8Array(262143)])).resolves.toBeTruthy();
    await expect(manager.uploadImages([new Uint8Array(262145)])).resolves.toBeTruthy();
  });

  it('verifyAttestation reuses the upload-time hash cache (no refetch of own uploads)', async () => {
    const { manager } = makeManager();
    const img = new Uint8Array([7, 7, 7]);
    const { cids, hashes } = await manager.uploadImages([img], metaV2);
    // storage has NO downloadDecryptedByCID — verify must succeed via the cache
    const { ltxInputCommitmentFor } = await import('../../src/utils/ltx-utils');
    const v2 = (await import('./vectors-i2v.json')).default as any;
    const job = { ...v2.singleImage.job, images: cids };
    const att = { ...((await import('./vectors.json')).default as any).attestation, inputCommitment: ltxInputCommitmentFor(job, 1, hashes), templateHash: job.templateHash, signature: undefined };
    (manager as any).storageManager.getByCID = vi.fn(async () => att);
    (manager as any).storageManager.getRawBytes = vi.fn(async () => new Uint8Array([0]));
    const m0 = (await import('./vectors.json')).default as any;
    const result: any = { outputCID: 'b', proofCID: 'bP', manifest: m0.attestation.manifest, frames: [], billing: { unit: 'megapixel-frame', tokens: 1 } };
    const v = await manager.verifyAttestation(job, result);
    expect(v.inputBinding).toBe(true);
  });
});
