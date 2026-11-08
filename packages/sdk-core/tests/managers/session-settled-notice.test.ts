// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-SESSION-SETTLED-NOTICE (sdk-core 1.39.22): node 8.63.0 (`session-settled-notice`) announces a settlement
 * with a `session_settled` frame and refuses new work with `SESSION_SETTLED`. The SDK marks the session settled from
 * either, and on such a node reads the chain only for what the node cannot see (owner, 2026-11-08).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { LtxManager } from '../../src/managers/LtxManager';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { SDKError } from '../../src/types';
import { LtxError } from '../../src/errors/ltx-errors';
import { TrainingError } from '../../src/errors/training-errors';
import { TranscodeError } from '../../src/errors/transcode-errors';
import { ImageGenerationError } from '../../src/errors/image-generation-errors';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { generateImageWs } from '../../src/utils/image-generation-ws';
import { FakeWs, FakeWebSocket, makeFakeEncryptionManager, fakeHostManager, stubNodeVersion } from '../helpers/session-doubles';

vi.mock('../../src/utils/transcode-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/transcode-ws')>()), submitTranscodeWs: vi.fn() }));
vi.mock('../../src/utils/image-generation-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/image-generation-ws')>()), generateImageWs: vi.fn() }));

const HOST = '0x' + '4'.repeat(40);
const MODEL = '0x' + 'ab'.repeat(32);
const ENDPOINT = 'https://host2.fabstir.net';
const A = 1433n, B = 1434n;
const KEY = new Uint8Array(32).fill(1);
const NOTICE = 'session-settled-notice';
const vec = (id: string) => ({ id, vector: new Array(384).fill(0.1), metadata: {} });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
function deferred<T = void>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
const settledFrame = (sid: string, reason = 'work_finished') => ({ type: 'session_settled', session_id: sid, job_id: sid, reason });
const refusalFrame = (sid: string, id?: string) => ({ type: 'error', code: 'SESSION_SETTLED', session_id: sid, message: `session ${sid} has been settled; open a new session for new work`, ...(id ? { id } : {}) });

/** Sessions A and B adopted; the shared socket is A's, watched like a real one. `features` is what /v1/version reports. */
function manager(opts: { features?: string[]; status?: number } = {}) {
  stubNodeVersion(opts.features ?? [NOTICE]);
  const storage = { storeConversation: vi.fn(), updateConversationMetadata: vi.fn(async () => {}), appendMessages: vi.fn(async () => {}), loadConversation: vi.fn(async () => null) };
  const payment = { completeSession: vi.fn(async () => '0xtx'), signer: { getAddress: async () => HOST } };
  const mgr: any = new SessionManager(payment as any, storage as any);
  mgr.initialized = true;
  mgr.encryptionManager = makeFakeEncryptionManager();
  mgr.hostManager = fakeHostManager();
  const read = vi.fn(async (_jobId: bigint) => ({ status: opts.status ?? 0, startTime: BigInt(Math.floor(Date.now() / 1000)), maxDuration: 3600n }));
  mgr.setSessionJobReader(() => ({ getSessionJobOnChain: read }));
  mgr.setConfidentialHosts([HOST]);
  for (const [sid, jid] of [[A, 1433n], [B, 1434n]] as const) {
    mgr.registerExternalSession({ sessionId: sid, jobId: jid, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
  }
  const ws: any = new FakeWs();
  ws.disconnect = vi.fn(async () => {});
  ws.sendMessage = vi.fn(async () => 'ok');
  mgr.wsClient = ws; mgr.wsSessionId = A.toString(); mgr.sessionKey = KEY;
  mgr.watchConnectionIdentity(ws);
  mgr.sessionKeyGeneration = 1; mgr.sessionKeyClient = ws;
  mgr.sessionCrypto.set(A.toString(), { key: KEY, messageIndex: 0 });
  vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY);
  const rag = vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
  return { mgr, ws, read, rag, storage };
}
const upload = (mgr: any, sid = A) => mgr.uploadVectors(sid.toString(), [vec('v1')]);
const settledByNode = { code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE' } };

beforeEach(() => { vi.mocked(submitTranscodeWs).mockReset(); vi.mocked(generateImageWs).mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('N1: the session_settled notice', () => {
  it('on the shared socket: the session is settled locally and later work refused without a read', async () => {
    const { mgr, ws, read, rag, storage } = manager();
    ws.emit(settledFrame('1433'));
    expect(mgr.getSession('1433').status).toBe('completed');
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeReason: 'work_finished', sessionId: '1433' } });
    expect(read).not.toHaveBeenCalled();
    expect(rag).not.toHaveBeenCalled();
    expect(storage.updateConversationMetadata).toHaveBeenCalledWith('1433', expect.objectContaining({ status: 'completed' }));
  });

  it('names its session: a notice for B leaves A alone', async () => {
    const { mgr, ws } = manager();
    ws.emit(settledFrame('1434', 'last_connection_closed'));
    expect(mgr.getSession('1434').status).toBe('completed');
    expect(mgr.getSession('1433').status).toBe('active');
  });

  it('does not abort work already in flight', async () => {
    const { mgr, ws, rag } = manager();
    await upload(mgr);
    const answer = deferred<any>();
    rag.mockImplementationOnce(() => answer.promise);
    const uploading = upload(mgr);
    await flush();
    ws.emit(settledFrame('1433'));
    answer.resolve({ uploaded: 1, rejected: 0, errors: [] });
    await expect(uploading).resolves.toMatchObject({ uploaded: 1 });
  });

  it('on a dedicated job socket too', async () => {
    const { mgr } = manager();
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const t = await mgr.acquireSessionTransport('1434', 'job');
    FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify(settledFrame('1434', 'ltx_finished')) });
    expect(mgr.getSession('1434').status).toBe('completed');
    await t.wsClient.disconnect();
  });

  it('a notice for a session this manager does not know is ignored', () => {
    const { mgr, ws } = manager();
    expect(() => ws.emit(settledFrame('9999'))).not.toThrow();
  });
});

describe('N2: the SESSION_SETTLED refusal', () => {
  it('encrypted chat: the prompt rejects SESSION_NOT_ACTIVE / SETTLED_BY_NODE with the node code', async () => {
    const { mgr, ws } = manager();
    await upload(mgr);
    vi.spyOn(mgr, 'sendEncryptedMessage').mockImplementation(async () => { setTimeout(() => ws.emit(refusalFrame('1433')), 0); });
    const err: any = await mgr.sendPromptStreaming(A, 'hello', () => {}).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeCode: 'SESSION_SETTLED', sessionId: '1433' } });
    expect(mgr.getSession('1433').status).toBe('completed');
  });

  it('plaintext chat: the refused prompt rejects SESSION_NOT_ACTIVE / SETTLED_BY_NODE', async () => {
    const { mgr, ws } = manager();
    mgr.getSession('1433').encryption = false;
    vi.spyOn(mgr, 'sendPlaintextInit').mockResolvedValue(undefined);
    await upload(mgr);
    ws.sendMessage = vi.fn(async (m: any) => {
      ws.emit(refusalFrame('1433', 'msg-1'));
      throw new SDKError('session 1433 has been settled', 'WS_REQUEST_ERROR', { originalError: refusalFrame('1433', 'msg-1') });
    });
    const err: any = await mgr.sendPromptStreaming(A, 'hello', () => {}).catch((e: any) => e);
    expect(err).toMatchObject(settledByNode);
  });

  it('vector upload: the refusal (matched by session id) rejects at once, with the landed batches', async () => {
    const { mgr, ws, rag } = manager();
    await upload(mgr);
    rag.mockRestore();
    ws.sendWithoutResponse = vi.fn(async (m: any) => { if (m.type === 'uploadVectors') setTimeout(() => ws.emit(refusalFrame('1433')), 0); });
    const t0 = Date.now();
    const err: any = await upload(mgr).catch((e: any) => e);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', batch: 1, uploadedSoFar: 0 } });
  });

  it('a refusal for another session leaves this socket\'s waiters alone', async () => {
    const { mgr, ws } = manager();
    const waiter = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    mgr.pendingRequests.set('r-a', waiter);   // A's upload on A's socket
    ws.emit(refusalFrame('1434'));
    expect(waiter.reject).not.toHaveBeenCalled();
    expect(mgr.getSession('1434').status).toBe('completed');
  });

  it('vector search: the refusal rejects at once', async () => {
    const { mgr, ws, rag } = manager();
    await upload(mgr);
    rag.mockRestore();
    mgr.getSession('1433').ragContext = { vectorDbId: 'vectors-1433' };
    ws.sendWithoutResponse = vi.fn(async (m: any) => { if (m.type === 'searchVectors') setTimeout(() => ws.emit(refusalFrame('1433')), 0); });
    const t0 = Date.now();
    await expect(mgr.searchVectors('1433', new Array(384).fill(0.1))).rejects.toMatchObject(settledByNode);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('image generation: the refused image rejects SESSION_NOT_ACTIVE / SETTLED_BY_NODE', async () => {
    const { mgr, ws } = manager();
    await upload(mgr);
    vi.mocked(generateImageWs).mockImplementation(async () => {
      ws.emit(refusalFrame('1433'));
      throw new ImageGenerationError('session 1433 has been settled', 'IMAGE_GENERATION_FAILED');
    });
    await expect(mgr.generateImage('1433', 'a red bicycle')).rejects.toMatchObject(settledByNode);
  });

  it('transcode: the encrypted transcode_error SESSION_SETTLED settles the session; the TranscodeError keeps its code', async () => {
    const { mgr, read } = manager();
    await upload(mgr);
    const refused = new TranscodeError('settled', 'TRANSCODE_FAILED', HOST, { nodeCode: 'SESSION_SETTLED' });
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: Promise.reject(refused) } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await expect(h.result).rejects.toBe(refused);
    read.mockClear();
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeCode: 'SESSION_SETTLED' } });
    expect(read).not.toHaveBeenCalled();
  });

  it('LTX: a GENERATION_FAILED carrying the node code SESSION_SETTLED becomes SESSION_NOT_ACTIVE / SETTLED_BY_NODE', async () => {
    const sm = { assertConfidentialHost: () => {}, submitLtx: vi.fn(async () => { throw new LtxError('settled', 'GENERATION_FAILED', { nodeCode: 'SESSION_SETTLED' }); }) };
    const lm: any = new LtxManager({ sessionManager: sm } as any);
    lm.adoptExistingSession = vi.fn(async () => ({ sessionId: 1600n, jobId: 3200n, entry: {} }));
    lm.clientWait = vi.fn(() => ({}));
    const err: any = await lm.generate({ seed: '1' }, HOST, {} as any, { existingSession: { sessionId: 1600n, jobId: 3200n } } as any).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeCode: 'SESSION_SETTLED', sessionId: 1600n, jobId: 3200n } });
  });

  it('training: a refused run is SESSION_NOT_ACTIVE: a fresh session, not retried or re-shopped', () => {
    const tag = { sessionId: 1600n, jobId: 3200n, adopted: true };
    const fromWire = new TrainingError('settled', 'TRAIN_FAILED', { sdkCode: 'SESSION_SETTLED' });
    const e: any = (TrainingManager as any).withSessionIds(fromWire, tag, true);
    expect(e).toMatchObject({ code: 'SESSION_NOT_ACTIVE', detail: { sdkCode: 'SESSION_SETTLED', sdkReason: 'SETTLED_BY_NODE', sessionId: 1600n } });
    expect(e.requiresFreshSession).toBe(true);
    expect(e.isRetryable).toBe(false);
    expect(e.isReshoppable(0)).toBe(false);
  });

  it('a job whose result carries the refusal settles its session (LTX / training path)', async () => {
    const { mgr } = manager();
    await upload(mgr);
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: Promise.reject(Object.assign(new Error('x'), { code: 'GENERATION_FAILED', details: { nodeCode: 'SESSION_SETTLED' } })) } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await h.result.catch(() => {});
    expect(mgr.getSession('1433').status).toBe('completed');
  });
});

describe('N3: chain reads on a session-settled-notice node', () => {
  it('an Active read clears the mark at once (no horizon)', async () => {
    const { mgr, read } = manager();
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a failed job leaves no sticky mark: one read after it, then none', async () => {
    const { mgr, read } = manager();
    await upload(mgr); read.mockClear();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: Promise.reject(new Error('TRANSCODE_TIMEOUT')) } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await h.result.catch(() => {});
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a node without the marker keeps 1.39.21: the 20 min horizon re-reads', async () => {
    const { mgr, read } = manager({ features: [] });
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a failed probe counts as no marker (1.39.21 rules)', async () => {
    const { mgr, read } = manager();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable'); }));
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('every new shared connection is read once', async () => {
    const { mgr, read } = manager();
    await upload(mgr); read.mockClear();
    mgr.wsClient = undefined; mgr.wsSessionId = undefined;   // closed cleanly, no dead client left behind
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    await upload(mgr);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a node without the marker: a clean new connection is not read (1.39.21)', async () => {
    const { mgr, read } = manager({ features: [] });
    (SessionManager as any).SETTLE_HORIZON_MS = 0;
    try {
      await upload(mgr); read.mockClear();
      mgr.wsClient = undefined; mgr.wsSessionId = undefined;
      FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
      await upload(mgr);
      expect(read).not.toHaveBeenCalled();
    } finally { (SessionManager as any).SETTLE_HORIZON_MS = 20 * 60_000; }
  });

  it('every new dedicated job connection is read before it connects', async () => {
    const { mgr, read } = manager();
    await upload(mgr, B); read.mockClear();
    FakeWebSocket.reset(); FakeWebSocket.autoOpen = false; vi.stubGlobal('WebSocket', FakeWebSocket);
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const acquiring = mgr.acquireSessionTransport('1434', 'job').catch((e: any) => e);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(0);   // not before the read answers
    answer.resolve({ status: 1 });
    expect(await acquiring).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('a node error frame naming the session marks it', async () => {
    const { mgr, ws, read } = manager();
    await upload(mgr); read.mockClear();
    ws.emit({ type: 'error', code: 'RATE_LIMIT', session_id: '1433', message: 'slow down' });
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('10 minutes idle marks it', async () => {
    const { mgr, read } = manager();
    await upload(mgr); read.mockClear();
    await upload(mgr);
    expect(read).not.toHaveBeenCalled();
    mgr.lastGatedAt.set('1433', Date.now() - 10 * 60_000 - 1);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('the idle clock restarts at every gated call, marked or not', async () => {
    const { mgr } = manager();
    await upload(mgr);   // a marked pass
    mgr.lastGatedAt.set('1433', Date.now() - 9 * 60_000);
    await upload(mgr);   // an unmarked pass
    expect(Date.now() - mgr.lastGatedAt.get('1433')).toBeLessThan(5_000);
  });

  it('idle does not mark on a node without the marker', async () => {
    const { mgr, read } = manager({ features: [] });
    (SessionManager as any).SETTLE_HORIZON_MS = 0;
    try {
      await upload(mgr); read.mockClear();
      mgr.lastGatedAt.set('1433', Date.now() - 10 * 60_000 - 1);
      await upload(mgr);
      expect(read).not.toHaveBeenCalled();
    } finally { (SessionManager as any).SETTLE_HORIZON_MS = 20 * 60_000; }
  });
});

describe('Review round 1', () => {
  const restOk = () => vi.fn(async (url: string) => String(url).endsWith('/v1/version')
    ? { ok: true, json: async () => ({ features: [NOTICE] }) } as any
    : { ok: true, json: async () => ({ content: 'hi' }) } as any);

  it('MAJOR: on a notice node a REST prompt keeps 1.39.21\'s rule (the node does not refuse REST): each call inside the horizon reads', async () => {
    const { mgr, read } = manager();
    vi.stubGlobal('fetch', restOk());
    await mgr.sendPrompt(A, 'one');
    await mgr.sendPrompt(A, 'two');
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValue({ status: 1 } as any);   // the completion lands
    await expect(mgr.sendPrompt(A, 'three')).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
  });

  it('MAJOR: streamResponse keeps it too (webSearch is REST /v1/search from 1.39.23 and is not gated)', async () => {
    const { mgr, read } = manager();
    vi.stubGlobal('fetch', restOk());
    await mgr.streamResponse(A, 'one', () => {});
    await mgr.streamResponse(A, 'two', () => {}).catch(() => {});
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('m2: a notice for a paused session completes it (it cannot be resumed)', async () => {
    const { mgr, ws } = manager();
    mgr.getSession('1434').status = 'paused';
    ws.emit(settledFrame('1434'));
    expect(mgr.getSession('1434').status).toBe('completed');
    await expect(mgr.resumeSession(B)).rejects.toBeDefined();
  });

  it('m3: a refusal on a dedicated socket leaves the shared socket\'s waiters alone', async () => {
    const { mgr } = manager();
    const waiter = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    mgr.pendingRequests.set('r-a', waiter);
    mgr.dedicatedSettledFrameListener(refusalFrame('1433'));
    expect(waiter.reject).not.toHaveBeenCalled();
    expect(mgr.getSession('1433').status).toBe('completed');
  });

  it('m3: a refusal on the shared socket leaves web-search waiters alone (the node does not refuse a searchRequest)', () => {
    const { mgr, ws } = manager();
    const search = { resolve: vi.fn(), reject: vi.fn(), timeoutId: setTimeout(() => {}, 0) };
    mgr.pendingSearches.set('s-a', search);
    ws.emit(refusalFrame('1433'));
    expect(search.reject).not.toHaveBeenCalled();
  });

  it('round 2: nodeReason reaches LTX and training', async () => {
    const gateErr = new SDKError('settled', 'SESSION_NOT_ACTIVE', { reason: 'SETTLED_BY_NODE', nodeReason: 'ltx_finished', nodeCode: 'SESSION_SETTLED', sessionId: '1600' });
    const sm = { assertConfidentialHost: () => {}, submitLtx: vi.fn(async () => { throw gateErr; }) };
    const lm: any = new LtxManager({ sessionManager: sm } as any);
    lm.adoptExistingSession = vi.fn(async () => ({ sessionId: 1600n, jobId: 3200n, entry: {} }));
    lm.clientWait = vi.fn(() => ({}));
    const err: any = await lm.generate({ seed: '1' }, HOST, {} as any, { existingSession: { sessionId: 1600n, jobId: 3200n } } as any).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_BY_NODE', nodeReason: 'ltx_finished' } });
    const t: any = (TrainingManager as any).withSessionIds(gateErr, { sessionId: 1600n, jobId: 3200n, adopted: true }, true);
    expect(t).toMatchObject({ code: 'SESSION_NOT_ACTIVE', detail: { sdkReason: 'SETTLED_BY_NODE', nodeReason: 'ltx_finished' } });
  });

  it('m6: a notice naming another job under the id is ignored', () => {
    const { mgr, ws } = manager();
    ws.emit({ ...settledFrame('1433'), job_id: '777' });
    expect(mgr.getSession('1433').status).toBe('active');
  });
});

describe('Review round 1 (idle)', () => {
  it('a REST prompt after 10 min idle on a notice node is read too', async () => {
    const { mgr, read } = manager();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).endsWith('/v1/version')
      ? { ok: true, json: async () => ({ features: [NOTICE] }) } as any : { ok: true, json: async () => ({ content: 'hi' }) } as any));
    await upload(mgr);   // a WebSocket call: one read clears the adoption mark
    read.mockClear();
    mgr.lastGatedAt.set('1433', Date.now() - 10 * 60_000 - 1);
    await mgr.sendPrompt(A, 'hello again');
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('N4: flag', () => {
  it('settledNotice', () => {
    expect((SDK_CAPABILITIES as any).settledNotice).toBe(true);
  });
});
