// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Milestone B1 (IMPLEMENTATION-MILESTONE-B, sdk-core 1.39.20): session edges from the Platformless UI request
 * (SDK-REQUEST-CONFIDENTIAL-RAG-STORAGE §2b / §4), re-verified against the 1.39.19 tree, plus D46.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { TranscodeError } from '../../src/errors/transcode-errors';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { SDKError } from '../../src/types';
import { resolveWebSearch } from '../../src/utils/search-query-resolver';
import { FakeWs, FakeWebSocket, makeFakeEncryptionManager, fakeHostManager, stubNodeVersion, activeOnChain } from '../helpers/session-doubles';
import type { IHostSelectionService, RankedHost } from '../../src/interfaces/IHostSelectionService';

const HOST = '0x' + '4'.repeat(40);
const MODEL = '0x' + 'ab'.repeat(32);
const ENDPOINT = 'https://host2.fabstir.net';
const A = 1433n, B = 1434n;
const KEY_A = new Uint8Array(32).fill(1), KEY_B = new Uint8Array(32).fill(2);
const vec = (id: string) => ({ id, vector: new Array(384).fill(0.1), metadata: {} });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

/** A SessionManager with sessions A and B on HOST, a shared socket owned by A holding A's key. */
function manager(opts: { features?: string[] } = {}) {
  stubNodeVersion(opts.features ?? []);
  const storage = { storeConversation: vi.fn(), updateConversationMetadata: vi.fn(async () => {}), appendMessages: vi.fn(async () => {}) };
  const payment = { completeSession: vi.fn(async () => '0xtx'), signer: { getAddress: async () => HOST } };
  const mgr: any = new SessionManager(payment as any, storage as any);
  mgr.initialized = true;
  mgr.encryptionManager = makeFakeEncryptionManager();
  mgr.hostManager = fakeHostManager();
  activeOnChain(mgr);   // 1.39.21: adopted sessions are read on chain before their first new work
  for (const [sid, jid] of [[A, 2866n], [B, 2868n]] as const) {
    mgr.registerExternalSession({ sessionId: sid, jobId: jid, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
  }
  const ws: any = new FakeWs();
  ws.disconnect = vi.fn(async () => {});
  ws.sendMessage = vi.fn(async () => 'ok');
  mgr.wsClient = ws;
  mgr.wsSessionId = A.toString();
  mgr.sessionKey = KEY_A;
  mgr.sessionKeyGeneration = 1;
  mgr.sessionKeyClient = ws;   // what the init's ack records
  mgr.sessionCrypto.set(A.toString(), { key: KEY_A, messageIndex: 3 });
  mgr.sessionCrypto.set(B.toString(), { key: KEY_B, messageIndex: 0 });
  // These tests pin D38's own /v1/version probe; the 1.39.22 settled-notice question is answered (no) up front.
  for (const sid of ['1433', '1434']) mgr.settledNoticeNodes.set(sid, false);
  return { mgr, ws, storage, payment };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// ── D33 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D33: SESSION_INIT_ERROR keeps the node code', () => {
  it('the node\'s refusal reaches the caller as details { nodeCode, sessionId }', async () => {
    const { mgr } = manager();
    const ws: any = new FakeWs();
    ws.autoAck = false;
    const init = mgr.sendEncryptedInit(ws, { chainId: 84532, host: HOST, modelId: MODEL, endpoint: ENDPOINT, encryption: true }, A, 2866n, 'dedicated');
    await flush();
    ws.emit({ type: 'error', session_id: A.toString(), code: 'SESSION_AUTH_DENIED', message: 'vault gate refused' });
    const err: any = await init.catch((e: any) => e);
    expect(err).toBeInstanceOf(SDKError);
    expect(err).toMatchObject({ code: 'SESSION_INIT_ERROR', message: 'vault gate refused', details: { nodeCode: 'SESSION_AUTH_DENIED', sessionId: '1433' } });
  });
});

// ── D37 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D37: SessionManager.getConnectionGeneration', () => {
  /** A client whose opens the test fires; like WebSocketClient, its own count restarts at 1. */
  const client = () => {
    let handler: (g: number) => void = () => {};
    let gen = 0, up = false;
    return {
      open: () => { up = true; handler(++gen); }, close: () => { up = false; },
      onConnectionChange: (h: any) => { handler = h; return () => {}; }, getConnectionGeneration: () => gen, isConnected: () => up,
      onMessage: () => () => {},   // a WebSocketClient has it; 1.39.22 attaches the settled-frame listener
    };
  };

  it('increases on every open of the shared connection, across replacement sockets (round 2)', () => {
    const { mgr } = manager();
    const x = client(), y = client();
    mgr.wsClient = x; mgr.watchConnectionIdentity(x);
    x.open();
    const first = mgr.getConnectionGeneration();
    expect(first).toEqual(expect.any(Number));
    x.open();   // a reconnect
    const second = mgr.getConnectionGeneration()!;
    expect(second).toBeGreaterThan(first!);
    mgr.wsClient = y; mgr.watchConnectionIdentity(y);
    expect(mgr.getConnectionGeneration()).toBeUndefined();   // not open yet
    y.open();   // its own count is 1 again
    expect(mgr.getConnectionGeneration()).toBeGreaterThan(second);
  });

  it('is undefined while the socket is closed awaiting a reconnect, and moves on when it reopens (round 3)', () => {
    const { mgr } = manager();
    const x = client();
    mgr.wsClient = x; mgr.watchConnectionIdentity(x);
    x.open();
    const before = mgr.getConnectionGeneration()!;
    x.close();
    expect(mgr.getConnectionGeneration()).toBeUndefined();
    x.open();
    expect(mgr.getConnectionGeneration()).toBeGreaterThan(before);
  });

  it('is undefined for an open client whose opens it did not count', () => {
    const { mgr } = manager();
    const x = client(), y = client();
    mgr.wsClient = x; mgr.watchConnectionIdentity(x);
    x.open();
    y.open();   // open, but never watched as the shared client
    mgr.wsClient = y;
    expect(mgr.getConnectionGeneration()).toBeUndefined();
  });

  it('is undefined with no shared connection', () => {
    const { mgr } = manager();
    mgr.wsClient = undefined;
    expect(mgr.getConnectionGeneration()).toBeUndefined();
  });
});

// ── D39 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D39: plaintext paths send the caller\'s prompt', () => {
  it('sendPrompt posts the prompt, not the session id', async () => {
    const { mgr } = manager();
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ content: 'hi there' }) } as any;
    }));
    await mgr.sendPrompt(A, 'What is in my notes?');
    expect(bodies[0].prompt).toBe('What is in my notes?');
  });

  it('sendPromptStreaming on a plaintext session sends the prompt in both fields', async () => {
    const { mgr, ws } = manager();
    mgr.getSession(A.toString()).encryption = false;
    vi.spyOn(mgr, 'sendPlaintextInit').mockResolvedValue(undefined);
    await mgr.sendPromptStreaming(A, 'Summarise chapter two', () => {});
    const frame = ws.sendMessage.mock.calls[0][0];
    expect(frame.prompt).toBe('Summarise chapter two');
    expect(frame.request.prompt).toBe('Summarise chapter two');
  });
});

// ── D36 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D36: uploadVectors relays the node\'s own counts', () => {
  function pendingUpload(mgr: any, requestId = 'r1') {
    return new Promise((resolve, reject) => {
      mgr.pendingRequests.set(requestId, { resolve, reject, timeoutId: setTimeout(() => {}, 0) });
    });
  }

  it('a partial ack resolves with the node\'s uploaded / rejected / errors', async () => {
    const { mgr } = manager();
    const p = pendingUpload(mgr);
    mgr._handleUploadVectorsResponse({ type: 'uploadVectorsResponse', requestId: 'r1', status: 'partial', uploaded: 3, rejected: 2, errors: ['v4: bad dim', 'v5: bad dim'] });
    await expect(p).resolves.toEqual({ uploaded: 3, rejected: 2, errors: ['v4: bad dim', 'v5: bad dim'] });
  });

  it('an error ack is relayed as sent, with no invented rejection count', async () => {
    const { mgr } = manager();
    const p = pendingUpload(mgr);
    mgr._handleUploadVectorsResponse({ type: 'uploadVectorsResponse', requestId: 'r1', status: 'error', uploaded: 0, rejected: 7, errors: ['all bad'] });
    await expect(p).resolves.toEqual({ uploaded: 0, rejected: 7, errors: ['all bad'] });
  });

  it('a clean ack resolves { uploaded, rejected: 0, errors: [] } as sent', async () => {
    const { mgr } = manager();
    const p = pendingUpload(mgr);
    mgr._handleUploadVectorsResponse({ type: 'uploadVectorsResponse', requestId: 'r1', status: 'success', uploaded: 5, rejected: 0, errors: [] });
    await expect(p).resolves.toEqual({ uploaded: 5, rejected: 0, errors: [] });
  });

  it('an ack without the counts is refused (UPLOAD_RESPONSE_MALFORMED), and uploadVectors throws it', async () => {
    const { mgr } = manager();
    const p = pendingUpload(mgr);
    mgr._handleUploadVectorsResponse({ type: 'uploadVectorsResponse', requestId: 'r1', status: 'success', uploaded: 5 });
    await expect(p).rejects.toMatchObject({ code: 'UPLOAD_RESPONSE_MALFORMED' });

    const { mgr: m2 } = manager();
    vi.spyOn(m2, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(m2, '_sendRAGRequest').mockRejectedValue(new SDKError('malformed', 'UPLOAD_RESPONSE_MALFORMED'));
    await expect(m2.uploadVectors(A.toString(), [vec('v1')])).rejects.toMatchObject({ code: 'UPLOAD_RESPONSE_MALFORMED' });
  });

  it('batches sum the node\'s counts', async () => {
    const { mgr } = manager();
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest')
      .mockResolvedValueOnce({ uploaded: 998, rejected: 2, errors: ['a', 'b'] })
      .mockResolvedValueOnce({ uploaded: 1, rejected: 0, errors: [] });
    const many = Array.from({ length: 1001 }, (_, i) => vec(`v${i}`));
    await expect(mgr.uploadVectors(A.toString(), many)).resolves.toEqual({ uploaded: 999, rejected: 2, errors: ['a', 'b'] });
  });
});

// ── D30 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D30: web search opt-out for delegated sessions and per prompt', () => {
  it('registerDelegatedSession stores webSearch on the session', async () => {
    const { mgr } = manager();
    await mgr.registerDelegatedSession({
      sessionId: 77n, jobId: 78n, hostUrl: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532,
      depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600, conversationLog: false,
      webSearch: { forceDisabled: true },
    });
    expect(mgr.getSession('77').webSearch).toEqual({ forceDisabled: true });
  });

  it('PromptOptions.webSearch wins over the session config, both ways', () => {
    expect(resolveWebSearch({ forceDisabled: true }, 'hello', { webSearch: true }).enabled).toBe(true);
    expect(resolveWebSearch({ forceEnabled: true }, 'search the latest news', { webSearch: false }).enabled).toBe(false);
    expect(resolveWebSearch(undefined, 'what is the latest news today', { webSearch: false }).enabled).toBe(false);
  });

  it('images still turn search off', () => {
    expect(resolveWebSearch(undefined, 'x', { webSearch: true, images: [{ data: 'aa', format: 'png' }] as any }).enabled).toBe(false);
  });

  it('sendPromptStreaming forwards the per-prompt decision to the node', async () => {
    const { mgr } = manager();
    mgr.getSession(A.toString()).webSearch = { forceEnabled: true };
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockRejectedValue(new Error('stop'));
    await mgr.sendPromptStreaming(A, 'extract the entities', () => {}, { webSearch: false }).catch(() => {});
    expect(send.mock.calls[0][2]).toMatchObject({ webSearch: false, maxSearches: 0 });
  });
});

// ── D32 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D32: endSession / completeSession touch only their own session', () => {
  for (const [name, end] of [
    ['endSession', (mgr: any, sid: bigint) => mgr.endSession(sid)],
    ['completeSession', (mgr: any, sid: bigint) => mgr.completeSession(sid, 10, '0xproof')],
  ] as const) {
    it(`${name}(B) leaves A's shared socket, key and waiters alone, and drops B's key`, async () => {
      const { mgr, ws } = manager();
      const waiter = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
      mgr.pendingRequests.set('upload-a', waiter);
      await end(mgr, B);
      expect(ws.disconnect).not.toHaveBeenCalled();
      expect(mgr.wsClient).toBe(ws);
      expect(mgr.wsSessionId).toBe('1433');
      expect(mgr.sessionKey).toBe(KEY_A);
      expect(mgr.sessionCrypto.get('1433')?.key).toBe(KEY_A);
      expect(mgr.sessionCrypto.has('1434')).toBe(false);
      expect(waiter.reject).not.toHaveBeenCalled();
      expect(mgr.pendingRequests.has('upload-a')).toBe(true);
    });

    it(`${name}(A) closes A's socket and clears A's state, keeping B's key`, async () => {
      const { mgr, ws } = manager();
      const waiter = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
      mgr.pendingRequests.set('upload-a', waiter);
      await end(mgr, A);
      expect(ws.disconnect).toHaveBeenCalledTimes(1);
      expect(mgr.wsClient).toBeUndefined();
      expect(mgr.wsSessionId).toBeUndefined();
      expect(mgr.sessionKey).toBeUndefined();
      expect(mgr.sessionCrypto.has('1433')).toBe(false);
      expect(mgr.sessionCrypto.get('1434')?.key).toBe(KEY_B);
      expect(waiter.reject).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_ENDED' }));
    });

    it(`${name}(A): a socket another session installs during the close survives it`, async () => {
      const { mgr, ws } = manager();
      const closing = deferred();
      ws.disconnect = vi.fn(() => closing.promise);
      const ending = end(mgr, A);
      await flush();
      const ws2: any = new FakeWs();
      mgr.wsClient = ws2; mgr.wsSessionId = '1434'; mgr.sessionKey = KEY_B;
      closing.resolve();
      await ending;
      expect(mgr.wsClient).toBe(ws2);
      expect(mgr.wsSessionId).toBe('1434');
      expect(mgr.sessionKey).toBe(KEY_B);
    });
  }

  it('endSession(B) still marks B ended', async () => {
    const { mgr } = manager();
    await mgr.endSession(B);
    expect(mgr.getSession('1434').status).toBe('ended');
  });
});

// ── D38 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D38: no re-init of an inited shared connection on session-job-completion nodes', () => {
  async function prompt(mgr: any) {
    vi.spyOn(mgr, 'sendEncryptedMessage').mockRejectedValue(new Error('stop'));
    await mgr.sendPromptStreaming(A, 'hello', () => {}).catch(() => {});
  }
  async function upload(mgr: any) {
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
  }
  async function search(mgr: any) {
    mgr.getSession(A.toString()).ragContext = { vectorDbId: 'vectors-1433' };
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ results: [] });
    await mgr.searchVectors(A.toString(), new Array(384).fill(0.1));
  }

  for (const [name, op] of [['sendPromptStreaming', prompt], ['uploadVectors', upload], ['searchVectors', search]] as const) {
    it(`${name}: a marker node with this session's key on the connection gets no init, and the key is kept`, async () => {
      const { mgr } = manager({ features: ['session-job-completion'] });
      const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
      await op(mgr);
      expect(init).not.toHaveBeenCalled();
      expect(mgr.sessionCrypto.get('1433')).toEqual({ key: KEY_A, messageIndex: 3 });
    });

    it(`${name}: an older node is re-inited as before`, async () => {
      const { mgr } = manager({ features: [] });
      const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
      await op(mgr);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it(`${name}: a marker node is inited when the connection does not hold this session's key`, async () => {
      const { mgr } = manager({ features: ['session-job-completion'] });
      mgr.sessionCrypto.delete('1433');
      const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
      await op(mgr);
      expect(init).toHaveBeenCalledTimes(1);
    });

    it(`${name}: a marker node is inited after the connection changed`, async () => {
      const { mgr } = manager({ features: ['session-job-completion'] });
      mgr.sessionKeyGeneration = 0;   // the key was minted on an earlier connection
      const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
      await op(mgr);
      expect(init).toHaveBeenCalledTimes(1);
    });
  }

  it('a failed /v1/version probe counts as an older node (re-init)', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable'); }));
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    await upload(mgr);
    expect(init).toHaveBeenCalledTimes(1);
  });
});

// ── D40 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D40: the transcode load balancer reports the sessions it funded and could not use', () => {
  const H1 = '0x1', H2 = '0x2';
  const ranked = (addr: string, url: string): RankedHost => ({
    host: { address: addr, apiUrl: url, metadata: {} as any, supportedModels: [], isActive: true, stake: 1n, minPricePerTokenNative: 1n, minPricePerTokenStable: 1n } as any,
    score: 1, factors: { stakeScore: 1, priceScore: 1, uptimeScore: 1, latencyScore: 1 },
  });
  const handle = () => ({ taskId: 'task-1', cancel: vi.fn(), result: Promise.resolve({} as any) });
  const capacityFull = () => new TranscodeError('full', 'CAPACITY_FULL', H1);

  function lb(hosts = [ranked(H1, 'http://h1'), ranked(H2, 'http://h2')]) {
    let n = 0;
    const sm = {
      startSession: vi.fn(async () => { n++; return { sessionId: BigInt(100 + n), jobId: BigInt(200 + n) }; }),
      submitTranscode: vi.fn(),
      getConfidentialHosts: vi.fn(() => [H1, H2]),
    };
    const tm = new TranscodeManager(sm, {} as any, {} as any, {} as any, {} as any, 84532);
    const sel: IHostSelectionService = { getRankedHostsForModel: vi.fn(async () => hosts), calculateHostScore: vi.fn(), getScoreFactors: vi.fn(), selectHostForModel: vi.fn() } as any;
    tm.setHostSelectionService(sel);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ active: 0, max: 3, queued: 0, available: 3, sidecarConnected: true }) })));
    return { tm, sm };
  }
  const go = (tm: TranscodeManager) => tm.submitTranscodeWithLoadBalancing('s5://bSrc', [{ id: 1, ext: 'mp4' }] as any, MODEL, { retryDelayMs: 0 });

  it('CAPACITY_FULL after funding: the next host\'s handle carries the orphaned ids', async () => {
    const { tm, sm } = lb();
    sm.submitTranscode.mockRejectedValueOnce(capacityFull()).mockResolvedValueOnce(handle());
    const h: any = await go(tm);
    expect(h.taskId).toBe('task-1');
    expect(h.orphanedSessions).toEqual([{ sessionId: 101n, jobId: 201n, host: H1 }]);
  });

  it('a handle with nothing orphaned has no orphanedSessions', async () => {
    const { tm, sm } = lb();
    sm.submitTranscode.mockResolvedValueOnce(handle());
    const h: any = await go(tm);
    expect(h.orphanedSessions).toBeUndefined();
  });

  it('every host full: the final error carries every funded session', async () => {
    const { tm, sm } = lb();
    sm.submitTranscode.mockRejectedValue(capacityFull());
    const err: any = await go(tm).catch((e) => e);
    expect(err).toMatchObject({ code: 'NO_AVAILABLE_HOSTS' });
    expect(err.details.orphanedSessions).toHaveLength(sm.startSession.mock.calls.length);
    expect(err.details.orphanedSessions[0]).toEqual({ sessionId: 101n, jobId: 201n, host: H1 });
  });

  it('another post-funding failure keeps its code and details, and adds this and earlier funded sessions', async () => {
    const { tm, sm } = lb();
    sm.submitTranscode.mockRejectedValueOnce(capacityFull())
      .mockRejectedValueOnce(new TranscodeError('bad', 'TRANSCODE_FAILED', H2, { reason: 'SESSION_CHANGED' }));
    const err: any = await go(tm).catch((e) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', hostAddress: H2, message: 'bad' });
    expect(err.details).toEqual({ reason: 'SESSION_CHANGED', orphanedSessions: [
      { sessionId: 101n, jobId: 201n, host: H1 }, { sessionId: 102n, jobId: 202n, host: H2 },
    ] });
  });

  it('a post-funding failure that is not a TranscodeError is wrapped with the funded ids and its cause', async () => {
    const { tm, sm } = lb([ranked(H1, 'http://h1')]);
    const boom = new Error('socket exploded');
    sm.submitTranscode.mockRejectedValueOnce(boom);
    const err: any = await go(tm).catch((e) => e);
    expect(err).toBeInstanceOf(TranscodeError);
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', hostAddress: H1, message: 'socket exploded' });
    expect(err.details).toMatchObject({ reason: 'POST_FUNDING_FAILURE', orphanedSessions: [{ sessionId: 101n, jobId: 201n, host: H1 }] });
    expect(err.details.cause).toBe(boom);
  });

  it('a failure before any funding is thrown unchanged', async () => {
    const { tm, sm } = lb([ranked(H1, 'http://h1')]);
    const boom = new Error('deposit refused');
    sm.startSession.mockRejectedValueOnce(boom);
    await expect(go(tm)).rejects.toBe(boom);
  });
});

// ── D46 ────────────────────────────────────────────────────────────────────────────────────────────
describe('D46: TranscodeManager storage and contract methods use APIs that exist', () => {
  const CAP = 'urqYS' + 'A'.repeat(136);   // first byte 0xae: a capability CID
  function tm(over: { storage?: any; jm?: any } = {}) {
    const storage = over.storage ?? {
      uploadEncryptedBlob: vi.fn(async () => CAP),
      downloadDecryptedByCID: vi.fn(async () => new Uint8Array([1, 2, 3])),
      getRawBytes: vi.fn(async () => new Uint8Array([4, 5])),
    };
    const jm = over.jm ?? {
      completeSessionJob: vi.fn(async () => ({ wait: vi.fn(async () => ({ hash: '0xreceipt' })) })),
      sessionJobs: vi.fn(async () => ({ status: 0n })),
    };
    const cm = { getJobMarketplace: vi.fn(() => jm) };
    const sm = { startSession: vi.fn(async () => ({ sessionId: 9n, jobId: 9n })), resolveModelRateLimit: vi.fn(async () => 2000) };
    return { m: new TranscodeManager(sm, storage, cm, {} as any, {} as any, 84532), storage, jm, cm, sm };
  }

  it('uploadVideoForTranscode encrypts and uploads the bytes, returning the s5:// capability CID', async () => {
    const { m, storage } = tm();
    const progress = vi.fn();
    const r = await m.uploadVideoForTranscode(new Blob([new Uint8Array([7, 8, 9])]), true, progress);
    expect(Array.from(storage.uploadEncryptedBlob.mock.calls[0][0])).toEqual([7, 8, 9]);
    expect(r).toEqual({ cid: `s5://${CAP}` });
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('uploadVideoForTranscode refuses an unencrypted upload (no plaintext upload path)', async () => {
    const { m, storage } = tm();
    await expect(m.uploadVideoForTranscode(new Blob(['x']), false)).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'PLAINTEXT_UPLOAD_UNSUPPORTED' } });
    expect(storage.uploadEncryptedBlob).not.toHaveBeenCalled();
  });

  it('downloadTranscodedVideo decrypts a capability CID, with or without s5://', async () => {
    const { m, storage } = tm();
    const blob = await m.downloadTranscodedVideo(`s5://${CAP}`) as Blob;
    expect(storage.downloadDecryptedByCID).toHaveBeenCalledWith(CAP);
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3]);
    await m.downloadTranscodedVideo(CAP);
    expect(storage.downloadDecryptedByCID).toHaveBeenLastCalledWith(CAP);
  });

  it('downloadTranscodedVideo reads a plain CID\'s raw bytes', async () => {
    const { m, storage } = tm();
    const blob = await m.downloadTranscodedVideo('s5://zPlainCid') as Blob;
    expect(storage.getRawBytes).toHaveBeenCalledWith('zPlainCid');
    expect(storage.downloadDecryptedByCID).not.toHaveBeenCalled();
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([4, 5]);
  });

  it('downloadTranscodedVideo refuses an outputPath (the SDK writes no files)', async () => {
    const { m, storage } = tm();
    await expect(m.downloadTranscodedVideo(CAP, './out.mp4')).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'OUTPUT_PATH_UNSUPPORTED' } });
    expect(storage.downloadDecryptedByCID).not.toHaveBeenCalled();
  });

  it('createTranscodeJob stores the format spec as an encrypted blob before funding', async () => {
    const { m, storage, sm } = tm();
    const order: string[] = [];
    storage.uploadEncryptedBlob.mockImplementation(async () => { order.push('upload'); return CAP; });
    sm.startSession.mockImplementation(async () => { order.push('fund'); return { sessionId: 9n, jobId: 9n }; });
    const formats = [{ id: 1, ext: 'mp4', vcodec: 'libx264', vf: 'scale=1280:720' }];
    const r = await m.createTranscodeJob({ hostAddress: HOST, chainId: 84532, maxDuration: 60, mediaFormats: formats } as any);
    expect(JSON.parse(new TextDecoder().decode(storage.uploadEncryptedBlob.mock.calls[0][0]))).toEqual(formats);
    expect(r.formatSpecCID).toBe(`s5://${CAP}`);
    expect(order).toEqual(['upload', 'fund']);
  });

  it('cancelTranscodeJob completes the session job on the JobMarketplace with an empty CID and waits 3 blocks', async () => {
    const { m, jm } = tm();
    const wait = vi.fn(async () => ({ hash: '0xreceipt' }));
    jm.completeSessionJob.mockResolvedValue({ wait });
    await expect(m.cancelTranscodeJob(5n)).resolves.toEqual({ txHash: '0xreceipt' });
    expect(jm.completeSessionJob).toHaveBeenCalledWith(5n, '');
    expect(wait).toHaveBeenCalledWith(3);
  });

  it('getTranscodeJobStatus reads sessionJobs with the contract\'s status enum', async () => {
    const { m, jm } = tm();
    jm.sessionJobs.mockResolvedValueOnce({ status: 0n });
    await expect(m.getTranscodeJobStatus(5n)).resolves.toEqual({ status: 'active', progress: 0 });
    jm.sessionJobs.mockResolvedValueOnce({ status: 1n });
    await expect(m.getTranscodeJobStatus(5n)).resolves.toEqual({ status: 'completed', progress: 100 });
    jm.sessionJobs.mockResolvedValueOnce({ status: 2n });
    await expect(m.getTranscodeJobStatus(5n)).resolves.toEqual({ status: 'timedOut', progress: 0 });
    expect(jm.sessionJobs).toHaveBeenCalledWith(5n);
  });

  it('getTranscodeJobStatus refuses a status it does not know', async () => {
    const { m, jm } = tm();
    jm.sessionJobs.mockResolvedValueOnce({ status: 9n });
    await expect(m.getTranscodeJobStatus(5n)).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'UNKNOWN_SESSION_STATUS', status: 9 } });
  });
});

// ── Review round 1 ─────────────────────────────────────────────────────────────────────────────────
describe('B1 review round 1', () => {
  const marker = () => manager({ features: ['session-job-completion'] });
  const upload = async (mgr: any) => {
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
  };

  it('M1: a replacement client at the same generation number is inited (generations are per client)', async () => {
    const { mgr } = marker();
    const ws2: any = new FakeWs();   // a new WebSocketClient also reports generation 1
    mgr.wsClient = ws2;
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    await upload(mgr);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('M2: after a failed LoRA staging the next operation re-inits (re-staging the adapter)', async () => {
    const { mgr } = marker();
    mgr.serveBackError = new Error('LORA_STAGING_FAILED');
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    await upload(mgr);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('M3: a socket another session is still connecting is owned from creation and survives endSession of the old owner', async () => {
    const { mgr } = manager();
    mgr.wsClient = undefined; mgr.wsSessionId = undefined; mgr.sessionKey = undefined;
    FakeWebSocket.reset(); FakeWebSocket.autoOpen = false; vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_B);
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    const uploading = mgr.uploadVectors(B.toString(), [vec('v1')]);
    await flush();
    expect(mgr.wsSessionId).toBe('1434');
    const connecting = FakeWebSocket.instances[0];
    await mgr.endSession(A);
    expect(connecting.readyState).toBe(FakeWebSocket.CONNECTING);
    connecting.open();
    await expect(uploading).resolves.toMatchObject({ uploaded: 1 });
  });

  it('M3: a socket no session has claimed is not closed by ending a session', async () => {
    const { mgr, ws } = manager();
    mgr.wsSessionId = undefined;
    await mgr.endSession(A);
    expect(ws.disconnect).not.toHaveBeenCalled();
    expect(mgr.wsClient).toBe(ws);
  });

  it('m1: the check waits for a shared init in flight', async () => {
    const { mgr } = marker();
    const inFlight = deferred();
    mgr.initChain = inFlight.promise;
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    const send = vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    const uploading = mgr.uploadVectors(A.toString(), [vec('v1')]);
    await flush();
    expect(send).not.toHaveBeenCalled();
    inFlight.resolve();
    await uploading;
    expect(send).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
  });

  it('m1: generateImage on a marker node with the key on the connection sends no re-init', async () => {
    const { mgr } = marker();
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    mgr.encryptionManager.encryptMessage = vi.fn(() => { throw new Error('stop'); });
    await mgr.generateImage(A.toString(), 'a red bicycle').catch(() => {});
    expect(init).not.toHaveBeenCalled();
  });

  it('m2: a coded error after funding keeps its class and code, with orphanedSessions added', async () => {
    const H1 = '0x1', H2 = '0x2';
    let n = 0;
    const uncertain = new SDKError('funding uncertain', 'SESSION_FUNDING_UNCERTAIN', { txHash: undefined });
    const sm = {
      startSession: vi.fn(async () => { if (++n === 2) throw uncertain; return { sessionId: 101n, jobId: 201n }; }),
      submitTranscode: vi.fn(async () => { throw new TranscodeError('full', 'CAPACITY_FULL', H1); }),
      getConfidentialHosts: vi.fn(() => [H1, H2]),
    };
    const tm = new TranscodeManager(sm, {} as any, {} as any, {} as any, {} as any, 84532);
    const host = (a: string) => ({ host: { address: a, apiUrl: `http://${a}` }, score: 1, factors: {} });
    tm.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => [host(H1), host(H2)]) } as any);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ available: 3, sidecarConnected: true }) })));
    const err: any = await tm.submitTranscodeWithLoadBalancing('s5://bSrc', [{ id: 1, ext: 'mp4' }] as any, MODEL, { retryDelayMs: 0 }).catch((e) => e);
    expect(err).toBe(uncertain);
    expect(err).toMatchObject({ code: 'SESSION_FUNDING_UNCERTAIN', details: { orphanedSessions: [{ sessionId: 101n, jobId: 201n, host: H1 }] } });
    expect('txHash' in err.details).toBe(true);
  });

  it('m3: a malformed ack on a later batch carries what earlier batches confirmed, and marks the session RAG-enabled', async () => {
    const { mgr } = manager();
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest')
      .mockResolvedValueOnce({ uploaded: 998, rejected: 2, errors: ['a', 'b'] })
      .mockRejectedValueOnce(new SDKError('malformed', 'UPLOAD_RESPONSE_MALFORMED', { requestId: 'r2' }));
    const many = Array.from({ length: 1001 }, (_, i) => vec(`v${i}`));
    const err: any = await mgr.uploadVectors(A.toString(), many).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'UPLOAD_RESPONSE_MALFORMED', details: { requestId: 'r2', batch: 2, uploadedSoFar: 998, rejectedSoFar: 2, errorsSoFar: ['a', 'b'] } });
    expect(mgr.getSession('1433').ragContext).toEqual({ vectorDbId: 'vectors-1433' });
  });

  it('m3: an ack whose errors are not all strings is refused', async () => {
    const { mgr } = manager();
    const p = new Promise((resolve, reject) => mgr.pendingRequests.set('r1', { resolve, reject, timeoutId: setTimeout(() => {}, 0) }));
    mgr._handleUploadVectorsResponse({ type: 'uploadVectorsResponse', requestId: 'r1', status: 'partial', uploaded: 1, rejected: 1, errors: [{ id: 'v2' }] });
    await expect(p).rejects.toMatchObject({ code: 'UPLOAD_RESPONSE_MALFORMED' });
  });

  it('m4: releasing the owned socket resets its serve-back state', async () => {
    const { mgr } = manager();
    const unsub = vi.fn();
    mgr.serveBackError = new Error('x'); mgr.serveBackUnsubscribe = unsub; mgr.loraSessionActive = true;
    await mgr.endSession(A);
    expect(unsub).toHaveBeenCalled();
    expect(mgr.getServeBackError()).toBeNull();
    expect(mgr.loraSessionActive).toBe(false);
  });

  it('m4: ending another session leaves the serve-back state alone', async () => {
    const { mgr } = manager();
    const err = new Error('x');
    mgr.serveBackError = err;
    await mgr.endSession(B);
    expect(mgr.getServeBackError()).toBe(err);
  });
});

// ── Review round 2 ─────────────────────────────────────────────────────────────────────────────────
describe('B1 review round 2', () => {
  it('m1: a key lost while the probe is in flight means a re-init', async () => {
    const { mgr } = manager();
    const answer = deferred<any>();
    vi.stubGlobal('fetch', vi.fn(() => answer.promise));
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    const uploading = mgr.uploadVectors(A.toString(), [vec('v1')]);
    await flush();
    mgr.handleConnectionChange(2);   // the connection changed while the probe waited
    answer.resolve({ ok: true, json: async () => ({ features: ['session-job-completion'] }) });
    await uploading;
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('m1: no probe when a re-init is due anyway', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    mgr.sessionCrypto.delete('1433');
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('m2: endSession marks the session ended before the close it awaits', async () => {
    const { mgr, ws } = manager();
    const closing = deferred();
    ws.disconnect = vi.fn(() => closing.promise);
    const ending = mgr.endSession(A);
    await flush();
    expect(mgr.getSession('1433').status).toBe('ended');
    closing.resolve();
    await ending;
  });

  it('m3: an open of a replacement client at the stale generation number drops the key', () => {
    const { mgr } = manager();
    mgr.wsClient = new FakeWs();   // not the client the key was acked on
    mgr.handleConnectionChange(1);
    expect(mgr.sessionKey).toBeUndefined();
    expect(mgr.sessionCrypto.size).toBe(0);
  });

  it('m3: the open that carried the init does not', () => {
    const { mgr } = manager();
    mgr.handleConnectionChange(1);
    expect(mgr.sessionKey).toBe(KEY_A);
  });

  it('m4: a job reusing the shared socket waits for a shared init in flight', async () => {
    const { mgr } = manager();
    const inFlight = deferred();
    mgr.initChain = inFlight.promise;
    let done = false;
    const acquiring = mgr.acquireSessionTransport('1433', 'job').then((t: any) => { done = true; return t; });
    await flush();
    expect(done).toBe(false);
    inFlight.resolve();
    const t = await acquiring;
    expect(t.wsClient).toBe(mgr.wsClient);
  });
});

// ── Review round 3 ─────────────────────────────────────────────────────────────────────────────────
describe('B1 review round 3', () => {
  const okUpload = (mgr: any) => vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });

  it('M2: a shared init queued while the probe waits means a re-init', async () => {
    const { mgr } = manager();
    const answer = deferred<any>();
    vi.stubGlobal('fetch', vi.fn(() => answer.promise));
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    okUpload(mgr);
    const uploading = mgr.uploadVectors(A.toString(), [vec('v1')]);
    await flush();
    mgr.initChain = deferred().promise;   // another flow queued an init: its key is in the shared fields already
    answer.resolve({ ok: true, json: async () => ({ features: ['session-job-completion'] }) });
    await uploading;
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('M2: inits queued while settling the chain are settled too', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    const first = deferred(), second = deferred();
    mgr.initChain = first.promise;
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    const send = okUpload(mgr);
    const uploading = mgr.uploadVectors(A.toString(), [vec('v1')]);
    await flush();
    mgr.initChain = second.promise;
    first.resolve();
    await flush();
    expect(send).not.toHaveBeenCalled();
    second.resolve();
    await uploading;
    expect(init).not.toHaveBeenCalled();
  });

  it('m3: a failed probe is not repeated for a minute; the operation re-inits', async () => {
    const { mgr } = manager();
    const probe = vi.fn(async () => { throw new Error('unreachable'); });
    vi.stubGlobal('fetch', probe);
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    okUpload(mgr);
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    await mgr.uploadVectors(A.toString(), [vec('v2')]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('m3: after the minute the probe is asked again', async () => {
    const { mgr } = manager();
    const probe = vi.fn(async () => { throw new Error('unreachable'); });
    vi.stubGlobal('fetch', probe);
    vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    okUpload(mgr);
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    mgr.holdsKeyProbeFailedAt.set('1433', Date.now() - SessionManager.HOLDS_KEY_PROBE_RETRY_MS - 1);
    await mgr.uploadVectors(A.toString(), [vec('v2')]);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('m2: a job whose session ended while it waited for an init is refused', async () => {
    const { mgr } = manager();
    const inFlight = deferred();
    mgr.initChain = inFlight.promise;
    const acquiring = mgr.acquireSessionTransport('1433', 'job');
    await flush();
    mgr.getSession('1433').status = 'ended';
    inFlight.resolve();
    await expect(acquiring).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
  });
});

// ── Review round 4 ─────────────────────────────────────────────────────────────────────────────────
describe('B1 review round 4', () => {
  const okUpload = (mgr: any) => vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });

  for (const [name, fail] of [
    ['the host key lookup fails', (mgr: any, _ws: any) => { mgr.hostManager.getHostPublicKey = vi.fn(async () => { throw new Error('rpc down'); }); }],
    ['the node refuses the init', (_mgr: any, ws: any) => { ws.autoAck = false; setTimeout(() => ws.emit({ type: 'error', session_id: '1433', code: 'CIRCUIT_OPEN', message: 'busy' }), 5); }],
  ] as const) {
    it(`M: after a failed shared re-init (${name}) the next operation inits again`, async () => {
      const { mgr, ws } = manager({ features: ['session-job-completion'] });
      fail(mgr, ws);
      const config = { chainId: 84532, host: HOST, modelId: MODEL, endpoint: ENDPOINT, encryption: true };
      await expect(mgr.sendEncryptedInit(ws, config, A, 2866n)).rejects.toBeDefined();
      expect(mgr.sessionKey).not.toBe(KEY_A);   // the failed init's key is in the shared fields
      const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
      okUpload(mgr);
      await mgr.uploadVectors(A.toString(), [vec('v1')]);
      expect(init).toHaveBeenCalledTimes(1);
    });
  }

  it('m2: a later 2xx answer clears the failed-probe entry', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    mgr.holdsKeyProbeFailedAt.set('1433', Date.now());
    await mgr.isJobCompletionNode('1433', true);
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    okUpload(mgr);
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    expect(init).not.toHaveBeenCalled();
  });

  it('m2: ending the session clears it', async () => {
    const { mgr } = manager();
    mgr.holdsKeyProbeFailedAt.set('1434', Date.now());
    await mgr.endSession(B);
    expect(mgr.holdsKeyProbeFailedAt.has('1434')).toBe(false);
  });
});

// ── Review round 5 ─────────────────────────────────────────────────────────────────────────────────
describe('B1 review round 5', () => {
  it('re-registering the session that owns the shared socket makes the next operation init (new lora / job reaches the node)', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('re-registering another session leaves the owner\'s binding alone', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    mgr.registerExternalSession({ sessionId: B, jobId: 2868n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    const init = vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY_A);
    vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
    await mgr.uploadVectors(A.toString(), [vec('v1')]);
    expect(init).not.toHaveBeenCalled();
  });

  it('registerDelegatedSession of the owner does the same', async () => {
    const { mgr } = manager({ features: ['session-job-completion'] });
    await mgr.registerDelegatedSession({ sessionId: A, jobId: 2866n, hostUrl: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532,
      depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600, conversationLog: false });
    expect(mgr.sessionKeyClient).toBeUndefined();
  });
});

// ── Flags ──────────────────────────────────────────────────────────────────────────────────────────
describe('B1 capability flags', () => {
  it('advertises each B1 behaviour', () => {
    for (const flag of [
      'delegatedWebSearchConfig', 'sessionEndScoped', 'sessionInitErrorDetails', 'uploadVectorsNodeCounts',
      'connectionGenerationAccessor', 'sharedConnectionKeyReuse', 'transcodeOrphanedSessions', 'transcodeStorageMethods',
    ]) expect((SDK_CAPABILITIES as any)[flag]).toBe(true);
  });
});
