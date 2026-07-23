// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Q7 — no localhost fallback on the WS submit paths.
 *
 * `submitLtx` and `submitTranscode` used to read `session.endpoint || 'http://localhost:8080'`,
 * so a session registered without an endpoint silently targeted the developer's own machine
 * instead of failing. House rule: no fallbacks — a missing endpoint is a bug, and it must
 * surface as a typed error before any socket is opened.
 *
 * Scope: Q7 covered the two WS *submit* paths only. The same `endpoint || 'http://localhost:8080'`
 * pattern still exists at 8 other sites in SessionManager.ts (chat/streaming/image/health) and
 * is left for a separate sweep — those are deliberately untouched, not overlooked.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';

const wsInstances: string[] = [];

// Constructing a WebSocketClient is the observable "we tried to connect" event — record the URL.
vi.mock('../../src/websocket/WebSocketClient', () => ({
  WebSocketClient: class {
    constructor(url: string) { wsInstances.push(url); }
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    isConnected = () => false;
    send = vi.fn();
    on = vi.fn();
    off = vi.fn();
  },
}));

const { SessionManager } = await import('../../src/managers/SessionManager');

function makeSM() {
  const storageManager = { storeConversation: vi.fn(), isInitialized: () => true } as any;
  const sm = new SessionManager({} as any, storageManager, {} as any);
  // Past the ENCRYPTION_NOT_AVAILABLE guard, so the endpoint line is the next thing reached.
  (sm as any).setEncryptionManager({
    encryptMessage: vi.fn(),
    decryptMessage: vi.fn(),
    getPublicKey: vi.fn(() => '0x' + '02'.repeat(33)),
  });
  return sm;
}

function seed(sm: any, endpoint?: string) {
  (sm as any).sessions.set('954', {
    sessionId: 954n, jobId: 456n, chainId: 84532,
    model: '0x' + '01'.repeat(32), provider: ethers.Wallet.createRandom().address,
    endpoint, status: 'active',
    prompts: [], responses: [], checkpoints: [], totalTokens: 0, startTime: Date.now(),
    encryption: true,
  });
}

beforeEach(() => { wsInstances.length = 0; });
afterEach(() => { vi.clearAllMocks(); });

describe('WS submit paths reject a session with no endpoint (no localhost fallback)', () => {
  test('submitLtx throws SESSION_ENDPOINT_MISSING and opens no socket', async () => {
    const sm = makeSM();
    seed(sm, undefined);

    await expect(sm.submitLtx('954', {} as any)).rejects.toMatchObject({
      code: 'SESSION_ENDPOINT_MISSING',
    });
    expect(wsInstances).toEqual([]);
  });

  test('submitTranscode throws SESSION_ENDPOINT_MISSING and opens no socket', async () => {
    const sm = makeSM();
    seed(sm, undefined);

    await expect(sm.submitTranscode('954', 'bSourceCid', ['mp4'] as any)).rejects.toMatchObject({
      code: 'SESSION_ENDPOINT_MISSING',
    });
    expect(wsInstances).toEqual([]);
  });

  test('a session WITH an endpoint still gets past the guard (no regression)', async () => {
    const sm = makeSM();
    seed(sm, 'https://host1.fabstir.net');

    // It will fail later at the encrypted-init boundary (no real host) — what matters is that
    // the failure is NOT the endpoint guard and that the WS URL was derived from the endpoint.
    const err: any = await sm.submitLtx('954', {} as any).catch((e) => e);
    expect(err).toBeDefined(); // else the code assertion below would pass vacuously
    expect(err.code).not.toBe('SESSION_ENDPOINT_MISSING');
    expect(wsInstances).toEqual(['wss://host1.fabstir.net/v1/ws']);
  });
});
