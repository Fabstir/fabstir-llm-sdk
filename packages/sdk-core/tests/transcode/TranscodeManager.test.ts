// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import type { ITranscodeManager } from '../../src/interfaces/ITranscodeManager';
import type { VideoFormat, CreateTranscodeJobParams } from '../../src/types/transcode.types';

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

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
  return { startSession: vi.fn().mockResolvedValue({ sessionId: 'sess-123', jobId: 1n }), endSession: vi.fn().mockResolvedValue(undefined) };
}
function mockStorageManager() {
  return { uploadFile: vi.fn().mockResolvedValue({ cid: 'bafyabc' }), downloadFile: vi.fn().mockResolvedValue(new Blob(['video'])), uploadJSON: vi.fn().mockResolvedValue('bafyjson') };
}
function mockContractManager() {
  return { getContract: vi.fn().mockReturnValue({ getSessionJob: vi.fn().mockResolvedValue({ status: 1, tokensClaimed: 0n }), completeSessionJob: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({ hash: '0xdef' }) }) }) };
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
    it('returns price estimate with breakdown', async () => {
      const formatSpec = {
        version: '1.0.0' as const,
        input: { cid: 'bafyinput' },
        output: {
          video: { codec: 'h264' as const, resolution: { width: 1920, height: 1080 }, frameRate: 30, bitrate: { target: 5000 } },
          audio: { codec: 'aac' as const, sampleRate: 48000, channels: 2 },
          container: 'mp4' as const,
        },
        quality: { tier: 'standard' as const },
        gop: { size: 60, structure: 'IBBPBBP' },
        proof: { strategy: 'per_gop' as any, requireQualityMetrics: true },
      };
      const estimate = await manager.estimateTranscodePrice(TEST_ADDRESS, formatSpec, 600);
      expect(estimate).toHaveProperty('totalCost');
      expect(estimate).toHaveProperty('breakdown');
      expect(estimate.breakdown).toHaveProperty('duration', 600);
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
