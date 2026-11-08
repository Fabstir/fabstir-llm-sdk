// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-SESSION-SETTLED-GUARD (sdk-core 1.39.21): the node settles a session at events the client is not told
 * about (last connection closed, the transcode grace, an LTX deferred completion, expiry), and answers a prompt or image on
 * a settled session unbilled. After any SDK-visible event that can lead to a settlement, the next new work on that session
 * reads its status on chain once and is refused if it is settled. An unreadable status refuses (owner, 2026-11-07).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { LtxManager } from '../../src/managers/LtxManager';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { LTX_CLIENT_ERROR_CODES } from '../../src/errors/ltx-errors';
import { TRAINING_CLIENT_ERROR_CODES } from '../../src/errors/training-errors';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { SDKError } from '../../src/types';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { FakeWs, FakeWebSocket, makeFakeEncryptionManager, fakeHostManager, stubNodeVersion } from '../helpers/session-doubles';

vi.mock('../../src/utils/transcode-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/transcode-ws')>()), submitTranscodeWs: vi.fn() }));

const HOST = '0x' + '4'.repeat(40);
const MODEL = '0x' + 'ab'.repeat(32);
const ENDPOINT = 'https://host2.fabstir.net';
const A = 1433n, B = 1434n;
const KEY = new Uint8Array(32).fill(1);
const vec = (id: string) => ({ id, vector: new Array(384).fill(0.1), metadata: {} });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
function deferred<T = void>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** Sessions A and B adopted (so marked); the shared socket is A's. `status` is what the chain answers. */
function manager(opts: { status?: unknown; reader?: 'none' | 'throws' } = {}) {
  stubNodeVersion([]);
  const storage = { storeConversation: vi.fn(), updateConversationMetadata: vi.fn(async () => {}), appendMessages: vi.fn(async () => {}), loadConversation: vi.fn(async () => null) };
  const payment = { completeSession: vi.fn(async () => '0xtx'), signer: { getAddress: async () => HOST } };
  const mgr: any = new SessionManager(payment as any, storage as any);
  mgr.initialized = true;
  mgr.encryptionManager = makeFakeEncryptionManager();
  mgr.hostManager = fakeHostManager();
  const read = vi.fn(async (_jobId: bigint) => {
    if (opts.reader === 'throws') throw new Error('rpc down');
    return { status: opts.status ?? 0, startTime: BigInt(Math.floor(Date.now() / 1000)), maxDuration: 3600n };
  });
  if (opts.reader !== 'none') mgr.setSessionJobReader(() => ({ getSessionJobOnChain: read }));
  mgr.setConfidentialHosts([HOST]);
  for (const [sid, jid] of [[A, 2866n], [B, 2868n]] as const) {
    mgr.registerExternalSession({ sessionId: sid, jobId: jid, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
  }
  const ws: any = new FakeWs();
  ws.disconnect = vi.fn(async () => {});
  ws.sendMessage = vi.fn(async () => 'ok');
  mgr.wsClient = ws; mgr.wsSessionId = A.toString(); mgr.sessionKey = KEY;
  mgr.sessionKeyGeneration = 1; mgr.sessionKeyClient = ws;
  mgr.sessionCrypto.set(A.toString(), { key: KEY, messageIndex: 0 });
  vi.spyOn(mgr, 'sendEncryptedInit').mockResolvedValue(KEY);
  const rag = vi.spyOn(mgr, '_sendRAGRequest').mockResolvedValue({ uploaded: 1, rejected: 0, errors: [] });
  return { mgr, ws, read, rag, storage };
}
const upload = (mgr: any, sid = A) => mgr.uploadVectors(sid.toString(), [vec('v1')]);

// Most tests pin one read per mark; the settle horizon has its own group below.
beforeEach(() => { vi.mocked(submitTranscodeWs).mockReset(); (SessionManager as any).SETTLE_HORIZON_MS = 0; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); (SessionManager as any).SETTLE_HORIZON_MS = 300_000; });

describe('S2: the gate', () => {
  it('an adopted session is read once before its first new work; an Active answer clears the mark', async () => {
    const { mgr, read } = manager();
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(2866n);
  });

  it('a settled session is refused before anything is sent, and marked completed', async () => {
    const { mgr, rag, read } = manager({ status: 1 });
    const err: any = await upload(mgr).catch((e: any) => e);
    expect(err).toBeInstanceOf(SDKError);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN', sessionId: '1433', status: 1, retryable: false } });
    expect(rag).not.toHaveBeenCalled();
    expect(mgr.getSession('1433').status).toBe('completed');
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(read).toHaveBeenCalledTimes(1);   // the local status refuses now, without a read
  });

  for (const [name, opts] of [['the read fails', { reader: 'throws' as const }], ['no reader is wired', { reader: 'none' as const }], ['the status is not a number', { status: 'x' }]] as const) {
    it(`${name}: refused retryable, nothing sent, and the next call reads again`, async () => {
      const { mgr, rag, read } = manager(opts);
      const err: any = await upload(mgr).catch((e: any) => e);
      expect(err).toMatchObject({ code: 'SESSION_STATUS_UNREADABLE', details: { sessionId: '1433', retryable: true } });
      expect(err.message).toMatch(opts.reader === 'none' ? /no session reader is wired/ : opts.reader === 'throws' ? /rpc down/ : /no session status on chain/);
      expect(rag).not.toHaveBeenCalled();
      expect(mgr.getSession('1433').status).toBe('active');
      if (opts.reader !== 'none') {
        await upload(mgr).catch(() => {});
        expect(read).toHaveBeenCalledTimes(2);
      }
    });
  }

  it('sendPrompt (REST) is gated', async () => {
    const { mgr } = manager({ status: 1 });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(mgr.sendPrompt(A, 'hi')).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendPromptStreaming is gated before any init or frame', async () => {
    const { mgr, ws } = manager({ status: 1 });
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockResolvedValue(undefined);
    await expect(mgr.sendPromptStreaming(A, 'hello', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(mgr.sendEncryptedInit).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(ws.sendMessage).not.toHaveBeenCalled();
    expect(mgr.getSession('1433').prompts).toEqual([]);   // a refused prompt is not recorded (round 7)
  });

  it('sendPromptStreaming refuses a settled session before opening any socket', async () => {
    const { mgr } = manager({ status: 1 });
    mgr.wsClient = undefined; mgr.wsSessionId = undefined;
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    await expect(mgr.sendPromptStreaming(A, 'hello', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('sendPromptStreaming: a dropped socket it replaces marks the session, and the refusal reaches the caller unwrapped', async () => {
    const { mgr, ws, read } = manager();
    await upload(mgr);   // A read Active: unmarked
    read.mockResolvedValue({ status: 1 } as any);
    ws.isConnected = () => false;
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockResolvedValue(undefined);
    await expect(mgr.sendPromptStreaming(A, 'hello', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('streamResponse is gated', async () => {
    const { mgr } = manager({ status: 1 });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(mgr.streamResponse(A, 'hello', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searchVectors is gated', async () => {
    const { mgr, rag } = manager({ status: 1 });
    mgr.getSession('1433').ragContext = { vectorDbId: 'vectors-1433' };
    await expect(mgr.searchVectors('1433', new Array(384).fill(0.1))).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('generateImage is gated before any init', async () => {
    const { mgr } = manager({ status: 1 });
    await expect(mgr.generateImage('1433', 'a red bicycle')).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(mgr.sendEncryptedInit).not.toHaveBeenCalled();
  });

  it('a job submit is gated before any socket or frame', async () => {
    const { mgr } = manager({ status: 1 });
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    await expect(mgr.submitTranscode('1434', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 })).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN', sessionId: '1434' } });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it('a result fetch is not gated (it serves settled sessions by design)', async () => {
    const { mgr, read } = manager({ status: 1 });
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const t = await mgr.acquireSessionTransport('1434', 'fetch');
    expect(t.ownsWs).toBe(true);
    expect(read).not.toHaveBeenCalled();
    await t.wsClient.disconnect();
  });

  it('settling writes completed to the log metadata (a restored session with a log)', async () => {
    const { mgr, storage } = manager({ status: 1 });
    storage.loadConversation.mockResolvedValue({ createdAt: 1, metadata: { jobId: '9000', model: MODEL, provider: HOST, endpoint: ENDPOINT, status: 'active', chainId: 84532 } });
    await expect(mgr.sendPromptStreaming(4500n, 'hello', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN', sessionId: '4500' } });
    expect(storage.updateConversationMetadata).toHaveBeenCalledWith('4500', expect.objectContaining({ status: 'completed' }));
  });
});

describe('S1: the events that mark a session', () => {
  /** Clear A's adoption mark with one Active read; returns the read spy. */
  async function cleared(opts: any = {}) {
    const m = manager(opts);
    await upload(m.mgr);
    m.read.mockClear();
    m.rag.mockClear();
    return m;
  }

  it('registerDelegatedSession marks', async () => {
    const { mgr, read } = manager();
    await mgr.registerDelegatedSession({ sessionId: 77n, jobId: 78n, hostUrl: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532,
      depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600, conversationLog: false });
    await upload(mgr, 77n).catch(() => {});
    expect(read).toHaveBeenCalledWith(78n);
  });

  it('a job whose result settles marks its session', async () => {
    const { mgr, read } = await cleared();
    const result = deferred<any>();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: result.promise } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await upload(mgr);
    expect(read).not.toHaveBeenCalled();   // not before the job ends
    result.resolve({ taskId: 't' });
    await h.result;
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a job whose result rejects marks it too', async () => {
    const { mgr, read } = await cleared();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: Promise.reject(new Error('BILLING_FAILED')) } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await h.result.catch(() => {});
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a job submit that fails marks it', async () => {
    const { mgr, read } = await cleared();
    vi.mocked(submitTranscodeWs).mockRejectedValueOnce(new Error('refused'));
    await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 }).catch(() => {});
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a reconnect of the shared socket marks its owner; its first open does not', async () => {
    const { mgr, read } = await cleared();
    let handler: (g: number) => void = () => {};
    const x: any = new FakeWs();
    x.onConnectionChange = (h: any) => { handler = h; return () => {}; };
    mgr.wsClient = x; mgr.sessionKeyClient = x; mgr.watchConnectionIdentity(x);
    handler(1);
    await upload(mgr);
    expect(read).not.toHaveBeenCalled();
    handler(2);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('a dropped shared socket replaced by the next operation marks its owner before that operation is sent', async () => {
    const { mgr, ws, read, rag } = await cleared();
    read.mockResolvedValue({ status: 1 } as any);
    ws.isConnected = () => false;
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('tearing down the shared socket for another session marks its old owner', async () => {
    const { mgr, read } = await cleared();
    await upload(mgr, B);   // B's adoption read, then B takes the socket from A
    read.mockClear();
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    await upload(mgr, B);
    expect(read).not.toHaveBeenCalled();   // B was not marked again
    // A's socket was closed for B: A is marked
    await upload(mgr, A).catch(() => {});
    expect(read).toHaveBeenCalledWith(2866n);
  });

  it('a mark that arrives during the read survives its Active answer', async () => {
    const { mgr, read } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    let handler: (g: number) => void = () => {};
    const x: any = new FakeWs();
    x.onConnectionChange = (h: any) => { handler = h; return () => {}; };
    mgr.wsClient = x; mgr.sessionKeyClient = x; mgr.watchConnectionIdentity(x);
    const first = upload(mgr);
    await flush();
    handler(2);   // a reconnect while the status was being read
    answer.resolve({ status: 0 });
    await first;
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('Review round 1', () => {
  it('M1: inside the settle horizon an Active read keeps the mark, so each new call reads again', async () => {
    const { mgr, read } = manager();
    (SessionManager as any).SETTLE_HORIZON_MS = 300_000;
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValue({ status: 1 } as any);   // the node's settlement lands
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
  });

  it('M1: past the horizon an Active read clears it', async () => {
    const { mgr, read } = manager();
    (SessionManager as any).SETTLE_HORIZON_MS = 300_000;
    mgr.maySettle.get('1433').at = Date.now() - 300_001;
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('M3: a job that failed leaves a sticky mark: Active reads never clear it, a settled read ends the session', async () => {
    const { mgr, read } = manager();
    await upload(mgr); read.mockClear();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: Promise.reject(new Error('TRANSCODE_TIMEOUT')) } as any);
    const h = await mgr.submitTranscode('1433', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 });
    await h.result.catch(() => {});
    mgr.maySettle.get('1433').at = Date.now() - 10 * 300_000;   // long past any horizon
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
    read.mockResolvedValue({ status: 2 } as any);
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN', status: 2 } });
  });

  it('M3: a later mark keeps an earlier sticky one sticky', async () => {
    const { mgr, read } = manager();
    mgr.markMaySettle('1433', true);
    mgr.markMaySettle('1433');
    await upload(mgr);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('M2: completeSession marks a session it restores from the log, and one whose completion fails', async () => {
    const { mgr, storage, read } = manager();
    storage.loadConversation.mockResolvedValue({ createdAt: 1, metadata: { jobId: '9100', model: MODEL, provider: HOST, endpoint: ENDPOINT, status: 'active', chainId: 84532 } });
    mgr.paymentManager.completeSession = vi.fn(async () => { throw new Error('reverted: already completed'); });
    await expect(mgr.completeSession(4600n, 10, '0x')).rejects.toMatchObject({ code: 'SESSION_COMPLETE_ERROR' });
    read.mockResolvedValue({ status: 1 } as any);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(mgr.sendPrompt(4600n, 'hi')).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('M2: a failed completion of an in-memory session marks it', async () => {
    const { mgr, read } = manager();
    await upload(mgr); read.mockClear();
    mgr.paymentManager.completeSession = vi.fn(async () => { throw new Error('reverted'); });
    await mgr.completeSession(A, 10, '0x').catch(() => {});
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('1.39.23: webSearch is not gated: it searches through REST /v1/search, which bills no session', async () => {
    const { mgr, read } = manager({ status: 1 });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [], resultCount: 0, provider: 'brave' }) })));
    await expect(mgr.webSearch(A, 'latest news')).resolves.toMatchObject({ resultCount: 0 });
    expect(read).not.toHaveBeenCalled();
  });

  it('m: a session on another chain than the reader is refused as not retryable', async () => {
    const { ChainMismatchError } = await import('../../src/errors/ChainErrors');
    const { mgr } = manager();
    mgr.setSessionJobReader(() => ({ getSessionJobOnChain: async () => { throw new ChainMismatchError(84532, 5611, 'session read'); } }));
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_STATUS_UNREADABLE', details: { retryable: false, reason: 'CHAIN_MISMATCH' } });
  });

  it('m: a null status is unreadable, not Active', async () => {
    const { mgr, rag, read } = manager();
    read.mockResolvedValue({ status: null } as any);
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_STATUS_UNREADABLE' });
    expect(rag).not.toHaveBeenCalled();
  });

  it('m: pauseSession marks the socket owner before closing; clearSessions drops every mark with the sessions', async () => {
    const { mgr } = manager();
    await upload(mgr);
    mgr.maySettle.clear();
    await mgr.pauseSession(B).catch(() => {});   // B is active; the socket is A's
    expect(mgr.maySettle.has('1433')).toBe(true);
    mgr.clearSessions();
    expect(mgr.maySettle.size).toBe(0);
  });

  it('m: a job socket whose init fails marks the session', async () => {
    const { mgr } = manager();
    mgr.maySettle.clear();
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    mgr.sendEncryptedInit.mockRejectedValueOnce(new Error('init refused'));
    await mgr.acquireSessionTransport('1434', 'job').catch(() => {});
    expect(mgr.maySettle.has('1434')).toBe(true);
  });
});

describe('Review round 2', () => {
  it('M1: a gate after one that found the session settled refuses too (status re-checked at every gate)', async () => {
    const { mgr, rag } = manager({ status: 1 });
    await expect(upload(mgr)).rejects.toMatchObject({ details: { reason: 'SETTLED_ON_CHAIN' } });
    // A call that passed its own status check before the session was found settled meets the gate's re-check
    const session = mgr.getSession('1433');
    await expect(mgr.refuseIfSettledOnChain('1433', session)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('M1: concurrent calls on a session found settled are both refused', async () => {
    const { mgr, read, rag } = manager();
    const answer = deferred<any>();
    read.mockImplementation(() => answer.promise);   // the chain gives both reads the same answer
    const first = upload(mgr).catch((e: any) => e);
    await flush();
    const second = upload(mgr).catch((e: any) => e);   // past its status check, waiting at the gate's read
    answer.resolve({ status: 1 });
    expect(await first).toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(await second).toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(rag).not.toHaveBeenCalled();
  });

  it('M1: an image-intent prompt whose image gate finds the session settled does not fall back to the LLM', async () => {
    const { mgr, ws, read } = manager();
    await upload(mgr);   // A read Active
    read.mockResolvedValue({ status: 1 } as any);
    ws.isConnected = () => false;   // dead: generateImage replaces it, which marks the session
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockResolvedValue(undefined);
    await expect(mgr.sendPromptStreaming(A, 'generate an image of a red bicycle', () => {})).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(send).not.toHaveBeenCalled();
  });


  it('M1: an image prompt whose status read fails is refused, not quietly answered by the LLM', async () => {
    const { mgr, ws, read } = manager();
    await upload(mgr);
    read.mockRejectedValueOnce(new Error('rpc blip'));   // the image gate's read; a later read would succeed
    ws.isConnected = () => false;
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockResolvedValue(undefined);
    await expect(mgr.sendPromptStreaming(A, 'generate an image of a red bicycle', () => {})).rejects.toMatchObject({ code: 'SESSION_STATUS_UNREADABLE' });
    expect(send).not.toHaveBeenCalled();
  });

  it('m1: the SDK reader\'s own CHAIN_MISMATCH code is not retryable', async () => {
    const { mgr } = manager();
    mgr.setSessionJobReader(() => ({ getSessionJobOnChain: async () => { throw new SDKError('chain', 'CHAIN_MISMATCH'); } }));
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_STATUS_UNREADABLE', details: { retryable: false, reason: 'CHAIN_MISMATCH' } });
  });

  it('m2: a read that never answers is unreadable after the network timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { mgr, read, rag } = manager();
      read.mockImplementationOnce(() => new Promise(() => {}));
      const p = upload(mgr).catch((e: any) => e);
      await vi.advanceTimersByTimeAsync(30_001);
      expect(await p).toMatchObject({ code: 'SESSION_STATUS_UNREADABLE', details: { retryable: true } });
      expect(rag).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('m7: ending a session drops its mark', async () => {
    const { mgr } = manager();
    await mgr.endSession(B);
    expect(mgr.maySettle.has('1434')).toBe(false);
  });
});

describe('Review round 3', () => {
  it('M1: a call whose read answers Active after another gate found the session settled is refused', async () => {
    const { mgr, read, rag } = manager();
    const slow = deferred<any>(), fast = deferred<any>();
    read.mockImplementationOnce(() => slow.promise).mockImplementationOnce(() => fast.promise);
    const lagging = upload(mgr).catch((e: any) => e);   // its RPC backend lags
    await flush();
    const prompt = upload(mgr).catch((e: any) => e);
    await flush();
    fast.resolve({ status: 1 });
    expect(await prompt).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    slow.resolve({ status: 0 });
    expect(await lagging).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('M1: endSession during the read: the REST prompt is not sent', async () => {
    const { mgr, read } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const prompting = mgr.sendPrompt(A, 'hi').catch((e: any) => e);
    await flush();
    await mgr.endSession(A);
    answer.resolve({ status: 0 });
    expect(await prompting).toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('round 4 #3: an identical re-seed during the read is not a refusal; the new record keeps its own mark', async () => {
    const { mgr, read, rag } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const uploading = upload(mgr);
    await flush();
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    answer.resolve({ status: 0 });
    await expect(uploading).resolves.toMatchObject({ uploaded: 1 });
    expect(rag).toHaveBeenCalledTimes(1);
    await upload(mgr);
    expect(read).toHaveBeenCalledTimes(2);   // the re-seed's mark is newer than the read: kept
  });

  it('round 4 #3: a session found settled while a re-seed of it happened mid-read is completed in both records', async () => {
    const { mgr, read } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const uploading = upload(mgr).catch((e: any) => e);
    await flush();
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    answer.resolve({ status: 1 });
    expect(await uploading).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(mgr.getSession('1433').status).toBe('completed');
  });

  it('M2: a job submit reads before the init-chain wait, so an init queued during the read is waited for', async () => {
    const { mgr, read } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const queued = deferred();
    let done = false;
    const acquiring = mgr.acquireSessionTransport('1433', 'job').then((t: any) => { done = true; return t; });
    await flush();
    mgr.initChain = queued.promise;   // a chat init queued during the read
    answer.resolve({ status: 0 });
    await flush();
    expect(done).toBe(false);
    queued.resolve();
    await acquiring;
    expect(done).toBe(true);
  });

  it('m1: re-registering a settled id clears its settled reason', async () => {
    const { mgr } = manager({ status: 1 });
    await upload(mgr).catch(() => {});
    mgr.registerExternalSession({ sessionId: A, jobId: 5000n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 5611 });
    mgr.getSession('1433').status = 'paused';
    let err: any;
    try { mgr.refuseIfNoLongerActive('1433', mgr.getSession('1433')); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { sessionId: '1433', status: 'paused' } });
    expect(err.details.reason).toBeUndefined();
  });
});

describe('Review round 4', () => {
  it('#2: a prompt still in its init handshake when another gate finds the session settled is not sent', async () => {
    const { mgr } = manager();
    await upload(mgr);   // read Active (horizon 0: cleared)
    const init = deferred<Uint8Array>();
    mgr.sendEncryptedInit.mockImplementationOnce(() => init.promise);
    mgr.sessionKeyClient = undefined;   // force a re-init, so the prompt awaits its handshake
    const send = vi.spyOn(mgr, 'sendEncryptedMessage').mockResolvedValue(undefined);
    const prompting = mgr.sendPromptStreaming(A, 'hello', () => {}).catch((e: any) => e);
    await flush();
    // meanwhile another call's gate found it settled
    mgr.settledOnChain.add('1433'); mgr.getSession('1433').status = 'completed';
    init.resolve(KEY);
    expect(await prompting).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('#2: an upload still in its init handshake when another gate finds the session settled is not sent', async () => {
    const { mgr, rag } = manager();
    await upload(mgr); rag.mockClear();
    const init = deferred<Uint8Array>();
    mgr.sendEncryptedInit.mockImplementationOnce(() => init.promise);
    mgr.sessionKeyClient = undefined;
    const uploading = upload(mgr).catch((e: any) => e);
    await flush();
    mgr.settledOnChain.add('1433'); mgr.getSession('1433').status = 'completed';
    init.resolve(KEY);
    expect(await uploading).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('round 5: a call holding a record that was ended stops, even if the id was re-adopted meanwhile', async () => {
    const { mgr, read, rag } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const uploading = upload(mgr).catch((e: any) => e);
    await flush();
    await mgr.endSession(A);   // the record this call holds is now ended…
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });   // …and re-adopted
    answer.resolve({ status: 0 });
    expect(await uploading).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { status: 'ended' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('#2: a job whose session is found settled while its socket connects is not submitted', async () => {
    const { mgr } = manager();
    await upload(mgr, B).catch(() => {});
    FakeWebSocket.reset(); FakeWebSocket.autoOpen = false; vi.stubGlobal('WebSocket', FakeWebSocket);
    const submitting = mgr.submitTranscode('1434', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 }).catch((e: any) => e);
    await flush();
    mgr.settledOnChain.add('1434'); mgr.getSession('1434').status = 'completed';
    FakeWebSocket.instances.forEach((s) => s.open());
    expect(await submitting).toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it('#1: LtxManager.generate keeps both guard codes with their details (not GENERATION_FAILED)', async () => {
    for (const [code, details] of [['SESSION_NOT_ACTIVE', { reason: 'SETTLED_ON_CHAIN', retryable: false }], ['SESSION_STATUS_UNREADABLE', { retryable: true }]] as const) {
      const sm = { assertConfidentialHost: () => {}, submitLtx: vi.fn(async () => { throw new SDKError('guard', code, { sessionId: '1600', ...details }); }) };
      const lm: any = new LtxManager({ sessionManager: sm } as any);
      lm.adoptExistingSession = vi.fn(async () => ({ sessionId: 1600n, jobId: 3200n, entry: {} }));
      lm.clientWait = vi.fn(() => ({}));
      const err: any = await lm.generate({ seed: '1' }, HOST, {} as any, { existingSession: { sessionId: 1600n, jobId: 3200n } } as any).catch((e: any) => e);
      expect(err).toMatchObject({ code, details: { ...details, sessionId: 1600n, jobId: 3200n } });
    }
    expect(LTX_CLIENT_ERROR_CODES).toEqual(expect.arrayContaining(['SESSION_NOT_ACTIVE', 'SESSION_STATUS_UNREADABLE']));
  });

  it('#1: TrainingManager: settled needs a fresh session and is not re-shopped; unreadable retries the same session', () => {
    const tag = { sessionId: 1600n, jobId: 3200n, adopted: true };
    const settled: any = (TrainingManager as any).withSessionIds(new SDKError('settled', 'SESSION_NOT_ACTIVE', { reason: 'SETTLED_ON_CHAIN', retryable: false }), tag, true);
    expect(settled).toMatchObject({ code: 'SESSION_NOT_ACTIVE', detail: { sdkReason: 'SETTLED_ON_CHAIN', sessionId: 1600n } });
    expect(settled.requiresFreshSession).toBe(true);
    expect(settled.isRetryable).toBe(false);
    expect(settled.isReshoppable(0)).toBe(false);
    const unreadable: any = (TrainingManager as any).withSessionIds(new SDKError('rpc', 'SESSION_STATUS_UNREADABLE', { retryable: true }), tag, true);
    expect(unreadable).toMatchObject({ code: 'SESSION_STATUS_UNREADABLE', detail: { consumed: false, retryable: true } });
    expect(unreadable.requiresFreshSession).toBe(false);
    expect(unreadable.isRetryable).toBe(true);
    expect(unreadable.isReshoppable(0)).toBe(false);
    expect(TRAINING_CLIENT_ERROR_CODES).toEqual(expect.arrayContaining(['SESSION_NOT_ACTIVE', 'SESSION_STATUS_UNREADABLE']));
  });

  it('#5: the job path\'s post-wait check keeps the settled reason', async () => {
    const { mgr } = manager();
    await upload(mgr, B).catch(() => {});
    const queued = deferred();
    mgr.initChain = queued.promise;
    const acquiring = mgr.acquireSessionTransport('1434', 'job').catch((e: any) => e);
    await flush();
    mgr.settledOnChain.add('1434'); mgr.getSession('1434').status = 'completed';
    queued.resolve();
    expect(await acquiring).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
  });
});

describe('Review round 5', () => {
  it('MAJOR: a non-streaming plaintext prompt is not sent after another gate found the session settled during its init', async () => {
    const { mgr, ws } = manager();
    mgr.getSession('1433').encryption = false;
    await upload(mgr);   // read Active
    const init = deferred<void>();
    vi.spyOn(mgr, 'sendPlaintextInit').mockImplementationOnce(() => init.promise);
    const prompting = mgr.sendPromptStreaming(A, 'hello').catch((e: any) => e);   // no onToken
    await flush();
    mgr.settledOnChain.add('1433'); mgr.getSession('1433').status = 'completed';
    init.resolve();
    expect(await prompting).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { reason: 'SETTLED_ON_CHAIN' } });
    expect(ws.sendMessage.mock.calls.filter(([m]: any[]) => m?.type === 'prompt')).toEqual([]);   // (the upload's own init went out)
  });

  it('m6: a call holding a live old record stops when the current record (after a re-seed) was ended', async () => {
    const { mgr, read, rag } = manager();
    const answer = deferred<any>();
    read.mockImplementationOnce(() => answer.promise);
    const uploading = upload(mgr).catch((e: any) => e);
    await flush();
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    await mgr.endSession(A);   // ends the NEW record; the call still holds the old, active one
    answer.resolve({ status: 0 });
    expect(await uploading).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { status: 'ended' } });
    expect(rag).not.toHaveBeenCalled();
  });

  it('m2: a refused plaintext streaming prompt leaves no listener behind', async () => {
    const { mgr, ws } = manager();
    mgr.getSession('1433').encryption = false;
    await upload(mgr);
    const init = deferred<void>();
    vi.spyOn(mgr, 'sendPlaintextInit').mockImplementationOnce(() => init.promise);
    const before = ws.handlers.size;
    const prompting = mgr.sendPromptStreaming(A, 'hello', () => {}).catch((e: any) => e);
    await flush();
    mgr.getSession('1433').status = 'completed';
    init.resolve();
    expect(await prompting).toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(ws.handlers.size).toBe(before);
  });

  it('m3: a refusal between upload batches reports the batches that landed', async () => {
    const { mgr, rag } = manager();
    rag.mockImplementationOnce(async () => { mgr.getSession('1433').status = 'completed'; return { uploaded: 1000, rejected: 0, errors: [] }; });
    const many = Array.from({ length: 1001 }, (_, i) => vec(`v${i}`));
    const err: any = await mgr.uploadVectors('1433', many).catch((e: any) => e);
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { batch: 2, uploadedSoFar: 1000, rejectedSoFar: 0 } });
    expect(mgr.getSession('1433').ragContext).toEqual({ vectorDbId: 'vectors-1433' });
  });

  it('m4: a training refusal for a chain mismatch is not retryable', () => {
    const tag = { sessionId: 1600n, jobId: 3200n, adopted: true };
    const e: any = (TrainingManager as any).withSessionIds(new SDKError('x', 'SESSION_STATUS_UNREADABLE', { retryable: false, reason: 'CHAIN_MISMATCH' }), tag, true);
    expect(e.isRetryable).toBe(false);
  });

  it('m5: training keeps a paused session (consumed: false), but not an ended or settled one', () => {
    const tag = { sessionId: 1600n, jobId: 3200n, adopted: true };
    const map = (details: any) => (TrainingManager as any).withSessionIds(new SDKError('Session is x', 'SESSION_NOT_ACTIVE', details), tag, true);
    expect(map({ sessionId: '1600', status: 'paused' }).requiresFreshSession).toBe(false);
    expect(map({ sessionId: '1600', status: 'ended' }).requiresFreshSession).toBe(true);
    expect(map({ reason: 'SETTLED_ON_CHAIN', retryable: false }).requiresFreshSession).toBe(true);
  });

  it('round 6: a session found settled keeps its shared socket, so a reply already streaming on it is not cut off', async () => {
    const { mgr, ws } = manager({ status: 1 });
    await upload(mgr).catch(() => {});
    expect(ws.disconnect).not.toHaveBeenCalled();
    expect(mgr.wsClient).toBe(ws);
    expect(mgr.sessionCrypto.get('1433')?.key).toBe(KEY);
    await expect(upload(mgr)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });   // later work is still refused
  });

  it('round 6: a job holding an ended record is not submitted after the id is re-adopted for the same host', async () => {
    const { mgr } = manager();
    await upload(mgr, B).catch(() => {});
    mgr.jobCompletionNodes.set('1434', true);   // such a node takes no job claim, so a re-registration mid-submit is allowed
    FakeWebSocket.reset(); FakeWebSocket.autoOpen = false; vi.stubGlobal('WebSocket', FakeWebSocket);
    const submitting = mgr.submitTranscode('1434', 's5://bSrc', ['mp4'] as any, { timeoutMs: 60_000 }).catch((e: any) => e);
    await flush();
    mgr.getSession('1434').status = 'ended';   // the record the submit was guarded on
    mgr.registerExternalSession({ sessionId: B, jobId: 2868n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    FakeWebSocket.instances.forEach((s) => s.open());
    expect(await submitting).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { status: 'ended' } });
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it('round 6: the refusal names the held record\'s status first', () => {
    const { mgr } = manager();
    const held = mgr.getSession('1433');
    held.status = 'completed';
    mgr.registerExternalSession({ sessionId: A, jobId: 2866n, endpoint: ENDPOINT, hostAddress: HOST, model: MODEL, chainId: 84532 });
    mgr.getSession('1433').status = 'paused';
    let err: any; try { mgr.refuseIfNoLongerActive('1433', held); } catch (e) { err = e; }
    expect(err).toMatchObject({ code: 'SESSION_NOT_ACTIVE', details: { status: 'completed' } });
  });
});

describe('S4: flag', () => {
  it('M2 (review round 2): the class default settle horizon is 20 minutes', async () => {
    vi.resetModules();
    const fresh = await import('../../src/managers/SessionManager');
    expect((fresh.SessionManager as any).SETTLE_HORIZON_MS).toBe(20 * 60_000);
  });

  it('settledSessionGuard', () => {
    expect(SDK_CAPABILITIES.settledSessionGuard).toBe(true);
  });
});
