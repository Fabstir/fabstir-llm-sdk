// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * G1 (IMPLEMENTATION-SESSION-JOB-EXCLUSIVE, 1.39.14): within one SessionManager at most one job — transcode, LTX or
 * training — is in flight per session id. The node keeps one key per session id across connections (a second init
 * replaces the first job's key) and completes the session when any of its sockets closes, so a second concurrent job
 * on a session is refused loudly, before any socket, init or frame, until the node keys by connection.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { LtxManager } from '../../src/managers/LtxManager';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { SDKError } from '../../src/types';
import { LTX_ERROR_CODES } from '../../src/errors/ltx-errors';
import { TRAINING_ERROR_CODES } from '../../src/errors/training-errors';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { submitLtxWs } from '../../src/utils/ltx-ws';
import { submitTrainingWs } from '../../src/utils/training-ws';
import { FakeWebSocket, FakeWs, stubNodeVersion, transcodeReady } from '../helpers/session-doubles';
import { MODEL, HOST, JOB } from '../training/fixtures';

vi.mock('../../src/utils/transcode-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/transcode-ws')>()), submitTranscodeWs: vi.fn() }));
vi.mock('../../src/utils/ltx-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/ltx-ws')>()), submitLtxWs: vi.fn() }));
vi.mock('../../src/utils/training-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/training-ws')>()), submitTrainingWs: vi.fn() }));


// 1.39.15: submits probe the node's /v1/version for `session-job-completion`; keep that off the network (an old node).
beforeEach(() => { stubNodeVersion(); });
afterEach(() => { vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

function manager() {
  const mgr: any = transcodeReady(new SessionManager({} as any, { storeConversation: vi.fn() } as any), [HOST]);
  mgr.encryptionManager = { encryptMessage: vi.fn(), decryptMessage: vi.fn() };
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async () => new Uint8Array(32).fill(9));
  for (const [sid, jid] of [[1433n, 2866n], [1434n, 2868n]] as const) {
    mgr.registerExternalSession({ sessionId: sid, jobId: jid, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
  }
  return mgr;
}
/** Each submit*Ws mock hands back a handle whose result the test settles. */
function pending() {
  const d = deferred<any>();
  return { d, handle: { taskId: 't', requestId: 'r', cancel: vi.fn(), result: d.promise, slices: [], pointers: [], forfeitedSlices: [] } };
}
const transcode = (mgr: any, sid = '1433') => mgr.submitTranscode(sid, 'bSrc', ['mp4'] as any);
const ltx = (mgr: any, sid = '1433') => mgr.submitLtx(sid, { seed: '1' } as any);
const train = (mgr: any, sid = '1433') => mgr.submitTraining(sid, JOB as any);

describe('G1: one job per session within a SessionManager', () => {
  beforeEach(() => {
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    for (const m of [submitTranscodeWs, submitLtxWs, submitTrainingWs]) vi.mocked(m).mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('X1: a second transcode on the session is refused before any socket or init; the first is unaffected', async () => {
    const mgr = manager();
    const first = pending();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(first.handle as any);
    const h1 = await transcode(mgr);
    const sockets = FakeWebSocket.instances.length, inits = mgr.sendEncryptedInit.mock.calls.length;
    const err: any = await transcode(mgr).catch((e: any) => e);
    expect(err).toBeInstanceOf(SDKError);
    expect(err).toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT', details: { sessionId: '1433', inFlight: 'transcode', retryable: false } });
    expect(err.message).toMatch(/Session 1433 already has a transcode job in flight/);
    expect(FakeWebSocket.instances.length).toBe(sockets);
    expect(mgr.sendEncryptedInit.mock.calls.length).toBe(inits);
    expect(submitTranscodeWs).toHaveBeenCalledTimes(1);
    first.d.resolve({ taskId: 't' });
    await expect(h1.result).resolves.toEqual({ taskId: 't' });
  });

  it('X2: the rule spans job kinds (LTX in flight → transcode; training in flight → LTX)', async () => {
    const mgr = manager();
    vi.mocked(submitLtxWs).mockResolvedValueOnce(pending().handle as any);
    await ltx(mgr);
    await expect(transcode(mgr)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT', details: { inFlight: 'ltx' } });
    vi.mocked(submitTrainingWs).mockResolvedValueOnce(pending().handle as any);
    await train(mgr, '1434');
    await expect(ltx(mgr, '1434')).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT', details: { inFlight: 'training' } });
  });

  it.each([
    ['resolves', (d: ReturnType<typeof deferred>) => d.resolve({})],
    ['rejects', (d: ReturnType<typeof deferred>) => d.reject(new Error('TRANSCODE_FAILED'))],
  ])('X3/X4: once the first result %s, the session takes a new job', async (_l, settle) => {
    const mgr = manager();
    const first = pending();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(first.handle as any).mockResolvedValueOnce(pending().handle as any);
    const h1 = await transcode(mgr);
    settle(first.d);
    await h1.result.catch(() => {});
    await flush();
    await expect(transcode(mgr)).resolves.toBeDefined();
  });

  it('X5: a submit that throws before its handle (init failure) releases the session', async () => {
    const mgr = manager();
    mgr.sendEncryptedInit.mockImplementationOnce(async () => { throw new Error('init ack timeout'); });
    await expect(transcode(mgr)).rejects.toThrow('init ack timeout');
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(pending().handle as any);
    await expect(transcode(mgr)).resolves.toBeDefined();
  });

  it('X5b: a submit whose frame send throws (submit*Ws rejects) releases the session', async () => {
    const mgr = manager();
    vi.mocked(submitTranscodeWs).mockRejectedValueOnce(new Error('encrypt failed')).mockResolvedValueOnce(pending().handle as any);
    await expect(transcode(mgr)).rejects.toThrow('encrypt failed');
    await expect(transcode(mgr)).resolves.toBeDefined();
  });

  it('X6: two submits started in the same tick — exactly one is refused', async () => {
    const mgr = manager();
    vi.mocked(submitTranscodeWs).mockResolvedValue(pending().handle as any);
    const out = await Promise.allSettled([transcode(mgr), transcode(mgr)]);
    expect(out.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(out.filter((o) => o.status === 'rejected').map((o: any) => o.reason.code)).toEqual(['SESSION_JOB_IN_FLIGHT']);
  });

  it('X7: jobs on different sessions run together (guard)', async () => {
    const mgr = manager();
    vi.mocked(submitTranscodeWs).mockResolvedValue(pending().handle as any);
    await expect(Promise.all([transcode(mgr, '1433'), transcode(mgr, '1434')])).resolves.toHaveLength(2);
  });

  it('X8: a job on the reused shared socket counts the same, and the shared socket is still never closed', async () => {
    const mgr = manager();
    const ws = new FakeWs();
    const disconnect = vi.spyOn(ws, 'disconnect');
    const key = new Uint8Array(32).fill(5);
    Object.assign(mgr, { wsClient: ws, wsSessionId: '1433', sessionKey: key, sessionKeyGeneration: 1 });
    mgr.sessionCrypto.set('1433', { key, messageIndex: 0 });
    const first = pending();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(first.handle as any);
    const h1 = await transcode(mgr);
    expect(vi.mocked(submitTranscodeWs).mock.calls[0][0].wsClient).toBe(ws);
    await expect(ltx(mgr)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });
    first.d.resolve({});
    await h1.result; await flush();
    expect(disconnect).not.toHaveBeenCalled();
    vi.mocked(submitLtxWs).mockResolvedValueOnce(pending().handle as any);
    await expect(ltx(mgr)).resolves.toBeDefined();
  });
});

describe('G5: the managers relay the refusal under its own code', () => {
  const refusal = () => new SDKError('Session 1433 already has a transcode job in flight', 'SESSION_JOB_IN_FLIGHT',
    { sessionId: '1433', inFlight: 'transcode', retryable: false });

  it('X9: LtxManager.generate → LtxError SESSION_JOB_IN_FLIGHT with the session ids', async () => {
    const lm: any = new LtxManager({ sessionManager: { submitLtx: vi.fn(async () => { throw refusal(); }) } } as any);
    lm.adoptExistingSession = vi.fn(async () => ({ sessionId: 1433n, jobId: 2866n, entry: {} }));
    lm.clientWait = vi.fn(() => ({}));
    const err: any = await lm.generate({ seed: '1' }, HOST, {} as any, { existingSession: { sessionId: 1433n, jobId: 2866n } } as any).catch((e: any) => e);
    expect(err.name).toBe('LtxError');
    expect(err).toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT', details: { sessionId: 1433n, jobId: 2866n, inFlight: 'transcode' } });
  });

  it('X10: TrainingManager → TrainingError SESSION_JOB_IN_FLIGHT, consumed: false, with the ids', () => {
    const err: any = (TrainingManager as any).withSessionIds(refusal(), { sessionId: 1433n, jobId: 2866n, adopted: true }, true);
    expect(err.name).toBe('TrainingError');
    expect(err.code).toBe('SESSION_JOB_IN_FLIGHT');
    expect(err.detail).toMatchObject({ consumed: false, sessionId: 1433n, jobId: 2866n, inFlight: 'transcode' });
  });
});

describe('G8: re-registering a session with a job in flight is refused before it overwrites anything', () => {
  beforeEach(() => {
    FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket);
    for (const m of [submitTranscodeWs, submitLtxWs, submitTrainingWs]) vi.mocked(m).mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  const reg = { sessionId: 1433n, jobId: 2866n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 };

  /** A manager with a transcode in flight on 1433 and some chat state on that session's record. */
  async function busy() {
    const mgr = manager();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(pending().handle as any);
    await transcode(mgr);
    const record = mgr.sessions.get('1433');
    record.prompts.push('earlier prompt'); record.totalTokens = 42;
    return { mgr, record };
  }

  it('X12: registerExternalSession → SESSION_JOB_IN_FLIGHT, and the record is untouched', async () => {
    const { mgr, record } = await busy();
    expect(() => mgr.registerExternalSession(reg)).toThrow(expect.objectContaining({ code: 'SESSION_JOB_IN_FLIGHT' }));
    expect(mgr.sessions.get('1433')).toBe(record);
    expect(record.prompts).toEqual(['earlier prompt']);
    expect(record.totalTokens).toBe(42);
  });

  it('X13: LtxManager.generate({ existingSession }) → LtxError SESSION_JOB_IN_FLIGHT with the ids; record untouched, no submit', async () => {
    const { mgr, record } = await busy();
    const lm: any = new LtxManager({ sessionManager: mgr, chainId: 84532 } as any);
    lm.validateJob = vi.fn(async () => ({})); lm.entryIn = vi.fn(() => ({})); lm.modelOf = vi.fn(() => MODEL);
    const err: any = await lm.generate({ seed: '1' }, HOST, {} as any,
      { existingSession: { sessionId: 1433n, jobId: 2866n }, endpoint: 'https://host2.fabstir.net', chainId: 84532 } as any).catch((e: any) => e);
    expect(err.name).toBe('LtxError');
    expect(err).toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT', details: { sessionId: 1433n, jobId: 2866n, inFlight: 'transcode', retryable: false } });
    expect(mgr.sessions.get('1433')).toBe(record);
    expect(submitLtxWs).not.toHaveBeenCalled();
  });

  it('X14: TrainingManager.submitTraining({ existingSession }) → TrainingError SESSION_JOB_IN_FLIGHT, consumed: false; record untouched', async () => {
    const { mgr, record } = await busy();
    const tm: any = new TrainingManager({ sessionManager: mgr, trainingModelId: MODEL, chainId: 84532 } as any);
    tm.validateAgainstBundle = vi.fn(); tm.validateExistingSession = vi.fn(async () => ({ pricePerToken: 904n }));
    const err: any = await tm.submitTraining({ job: JOB, hostAddress: HOST, endpoint: 'https://host2.fabstir.net', chainId: 84532,
      bundle: {}, existingSession: { sessionId: 1433n, jobId: 2866n } }).catch((e: any) => e);
    expect(err.name).toBe('TrainingError');
    expect(err.code).toBe('SESSION_JOB_IN_FLIGHT');
    expect(err.detail).toMatchObject({ consumed: false, sessionId: 1433n, jobId: 2866n, inFlight: 'transcode', retryable: false });
    expect(mgr.sessions.get('1433')).toBe(record);
    expect(submitTrainingWs).not.toHaveBeenCalled();
  });
});

it('X11: the flag and the extended code lists', () => {
  expect((SDK_CAPABILITIES as any).sessionJobExclusive).toBe(true);
  expect(LTX_ERROR_CODES).toContain('SESSION_JOB_IN_FLIGHT');
  expect(TRAINING_ERROR_CODES).toContain('SESSION_JOB_IN_FLIGHT');
});
