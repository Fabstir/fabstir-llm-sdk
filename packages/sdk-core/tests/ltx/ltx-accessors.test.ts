// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// BL1 helper surface: getLtxBundleMetadata (on-chain bundle discovery + drift recovery) and
// downloadOutputVideo (the single playable container, or a clear "encode the sequence" signal).
import { describe, it, expect, vi } from 'vitest';
import { LtxManager } from '../../src/managers/LtxManager';

const HOST = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
const LTX_BLOCK = {
  allowListVersion: 5,
  bundleHash: '0xc6f1091dc3d4fbae2a757db1a43141443e593107b697ff895c52f3ee712664b7',
  bundleCID: 'blobb4tan427epwkk5rdmgrs2ggwsqkpa2woeemsipktw7236oq2ofupxayda',
};

function makeManager(over: { hostInfo?: any; frameBytes?: Uint8Array } = {}) {
  const getHostInfo = vi.fn(async () => over.hostInfo ?? { address: HOST, metadata: { ltx: LTX_BLOCK } });
  const downloadDecryptedByCID = vi.fn(async () => over.frameBytes ?? new Uint8Array([0x66, 0x74, 0x79, 0x70]));
  const manager = new LtxManager({
    hostManager: { getHostInfo },
    storageManager: { downloadDecryptedByCID },
    ltxModelId: '0x01', usdcAddress: '0xabc', chainId: 84532,
  } as any);
  return { manager, getHostInfo, downloadDecryptedByCID };
}

describe('LtxManager.getLtxBundleMetadata (on-chain bundle discovery)', () => {
  it('reads the host\'s published metadata.ltx block into LtxBundleMetadata', async () => {
    const { manager, getHostInfo } = makeManager();
    const meta = await manager.getLtxBundleMetadata(HOST);
    expect(getHostInfo).toHaveBeenCalledWith(HOST);
    expect(meta).toEqual({
      allowListVersion: 5,
      bundleHash: LTX_BLOCK.bundleHash,
      bundleCID: LTX_BLOCK.bundleCID,
    });
  });

  it('throws LTX_PREVALIDATION_FAILED when the host advertises no LTX bundle (metadata.ltx absent)', async () => {
    const { manager } = makeManager({ hostInfo: { address: HOST, metadata: { hardware: { gpu: 'L40S' } } } });
    await expect(manager.getLtxBundleMetadata(HOST)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });

  it('throws when the ltx block is malformed (missing bundleHash/CID)', async () => {
    const { manager } = makeManager({ hostInfo: { address: HOST, metadata: { ltx: { allowListVersion: 5 } } } });
    await expect(manager.getLtxBundleMetadata(HOST)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });
});

describe('LtxManager.downloadOutputVideo (single playable container)', () => {
  const singleFile = (over: Record<string, unknown> = {}) => ({
    outputCID: 'bOut', proofCID: 'bProof', frames: ['uMp4'],
    manifest: { frameCount: 1, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'h264', frameHashes: ['0xaa'], merkleRoot: '0x' },
    billing: { unit: 'megapixel-frame', tokens: 1 }, ...over,
  });

  it('decrypts the single container (frameCount === 1) to bytes', async () => {
    const bytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    const { manager, downloadDecryptedByCID } = makeManager({ frameBytes: bytes });
    const out = await manager.downloadOutputVideo(singleFile() as any);
    expect(downloadDecryptedByCID).toHaveBeenCalledWith('uMp4');
    expect(out).toBe(bytes);
  });

  it('throws a clear "encode the sequence" error when the output is an N-frame sequence', async () => {
    const { manager } = makeManager();
    const seq = singleFile({
      frames: ['u0', 'u1', 'u2'],
      manifest: { frameCount: 3, fps: 24, resolution: { w: 1280, h: 720 }, colourEncoding: 'exr', frameHashes: ['0xa', '0xb', '0xc'], merkleRoot: '0x' },
    });
    await expect(manager.downloadOutputVideo(seq as any)).rejects.toMatchObject({ code: 'LTX_PREVALIDATION_FAILED' });
  });
});
