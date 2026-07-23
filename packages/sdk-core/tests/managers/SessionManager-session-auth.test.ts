// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * FC1.6 session-auth — Item 2: session-auth delivery.
 *
 * `postSessionAuth` relays the fiat service's authorisation object to the node's
 * `POST <nodeHttpUrl>/v1/session-auth` gate. `registerDelegatedSession` gains an
 * opt-in path that POSTs the authorisation (awaited, before any local state) and,
 * when an EncryptionManager is present, cross-checks the authorised clientAddress
 * against the WS client address first (Q6).
 *
 * Wire body is LOCKED (spec §Step 1):
 *   { "sessionId": "954", "clientAddress": "0x…", "scheme": "fc1-session-auth-v1", "signature": "0x…" }
 * Status semantics (D4): 200 delivered · 404 tolerated · 401 fatal · 400/other fatal.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import { EncryptionManager } from '../../src/managers/EncryptionManager';
import 'fake-indexeddb/auto';

const SEED = 'yield organic score bishop free juice atop village video element unless sneak care rock update';

// A well-formed authorisation exactly as /fiat/session returns it (clientAddress lowercased).
function makeAuth(clientAddress: string) {
  return {
    scheme: 'fc1-session-auth-v1',
    signature: '0x' + 'ab'.repeat(65),
    clientAddress: clientAddress.toLowerCase(),
  };
}

function makeSM(opts: { encryptionManager?: EncryptionManager } = {}) {
  const storeConversation = vi.fn().mockResolvedValue(undefined);
  const storageManager = { storeConversation, isInitialized: () => true } as any;
  const sm = new SessionManager({} as any, storageManager, {} as any);
  if (opts.encryptionManager) (sm as any).setEncryptionManager(opts.encryptionManager);
  return { sm, storeConversation };
}

function baseConfig() {
  return {
    sessionId: 954n,
    jobId: 456n,
    hostUrl: 'http://node.example.com:8080',
    hostAddress: ethers.Wallet.createRandom().address,
    model: 'llama-3',
    chainId: 84532,
    depositAmount: '1.0',
    pricePerToken: 2000,
    proofInterval: 10,
    duration: 3600,
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

describe('SessionManager.postSessionAuth', () => {
  const NODE = 'https://node.example.com';
  const AUTH = makeAuth('0x' + '11'.repeat(20));

  test('posts the exact locked wire body + URL and returns {delivered:true} on 200', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    const { sm } = makeSM();

    const res = await sm.postSessionAuth(NODE, 954n, AUTH);

    expect(res).toEqual({ delivered: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://node.example.com/v1/session-auth');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      sessionId: '954',
      clientAddress: AUTH.clientAddress,
      scheme: 'fc1-session-auth-v1',
      signature: AUTH.signature,
    });
  });

  test('returns {delivered:false} on a tolerated 404 without throwing', async () => {
    fetchMock.mockResolvedValue({ status: 404 });
    const { sm } = makeSM();

    await expect(sm.postSessionAuth(NODE, 954n, AUTH)).resolves.toEqual({ delivered: false });
  });

  test('throws SESSION_AUTH_REJECTED mentioning backend-auth on 401', async () => {
    fetchMock.mockResolvedValue({ status: 401 });
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, 954n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_REJECTED');
      expect(e.message).toMatch(/backend-auth/i);
    }
  });

  test('throws SESSION_AUTH_FAILED on 400', async () => {
    fetchMock.mockResolvedValue({ status: 400 });
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, 954n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_FAILED');
    }
  });

  test('throws SESSION_AUTH_FAILED on a 5xx server error (status carried in details)', async () => {
    fetchMock.mockResolvedValue({ status: 503 });
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, 954n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_FAILED');
      expect(e.details?.status).toBe(503);
    }
  });

  test('rejects a non-http(s) URL without calling fetch (SESSION_AUTH_BAD_URL)', async () => {
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth('wss://node.example.com', 954n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_BAD_URL');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('normalizes a trailing slash in nodeHttpUrl', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    const { sm } = makeSM();

    await sm.postSessionAuth('https://node.example.com/', 954n, AUTH);

    expect(fetchMock.mock.calls[0][0]).toBe('https://node.example.com/v1/session-auth');
  });

  test('accepts a decimal-string sessionId', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    const { sm } = makeSM();

    const res = await sm.postSessionAuth(NODE, '954', AUTH);

    expect(res).toEqual({ delivered: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sessionId).toBe('954');
  });

  test('rejects a non-decimal string sessionId without calling fetch (SESSION_AUTH_BAD_SESSION_ID)', async () => {
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, '95a', AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_BAD_SESSION_ID');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects a negative bigint sessionId without calling fetch (uniform with the string guard)', async () => {
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, -5n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_BAD_SESSION_ID');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('wraps a network failure as SESSION_AUTH_UNREACHABLE (node never reached)', async () => {
    const cause = new Error('ECONNREFUSED');
    fetchMock.mockRejectedValue(cause);
    const { sm } = makeSM();

    try {
      await sm.postSessionAuth(NODE, 954n, AUTH);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_UNREACHABLE');
      expect(e.details?.cause).toBe(cause);
    }
  });
});

describe('SessionManager.registerDelegatedSession — FC1.6 opt-in delivery', () => {
  const NODE = 'https://node.example.com';
  const AUTH = makeAuth('0x' + '11'.repeat(20));

  test('awaits the session-auth POST before writing any local state', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    const { sm, storeConversation } = makeSM();

    await sm.registerDelegatedSession({ ...baseConfig(), authorisation: AUTH, nodeHttpUrl: NODE });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storeConversation).toHaveBeenCalledTimes(1);
    // POST happens before persistence.
    expect(fetchMock.mock.invocationCallOrder[0])
      .toBeLessThan(storeConversation.mock.invocationCallOrder[0]);
    expect((sm as any).sessions.get('954')).toBeDefined();
  });

  test('throws SESSION_AUTH_BAD_URL when authorisation is present but nodeHttpUrl is missing; nothing registered, no fetch', async () => {
    const { sm, storeConversation } = makeSM();

    try {
      await sm.registerDelegatedSession({ ...baseConfig(), authorisation: AUTH });
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_BAD_URL');
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeConversation).not.toHaveBeenCalled();
    expect((sm as any).sessions.size).toBe(0);
  });

  test('does NOT register when the node rejects the POST (401)', async () => {
    fetchMock.mockResolvedValue({ status: 401 });
    const { sm, storeConversation } = makeSM();

    await expect(
      sm.registerDelegatedSession({ ...baseConfig(), authorisation: AUTH, nodeHttpUrl: NODE })
    ).rejects.toMatchObject({ code: 'SESSION_AUTH_REJECTED' });
    expect(storeConversation).not.toHaveBeenCalled();
    expect((sm as any).sessions.size).toBe(0);
  });

  test('still registers when the node tolerates the POST with 404', async () => {
    fetchMock.mockResolvedValue({ status: 404 });
    const { sm, storeConversation } = makeSM();

    await sm.registerDelegatedSession({ ...baseConfig(), authorisation: AUTH, nodeHttpUrl: NODE });

    expect(storeConversation).toHaveBeenCalledTimes(1);
    expect((sm as any).sessions.get('954')).toBeDefined();
  });

  test('legacy path unchanged: no authorisation → zero fetch, session registered', async () => {
    const { sm, storeConversation } = makeSM();

    await sm.registerDelegatedSession(baseConfig());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeConversation).toHaveBeenCalledTimes(1);
    expect((sm as any).sessions.get('954')).toBeDefined();
  });
});

describe('SessionManager.registerDelegatedSession — Q6 client-address cross-check', () => {
  const NODE = 'https://node.example.com';

  test('throws SESSION_AUTH_CLIENT_MISMATCH with BOTH addresses (lowercased); no fetch, nothing registered', async () => {
    const em = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);
    const wsAddr = em.getWsClientAddress();
    const wrong = ethers.Wallet.createRandom().address; // ≠ wsAddr
    const { sm, storeConversation } = makeSM({ encryptionManager: em });

    try {
      await sm.registerDelegatedSession({
        ...baseConfig(),
        authorisation: makeAuth(wrong),
        nodeHttpUrl: NODE,
      });
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.code).toBe('SESSION_AUTH_CLIENT_MISMATCH');
      expect(e.message).toContain(wsAddr.toLowerCase());
      expect(e.message).toContain(wrong.toLowerCase());
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeConversation).not.toHaveBeenCalled();
    expect((sm as any).sessions.size).toBe(0);
  });

  test('proceeds when clientAddress matches the WS address case-insensitively', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    const em = EncryptionManager.fromSeed(SEED, ethers.Wallet.createRandom().address);
    const wsAddr = em.getWsClientAddress();
    const { sm, storeConversation } = makeSM({ encryptionManager: em });

    // makeAuth lowercases — differs in case from the checksummed getter, must still match.
    await sm.registerDelegatedSession({
      ...baseConfig(),
      authorisation: makeAuth(wsAddr),
      nodeHttpUrl: NODE,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storeConversation).toHaveBeenCalledTimes(1);
    expect((sm as any).sessions.get('954')).toBeDefined();
  });

  test('skips the cross-check when no EncryptionManager is set', async () => {
    fetchMock.mockResolvedValue({ status: 200 });
    // No EncryptionManager → nothing to check against; an arbitrary clientAddress proceeds.
    const { sm, storeConversation } = makeSM();

    await sm.registerDelegatedSession({
      ...baseConfig(),
      authorisation: makeAuth(ethers.Wallet.createRandom().address),
      nodeHttpUrl: NODE,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storeConversation).toHaveBeenCalledTimes(1);
    expect((sm as any).sessions.get('954')).toBeDefined();
  });
});
