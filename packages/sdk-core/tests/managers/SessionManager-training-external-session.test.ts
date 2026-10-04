// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression guard for the claim the existingSession path rests on: "training needs no new
 * registry shape". IMPLEMENTATION §2 verified it by READING acquireSessionTransport; this proves
 * it by driving the REAL SessionManager.submitTraining against a registerExternalSession-seeded
 * entry and asserting it gets past every registry guard and reaches the WS submit with exactly
 * the seeded fields. Predicted profile: GREEN (a guard, like the LTX plan's Phase-1 guard-pass
 * test) — a RED here would be a real defect, not a missing feature.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { submitTrainingWs } from '../../src/utils/training-ws';
import { submitLtxWs } from '../../src/utils/ltx-ws';
import { FakeWebSocket } from '../helpers/session-doubles';
import { MODEL, HOST, JOB, LORA } from '../training/fixtures';

vi.mock('../../src/utils/ltx-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/ltx-ws')>();
  return { ...mod, submitLtxWs: vi.fn(async () => ({ requestId: 'l', result: Promise.resolve({}), cancel: async () => {} })) };
});

vi.mock('../../src/utils/training-ws', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/utils/training-ws')>();
  return {
    ...mod,
    submitTrainingWs: vi.fn(async () => ({
      requestId: 'r', result: Promise.resolve({}), cancel: async () => {}, slices: [], pointers: [], forfeitedSlices: [],
    })),
  };
});

const JOB_ANY: any = JOB;

function manager() {
  const mgr: any = new SessionManager({} as any, { storeConversation: vi.fn() } as any);
  mgr.encryptionManager = { encryptMessage: vi.fn(), decryptMessage: vi.fn() };
  const initConfigs: any[] = [];
  vi.spyOn(mgr, 'sendEncryptedInit').mockImplementation(async (_ws: any, cfg: any, sid: bigint, jid: bigint) => {
    initConfigs.push({ ...cfg, __sid: sid, __jid: jid });
    mgr.sessionKey = new Uint8Array(32).fill(9);
    mgr.messageIndex = 0;
  });
  return { mgr, initConfigs };
}

describe('SessionManager.submitTraining against a registerExternalSession-seeded entry', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); vi.mocked(submitTrainingWs).mockClear(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('passes the registry guards and reaches the WS submit with the seeded fields', async () => {
    const { mgr, initConfigs } = manager();
    mgr.registerExternalSession({ sessionId: 1145n, jobId: 2290n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });

    const handle = await mgr.submitTraining('1145', JOB_ANY, { onChainPricePerToken: '904', sliceTokens: 1_000_000, minAllowListVersion: 26 });

    expect(FakeWebSocket.urls).toEqual(['wss://host2.fabstir.net/v1/ws']);     // http(s) base → /v1/ws derivation
    expect(initConfigs[0]).toMatchObject({ host: HOST, modelId: MODEL, chainId: 84532, endpoint: 'https://host2.fabstir.net', encryption: true });
    expect(initConfigs[0].__sid).toBe(1145n);                                   // the SEEDED ids reach the init frame …
    expect(initConfigs[0].__jid).toBe(2290n);                                   // … and they are different numbers
    const opts = vi.mocked(submitTrainingWs).mock.calls[0][0];
    expect(opts.sessionId).toBe('1145');
    expect(opts.onChainPricePerToken).toBe('904');
    expect(opts.sliceTokens).toBe(1_000_000);
    expect(opts.minAllowListVersion).toBe(26);
    expect(handle.requestId).toBe('r');
  });

  it('closes the dedicated socket only AFTER the run settles (CK-6: pointers arrive on this socket)', async () => {
    let settle!: (v: unknown) => void;
    vi.mocked(submitTrainingWs).mockResolvedValueOnce({
      requestId: 'r', result: new Promise((r) => { settle = r; }), cancel: async () => {}, slices: [], pointers: [], forfeitedSlices: [],
    } as any);
    const { mgr } = manager();
    mgr.registerExternalSession({ sessionId: 1148n, jobId: 2296n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    const handle = await mgr.submitTraining('1148', JOB_ANY);
    const socket = FakeWebSocket.instances[0];
    const close = vi.spyOn(socket, 'close');
    expect(close).not.toHaveBeenCalled();
    settle({});
    await handle.result;
    await new Promise((r) => setImmediate(r));
    expect(close).toHaveBeenCalled();
  });

  it('a run that fails before anyone awaits handle.result is not an unhandled rejection (owned socket)', async () => {
    const rejected = Promise.reject(new Error('node said no')); rejected.catch(() => {});
    vi.mocked(submitTrainingWs).mockResolvedValueOnce({ requestId: 'r', result: rejected, cancel: async () => {}, slices: [], pointers: [], forfeitedSlices: [] } as any);
    const { mgr } = manager();
    mgr.registerExternalSession({ sessionId: 1149n, jobId: 2298n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    const seen: unknown[] = []; const on = (r: unknown) => seen.push(r);
    process.on('unhandledRejection', on);
    let handle!: Awaited<ReturnType<typeof mgr.submitTraining>>;
    try {
      handle = await mgr.submitTraining('1149', JOB_ANY);
      await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    } finally { process.off('unhandledRejection', on); }
    expect(seen).toEqual([]);
    await expect(handle.result).rejects.toThrow(/node said no/);
  });

  it('SESSION_NOT_FOUND for an id that was never seeded — the guard the seeding exists to pass', async () => {
    const { mgr } = manager();
    await expect(mgr.submitTraining('9999', JOB_ANY)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect(FakeWebSocket.urls).toHaveLength(0);
  });

  it.each(['wss://host2.fabstir.net', 'https://host2.fabstir.net/?token=x', 'https://proxy.example/?u=wss://h'])(
    'the registry itself refuses an endpoint the transport would mistarget or mangle (%s) — the rule lives at the seam', (endpoint) => {
      // registerExternalSession is a public ISessionManager method; a third caller (a UI re-seeding
      // after a reload) has no manager pre-check in front of it. A wss:// value would be used VERBATIM
      // (no /v1/ws → socket at the root); a query would have /v1/ws appended AFTER it. ('HTTPS://' is
      // normalised, not refused — see the next test.)
      const { mgr } = manager();
      expect(() => mgr.registerExternalSession({ sessionId: 1146n, jobId: 2292n, endpoint, hostAddress: HOST, model: MODEL, chainId: 84532 }))
        .toThrow(expect.objectContaining({ code: 'SESSION_ENDPOINT_INVALID' }));
      expect(mgr.getSession('1146')).toBeUndefined();
    },
  );

  it('the registry normalises a valid endpoint the way the managers do (one rule, one place)', () => {
    const { mgr } = manager();
    mgr.registerExternalSession({ sessionId: 1150n, jobId: 2300n, endpoint: 'HTTPS://host2.fabstir.net//', hostAddress: HOST, model: MODEL, chainId: 84532 });
    expect(mgr.getSession('1150').endpoint).toBe('https://host2.fabstir.net');
  });

  it('the seeded entry keeps lora/onServeBackError and the re-init carries them', async () => {
    const { mgr, initConfigs } = manager();
    const onServeBackError = vi.fn();
    mgr.registerExternalSession({ sessionId: 1147n, jobId: 2294n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532, lora: LORA, onServeBackError });
    await mgr.submitTraining('1147', JOB_ANY);
    expect(initConfigs[0].lora).toEqual(LORA);
    expect(initConfigs[0].onServeBackError).toBe(onServeBackError);
  });
});

describe('adjacent: submitLtx on the SHARED socket (ownsWs === false)', () => {
  beforeEach(() => { FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('a rejecting LTX result nobody awaited is not an unhandled rejection even when the socket is shared', async () => {
    // submitLtx re-wraps handle.result unconditionally (`.then(r => r.seed = …)`); Round 2 marked only
    // the owned-socket `.finally` wrapper handled. ltx-ws never marks its original either.
    const rejected = Promise.reject(new Error('node said no')); rejected.catch(() => {});
    vi.mocked(submitLtxWs).mockResolvedValueOnce({ requestId: 'l', result: rejected, cancel: async () => {} } as any);
    const { mgr } = manager();
    mgr.registerExternalSession({ sessionId: 1152n, jobId: 2304n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    // Prime the shared client so acquireSessionTransport REUSES it (identity + key present).
    mgr.wsClient = { isConnected: () => true, getConnectionGeneration: () => 1, onMessage: () => () => {}, sendWithoutResponse: async () => {}, disconnect: async () => {} };
    mgr.wsSessionId = '1152'; mgr.sessionKey = new Uint8Array(32).fill(9); mgr.sessionKeyGeneration = 1; mgr.messageIndex = 0;
    const seen: unknown[] = []; const on = (r: unknown) => seen.push(r);
    process.on('unhandledRejection', on);
    let handle!: Awaited<ReturnType<typeof mgr.submitLtx>>;
    try {
      handle = await mgr.submitLtx('1152', { seed: '1' } as any, {});
      await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
    } finally { process.off('unhandledRejection', on); }
    expect(FakeWebSocket.urls).toHaveLength(0);                                 // shared socket: no new connection
    expect(seen).toEqual([]);
    await expect(handle.result).rejects.toThrow(/node said no/);
  });
});

describe('Round 4b — a pre-frame init failure must not leak the dedicated socket', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeWebSocket.reset(); vi.stubGlobal('WebSocket', FakeWebSocket); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('an init failure (host unreachable for its key) closes the socket; no heartbeat, no reconnect', async () => {
    const { mgr } = manager();
    (mgr.sendEncryptedInit as any).mockImplementation(async () => { throw Object.assign(new Error('host down'), { code: 'HOST_PUBKEY_UNAVAILABLE' }); });
    mgr.registerExternalSession({ sessionId: 1160n, jobId: 2320n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    const sharedKey = new Uint8Array(32).fill(7); mgr.sessionKey = sharedKey; mgr.wsSessionId = 'chat-9'; mgr.messageIndex = 4;   // the CHAT session's key
    const p = mgr.submitTraining('1160', JOB_ANY).catch((e: any) => e);
    await vi.advanceTimersByTimeAsync(20);
    const e = await p;
    expect(e.code).toBe('HOST_PUBKEY_UNAVAILABLE');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);                 // closed, not left pinging
    expect(mgr.sessionKey).toBe(sharedKey); expect(mgr.messageIndex).toBe(4);                  // the shared session's key survived the failed per-job init
    const sent = FakeWebSocket.instances[0].sent.length;
    await vi.advanceTimersByTimeAsync(70_000);
    expect(FakeWebSocket.instances[0].sent.length).toBe(sent);                                // no heartbeat after the failure
    expect(FakeWebSocket.instances).toHaveLength(1);                                          // no reconnect
  });

  it('a connect failure (host down) does not start a background reconnect loop', async () => {
    const { mgr } = manager();
    FakeWebSocket.autoOpen = false;
    mgr.registerExternalSession({ sessionId: 1161n, jobId: 2322n, endpoint: 'https://host2.fabstir.net', hostAddress: HOST, model: MODEL, chainId: 84532 });
    const p = mgr.submitTraining('1161', JOB_ANY).catch((e: any) => e);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].onerror?.({ message: 'ECONNREFUSED' });
    FakeWebSocket.instances[0].drop();
    const e = await p;
    expect(e.code).toBe('WS_CONNECTION_ERROR');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWebSocket.instances).toHaveLength(1);                                          // 5 s later: still one socket
  });
});
