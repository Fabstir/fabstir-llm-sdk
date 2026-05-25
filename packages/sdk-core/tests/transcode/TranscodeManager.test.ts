// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatUnits } from 'ethers';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import type { ITranscodeManager } from '../../src/interfaces/ITranscodeManager';
import type { VideoFormat, CreateTranscodeJobParams } from '../../src/types/transcode.types';
import { tokensToUsdc, estimateTranscodeUnits, billingUnitsToTokens, computeTranscodeModelId } from '../../src/utils/transcode-utils';
import { TranscodeError } from '../../src/errors/transcode-errors';

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
// Mock USDC token address returned by the stubbed contractManager.getContractAddress('usdcToken')
const USDC_ADDRESS = '0xaaaa567890abcdef1234567890abcdef1234aaaa';
const TEST_PRICE = 5000n; // on-chain pricePerToken (base units; canonical /1000 scale)
// Two renditions (720p + 1080p) to exercise multi-rendition summing
const PRICE_FORMATS: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1280x720' },
  { id: 2, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' },
];

const TEST_FORMATS: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1920x1080' },
];

const TEST_JOB_PARAMS: CreateTranscodeJobParams = {
  hostAddress: TEST_ADDRESS,
  inputCID: 'bafyinput',
  mediaFormats: TEST_FORMATS,
  maxDuration: 3600,
  proofInterval: 100,
  chainId: 84532,
};

/** Minimal mock factories */
function mockSessionManager() {
  return { startSession: vi.fn().mockResolvedValue({ sessionId: 'sess-123', jobId: 1n }), endSession: vi.fn().mockResolvedValue(undefined), resolveModelPricePerToken: vi.fn().mockResolvedValue(TEST_PRICE) };
}
function mockStorageManager() {
  return { uploadFile: vi.fn().mockResolvedValue({ cid: 'bafyabc' }), downloadFile: vi.fn().mockResolvedValue(new Blob(['video'])), uploadJSON: vi.fn().mockResolvedValue('bafyjson') };
}
function mockContractManager() {
  return { getContract: vi.fn().mockReturnValue({ getSessionJob: vi.fn().mockResolvedValue({ status: 1, tokensClaimed: 0n }), completeSessionJob: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({ hash: '0xdef' }) }) }), getContractAddress: vi.fn().mockResolvedValue(USDC_ADDRESS) };
}
function mockEncryptionManager() {
  return { encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: '0xenc', nonceHex: '0xnonce', aadHex: '0xaad' }), decryptMessage: vi.fn().mockReturnValue('{}') };
}
function mockSigner() {
  return { getAddress: vi.fn().mockResolvedValue(TEST_ADDRESS) };
}

/** Create manager with optional dep overrides */
function createManager(overrides: { sm?: any; storage?: any; cm?: any; em?: any } = {}) {
  return new TranscodeManager(
    overrides.sm ?? mockSessionManager(), overrides.storage ?? mockStorageManager(),
    overrides.cm ?? mockContractManager(), overrides.em ?? mockEncryptionManager(),
    mockSigner() as any, 84532,
  );
}

describe('TranscodeManager', () => {
  let manager: TranscodeManager;

  beforeEach(() => { manager = createManager(); });

  it('constructor accepts required dependencies', () => {
    expect(manager).toBeInstanceOf(TranscodeManager);
  });

  it('implements ITranscodeManager interface', () => {
    const iface: ITranscodeManager = manager;
    expect(iface).toBeDefined();
  });

  describe('createTranscodeJob', () => {
    it('returns jobId and estimated cost', async () => {
      const result = await manager.createTranscodeJob(TEST_JOB_PARAMS);
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('formatSpecHash');
      expect(result).toHaveProperty('formatSpecCID');
      expect(typeof result.jobId).toBe('bigint');
    });

    it('computes modelId from mediaFormats', async () => {
      const sm = mockSessionManager();
      const mgr = createManager({ sm });
      await mgr.createTranscodeJob(TEST_JOB_PARAMS);
      expect(sm.startSession).toHaveBeenCalled();
      expect(sm.startSession.mock.calls[0][0].modelId).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('uploads format spec to storage', async () => {
      const storage = mockStorageManager();
      const mgr = createManager({ storage });
      await mgr.createTranscodeJob(TEST_JOB_PARAMS);
      expect(storage.uploadJSON).toHaveBeenCalled();
    });
  });

  describe('estimateTranscodePrice', () => {
    const DURATION = 600;

    it('sums all renditions and applies encryption by default', async () => {
      const est = await manager.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION);
      const expectedTokens = billingUnitsToTokens(estimateTranscodeUnits(DURATION, PRICE_FORMATS, true));
      expect(est.tokens).toBe(expectedTokens);
      expect(est.breakdown.renditions).toBe(PRICE_FORMATS.length);
    });

    it('returns USDC cost (base units + human-readable), not a token count', async () => {
      const est = await manager.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION);
      const expectedBase = tokensToUsdc(est.tokens, TEST_PRICE);
      expect(est.totalCostBaseUnits).toBe(expectedBase.toString());
      expect(est.totalCost).toBe(formatUnits(expectedBase, 6));
      expect(est.pricePerToken).toBe(TEST_PRICE.toString());
      // totalCost must be a real USDC figure, NOT the raw token count
      expect(est.totalCost).not.toBe(String(est.tokens));
    });

    it('defaults isEncrypted true (1.1x applied); {isEncrypted:false} drops it', async () => {
      const enc = await manager.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION);
      const plain = await manager.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION, { isEncrypted: false });
      expect(enc.breakdown.isEncrypted).toBe(true);
      expect(plain.breakdown.isEncrypted).toBe(false);
      expect(enc.tokens).toBe(billingUnitsToTokens(estimateTranscodeUnits(DURATION, PRICE_FORMATS, true)));
      expect(plain.tokens).toBe(billingUnitsToTokens(estimateTranscodeUnits(DURATION, PRICE_FORMATS, false)));
      expect(enc.tokens).toBeGreaterThan(plain.tokens);
    });

    it('defaults paymentToken to USDC via getContractAddress; resolves price for the transcode modelId', async () => {
      const sm = mockSessionManager();
      const cm = mockContractManager();
      const mgr = createManager({ sm, cm });
      const est = await mgr.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION);
      expect(cm.getContractAddress).toHaveBeenCalledWith('usdcToken');
      expect(est.paymentToken).toBe(USDC_ADDRESS);
      expect(sm.resolveModelPricePerToken).toHaveBeenCalledWith(
        TEST_ADDRESS, computeTranscodeModelId(PRICE_FORMATS), USDC_ADDRESS,
      );
    });

    it('an explicit paymentToken overrides the default (no getContractAddress call)', async () => {
      const sm = mockSessionManager();
      const cm = mockContractManager();
      const mgr = createManager({ sm, cm });
      const est = await mgr.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION, { paymentToken: TEST_ADDRESS });
      expect(cm.getContractAddress).not.toHaveBeenCalled();
      expect(est.paymentToken).toBe(TEST_ADDRESS);
      expect(sm.resolveModelPricePerToken).toHaveBeenCalledWith(
        TEST_ADDRESS, computeTranscodeModelId(PRICE_FORMATS), TEST_ADDRESS,
      );
    });

    it('uses an explicit options.modelId override instead of computeTranscodeModelId(formats)', async () => {
      const sm = mockSessionManager();
      const mgr = createManager({ sm });
      // A registered, NAMED modelId (e.g. getModelId('fabstir/transcoding-hls','480p-720p-1080p-av1'))
      const namedModelId = '0x' + 'ab'.repeat(32);
      // sanity: the override must differ from the formats-derived hash, else the test proves nothing
      expect(namedModelId).not.toBe(computeTranscodeModelId(PRICE_FORMATS));
      await mgr.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION, { modelId: namedModelId });
      expect(sm.resolveModelPricePerToken).toHaveBeenCalledWith(TEST_ADDRESS, namedModelId, USDC_ADDRESS);
    });

    it('breakdown carries { duration, units, renditions, isEncrypted }', async () => {
      const est = await manager.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION);
      expect(est.breakdown).toEqual({
        duration: DURATION,
        units: estimateTranscodeUnits(DURATION, PRICE_FORMATS, true),
        renditions: PRICE_FORMATS.length,
        isEncrypted: true,
      });
    });

    it('throws TranscodeError on a zero on-chain price (never a zero/NaN deposit)', async () => {
      const sm = mockSessionManager();
      sm.resolveModelPricePerToken.mockResolvedValue(0n);
      const mgr = createManager({ sm });
      await expect(
        mgr.estimateTranscodePrice(TEST_ADDRESS, PRICE_FORMATS, DURATION),
      ).rejects.toThrow(TranscodeError);
    });
  });

  describe('cancelTranscodeJob', () => {
    it('returns txHash', async () => {
      const result = await manager.cancelTranscodeJob(1n);
      expect(result).toHaveProperty('txHash');
    });
  });

  describe('uploadVideoForTranscode', () => {
    it('delegates to StorageManager', async () => {
      const storage = mockStorageManager();
      const mgr = createManager({ storage });
      const result = await mgr.uploadVideoForTranscode(new Blob(['video']));
      expect(result).toHaveProperty('cid');
      expect(storage.uploadFile).toHaveBeenCalled();
    });
  });

  describe('downloadTranscodedVideo', () => {
    it('delegates to StorageManager', async () => {
      const storage = mockStorageManager();
      const mgr = createManager({ storage });
      const result = await mgr.downloadTranscodedVideo('bafyoutput');
      expect(result).toBeInstanceOf(Blob);
      expect(storage.downloadFile).toHaveBeenCalled();
    });
  });

  describe('getTranscodeJobStatus', () => {
    it('returns status object', async () => {
      const result = await manager.getTranscodeJobStatus(1n);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('progress');
    });
  });

  describe('verifyTranscodeOutput', () => {
    it('returns verification result', async () => {
      const result = await manager.verifyTranscodeOutput(1n);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('verifiedGOPs');
      expect(result).toHaveProperty('failedGOPs');
    });
  });

  describe('non-MVP methods', () => {
    it('stubs throw "Not implemented"', async () => {
      const stubs = [
        () => manager.findTranscodeHosts(),
        () => manager.getHostTranscodeCapabilities(TEST_ADDRESS),
        () => manager.registerFormatSpec({} as any),
        () => manager.getFormatSpec('hash'),
        () => manager.completeTranscodeJob(1n),
        () => manager.disputeTranscodeJob(1n, 'bad', [0]),
        () => manager.getTranscodeJobHistory(TEST_ADDRESS),
        () => manager.getGOPProofs(1n),
      ];
      for (const stub of stubs) {
        await expect(stub()).rejects.toThrow('Not implemented');
      }
    });
  });
});
