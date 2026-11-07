// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-TRANSPORT-ISOLATION (1.39.12), driven through the REAL sendEncryptedInit:
 *  E1/E2 a dedicated init reads and writes only its own call's state, and does not queue behind other inits;
 *  E3    on the shared socket every frame under a key takes its index from that key's one counter;
 *  E4    transcode rejects WS_CLOSED when its socket closes (the node stops relaying when the client goes).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { generateImageWs } from '../../src/utils/image-generation-ws';
import { FakeWebSocket, FakeWs, makeFakeEncryptionManager, fakeHostManager, stubNodeVersion, transcodeReady } from '../helpers/session-doubles';
import { MODEL, HOST, LORA } from '../training/fixtures';

vi.mock('../../src/utils/transcode-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/transcode-ws')>();
  return { ...mod, submitTranscodeWs: vi.fn() };
});
vi.mock('../../src/utils/image-generation-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/image-generation-ws')>();
  return { ...mod, generateImageWs: vi.fn() };
});


// 1.39.15: submits probe the node's /v1/version for `session-job-completion`; keep that off the network (an old node).
beforeEach(() => { stubNodeVersion(); });
afterEach(() => { vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
const hex = (k: Uint8Array) => Buffer.from(k).toString('hex');
const strip = (h: string) => h.replace(/^0x/, '');

function realInitManager() {
  const mgr: any = transcodeReady(new SessionManager({} as any, { storeConversation: vi.fn() } as any), [HOST]);
  mgr.encryptionManager = makeFakeEncryptionManager();
  mgr.hostManager = fakeHostManager();
  return mgr;
}
const seed = (mgr: any, sid: bigint, jid: bigint) =>
  mgr.registerExternalSession({ sessionId: sid, jobId: jid, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
/** The session key the init for `jobId` actually sent to the node. */
const sentKey = (mgr: any, jobId: bigint) =>
  strip(mgr.encryptionManager.encryptSessionInit.mock.calls.map((c: any) => c[1]).find((p: any) => p.jobId === jobId.toString()).sessionKey);

describe('E1/E2: concurrent dedicated inits each work on their own state', () => {
  beforeEach(() => {
    FakeWebSocket.reset(); FakeWebSocket.autoAckInit = true; vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.mocked(submitTranscodeWs).mockReset();
    vi.mocked(submitTranscodeWs).mockImplementation(async () => ({ taskId: 't', cancel: vi.fn(), result: new Promise(() => {}) }) as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('T1: two submits started together each encrypt under the key their own init sent', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n); seed(mgr, 1434n, 2868n);
    await Promise.all([
      mgr.submitTranscode('1433', 'bA', ['mp4'] as any),
      mgr.submitTranscode('1434', 'bB', ['mp4'] as any),
    ]);
    const calls = vi.mocked(submitTranscodeWs).mock.calls.map((c) => c[0] as any);
    const bySession = Object.fromEntries(calls.map((o) => [o.sessionId, hex(o.sessionKey)]));
    expect(bySession['1433']).toBe(sentKey(mgr, 2866n));
    expect(bySession['1434']).toBe(sentKey(mgr, 2868n));
    expect(bySession['1433']).not.toBe(bySession['1434']);
    for (const o of calls) expect(o.messageIndex.value).toBe(0);
  });

  it('T2: the shared chat key, legacy index and the shared session\'s entry are untouched', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n); seed(mgr, 1434n, 2868n);
    const sharedKey = new Uint8Array(32).fill(7);
    const entry = { key: sharedKey, messageIndex: 5 };
    mgr.sessionKey = sharedKey; mgr.messageIndex = 5; mgr.sessionCrypto.set('999', entry);
    await Promise.all([
      mgr.submitTranscode('1433', 'bA', ['mp4'] as any),
      mgr.submitTranscode('1434', 'bB', ['mp4'] as any),
    ]);
    expect(mgr.sessionKey).toBe(sharedKey);
    expect(mgr.messageIndex).toBe(5);
    expect(mgr.sessionCrypto.get('999')).toBe(entry);
    expect(entry.messageIndex).toBe(5);
    expect(mgr.sessionCrypto.has('1433')).toBe(false);          // a dedicated key is not the session's chat key
    expect(mgr.sessionCrypto.has('1434')).toBe(false);
  });

  it('T3: a dedicated init on a lora session leaves the shared serve-back listener and lora state alone', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n);
    mgr.sessions.get('1433').lora = LORA;
    const sharedUnsub = vi.fn();
    const priorError = { code: 'LORA_STAGING_FAILED' };
    mgr.serveBackUnsubscribe = sharedUnsub; mgr.loraSessionActive = false; mgr.serveBackError = priorError;
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    expect(sharedUnsub).not.toHaveBeenCalled();
    expect(mgr.serveBackUnsubscribe).toBe(sharedUnsub);
    expect(mgr.loraSessionActive).toBe(false);
    expect(mgr.serveBackError).toBe(priorError);
    // …while the dedicated socket still reports a post-ack staging failure (E.3)
    FakeWebSocket.instances[0].onmessage?.({ data: JSON.stringify({ type: 'error', code: 'LORA_STAGING_FAILED', message: 'x', session_id: '1433' }) });
    expect(mgr.serveBackError).not.toBe(priorError);
    expect(mgr.serveBackError?.code).toBe('LORA_STAGING_FAILED');
  });

  it('T4: a second creator\'s init is sent without waiting for the first one\'s ack', async () => {
    FakeWebSocket.autoAckInit = false;
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n); seed(mgr, 1434n, 2868n);
    const both = Promise.all([
      mgr.submitTranscode('1433', 'bA', ['mp4'] as any),
      mgr.submitTranscode('1434', 'bB', ['mp4'] as any),
    ]);
    await flush();
    const inits = FakeWebSocket.instances.flatMap((s) => s.sent.map((d) => JSON.parse(d)).filter((f) => f.type === 'encrypted_session_init'));
    expect(inits.map((f) => f.session_id).sort()).toEqual(['1433', '1434']);
    for (const s of FakeWebSocket.instances) {
      const f = s.sent.map((d) => JSON.parse(d)).find((x) => x.type === 'encrypted_session_init');
      s.onmessage?.({ data: JSON.stringify({ type: 'session_init_ack', session_id: f.session_id, status: 'success' }) });
    }
    await both;
  });
});

describe('E3: one counter per key on the shared socket', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); vi.mocked(submitTranscodeWs).mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('T5: a job on the reused socket continues the chat counter, and chat continues after it', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n);
    const ws = new FakeWs();
    const key = new Uint8Array(32).fill(5);
    const entry = { key, messageIndex: 3 };                       // three chat frames already sent (0, 1, 2)
    Object.assign(mgr, { wsClient: ws, wsSessionId: '1433', sessionKey: key, messageIndex: 0, sessionKeyGeneration: 1 });
    mgr.sessionCrypto.set('1433', entry);
    let used = -1;
    vi.mocked(submitTranscodeWs).mockImplementationOnce(async (o: any) => {
      used = o.messageIndex.value++;
      return { taskId: 't', cancel: vi.fn(), result: Promise.resolve({}) } as any;
    });
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    expect(vi.mocked(submitTranscodeWs).mock.calls[0][0].sessionKey).toBe(key);
    expect(used).toBe(3);
    expect(entry.messageIndex).toBe(4);                           // the next chat frame is 4, never a repeat
  });

  it('T5b: after a session-switch teardown the old entry is not reused (the connection never received that key)', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n);
    vi.mocked(submitTranscodeWs).mockResolvedValueOnce({ taskId: 't', cancel: vi.fn(), result: new Promise(() => {}) } as any);
    FakeWebSocket.autoAckInit = true;
    const stale = { key: new Uint8Array(32).fill(5), messageIndex: 3 };
    // The teardown state: a new shared socket for 1433 (generation 1 again), sessionKey cleared, the old entry left behind.
    Object.assign(mgr, { wsClient: new FakeWs(), wsSessionId: '1433', sessionKey: undefined, sessionKeyGeneration: 1 });
    mgr.sessionCrypto.set('1433', stale);
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    const o = vi.mocked(submitTranscodeWs).mock.calls[0][0] as any;
    expect(o.sessionKey).not.toBe(stale.key);
    expect(FakeWebSocket.instances).toHaveLength(1);               // a dedicated socket with its own init instead
    expect(stale.messageIndex).toBe(3);
  });

  it('T6: generateImage and chat share one counter after the image re-init', async () => {
    const mgr = realInitManager();
    seed(mgr, 1433n, 2866n);
    const ws = new FakeWs();
    Object.assign(mgr, { wsClient: ws, wsSessionId: '1433' });
    let used = -1;
    vi.mocked(generateImageWs).mockImplementationOnce(async (o: any) => {
      used = o.messageIndex.value++;
      return { image: 'x', billing: { generationUnits: 0 } } as any;
    });
    await mgr.generateImage('1433', 'a cat');
    expect(used).toBe(0);
    expect(mgr.sessionCrypto.get('1433').messageIndex).toBe(1);   // the next chat frame is 1, not 0 again
  });
});

describe('E4: transcode-ws rejects WS_CLOSED when its socket closes', () => {
  function closable() {
    const closeHandlers = new Set<(e: any) => void>();
    return {
      closeHandlers,
      sendWithoutResponse: vi.fn(async () => {}),
      onMessage: vi.fn(() => () => {}),
      onClose: vi.fn((h: (e: any) => void) => { closeHandlers.add(h); return () => closeHandlers.delete(h); }),
      close(code: number) { [...closeHandlers].forEach((h) => h({ code })); },
    };
  }
  const run = async (ws: any) => {
    const real = (await vi.importActual<typeof import('../../src/utils/transcode-ws')>('../../src/utils/transcode-ws')).submitTranscodeWs;
    return real({
      wsClient: ws, sessionId: 's', sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: 'b', formats: [] as any,
      encryptionManager: { encryptMessage: () => ({ ciphertextHex: 'c', nonceHex: 'n', aadHex: 'a' }), decryptMessage: () => '{}' },
    });
  };

  it('T7: a close while pending rejects TRANSCODE_FAILED with reason WS_CLOSED and the close code', async () => {
    const ws = closable();
    const handle = await run(ws);
    ws.close(1006);
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'WS_CLOSED', closeCode: 1006 } });
  });

  it('T8: once the result has settled, the close listener is gone', async () => {
    const ws = closable();
    const handle = await run(ws);
    ws.close(1000);
    await handle.result.catch(() => {});
    expect(ws.closeHandlers.size).toBe(0);
  });
});

it('T9: the three capability flags', () => {
  const caps = SDK_CAPABILITIES as any;
  expect([caps.dedicatedInitIsolated, caps.sharedSocketMessageIndex, caps.transcodeWsClosed]).toEqual([true, true, true]);
});
