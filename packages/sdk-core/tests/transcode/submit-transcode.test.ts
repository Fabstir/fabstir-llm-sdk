// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import type { VideoFormat, TranscodeHandle } from '../../src/types/transcode.types';

// Mock submitTranscodeWs to capture calls without needing a real WebSocket
vi.mock('../../src/utils/transcode-ws', () => ({
  submitTranscodeWs: vi.fn(),
}));

import { submitTranscodeWs } from '../../src/utils/transcode-ws';
const mockSubmitTranscodeWs = vi.mocked(submitTranscodeWs);

const TEST_SESSION_ID = 'sess-transcode-1';
const TEST_FORMATS: VideoFormat[] = [
  { id: 1, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: 'scale=1920x1080', b_v: '5M', ar: '48k', ch: 2, dest: 's5' },
];

function createSessionManager(): SessionManager {
  const pm = { depositNative: vi.fn() } as any;
  const sm = { uploadJSON: vi.fn() } as any;
  return new SessionManager(pm, sm);
}

function injectSession(mgr: SessionManager, sessionId: string, overrides: Record<string, unknown> = {}): void {
  const session = {
    sessionId: 1n, jobId: 42n, chainId: 84532, model: '0xabc', provider: '0xhost',
    endpoint: 'http://localhost:8083', status: 'active', prompts: [], responses: [],
    checkpoints: [], totalTokens: 0, startTime: Date.now(), ...overrides,
  };
  (mgr as any).sessions.set(sessionId, session);
}

function injectEncryptionAndWs(mgr: SessionManager): void {
  (mgr as any).encryptionManager = {
    encryptMessage: vi.fn().mockReturnValue({ ciphertextHex: '0xenc', nonceHex: '0xnonce', aadHex: '0xaad' }),
    decryptMessage: vi.fn().mockReturnValue('{}'),
  };
  // Pre-inject wsClient and sessionKey so submitTranscode skips WS init
  (mgr as any).wsClient = { isConnected: () => true, sendWithoutResponse: vi.fn(), onMessage: vi.fn(() => () => {}) };
  (mgr as any).wsSessionId = TEST_SESSION_ID;
  (mgr as any).sessionKey = new Uint8Array(32);
  (mgr as any).messageIndex = 5;
}

const MOCK_HANDLE: TranscodeHandle = {
  taskId: 'task-abc',
  cancel: vi.fn(),
  result: Promise.resolve({ outputCids: ['bafyout'], billing: { totalUnits: 100, totalTokens: 1000 }, durationMs: 5000, qualityMetrics: null, proofTree: null }),
};

describe('SessionManager.submitTranscode', () => {
  let mgr: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mgr = createSessionManager();
    mockSubmitTranscodeWs.mockResolvedValue(MOCK_HANDLE);
  });

  it('throws SESSION_NOT_FOUND for invalid sessionId', async () => {
    injectEncryptionAndWs(mgr);
    await expect(mgr.submitTranscode('nonexistent', 'bafysrc', TEST_FORMATS))
      .rejects.toThrow('Session not found');
  });

  it('throws SESSION_NOT_ACTIVE for non-active session', async () => {
    injectSession(mgr, TEST_SESSION_ID, { status: 'completed' });
    injectEncryptionAndWs(mgr);
    await expect(mgr.submitTranscode(TEST_SESSION_ID, 'bafysrc', TEST_FORMATS))
      .rejects.toThrow('Session is not active');
  });

  it('calls submitTranscodeWs with correct parameters', async () => {
    injectSession(mgr, TEST_SESSION_ID);
    injectEncryptionAndWs(mgr);
    await mgr.submitTranscode(TEST_SESSION_ID, 'bafysrc', TEST_FORMATS, { isGpu: true });
    expect(mockSubmitTranscodeWs).toHaveBeenCalledOnce();
    const opts = mockSubmitTranscodeWs.mock.calls[0][0];
    expect(opts.sourceCid).toBe('bafysrc');
    expect(opts.formats).toBe(TEST_FORMATS);
    expect(opts.isGpu).toBe(true);
    expect(opts.sessionId).toBe(TEST_SESSION_ID);
    expect(opts.sessionKey).toBeInstanceOf(Uint8Array);
    expect(opts.wsClient).toBeDefined();
    expect(opts.encryptionManager).toBeDefined();
  });

  it('returns TranscodeHandle with taskId, cancel, and result', async () => {
    injectSession(mgr, TEST_SESSION_ID);
    injectEncryptionAndWs(mgr);
    const handle = await mgr.submitTranscode(TEST_SESSION_ID, 'bafysrc', TEST_FORMATS);
    expect(handle.taskId).toBe('task-abc');
    expect(typeof handle.cancel).toBe('function');
    expect(handle.result).toBeInstanceOf(Promise);
  });

  it('passes onProgress callback through to WS handler', async () => {
    injectSession(mgr, TEST_SESSION_ID);
    injectEncryptionAndWs(mgr);
    const onProgress = vi.fn();
    await mgr.submitTranscode(TEST_SESSION_ID, 'bafysrc', TEST_FORMATS, { onProgress });
    const opts = mockSubmitTranscodeWs.mock.calls[0][0];
    expect(opts.onProgress).toBe(onProgress);
  });

  it('uses session jobId and chainId', async () => {
    injectSession(mgr, TEST_SESSION_ID, { jobId: 99n, chainId: 5611 });
    injectEncryptionAndWs(mgr);
    await mgr.submitTranscode(TEST_SESSION_ID, 'bafysrc', TEST_FORMATS);
    const opts = mockSubmitTranscodeWs.mock.calls[0][0];
    expect(opts.jobId).toBe(99);
    expect(opts.chainId).toBe(5611);
  });
});
