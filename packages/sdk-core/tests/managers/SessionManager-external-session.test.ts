// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LTX existing-session (vault) path — Phase 1: registry seeding.
 *
 * `registerExternalSession` records a session created OUTSIDE the SDK (the fiat
 * service's `POST /fiat/session` mints sessionId/jobId against vault deposits) in
 * the in-memory session registry, so the WS submit paths (`submitLtx` /
 * `submitTranscode`) get past their `sessions.get(sessionId)` guard.
 *
 * It is deliberately in-memory ONLY: no S5 persistence (unlike
 * registerDelegatedSession, which writes a chat-shaped conversation) and no
 * network call. Defaults per IMPLEMENTATION §4.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import 'fake-indexeddb/auto';

function makeSM() {
  const storeConversation = vi.fn().mockResolvedValue(undefined);
  const storageManager = { storeConversation, isInitialized: () => true } as any;
  const sm = new SessionManager({} as any, storageManager, {} as any);
  return { sm, storeConversation };
}

function baseConfig() {
  return {
    sessionId: 954n,
    jobId: 456n,
    endpoint: 'https://host1.fabstir.net',
    hostAddress: ethers.Wallet.createRandom().address,
    model: '0x' + '01'.repeat(32),
    chainId: 84532,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SessionManager.registerExternalSession', () => {
  test('records the session in memory with the exact SessionState defaults', () => {
    const { sm } = makeSM();
    const config = baseConfig();
    const before = Date.now();

    sm.registerExternalSession(config);

    const state = sm.getSession('954');
    expect(state).toBeDefined();
    // The six caller-supplied fields land verbatim on the state submitLtx reads.
    expect(state!.sessionId).toBe(954n);
    expect(state!.jobId).toBe(456n);
    expect(state!.endpoint).toBe(config.endpoint);
    expect(state!.provider).toBe(config.hostAddress);
    expect(state!.model).toBe(config.model);
    expect(state!.chainId).toBe(84532);
    // Defaults (IMPLEMENTATION §4) — 'active' is what submitLtx's status guard requires.
    expect(state!.status).toBe('active');
    expect(state!.encryption).toBe(true);
    expect(state!.prompts).toEqual([]);
    expect(state!.responses).toEqual([]);
    expect(state!.checkpoints).toEqual([]);
    expect(state!.totalTokens).toBe(0);
    expect(state!.startTime).toBeGreaterThanOrEqual(before);
    expect(state!.startTime).toBeLessThanOrEqual(Date.now());
  });

  test('is in-memory only — no S5 persistence and no network call', () => {
    const { sm, storeConversation } = makeSM();

    sm.registerExternalSession(baseConfig());

    expect(storeConversation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('seeded session gets submitLtx past the registry guards', async () => {
    const { sm } = makeSM();
    sm.registerExternalSession(baseConfig());

    // No EncryptionManager is set, so submitLtx must fail at the NEXT guard —
    // proving the SESSION_NOT_FOUND / SESSION_NOT_ACTIVE guards were cleared.
    await expect(sm.submitLtx('954', {} as any)).rejects.toMatchObject({
      code: 'ENCRYPTION_NOT_AVAILABLE',
    });
  });

  test('seeded session gets submitTranscode past the registry guards too', async () => {
    // ExternalSessionConfig claims the six fields are what BOTH submit paths read;
    // submitTranscode has the identical sessions.get/status guard pair.
    const { sm } = makeSM();
    sm.registerExternalSession(baseConfig());

    await expect(sm.submitTranscode('954', 'bSourceCid', ['mp4'] as any)).rejects.toMatchObject({
      code: 'ENCRYPTION_NOT_AVAILABLE',
    });
  });

  test('re-registration overwrites (idempotent seeding)', () => {
    const { sm } = makeSM();
    sm.registerExternalSession(baseConfig());

    const second = { ...baseConfig(), endpoint: 'https://host2.fabstir.net', chainId: 5611 };
    sm.registerExternalSession(second);

    expect(sm.getSession('954')!.endpoint).toBe('https://host2.fabstir.net');
    expect(sm.getSession('954')!.chainId).toBe(5611);
  });
});
