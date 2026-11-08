// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * D2 invariant (IMPLEMENTATION-SUBMITTRANSCODE-SOCKET-LEAK): a socket a submit path opened itself is
 * closed on EVERY outcome — result resolved, result rejected, or a throw before the handle exists —
 * and a socket it reused is never closed by it. The node settles a session when its socket closes;
 * a leaked delegate-session socket kept session 1433 Active for 15 h with the host unpaid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { submitLtxWs } from '../../src/utils/ltx-ws';
import { submitTrainingWs } from '../../src/utils/training-ws';
import { FakeWebSocket, stubNodeVersion, transcodeReady } from '../helpers/session-doubles';
import { MODEL, HOST, JOB } from '../training/fixtures';

vi.mock('../../src/utils/transcode-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/transcode-ws')>();
  return { ...mod, submitTranscodeWs: vi.fn() };
});
vi.mock('../../src/utils/ltx-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/ltx-ws')>();
  return { ...mod, submitLtxWs: vi.fn() };
});
vi.mock('../../src/utils/training-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/training-ws')>();
  return { ...mod, submitTrainingWs: vi.fn() };
});


// 1.39.15: submits probe the node's /v1/version for `session-job-completion`; keep that off the network (an old node).
beforeEach(() => { stubNodeVersion(); });
afterEach(() => { vi.unstubAllGlobals(); });

const SID = '1433';
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

function delegateManager() {
  const mgr: any = transcodeReady(new SessionManager({} as any, { storeConversation: vi.fn() } as any), [HOST]);
  mgr.encryptionManager = { encryptMessage: vi.fn(), decryptMessage: vi.fn() };
  // A dedicated init returns its key and writes nothing shared (1.39.12).
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async () => new Uint8Array(32).fill(9));
  mgr.registerExternalSession({ sessionId: 1433n, jobId: 2866n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
  return mgr;
}

function deferred<T>() {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const transcodeHandle = (result: Promise<any>) => ({ taskId: 't', cancel: vi.fn(), result });
const socket = () => FakeWebSocket.instances[0];

describe('submitTranscode on a delegate session closes the socket it opened', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); vi.mocked(submitTranscodeWs).mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('S1: keeps the socket open while pending, closes it once the result resolves', async () => {
    const d = deferred<any>();
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(transcodeHandle(d.promise) as any);
    const mgr = delegateManager();
    const handle = await mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.OPEN);       // progress + completion arrive on this socket
    d.resolve({ taskId: 't', outputs: [] });
    await expect(handle.result).resolves.toMatchObject({ taskId: 't' });
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('S2: closes it when the result rejects; the consumer still sees the rejection, and nothing is unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const d = deferred<any>();
      vi.mocked(submitTranscodeWs).mockResolvedValueOnce(transcodeHandle(d.promise) as any);
      const mgr = delegateManager();
      const handle = await mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any);
      d.promise.catch(() => {});                                  // the mock's own promise is not under test
      d.reject(new Error('TRANSCODE_FAILED'));
      await flush();                                              // nobody has attached to handle.result yet
      expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
      expect(unhandled).toEqual([]);
      await expect(handle.result).rejects.toThrow('TRANSCODE_FAILED');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('S3: closes it when submitTranscodeWs throws before returning a handle; the error propagates unchanged', async () => {
    const boom = new Error('encrypt failed');
    vi.mocked(submitTranscodeWs).mockRejectedValueOnce(boom);
    const mgr = delegateManager();
    await expect(mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any)).rejects.toBe(boom);
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('S5: a failed init closes the socket and leaves the shared session key untouched', async () => {
    const mgr = delegateManager();
    const sharedKey = new Uint8Array(32).fill(7);
    mgr.sessionKey = sharedKey;
    mgr.messageIndex = 11;
    mgr.sendEncryptedInit.mockImplementationOnce(async () => { throw new Error('init ack timeout'); });
    await expect(mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any)).rejects.toThrow('init ack timeout');
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
    expect(mgr.sessionKey).toBe(sharedKey);
    expect(mgr.messageIndex).toBe(11);
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it('S9: an init that returns without a key closes the socket (SESSION_KEY_NOT_AVAILABLE)', async () => {
    const mgr = delegateManager();
    mgr.sendEncryptedInit.mockImplementationOnce(async () => {});
    await expect(mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any)).rejects.toMatchObject({ code: 'SESSION_KEY_NOT_AVAILABLE' });
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('S6: the dedicated socket never silently reconnects (a reconnected socket has no session init)', async () => {
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce(transcodeHandle(new Promise(() => {})) as any);
    const mgr = delegateManager();
    await mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any);
    const { wsClient } = vi.mocked(submitTranscodeWs).mock.calls[0][0] as any;
    expect(wsClient.options.reconnect).toBe(false);
  });
});

describe('a reused shared socket is never closed by a submit path', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); vi.mocked(submitTranscodeWs).mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function sharedManager() {
    const mgr = delegateManager();
    const shared = { isConnected: () => true, getConnectionGeneration: () => 3, disconnect: vi.fn(async () => {}),
      onMessage: vi.fn(() => () => {}), sendWithoutResponse: vi.fn(async () => {}) };
    mgr.wsClient = shared;
    mgr.wsSessionId = SID;
    mgr.sessionKey = new Uint8Array(32).fill(5);
    mgr.sessionCrypto.set(SID, { key: mgr.sessionKey, messageIndex: 0 });
    mgr.sessionKeyGeneration = 3;
    mgr.sessionKeyClient = shared;   // the client the init was acked on (1.39.20: generations are per client)
    return { mgr, shared };
  }

  it.each([
    ['resolves', () => Promise.resolve({ taskId: 't' })],
    ['rejects', () => Promise.reject(new Error('TRANSCODE_FAILED'))],
  ])('S4: result %s → shared socket left open', async (_label, result) => {
    vi.mocked(submitTranscodeWs).mockImplementationOnce(async () => transcodeHandle(result()) as any);
    const { mgr, shared } = sharedManager();
    const handle = await mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any);
    await handle.result.catch(() => {});
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);              // reused, not dialled
    expect(vi.mocked(submitTranscodeWs).mock.calls[0][0].wsClient).toBe(shared);
    expect(shared.disconnect).not.toHaveBeenCalled();
    expect(mgr.wsClient).toBe(shared);
  });

  it('S4: submitTranscodeWs throws → shared socket left open', async () => {
    vi.mocked(submitTranscodeWs).mockRejectedValueOnce(new Error('encrypt failed'));
    const { mgr, shared } = sharedManager();
    await expect(mgr.submitTranscode(SID, 'bSrc', ['mp4'] as any)).rejects.toThrow('encrypt failed');
    await flush();
    expect(shared.disconnect).not.toHaveBeenCalled();
    expect(mgr.wsClient).toBe(shared);
  });
});

describe('S7: LTX and training close a dedicated socket when submit*Ws throws before the handle', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('submitLtx', async () => {
    const boom = new Error('encrypt failed');
    vi.mocked(submitLtxWs).mockRejectedValueOnce(boom);
    const mgr = delegateManager();
    await expect(mgr.submitLtx(SID, { prompt: 'p' } as any)).rejects.toBe(boom);
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('submitTraining', async () => {
    const boom = new Error('send failed');
    vi.mocked(submitTrainingWs).mockRejectedValueOnce(boom);
    const mgr = delegateManager();
    await expect(mgr.submitTraining(SID, JOB as any)).rejects.toBe(boom);
    await flush();
    expect(socket().readyState).toBe(FakeWebSocket.CLOSED);
  });
});

it('S8: SDK_CAPABILITIES.dedicatedSocketClosed', () => {
  expect((SDK_CAPABILITIES as any).dedicatedSocketClosed).toBe(true);
});
