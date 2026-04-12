// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect, vi } from 'vitest';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';

/** Minimal mock WS + encryption for testing inner message shape */
function createMocks() {
  let handler: ((data: any) => void) | null = null;
  const sent: any[] = [];
  const wsClient = {
    sendWithoutResponse: vi.fn(async (data: any) => { sent.push(data); }),
    onMessage: vi.fn((h: (data: any) => void) => { handler = h; return () => { handler = null; }; }),
  };
  const encryptionManager = {
    encryptMessage: vi.fn((_k: Uint8Array, plaintext: string, _i: number) => {
      return { ciphertextHex: plaintext, nonceHex: '00', aadHex: '00' };
    }),
    decryptMessage: vi.fn((_k: Uint8Array, payload: any) => JSON.stringify(payload)),
  };
  const pushMessage = (msg: any) => { handler?.({ type: 'encrypted_response', payload: msg }); };
  return { wsClient, encryptionManager, sent, pushMessage };
}

describe('HLS WS — Sub-phase 2.1', () => {
  it('includes previewPercent in inner payload when set', async () => {
    const { wsClient, encryptionManager } = createMocks();
    await submitTranscodeWs({
      wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, sourceCid: 'zSRC', formats: [],
      previewPercent: 10,
    });
    const plaintext = encryptionManager.encryptMessage.mock.calls[0][1];
    const inner = JSON.parse(plaintext);
    expect(inner.previewPercent).toBe(10);
  });

  it('omits previewPercent from inner payload when undefined', async () => {
    const { wsClient, encryptionManager } = createMocks();
    await submitTranscodeWs({
      wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, sourceCid: 'zSRC', formats: [],
    });
    const plaintext = encryptionManager.encryptMessage.mock.calls[0][1];
    const inner = JSON.parse(plaintext);
    expect(inner).not.toHaveProperty('previewPercent');
  });

  it('passes HLS outputs through in transcode_complete result', async () => {
    const { wsClient, encryptionManager, pushMessage } = createMocks();
    const handle = await submitTranscodeWs({
      wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, sourceCid: 'zSRC', formats: [],
    });
    pushMessage({
      type: 'transcode_complete', taskId: 't1',
      outputs: [{ id: 1, hls: true, initSegmentCid: 'zINIT', segments: [], previewSegments: 0, totalSegments: 5, totalDuration: 30 }],
      billing: { units: 60, tokens: 60000 }, duration: 60,
    });
    const result = await handle.result;
    expect(result.outputs[0]).toHaveProperty('hls', true);
    expect(result.outputs[0]).toHaveProperty('initSegmentCid', 'zINIT');
  });

  it('passes mixed HLS + standard outputs through correctly', async () => {
    const { wsClient, encryptionManager, pushMessage } = createMocks();
    const handle = await submitTranscodeWs({
      wsClient, encryptionManager, sessionId: 's1', sessionKey: new Uint8Array(32),
      messageIndex: { value: 0 }, sourceCid: 'zSRC', formats: [],
    });
    pushMessage({
      type: 'transcode_complete', taskId: 't1',
      outputs: [
        { id: 1, ext: 'mp4', cid: 'zSTD' },
        { id: 2, hls: true, initSegmentCid: 'zINIT', segments: [], previewSegments: 0, totalSegments: 5, totalDuration: 30 },
      ],
      billing: { units: 60, tokens: 60000 }, duration: 60,
    });
    const result = await handle.result;
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]).toHaveProperty('cid', 'zSTD');
    expect(result.outputs[1]).toHaveProperty('hls', true);
  });
});
