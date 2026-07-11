// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// BL3: LtxManager.uploadVideos — encrypt+upload control videos to S5, mirror of uploadImages.
import { describe, it, expect, vi } from 'vitest';

describe('LtxManager.uploadVideos (BL3, IC-LoRA)', async () => {
  const { LtxManager } = await import('../../src/managers/LtxManager');
  const { ltxVideoHash } = await import('../../src/utils/ltx-utils');
  const bundleV6 = (await import('./bundle-fixture-v6.json')).default as any;
  const metaV6 = { allowListVersion: 6, bundleHash: bundleV6.bundleHash, bundleCID: 'bBundleV6' };

  // minimal valid mp4 head: 4 size bytes + 'ftyp' box tag at offset 4
  const mp4 = (n: number) => { const b = new Uint8Array(n); b[4] = 0x66; b[5] = 0x74; b[6] = 0x79; b[7] = 0x70; return b; };

  function makeManager() {
    let n = 0;
    const uploadEncryptedBlob = vi.fn(async () => `uVid${n++}`);
    const getByCID = vi.fn(async () => bundleV6);
    const manager = new LtxManager({ storageManager: { uploadEncryptedBlob, getByCID }, ltxModelId: '0x01', usdcAddress: '0xabc' } as any);
    return { manager, uploadEncryptedBlob };
  }

  it('uploads each video and returns cids + keccak plaintext hashes (order preserved)', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    const a = mp4(1000), b = mp4(2000);
    const r = await manager.uploadVideos([a, b], metaV6);
    expect(r.cids).toEqual(['uVid0', 'uVid1']);
    expect(r.hashes).toEqual([ltxVideoHash(a), ltxVideoHash(b)]);
    expect(uploadEncryptedBlob).toHaveBeenCalledTimes(2);
  });

  it('rejects a video over bounds.videoMaxBytes BEFORE uploading (fail-closed)', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    const big = mp4(bundleV6.bounds.videoMaxBytes + 1);
    await expect(manager.uploadVideos([big], metaV6)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(uploadEncryptedBlob).not.toHaveBeenCalled();
  });

  it('rejects a non-mp4 (no ftyp box) when the bundle constrains videoFormats to mp4', async () => {
    const { manager, uploadEncryptedBlob } = makeManager();
    const notMp4 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2]); // PNG-ish magic, no ftyp
    await expect(manager.uploadVideos([notMp4], metaV6)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    expect(uploadEncryptedBlob).not.toHaveBeenCalled();
  });

  it('rejects an exact 256 KiB-multiple / empty plaintext even without metadata; ±1 byte is fine', async () => {
    const { manager } = makeManager();
    await expect(manager.uploadVideos([mp4(262144)])).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(manager.uploadVideos([new Uint8Array(0)])).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
    await expect(manager.uploadVideos([mp4(262145)])).resolves.toBeTruthy(); // no metadata → format not checked
  });

  it('verifyAttestation reuses the upload-time video-hash cache (no refetch of own uploads)', async () => {
    const { manager } = makeManager();
    const { ltxInputCommitmentFor } = await import('../../src/utils/ltx-utils');
    const v3 = (await import('./vectors-iclora.json')).default as any;
    const img = mp4(500), vid = mp4(600);
    const { cids: imgCids, hashes: imgHashes } = await manager.uploadImages([img], metaV6);
    const { cids: vidCids, hashes: vidHashes } = await manager.uploadVideos([vid], metaV6);
    const job = { ...v3.referencePlusControl.job, images: imgCids, videos: vidCids };
    const att = {
      ...((await import('./vectors.json')).default as any).attestation,
      inputCommitment: ltxInputCommitmentFor(job, 1, imgHashes, 1, vidHashes),
      templateHash: job.templateHash, signature: undefined,
    };
    (manager as any).storageManager.getByCID = vi.fn(async () => att); // no downloadDecryptedByCID → must use the cache
    const m0 = (await import('./vectors.json')).default as any;
    const result: any = { outputCID: 'b', proofCID: 'bP', manifest: m0.attestation.manifest, frames: [], billing: { unit: 'megapixel-frame', tokens: 1 } };
    const v = await manager.verifyAttestation(job, result);
    expect(v.inputBinding).toBe(true);
  });
});
