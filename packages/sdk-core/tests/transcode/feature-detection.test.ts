// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranscodeManager } from '../../src/managers/TranscodeManager';

function createManager() {
  return new TranscodeManager({} as any, {} as any, {} as any, {} as any, {} as any, 84532);
}

describe('Feature Detection', () => {
  let manager: TranscodeManager;
  const originalFetch = globalThis.fetch;

  beforeEach(() => { manager = createManager(); });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('isTranscodingAvailable returns true when host has video-audio-transcoding flag', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '8.26.1', features: ['video-audio-transcoding', 'llm-inference'] }),
    });
    expect(await manager.isTranscodingAvailable('http://host:8080')).toBe(true);
  });

  it('isTranscodingAvailable returns false when flag absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '8.26.1', features: ['llm-inference'] }),
    });
    expect(await manager.isTranscodingAvailable('http://host:8080')).toBe(false);
  });

  it('isTrustlessAvailable returns true when host has transcoding-quality-metrics flag', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '8.26.1', features: ['video-audio-transcoding', 'transcoding-quality-metrics'] }),
    });
    expect(await manager.isTrustlessAvailable('http://host:8080')).toBe(true);
  });

  it('isTrustlessAvailable returns false when flag absent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '8.26.1', features: ['video-audio-transcoding'] }),
    });
    expect(await manager.isTrustlessAvailable('http://host:8080')).toBe(false);
  });
});
