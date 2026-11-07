// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * IMPLEMENTATION-TRANSCODE-1-39-18:
 *  K1 SOURCE_TOO_LONG is lifted on a node reporting `transcode-final-wait-uncapped` (node 8.62.6);
 *  K2 the default wait is the session's own on-chain expiry + 300 s;
 *  K3 TRANSCODE_TIMEOUT is not retryable (the run carries on and bills);
 *  K4 cancel() settles locally (from transcoder 6cc694e the node sends nothing after transcode_cancel);
 *  K5 encrypted transcodes go only to a configured allowlist — and with none configured they are refused (owner, fail closed).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { TranscodeManager } from '../../src/managers/TranscodeManager';
import { TranscodeError } from '../../src/errors/transcode-errors';
import { transcodeSessionDuration } from '../../src/utils/transcode-utils';
import { submitTranscodeWs } from '../../src/utils/transcode-ws';
import { SDK_CAPABILITIES } from '../../src/capabilities';
import { FakeWebSocket, stubNodeVersion } from '../helpers/session-doubles';
import { MODEL, HOST } from '../training/fixtures';
import type { VideoFormat } from '../../src/types/transcode.types';

vi.mock('../../src/utils/transcode-ws', async (o) => ({ ...(await o<typeof import('../../src/utils/transcode-ws')>()), submitTranscodeWs: vi.fn() }));

const fmt = (id: number, h: number, w: number): VideoFormat =>
  ({ id, ext: 'mp4', vcodec: 'h264_nvenc', acodec: 'aac', preset: 'fast', vf: `scale=${w}x${h}`, b_v: '5M', ar: '48k', ch: 2, dest: 's5' }) as VideoFormat;
const LADDER = [fmt(1, 480, 854), fmt(2, 720, 1280), fmt(3, 1080, 1920), fmt(4, 2160, 3840)];
const P1080 = fmt(3, 1080, 1920);
const OTHER_HOST = '0x' + '77'.repeat(20);
const PLAIN_CID = 's5://uPlainSource';
const ENC_CID = 's5://u' + Buffer.from(new Uint8Array([0xae, 0x01, 0x12, ...new Array(120).fill(7)])).toString('base64url');
const pendingHandle = () => ({ taskId: 't', cancel: vi.fn(), result: new Promise(() => {}) });
const base58 = (b: Uint8Array) => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Buffer.from(b).toString('hex')); let out = '';
  while (n > 0n) { out = A[Number(n % 58n)] + out; n /= 58n; }
  for (const x of b) { if (x !== 0) break; out = '1' + out; }
  return out;
};
const base32 = (b: Uint8Array) => {
  const A = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, out = '';
  for (const x of b) { v = (v << 8) | x; bits += 8; while (bits >= 5) { out += A[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += A[(v << (5 - bits)) & 31];
  return out;
};

function manager({ allow = [HOST] as string[] | null, job = { startTime: Math.floor(Date.now() / 1000) - 100, maxDuration: 3600 } as any } = {}) {
  const mgr: any = new SessionManager({ getSessionJob: vi.fn(async () => { throw new Error('the wallet path must not be used'); }) } as any, { storeConversation: vi.fn() } as any);
  mgr.reader = { getSessionJobOnChain: vi.fn(async () => ({ startTime: BigInt(job.startTime), maxDuration: BigInt(job.maxDuration) })) };
  mgr.setSessionJobReader(() => mgr.reader);
  mgr.encryptionManager = { encryptMessage: vi.fn(), decryptMessage: vi.fn() };
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async () => new Uint8Array(32).fill(9));
  mgr.registerExternalSession({ sessionId: 1500n, jobId: 3000n, endpoint: 'https://host2.fabstir.test', hostAddress: HOST, model: MODEL, chainId: 84532 });
  if (allow) mgr.setConfidentialHosts(allow);   // null: none configured
  return mgr;
}

beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); stubNodeVersion(); vi.mocked(submitTranscodeWs).mockReset(); vi.mocked(submitTranscodeWs).mockImplementation(async () => pendingHandle() as any); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('K1: the final-wait ceiling is per node', () => {
  it('lifted with finalWaitUncapped, strict without', () => {
    expect(() => transcodeSessionDuration(2619, LADDER, { ratePerSecond: 2000 })).toThrow(expect.objectContaining({ details: expect.objectContaining({ reason: 'SOURCE_TOO_LONG' }) }));
    expect(transcodeSessionDuration(2619, LADDER, { ratePerSecond: 2000, finalWaitUncapped: true })).toBe(Math.ceil(10_803_375 / 2000) + 600);
  });

  it('sizeTranscodeSession lifts it only for a hostUrl whose node reports the marker', async () => {
    const tm: any = new TranscodeManager({ resolveModelRateLimit: vi.fn(async () => 2000) } as any, {} as any, {} as any, {} as any, {} as any, 84532);
    await expect(tm.sizeTranscodeSession(2619, LADDER)).rejects.toMatchObject({ details: { reason: 'SOURCE_TOO_LONG' } });
    await expect(tm.sizeTranscodeSession(2619, LADDER, { hostUrl: 'https://host2.fabstir.test' })).rejects.toMatchObject({ details: { reason: 'SOURCE_TOO_LONG' } });
    stubNodeVersion(['transcode-final-wait-uncapped']);
    await expect(tm.sizeTranscodeSession(2619, LADDER, { hostUrl: 'https://host2.fabstir.test' })).resolves.toMatchObject({ duration: 6002, finalWaitUncapped: true });
  });
});

describe('K1/K5: the load balancer picks only hosts that can take the job', () => {
  const HOSTS = [
    { address: OTHER_HOST, apiUrl: 'https://capped.test', metadata: {}, supportedModels: [] },
    { address: HOST, apiUrl: 'https://uncapped.test', metadata: {}, supportedModels: [] },
  ];
  function tm(allow: string[] | undefined, features: Record<string, string[]>) {
    const sm = {
      startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
      submitTranscode: vi.fn(async () => pendingHandle()),
      resolveModelRateLimit: vi.fn(async () => 2000),
      getConfidentialHosts: vi.fn(() => allow),
    };
    const m: any = new TranscodeManager(sm as any, {} as any, {} as any, {} as any, {} as any, 84532);
    m.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => HOSTS.map((host) => ({ host }))) } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const host = Object.keys(features).find((h) => String(url).startsWith(h));
      if (String(url).endsWith('/v1/version')) return { ok: true, json: async () => ({ features: features[host!] ?? [] }) };
      return { ok: true, json: async () => ({ total: 4, available: 4, sidecar_connected: true, sidecarConnected: true }) };
    }));
    return { m, sm };
  }

  it('an over-limit job skips a node without the marker and funds the one that has it', async () => {
    const { m, sm } = tm([HOST, OTHER_HOST], { 'https://capped.test': [], 'https://uncapped.test': ['transcode-final-wait-uncapped'] });
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, LADDER, MODEL, { sourceDurationSeconds: 2619 });
    expect(sm.startSession).toHaveBeenCalledTimes(1);
    expect(sm.startSession.mock.calls[0][0]).toMatchObject({ host: HOST, duration: 6002 });
  });

  it('no node can take it → SOURCE_TOO_LONG, nothing funded', async () => {
    const { m, sm } = tm([HOST, OTHER_HOST], {});
    await expect(m.submitTranscodeWithLoadBalancing(PLAIN_CID, LADDER, MODEL, { sourceDurationSeconds: 2619 })).rejects.toMatchObject({ details: { reason: 'SOURCE_TOO_LONG' } });
    expect(sm.startSession).not.toHaveBeenCalled();
  });

  it('encrypted: unlisted hosts are never probed or funded; none listed → refused', async () => {
    const { m, sm } = tm([HOST], {});
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, [P1080], MODEL);
    expect(sm.startSession.mock.calls[0][0].host).toBe(HOST);
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).startsWith('https://capped.test'))).toBe(false);

    const none = tm(undefined, {});
    await expect(none.m.submitTranscodeWithLoadBalancing(PLAIN_CID, [P1080], MODEL)).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'NO_ALLOWLIST' } });
    expect(none.sm.startSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('unencrypted (isEncrypted false, plain CID) stays open', async () => {
    const { m, sm } = tm(undefined, {});
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, [P1080], MODEL, { isEncrypted: false });
    expect(sm.startSession).toHaveBeenCalledTimes(1);
  });

  it('K2: TranscodeManager waits for the session it funded + 300 s unless the caller says otherwise', async () => {
    const { m, sm } = tm([HOST, OTHER_HOST], {});
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, [P1080], MODEL);
    expect(sm.submitTranscode.mock.calls[0][3].timeoutMs).toBe((3600 + 300) * 1000);
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, [P1080], MODEL, { timeoutMs: 60_000 });
    expect(sm.submitTranscode.mock.calls[1][3].timeoutMs).toBe(60_000);
  });
});

describe('K5: submitTranscode is the guard every path passes', () => {
  it('no allowlist configured → refused before any socket (fail closed)', async () => {
    const mgr = manager({ allow: null });
    await expect(mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'NO_ALLOWLIST', host: HOST } });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it('a host not on the list → refused; a listed host (any case) → sent', async () => {
    await expect(manager({ allow: [OTHER_HOST] }).submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED', details: { reason: 'HOST_NOT_ALLOWED' } });
    await expect(manager({ allow: [HOST.toUpperCase().replace('0X', '0x')] }).submitTranscode('1500', PLAIN_CID, [P1080] as any)).resolves.toBeDefined();
  });

  it('isEncrypted false with a plain CID is open; with a 0xae capability CID it is still encrypted', async () => {
    await expect(manager({ allow: null }).submitTranscode('1500', PLAIN_CID, [P1080] as any, { isEncrypted: false })).resolves.toBeDefined();
    await expect(manager({ allow: null }).submitTranscode('1500', ENC_CID, [P1080] as any, { isEncrypted: false })).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED' });
  });

  it('R1: a session record swapped mid-submit is refused before the job frame (the guard checked the old one)', async () => {
    const mgr = manager();
    mgr.jobCompletionNodes.set('1500', true);   // no claim on such a node, so nothing else stops a re-registration
    let release!: () => void;
    mgr.reader.getSessionJobOnChain = vi.fn(() => new Promise((r) => { release = () => r({ startTime: BigInt(Math.floor(Date.now() / 1000)), maxDuration: 3600n }); }));
    const pending = mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any).catch((e: any) => e);
    await new Promise((r) => setTimeout(r, 0));
    mgr.registerExternalSession({ sessionId: 1500n, jobId: 3000n, endpoint: 'https://evil.test', hostAddress: OTHER_HOST, model: MODEL, chainId: 84532 });
    release();
    const err = await pending;
    expect(err).toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'SESSION_CHANGED' } });
    expect(submitTranscodeWs).not.toHaveBeenCalled();
  });

  it.each([
    ['z (base58btc)', (b: Uint8Array) => 's5://z' + base58(b)],
    ['b (base32)', (b: Uint8Array) => 's5://b' + base32(b)],
    ['f (hex)', (b: Uint8Array) => 's5://f' + Buffer.from(b).toString('hex')],
    ['u without s5://', (b: Uint8Array) => 'u' + Buffer.from(b).toString('base64url')],
  ])('R2: a 0xae capability CID in %s is still encrypted', async (_l, encode) => {
    const cid = encode(new Uint8Array([0xae, 0x01, 0x12, ...new Array(60).fill(7)]));
    await expect(manager({ allow: null }).submitTranscode('1500', cid, [P1080] as any, { isEncrypted: false })).rejects.toMatchObject({ code: 'CONFIDENTIAL_HOST_NOT_ALLOWED' });
  });

  it('R2: a plain CID in those encodings stays plain', async () => {
    const plain = new Uint8Array([0x26, 0x1f, ...new Array(33).fill(3)]);
    for (const cid of ['s5://z' + base58(plain), 's5://b' + base32(plain), 's5://f' + Buffer.from(plain).toString('hex')]) {
      await expect(manager({ allow: null }).submitTranscode('1500', cid, [P1080] as any, { isEncrypted: false })).resolves.toBeDefined();
    }
  });

  it('K6: SESSION_NOT_ACTIVE and ENCRYPTION_NOT_AVAILABLE also keep their precedence', async () => {
    const inactive = manager({ allow: null });
    inactive.sessions.get('1500').status = 'completed';
    await expect(inactive.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    const noEnc = manager({ allow: null });
    noEnc.encryptionManager = undefined;
    await expect(noEnc.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'ENCRYPTION_NOT_AVAILABLE' });
  });

  it('K6: the session guards still come first', async () => {
    const mgr = manager({ allow: null });
    await expect(mgr.submitTranscode('9999', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    mgr.sessions.get('1500').endpoint = undefined;
    await expect(mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'SESSION_ENDPOINT_MISSING' });
  });

  it('the allowlist must be addresses', () => {
    expect(() => manager({ allow: ['host2.fabstir.net'] })).toThrow(expect.objectContaining({ code: 'INVALID_CONFIDENTIAL_HOSTS' }));
  });
});

describe('K2: the default wait is the session\'s own expiry + 300 s', () => {
  it('read from the chain when the caller sets none', async () => {
    const mgr = manager();
    await mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any);
    const { timeoutMs } = vi.mocked(submitTranscodeWs).mock.calls[0][0] as any;
    expect(timeoutMs).toBeGreaterThan((3600 + 300 - 100 - 5) * 1000);
    expect(timeoutMs).toBeLessThanOrEqual((3600 + 300 - 100) * 1000);
    expect(mgr.reader.getSessionJobOnChain).toHaveBeenCalledWith(3000n);      // the read provider's path, not the wallet's
    expect(mgr.paymentManager.getSessionJob).not.toHaveBeenCalled();
  });

  it("the caller's timeoutMs stands, and then nothing is read", async () => {
    const mgr = manager();
    await mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any, { timeoutMs: 60_000 });
    expect((vi.mocked(submitTranscodeWs).mock.calls[0][0] as any).timeoutMs).toBe(60_000);
    expect(mgr.reader.getSessionJobOnChain).not.toHaveBeenCalled();
  });

  it('a session the chain cannot answer for is refused before any socket — no assumed wait', async () => {
    const mgr = manager();
    mgr.reader.getSessionJobOnChain = vi.fn(async () => { throw new Error('rpc down'); });
    await expect(mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'SESSION_UNREADABLE' } });
    expect(FakeWebSocket.instances).toHaveLength(0);
    // …and the claim was given back: the next submit meets the same refusal, not SESSION_JOB_IN_FLIGHT
    await expect(mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ details: { reason: 'SESSION_UNREADABLE' } });
  });

  it('an expired session, or one with no start time, is refused before any socket', async () => {
    const expired = manager({ job: { startTime: Math.floor(Date.now() / 1000) - 10_000, maxDuration: 3600 } });
    await expect(expired.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ details: { reason: 'SESSION_EXPIRED' } });
    const unstarted = manager({ job: { startTime: 0, maxDuration: 3600 } });
    await expect(unstarted.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ details: { reason: 'SESSION_UNREADABLE' } });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('with no session reader wired the wait is refused, never assumed', async () => {
    const mgr = manager();
    mgr.sessionJobReader = undefined;
    await expect(mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any)).rejects.toMatchObject({ details: { reason: 'SESSION_UNREADABLE' } });
  });
});

describe('K3/K4: timeouts and cancel on the wire', () => {
  function socket() {
    const handlers = new Set<(d: any) => void>(); const sent: any[] = [];
    return { sent, handlers, sendWithoutResponse: vi.fn(async (d: any) => { sent.push(d); }), onMessage: vi.fn((h: any) => { handlers.add(h); return () => handlers.delete(h); }), onClose: vi.fn(() => () => {}) };
  }
  const real = async () => (await vi.importActual<typeof import('../../src/utils/transcode-ws')>('../../src/utils/transcode-ws')).submitTranscodeWs;
  const enc = { encryptMessage: () => ({ ciphertextHex: 'c', nonceHex: 'n', aadHex: 'a' }), decryptMessage: (_k: any, p: any) => p.__plain };
  const accept = (ws: ReturnType<typeof socket>) => [...ws.handlers].forEach((h) => h({ type: 'encrypted_response', payload: { __plain: JSON.stringify({ type: 'transcode_accepted', taskId: 'task-9' }) } }));

  it('K3: TRANSCODE_TIMEOUT is not retryable, and the timeout names the task', async () => {
    expect(new TranscodeError('x', 'TRANSCODE_TIMEOUT').isRetryable).toBe(false);
    const ws = socket();
    const handle = await (await real())({ wsClient: ws as any, encryptionManager: enc as any, sessionId: 's', sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: PLAIN_CID, formats: [P1080] as any, timeoutMs: 30 });
    accept(ws);
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_TIMEOUT', details: { reason: 'WAIT_TIMEOUT', taskId: 'task-9' } });
  });

  it('K4: cancel() sends transcode_cancel and settles the result locally', async () => {
    const ws = socket();
    const handle = await (await real())({ wsClient: ws as any, encryptionManager: enc as any, sessionId: 's', sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: PLAIN_CID, formats: [P1080] as any, timeoutMs: 60_000 });
    accept(ws);
    handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ code: 'TRANSCODE_FAILED', details: { reason: 'CANCELLED', taskId: 'task-9' } });
    expect(ws.sent.some((f) => f.type === 'transcode_cancel')).toBe(true);
  });
});

describe('R4: cancel through SessionManager, and before the accept', () => {
  it('a cancelled job settles, closes its socket and frees the session', async () => {
    const mgr = manager();
    const real = (await vi.importActual<typeof import('../../src/utils/transcode-ws')>('../../src/utils/transcode-ws')).submitTranscodeWs;
    vi.mocked(submitTranscodeWs).mockImplementation(real as any);
    mgr.encryptionManager = { encryptMessage: () => ({ ciphertextHex: 'c', nonceHex: 'n', aadHex: 'a' }), decryptMessage: (_k: any, p: any) => p.__plain };
    const handle = await mgr.submitTranscode('1500', PLAIN_CID, [P1080] as any);
    const ws = FakeWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: 'encrypted_response', session_id: '1500', payload: { __plain: JSON.stringify({ type: 'transcode_accepted', taskId: 'task-5' }) } }) });
    handle.cancel();
    await expect(handle.result).rejects.toMatchObject({ details: { reason: 'CANCELLED', taskId: 'task-5' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    expect(mgr.jobsInFlight.has('1500')).toBe(false);
  });

  it('a cancel before the accept waits for it, then sends transcode_cancel and settles (the node reads it only after its ack)', async () => {
    const handlers = new Set<(d: any) => void>(); const sent: any[] = [];
    const ws = { sendWithoutResponse: vi.fn(async (d: any) => { sent.push(d); }), onMessage: vi.fn((h: any) => { handlers.add(h); return () => handlers.delete(h); }), onClose: vi.fn(() => () => {}) };
    const real = (await vi.importActual<typeof import('../../src/utils/transcode-ws')>('../../src/utils/transcode-ws')).submitTranscodeWs;
    const handle = await real({ wsClient: ws as any, encryptionManager: { encryptMessage: () => ({ ciphertextHex: 'c', nonceHex: 'n', aadHex: 'a' }), decryptMessage: (_k: any, p: any) => p.__plain } as any,
      sessionId: 's', sessionKey: new Uint8Array(32), messageIndex: { value: 0 }, sourceCid: PLAIN_CID, formats: [P1080] as any, timeoutMs: 60_000 });
    let settled = false; handle.result.catch(() => { settled = true; });
    handle.cancel();
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false);
    expect(sent.some((f) => f.type === 'transcode_cancel')).toBe(false);
    [...handlers].forEach((h) => h({ type: 'encrypted_response', payload: { __plain: JSON.stringify({ type: 'transcode_accepted', taskId: 'task-6' }) } }));
    await expect(handle.result).rejects.toMatchObject({ details: { reason: 'CANCELLED', taskId: 'task-6' } });
    expect(sent.some((f) => f.type === 'transcode_cancel')).toBe(true);
  });
});

describe('R5: the load balancer\'s skips', () => {
  const host = (n: number, url: string) => ({ address: '0x' + String(n).repeat(40).slice(0, 40), apiUrl: url, metadata: {}, supportedModels: [] });
  function lb(hosts: any[], features: Record<string, string[]>, capacity: Record<string, number>, maxHostRetries?: number) {
    const sm = {
      startSession: vi.fn(async () => ({ sessionId: 7n, jobId: 8n })),
      submitTranscode: vi.fn(async () => pendingHandle()),
      resolveModelRateLimit: vi.fn(async () => 2000),
      getConfidentialHosts: vi.fn(() => hosts.map((h) => h.address)),
    };
    const m: any = new TranscodeManager(sm as any, {} as any, {} as any, {} as any, {} as any, 84532);
    m.setHostSelectionService({ getRankedHostsForModel: vi.fn(async () => hosts.map((h) => ({ host: h }))) } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const base = Object.keys(features).find((h) => String(url).startsWith(h))!;
      if (String(url).endsWith('/v1/version')) return { ok: true, json: async () => ({ features: features[base] ?? [] }) };
      return { ok: true, json: async () => ({ total: 4, available: capacity[base] ?? 4, sidecar_connected: true, sidecarConnected: true }) };
    }));
    return { m, sm, opts: { sourceDurationSeconds: 2619, retryDelayMs: 1, ...(maxHostRetries && { maxHostRetries }) } };
  }

  it('one host has the marker but no capacity, another lacks the marker → NO_AVAILABLE_HOSTS, not SOURCE_TOO_LONG', async () => {
    const { m, opts } = lb([host(1, 'https://a.test'), host(2, 'https://b.test')],
      { 'https://a.test': ['transcode-final-wait-uncapped'], 'https://b.test': [] }, { 'https://a.test': 0 });
    await expect(m.submitTranscodeWithLoadBalancing(PLAIN_CID, LADDER, MODEL, opts)).rejects.toMatchObject({ code: 'NO_AVAILABLE_HOSTS' });
  });

  it('hosts skipped for the marker do not use up the retry slots', async () => {
    const { m, sm, opts } = lb([host(1, 'https://a.test'), host(2, 'https://b.test'), host(3, 'https://c.test'), host(4, 'https://d.test')],
      { 'https://a.test': [], 'https://b.test': [], 'https://c.test': [], 'https://d.test': ['transcode-final-wait-uncapped'] }, {}, 3);
    await m.submitTranscodeWithLoadBalancing(PLAIN_CID, LADDER, MODEL, opts);
    expect(sm.startSession.mock.calls[0][0].endpoint).toBe('https://d.test');
  });
});

it('K7: flags', () => {
  const c = SDK_CAPABILITIES as any;
  expect([c.transcodeFinalWaitUncapped, c.transcodeWaitFromSession, c.transcodeCancelSettles, c.encryptedTranscodeAllowlist]).toEqual([true, true, true, true]);
});

describe('K5: FabstirSDKCore config', () => {
  it('a malformed transcode.encryptedHosts fails at construction, not at the first transcode', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    const { ChainRegistry } = await import('../../src/config/ChainRegistry');
    const { ChainId } = await import('../../src/types/chain.types');
    const c = ChainRegistry.getChain(ChainId.BASE_SEPOLIA).contracts;
    const base = { mode: 'production' as const, chainId: ChainId.BASE_SEPOLIA, rpcUrl: 'https://rpc.invalid', contractAddresses: { ...c } };
    expect(() => new FabstirSDKCore({ ...base, confidentialHosts: ['host2.fabstir.net'] } as any))
      .toThrow(expect.objectContaining({ code: 'INVALID_CONFIDENTIAL_HOSTS' }));
    expect(() => new FabstirSDKCore({ ...base, confidentialHosts: [HOST] } as any)).not.toThrow();
  });
});
