// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-JOB-COMPLETION-NODES (1.39.15). A node that reports `session-job-completion` in /v1/version keys
 * sessions by connection, completes a session when its job's work is paid, and keeps a dropped transcode's result for
 * 7 days behind `{"action":"transcode_result","taskId"}`. On such a node the SDK lifts the one-job-per-session refusal,
 * recovers a dropped transcode, and exposes fetchTranscodeResult. Every other node — and a probe that fails — keeps
 * 1.39.14 exactly (H1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { FakeWebSocket, transcodeReady } from '../helpers/session-doubles';
import { MODEL, HOST } from '../training/fixtures';

const MARKER = 'session-job-completion';
const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const enc = (plaintext: string) => ({ ciphertextHex: Buffer.from(plaintext).toString('hex'), nonceHex: 'nn', aadHex: 'aa' });
const dec = (payload: any) => Buffer.from(payload.ciphertextHex, 'hex').toString();

/** What the fake node answers to each `transcode_result` fetch, in order (the last one repeats). */
let fetchAnswers: any[] = [];
/** Every fetch frame the fake node received (decrypted plaintext). */
let fetches: any[] = [];
/** When set, the node first answers with this under a DIFFERENT message id (another flow's frame on the connection). */
let decoy: any;

/** A FakeWebSocket that also plays the node's side of the result fetch. */
class NodeSocket extends FakeWebSocket {
  send(data: string) {
    super.send(data);
    const frame = JSON.parse(data);
    if (frame.type !== 'encrypted_message') return;
    const inner = JSON.parse(dec(frame.payload));
    if (inner.action !== 'transcode_result') return;
    fetches.push(inner);
    if ((NodeSocket as any).silent) return;
    const answer = fetchAnswers.length > 1 ? fetchAnswers.shift() : fetchAnswers[0];
    if (answer?.__plainError) {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(answer.__plainError) }), 0);
      return;
    }
    if (decoy) {
      const d = decoy;
      setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'encrypted_response', session_id: frame.session_id, id: 'someone-else', payload: enc(JSON.stringify(d)) }) }), 0);
    }
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'encrypted_response', session_id: frame.session_id, id: frame.id, payload: enc(JSON.stringify(answer)) }) }), 0);
  }
}

/** Deliver an encrypted inner message on a socket, as the node would on the submitting connection. */
const deliver = (ws: FakeWebSocket, inner: any) =>
  ws.onmessage?.({ data: JSON.stringify({ type: 'encrypted_response', session_id: '1433', payload: enc(JSON.stringify(inner)) }) });

let versionAnswer: () => Promise<any>;
let versionCalls = 0;

function manager() {
  const mgr: any = transcodeReady(new SessionManager({} as any, { storeConversation: vi.fn() } as any), [HOST]);
  mgr.encryptionManager = {
    encryptMessage: vi.fn((_k: Uint8Array, plaintext: string) => enc(plaintext)),
    decryptMessage: vi.fn((_k: Uint8Array, payload: any) => dec(payload)),
  };
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async () => new Uint8Array(32).fill(9));
  mgr.registerExternalSession({ sessionId: 1433n, jobId: 2866n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
  return mgr;
}
const marker = (yes: boolean) => { versionAnswer = async () => ({ ok: true, json: async () => ({ version: '8.61.0', features: yes ? ['video-audio-transcoding', MARKER] : ['video-audio-transcoding'] }) }); };
const COMPLETE = { type: 'transcode_complete', taskId: 'task-1', outputs: [{ cid: 'bOut' }], billing: { units: 10, tokens: 1000, provenTokens: 1200 }, duration: 12 };

beforeEach(() => {
  FakeWebSocket.reset(); vi.stubGlobal('WebSocket', NodeSocket);
  fetchAnswers = []; fetches = []; versionCalls = 0; decoy = undefined;
  marker(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/v1/version')) { versionCalls++; return versionAnswer(); }
    throw new Error(`unexpected fetch ${url}`);
  }));
  (SessionManager as any).TRANSCODE_RESULT_POLL_MS = 20;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('H1/H2: the one-job refusal is lifted for exactly the nodes that report the marker', () => {
  it('J1: a marker node takes a second concurrent transcode on the session', async () => {
    const mgr = manager();
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    await expect(mgr.submitTranscode('1433', 'bB', ['mp4'] as any)).resolves.toBeDefined();
    expect(versionCalls).toBe(1);                                  // J3: one probe per session
  });

  it('J2: a node without the marker, or a probe that fails, keeps the 1.39.14 refusal', async () => {
    marker(false);
    const mgr = manager();
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    await expect(mgr.submitTranscode('1433', 'bB', ['mp4'] as any)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });

    versionAnswer = async () => { throw new Error('ECONNREFUSED'); };
    const mgr2 = manager();
    await mgr2.submitTranscode('1433', 'bA', ['mp4'] as any);
    await expect(mgr2.submitTranscode('1433', 'bB', ['mp4'] as any)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });
  });

  it('J3: a failed probe is not remembered — the next submit asks again (and can then be lifted)', async () => {
    versionAnswer = async () => ({ ok: false, status: 502, json: async () => ({}) });
    const mgr = manager();
    const first = await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    // The node was unknown, so the first job holds the 1.39.14 claim until it ends.
    await expect(mgr.submitTranscode('1433', 'bB', ['mp4'] as any)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });
    deliver(FakeWebSocket.instances[0], COMPLETE);
    await first.result;
    marker(true);
    await mgr.submitTranscode('1433', 'bC', ['mp4'] as any);
    await expect(mgr.submitTranscode('1433', 'bD', ['mp4'] as any)).resolves.toBeDefined();
    expect(versionCalls).toBe(2);
  });

  it('J3b: a definitive "no" is remembered for the session', async () => {
    marker(false);
    const mgr = manager();
    const first = await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    deliver(FakeWebSocket.instances[0], COMPLETE);
    await first.result;
    await mgr.submitTranscode('1433', 'bB', ['mp4'] as any);
    expect(versionCalls).toBe(1);
  });

  it('J3c: old node, two submits in one tick — the FIRST caller wins, as in 1.39.14, whatever the probes take', async () => {
    let n = 0;
    versionAnswer = async () => { const delay = n++ === 0 ? 50 : 5; await new Promise((r) => setTimeout(r, delay)); return { ok: true, json: async () => ({ features: [] }) }; };
    const mgr = manager();
    const [a, b] = await Promise.allSettled([mgr.submitTranscode('1433', 'bA', ['mp4'] as any), mgr.submitTranscode('1433', 'bB', ['mp4'] as any)]);
    expect(a.status).toBe('fulfilled');
    expect(b).toMatchObject({ status: 'rejected', reason: { code: 'SESSION_JOB_IN_FLIGHT' } });
  });

  it('J3d: registerExternalSession is refused from the first instant of a submit, probe or not', async () => {
    versionAnswer = () => new Promise(() => {});   // a probe that has not answered yet
    const mgr = manager();
    void mgr.submitTranscode('1433', 'bA', ['mp4'] as any).catch(() => {});
    expect(() => mgr.registerExternalSession({ sessionId: 1433n, jobId: 2866n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 }))
      .toThrow(expect.objectContaining({ code: 'SESSION_JOB_IN_FLIGHT' }));
  });

  it('J3e: the probe URL is the http(s) base, whatever form the endpoint takes', async () => {
    const mgr = manager();
    mgr.sessions.get('1433').endpoint = 'WSS://host2.fabstir.net/v1/ws/';
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://host2.fabstir.net/v1/version');
  });

  it('J3f: re-registering a session forgets what its old node reported', async () => {
    const mgr = manager();
    const first = await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);
    deliver(FakeWebSocket.instances[0], COMPLETE);
    await first.result;
    mgr.registerExternalSession({ sessionId: 1433n, jobId: 2866n, endpoint: 'https://host3.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    marker(false);
    await mgr.submitTranscode('1433', 'bB', ['mp4'] as any);
    await expect(mgr.submitTranscode('1433', 'bC', ['mp4'] as any)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });
    expect(versionCalls).toBe(2);
  });
});

describe('H3: fetchTranscodeResult', () => {
  it('J4: stored complete → { complete, result }; its socket is closed', async () => {
    fetchAnswers = [COMPLETE];
    const mgr = manager();
    const out = await mgr.fetchTranscodeResult('1433', 'task-1');
    expect(out).toMatchObject({ status: 'complete', result: { taskId: 'task-1', outputs: [{ cid: 'bOut' }], billing: { provenTokens: 1200 } } });
    expect(fetches).toEqual([{ action: 'transcode_result', taskId: 'task-1' }]);
    await flush();
    expect(FakeWebSocket.instances.every((s) => s.readyState === FakeWebSocket.CLOSED)).toBe(true);
  });

  it('J4b: an answer that does not echo the fetch\'s message id is not the answer', async () => {
    decoy = { type: 'transcode_result_pending', taskId: 'task-1' };
    fetchAnswers = [COMPLETE];
    await expect(manager().fetchTranscodeResult('1433', 'task-1')).resolves.toMatchObject({ status: 'complete' });
  });

  it('J4: pending → { pending }', async () => {
    fetchAnswers = [{ type: 'transcode_result_pending', taskId: 'task-1' }];
    await expect(manager().fetchTranscodeResult('1433', 'task-1')).resolves.toEqual({ status: 'pending' });
  });

  it.each(['RESULT_EXPIRED', 'RESULT_NOT_FOUND', 'NOT_OWNER', 'BILLING_FAILED'])('J4: transcode_error %s → TranscodeError with the node code', async (code) => {
    fetchAnswers = [{ type: 'transcode_error', taskId: 'task-1', error: { code, message: `node says ${code}` } }];
    const err: any = await manager().fetchTranscodeResult('1433', 'task-1').catch((e: any) => e);
    expect(err.name).toBe('TranscodeError');
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', details: { nodeCode: code, taskId: 'task-1' } });
  });

  it('J5: works on a session the node or the caller already completed', async () => {
    fetchAnswers = [COMPLETE];
    const mgr = manager();
    mgr.sessions.get('1433').status = 'completed';
    await expect(mgr.fetchTranscodeResult('1433', 'task-1')).resolves.toMatchObject({ status: 'complete' });
  });

  it('J6: a node without the marker → TRANSCODE_RESULT_UNSUPPORTED before any socket', async () => {
    marker(false);
    await expect(manager().fetchTranscodeResult('1433', 'task-1')).rejects.toMatchObject({ code: 'TRANSCODE_RESULT_UNSUPPORTED', details: { retryable: false } });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe('H4/H7: a transcode whose socket drops after the accept', () => {
  async function submitted(mgr: any, timeoutMs?: number) {
    const handle = await mgr.submitTranscode('1433', 'bA', ['mp4'] as any, timeoutMs ? { timeoutMs } : undefined);
    const ws = FakeWebSocket.instances[0];
    deliver(ws, { type: 'transcode_accepted', taskId: 'task-1' });
    return { handle, ws };
  }

  it('J7: marker node — the result is recovered (pending, then the stored complete)', async () => {
    fetchAnswers = [{ type: 'transcode_result_pending', taskId: 'task-1' }, COMPLETE];
    const { handle, ws } = await submitted(manager());
    ws.drop();
    await expect(handle.result).resolves.toMatchObject({ taskId: 'task-1', outputs: [{ cid: 'bOut' }] });
    expect(fetches.length).toBe(2);
  });

  it('J7: marker node — a gone result rejects with the node code', async () => {
    fetchAnswers = [{ type: 'transcode_error', taskId: 'task-1', error: { code: 'RESULT_EXPIRED', message: 'gone' } }];
    const { handle, ws } = await submitted(manager());
    ws.drop();
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { nodeCode: 'RESULT_EXPIRED', taskId: 'task-1' } });
  });

  it('J8: marker node — recovery stops at the submit deadline', async () => {
    fetchAnswers = [{ type: 'transcode_result_pending', taskId: 'task-1' }];
    const { handle, ws } = await submitted(manager(), 300);
    ws.drop();
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_TIMEOUT', details: { reason: 'WS_CLOSED', taskId: 'task-1' } });
  });

  it('J9: marker node — a close BEFORE the accept stays final (no task to fetch)', async () => {
    const handle = await manager().submitTranscode('1433', 'bA', ['mp4'] as any);
    FakeWebSocket.instances[0].drop();
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'WS_CLOSED' } });
    expect(fetches).toEqual([]);
  });

  it('J10: old node — final WS_CLOSED, the accurate message, and the task id', async () => {
    marker(false);
    const { handle, ws } = await submitted(manager());
    ws.drop();
    const err: any = await handle.result.catch((e: any) => e);
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'WS_CLOSED', closeCode: 1006, taskId: 'task-1' } });
    expect(err.message).toMatch(/does not keep a dropped transcode's result/);
    expect(fetches).toEqual([]);
  });
});

describe('round 1: recovery is bounded, and the fetch is its own connection', () => {
  async function dropped(mgr: any, timeoutMs?: number) {
    const handle = await mgr.submitTranscode('1433', 'bA', ['mp4'] as any, timeoutMs ? { timeoutMs } : undefined);
    deliver(FakeWebSocket.instances[0], { type: 'transcode_accepted', taskId: 'task-1' });
    FakeWebSocket.instances[0].drop();
    return handle;
  }

  it('R1: the deadline bounds an attempt that hangs (a node that never answers the fetch)', async () => {
    (SessionManager as any).TRANSCODE_RESULT_ANSWER_MS = 60_000;
    try {
      fetchAnswers = [];
      (NodeSocket as any).silent = true;
      const t0 = Date.now();
      const handle = await dropped(manager(), 300);
      await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_TIMEOUT', details: { reason: 'WS_CLOSED', taskId: 'task-1' } });
      expect(Date.now() - t0).toBeLessThan(3000);
    } finally {
      (SessionManager as any).TRANSCODE_RESULT_ANSWER_MS = 30_000;
      (NodeSocket as any).silent = false;
    }
  });

  it('R2: a refused init ends recovery at once instead of retrying to the deadline', async () => {
    const mgr = manager();
    const handle = await dropped(mgr, 60_000);
    mgr.sendEncryptedInit.mockImplementation(async () => { throw Object.assign(new Error('Session init failed'), { code: 'SESSION_INIT_ERROR' }); });
    const t0 = Date.now();
    await expect(handle.result).rejects.toMatchObject({ code: 'SESSION_INIT_ERROR' });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('R3: a plaintext node error on the fetch connection is the answer, with its code', async () => {
    fetchAnswers = [{ __plainError: { type: 'error', code: 'SESSION_AUTH_DENIED', message: 'not authorised' } }];
    const err: any = await manager().fetchTranscodeResult('1433', 'task-1').catch((e: any) => e);
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', details: { nodeCode: 'SESSION_AUTH_DENIED', taskId: 'task-1' } });
  });

  it('R4: cancel() during recovery stops the polling and rejects CANCELLED', async () => {
    fetchAnswers = [{ type: 'transcode_result_pending', taskId: 'task-1' }];
    const handle = await dropped(manager(), 60_000);
    await flush(20);
    const asked = fetches.length;
    handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ details: { reason: 'CANCELLED', taskId: 'task-1' } });
    await new Promise((r) => setTimeout(r, 100));
    expect(fetches.length).toBeLessThanOrEqual(asked + 1);
  });

  it('R5: a fetch never reuses — or closes — the shared chat socket, and inits with the dedicated scope', async () => {
    fetchAnswers = [COMPLETE];
    const mgr = manager();
    const shared = { isConnected: () => true, getConnectionGeneration: () => 1, disconnect: vi.fn(async () => {}),
      onMessage: vi.fn(() => () => {}), onClose: vi.fn(() => () => {}), sendWithoutResponse: vi.fn(async () => {}) };
    const key = new Uint8Array(32).fill(5);
    Object.assign(mgr, { wsClient: shared, wsSessionId: '1433', sessionKey: key, sessionKeyGeneration: 1 });
    mgr.sessionCrypto.set('1433', { key, messageIndex: 0 });
    await mgr.fetchTranscodeResult('1433', 'task-1');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(shared.sendWithoutResponse).not.toHaveBeenCalled();
    expect(shared.disconnect).not.toHaveBeenCalled();
    expect(mgr.sendEncryptedInit.mock.calls[0][4]).toBe('dedicated');
  });

  it('R7 (1.39.16): a fetch connection\'s init carries no lora — the node would re-stage the adapter (up to 300 s) before answering', async () => {
    fetchAnswers = [COMPLETE];
    const mgr = manager();
    const LORA = { manifestCID: 'uAdapter', manifestSha256: `0x${'0843be66'.repeat(8)}`, file: 'adapter.gguf' };
    const onServeBackError = vi.fn();
    Object.assign(mgr.sessions.get('1433'), { lora: LORA, onServeBackError });
    await mgr.fetchTranscodeResult('1433', 'task-1');
    const cfg = mgr.sendEncryptedInit.mock.calls[0][1];
    expect(cfg.lora).toBeUndefined();
    expect(cfg.onServeBackError).toBeUndefined();
    expect(mgr.sessions.get('1433').lora).toEqual(LORA);   // the session keeps its adapter for its jobs
  });

  it('R7b (1.39.16): recovery fetches carry no lora either, while the job\'s own init still does', async () => {
    fetchAnswers = [COMPLETE];
    const mgr = manager();
    const LORA = { manifestCID: 'uAdapter', manifestSha256: `0x${'0843be66'.repeat(8)}`, file: 'adapter.gguf' };
    mgr.sessions.get('1433').lora = LORA;
    const handle = await dropped(mgr);
    await handle.result;
    const configs = mgr.sendEncryptedInit.mock.calls.map((c: any) => c[1]);
    expect(configs[0].lora).toEqual(LORA);                       // the submit's init: the job runs on the adapter
    expect(configs.length).toBeGreaterThan(1);
    for (const cfg of configs.slice(1)) expect(cfg.lora).toBeUndefined();
  });

  it('R6: a fetch probes afresh — a node that stopped reporting the marker gets no fetch frame', async () => {
    const mgr = manager();
    await mgr.submitTranscode('1433', 'bA', ['mp4'] as any);   // remembers "yes"
    marker(false);
    await expect(mgr.fetchTranscodeResult('1433', 'task-1')).rejects.toMatchObject({ code: 'TRANSCODE_RESULT_UNSUPPORTED' });
    expect(fetches).toEqual([]);
  });
});

describe('H5/H6: node codes and billing', () => {
  it('J11: a coded transcode_error keeps the node code', async () => {
    const handle = await manager().submitTranscode('1433', 'bA', ['mp4'] as any);
    deliver(FakeWebSocket.instances[0], { type: 'transcode_error', error: { code: 'PROOF_WINDOW_TOO_SHORT', message: 'window under 300 s' } });
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { nodeCode: 'PROOF_WINDOW_TOO_SHORT' } });
  });

  it('J12: billing.provenTokens passes through', async () => {
    const handle = await manager().submitTranscode('1433', 'bA', ['mp4'] as any);
    deliver(FakeWebSocket.instances[0], COMPLETE);
    await expect(handle.result).resolves.toMatchObject({ billing: { units: 10, tokens: 1000, provenTokens: 1200 } });
  });
});

it('J13: flags', () => {
  expect([(SDK_CAPABILITIES as any).jobCompletionNodes, (SDK_CAPABILITIES as any).transcodeResultFetch]).toEqual([true, true]);
});
