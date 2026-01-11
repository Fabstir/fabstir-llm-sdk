// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for HTTP-based checkpoint index fetching.
 * Tests the fetchCheckpointIndexFromNode() utility function.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCheckpointIndexFromNode } from '../../src/utils/checkpoint-http';
import type { CheckpointIndex } from '../../src/types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchCheckpointIndexFromNode', () => {
  const hostUrl = 'http://localhost:8080';
  const sessionId = '123';

  // Valid checkpoint index for testing
  const validCheckpointIndex: CheckpointIndex = {
    sessionId: '123',
    hostAddress: '0x048afa7126a3b684832886b78e7cc1dd4019557e',
    checkpoints: [
      {
        index: 0,
        proofHash: '0xabc123',
        deltaCID: 's5://bafybeig1',
        tokenRange: [0, 1000] as [number, number],
        timestamp: 1704844800000,
      },
      {
        index: 1,
        proofHash: '0xdef456',
        deltaCID: 's5://bafybeig2',
        tokenRange: [1000, 2000] as [number, number],
        timestamp: 1704844860000,
      },
    ],
    hostSignature: '0xsig123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns CheckpointIndex on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validCheckpointIndex,
    });

    const result = await fetchCheckpointIndexFromNode(hostUrl, sessionId);

    expect(result).toEqual(validCheckpointIndex);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/checkpoints/123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
      })
    );
  });

  it('returns null when server returns 404 (no checkpoints)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await fetchCheckpointIndexFromNode(hostUrl, sessionId);

    expect(result).toBeNull();
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId))
      .rejects
      .toThrow('CHECKPOINT_FETCH_FAILED');
  });

  it('throws on malformed JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    });

    await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId))
      .rejects
      .toThrow('CHECKPOINT_FETCH_FAILED');
  });

  it('throws on invalid response structure (missing required fields)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: '123',
        // Missing hostAddress, checkpoints, hostSignature
      }),
    });

    await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId))
      .rejects
      .toThrow('INVALID_CHECKPOINT_INDEX');
  });

  it('throws on server error (5xx)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId))
      .rejects
      .toThrow('CHECKPOINT_FETCH_FAILED');
  });

  it('constructs correct URL with different host URLs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validCheckpointIndex,
    });

    await fetchCheckpointIndexFromNode('https://node.example.com:9090', '456');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://node.example.com:9090/v1/checkpoints/456',
      expect.any(Object)
    );
  });

  it('handles host URL with trailing slash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validCheckpointIndex,
    });

    await fetchCheckpointIndexFromNode('http://localhost:8080/', sessionId);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/v1/checkpoints/123',
      expect.any(Object)
    );
  });

  it('validates checkpoint entry structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sessionId: '123',
        hostAddress: '0x048afa7126a3b684832886b78e7cc1dd4019557e',
        checkpoints: [
          {
            index: 0,
            // Missing proofHash, deltaCID, tokenRange, timestamp
          },
        ],
        hostSignature: '0xsig123',
      }),
    });

    await expect(fetchCheckpointIndexFromNode(hostUrl, sessionId))
      .rejects
      .toThrow('INVALID_CHECKPOINT_INDEX');
  });

  it('handles empty checkpoints array (valid case)', async () => {
    const emptyCheckpointsIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: '0x048afa7126a3b684832886b78e7cc1dd4019557e',
      checkpoints: [],
      hostSignature: '0xsig123',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => emptyCheckpointsIndex,
    });

    const result = await fetchCheckpointIndexFromNode(hostUrl, sessionId);

    expect(result).toEqual(emptyCheckpointsIndex);
    expect(result?.checkpoints).toHaveLength(0);
  });
});
