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
 * Scope: Q7 covered the two WS *submit* paths. 1.39.13 (IMPLEMENTATION-NO-LOCALHOST-FALLBACK) swept
 * the other eight sites and ClientManager.discoverNodes: each fails typed, BEFORE any side effect
 * (prompt recorded, RAG, image routing, fetch, socket) and outside any try that rewraps or swallows (F2).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { stubNodeVersion } from '../helpers/session-doubles';

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
  (sm as any).assertConfidentialHost = () => {};   // 1.39.19: the confidential-host check is not under test here
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

// 1.39.15: submits probe the node's /v1/version for `session-job-completion`; keep that off the network (an old node).
beforeEach(() => { wsInstances.length = 0; stubNodeVersion(); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

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

// ---------------------------------------------------------------------------------------------
// 1.39.13 — the remaining eight SessionManager sites (F1–F4)
// ---------------------------------------------------------------------------------------------

describe('every SessionManager method refuses a session with no endpoint (no localhost fallback)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchSpy = vi.fn(async () => { throw new Error('fetch must not be called'); }); vi.stubGlobal('fetch', fetchSpy); });
  afterEach(() => { vi.unstubAllGlobals(); });

  /** An initialised manager holding active session 954 without an endpoint. */
  function noEndpoint(extra: Record<string, unknown> = {}) {
    const sm: any = makeSM();
    sm.initialized = true;
    seed(sm, undefined);
    Object.assign(sm.sessions.get('954'), extra);
    return sm;
  }
  const refused = async (p: Promise<unknown>) => {
    const err: any = await p.then(() => undefined, (e) => e);
    expect(err).toBeDefined();
    expect(err.code).toBe('SESSION_ENDPOINT_MISSING');
    expect(err.message).toMatch(/Session 954 has no endpoint/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(wsInstances).toEqual([]);
    return err;
  };

  test('N1 sendPrompt: typed, not PROMPT_SEND_ERROR, and the prompt is not recorded', async () => {
    const sm = noEndpoint();
    await refused(sm.sendPrompt(954n, 'hello'));
    expect(sm.sessions.get('954').prompts).toEqual([]);
  });

  test('N2 sendPromptStreaming: typed, not WS_PROMPT_ERROR, and the prompt is not recorded', async () => {
    const sm = noEndpoint();
    await refused(sm.sendPromptStreaming(954n, 'hello', () => {}));
    expect(sm.sessions.get('954').prompts).toEqual([]);
  });

  test('N3 sendPromptStreaming with an image-intent prompt: refused before image routing (whose errors are swallowed)', async () => {
    const sm = noEndpoint();
    const route = vi.spyOn(sm, 'generateImage');
    await refused(sm.sendPromptStreaming(954n, 'generate an image of a cat', () => {}));
    expect(route).not.toHaveBeenCalled();
  });

  test('N3b a blank endpoint is no endpoint', async () => {
    const sm = noEndpoint({ endpoint: '   ' });
    await refused(sm.sendPrompt(954n, 'hello'));
  });

  test('N4 sendPromptStreaming on a session restored from a stored log without an endpoint', async () => {
    const sm: any = makeSM();
    sm.initialized = true;
    sm.storageManager.loadConversation = vi.fn(async () => ({
      createdAt: Date.now(),
      metadata: { jobId: '456', chainId: 84532, model: 'm', provider: '0xhost', status: 'active' },
    }));
    await refused(sm.sendPromptStreaming(954n, 'hello', () => {}));
  });

  test('N5 streamResponse: typed, and the prompt is not recorded', async () => {
    const sm = noEndpoint();
    await refused(sm.streamResponse(954n, 'hello', () => {}));
    expect(sm.sessions.get('954').prompts).toEqual([]);
  });

  test('N6 uploadVectors', async () => {
    const sm = noEndpoint();
    await refused(sm.uploadVectors('954', [{ id: 'v1', vector: [0.1], metadata: {} }]));
  });

  test('N7 askWithContext with RAG configured: throws instead of returning the question', async () => {
    const sm = noEndpoint({ ragContext: { vectorDbId: 'db-1' } });
    await refused(sm.askWithContext('954', 'what is in my notes?'));
  });

  test('N8 generateEmbeddings', async () => {
    const sm = noEndpoint();
    await refused(sm.generateEmbeddings(954n, 'some file content to embed'));
  });

  test('N9 recoverFromCheckpoints: SESSION_ENDPOINT_MISSING, not RECOVERY_FAILED', async () => {
    const sm = noEndpoint();
    sm.encryptionManager.getRecoveryPrivateKey = () => '0x' + '11'.repeat(32);   // the real manager has one
    await refused(sm.recoverFromCheckpoints(954n));
  });

  test('N9b recoverFromCheckpoints for a session not in memory still reports SESSION_NOT_FOUND', async () => {
    const sm = noEndpoint();
    sm.sessions.clear();
    sm.encryptionManager.getRecoveryPrivateKey = () => '0x' + '11'.repeat(32);
    await expect(sm.recoverFromCheckpoints(954n)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  test('N9c a session completeSession restores from storage keeps its stored endpoint (a failed completion leaves it usable)', async () => {
    const sm: any = makeSM();
    sm.initialized = true;
    sm.storageManager.loadConversation = vi.fn(async () => ({
      createdAt: Date.now(),
      metadata: { jobId: '456', model: 'm', provider: '0xhost', status: 'active', endpoint: 'https://host1.fabstir.net' },
    }));
    sm.paymentManager = { completeSession: vi.fn(async () => { throw new Error('user rejected'); }) };
    await sm.completeSession(954n, 10, '0xproof').catch(() => undefined);
    expect(sm.sessions.get('954')?.endpoint).toBe('https://host1.fabstir.net');
  });

  test('N10 generateImage', async () => {
    const sm = noEndpoint();
    await refused(sm.generateImage('954', 'a cat'));
  });
});

// ---------------------------------------------------------------------------------------------
// 1.39.13 — ClientManager.discoverNodes (F5)
// ---------------------------------------------------------------------------------------------

describe('ClientManager.discoverNodes needs NODE_DISCOVERY_URL (no localhost fallback)', () => {
  const saved = process.env.NODE_DISCOVERY_URL;
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ nodes: [] }) })); vi.stubGlobal('fetch', fetchSpy); });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (saved === undefined) delete process.env.NODE_DISCOVERY_URL; else process.env.NODE_DISCOVERY_URL = saved;
  });
  const client = async () => {
    const { ClientManager } = await import('../../src/managers/ClientManager');
    return new ClientManager({} as any, {} as any, {} as any);
  };

  test('N11 unset → NODE_DISCOVERY_URL_MISSING, not retryable, and nothing is fetched', async () => {
    delete process.env.NODE_DISCOVERY_URL;
    const err: any = await (await client()).discoverNodes(84532).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'NODE_DISCOVERY_URL_MISSING', details: { retryable: false } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('N11b empty string → the same refusal', async () => {
    process.env.NODE_DISCOVERY_URL = '';
    const err: any = await (await client()).discoverNodes(84532).catch((e: any) => e);
    expect(err.code).toBe('NODE_DISCOVERY_URL_MISSING');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('N12 set → it queries that URL (guard)', async () => {
    process.env.NODE_DISCOVERY_URL = 'https://discovery.fabstir.test';
    await (await client()).discoverNodes(84532);
    expect(fetchSpy).toHaveBeenCalledWith('https://discovery.fabstir.test/v1/models?chain_id=84532');
  });
});
