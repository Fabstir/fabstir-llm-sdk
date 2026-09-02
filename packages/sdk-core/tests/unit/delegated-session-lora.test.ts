// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * §4 of SDK-REQUEST-TRAINING-EXISTING-SESSION.md, proven rather than asserted: a card-paid
 * CHAT serving a trained adapter is UI plumbing only. The two confirmations asked for:
 *  1. the adapter first-response allowance applies on a session registered via
 *     `registerDelegatedSession` exactly as on a created one (the allowance itself —
 *     ADAPTER_STAGE_BUDGET_MS = 300 s, 180 s → 480 s — is pinned in tests/training/serve-back.test.ts);
 *  2. nothing in the delegated registration path drops `lora` when `authorisation` is present.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { FakeWs, FakeWebSocket, makeFakeEncryptionManager, fakeHostManager } from '../helpers/session-doubles';
import { ADAPTER_STAGE_BUDGET_MS } from '../../src/utils/training-serve-back';
import { LORA } from '../training/fixtures';

const AUTH = { scheme: 'fc1.6', signature: '0xsig', clientAddress: `0x${'ab'.repeat(20)}` };
const BASE = {
  hostUrl: 'https://host2.fabstir.net', hostAddress: `0x${'20'.repeat(20)}`, model: 'base-model', chainId: 84532,
  depositAmount: '1', pricePerToken: 904, proofInterval: 1000, duration: 3600,
};

function manager() {
  const mgr: any = new SessionManager({} as any, { storeConversation: vi.fn().mockResolvedValue(undefined) } as any);
  mgr.encryptionManager = makeFakeEncryptionManager({ clientAddress: AUTH.clientAddress });
  mgr.hostManager = fakeHostManager();
  return mgr;
}
const register = (mgr: any, over: Record<string, unknown>) => mgr.registerDelegatedSession({ ...BASE, ...over });
/** The re-init config both the prompt path and acquireSessionTransport build from a registry entry. */
const reinit = async (mgr: any, s: any) => {
  const ws = new FakeWs();
  await mgr.sendEncryptedInit(ws, {
    chainId: s.chainId, host: s.provider, modelId: s.model, endpoint: s.endpoint,
    paymentMethod: 'deposit', encryption: true, lora: s.lora, onServeBackError: s.onServeBackError,
  }, s.sessionId, s.jobId);
  return ws;
};

describe('§4 — serve-back on a delegated (card-paid) session', () => {
  it('registerDelegatedSession keeps lora and onServeBackError when authorisation is present', async () => {
    const mgr = manager();
    const post = vi.spyOn(mgr, 'postSessionAuth').mockResolvedValue({ delivered: true });
    const onServeBackError = vi.fn();
    await register(mgr, { sessionId: 1145n, jobId: 2290n, authorisation: AUTH, nodeHttpUrl: BASE.hostUrl, lora: LORA, onServeBackError });
    expect(post).toHaveBeenCalledTimes(1);                      // the authorisation branch actually ran
    const entry = mgr.sessions.get('1145');
    expect(entry.lora).toEqual(LORA);
    expect(entry.onServeBackError).toBe(onServeBackError);
  });

  it('the init on a delegated session carries lora, so loraSessionActive — hence the allowance — is set', async () => {
    const mgr = manager();
    vi.spyOn(mgr, 'postSessionAuth').mockResolvedValue({ delivered: true });
    await register(mgr, { sessionId: 1145n, jobId: 2290n, authorisation: AUTH, nodeHttpUrl: BASE.hostUrl, lora: LORA });
    const ws = await reinit(mgr, mgr.sessions.get('1145'));
    expect(mgr.loraSessionActive).toBe(true);
    const init = ws.sent.find((m) => m.type === 'encrypted_session_init');
    expect(init.payload.__init.lora).toMatchObject({ manifestCID: LORA.manifestCID, file: LORA.file });
  });

  it('a delegated session registered WITHOUT lora leaves the allowance off (no false positives)', async () => {
    const mgr = manager();
    await register(mgr, { sessionId: 1146n, jobId: 2292n });
    const ws = await reinit(mgr, mgr.sessions.get('1146'));
    expect(mgr.loraSessionActive).toBe(false);
    expect(ws.sent.find((m) => m.type === 'encrypted_session_init').payload.__init.lora).toBeUndefined();   // not just the field's initial value
  });

  describe('end to end — the first CHAT prompt on a delegated session gets the adapter allowance', () => {
    // The addendum's one open question. This drives the REAL sendPrompt → sendEncryptedInit over a
    // socket double that acks the init, with fake timers: the config is what the SDK BUILDS from the
    // registry entry, and the timeout is the one the SDK ARMS — 180 s + the 300 s stage budget.
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); FakeWebSocket.reset(); delete (globalThis as any).WebSocket; });

    async function firstPrompt(withLora: boolean) {
      // A unit test must never reach a host: the legacy sendPrompt() is HTTP (POST /v1/inference) and a
      // first draft of this test hit host2.fabstir.net for real. The encrypted chat path is
      // sendPromptStreaming(); fetch is stubbed to throw so any HTTP escape is a loud failure.
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network is forbidden in unit tests'); }));
      vi.useFakeTimers();
      FakeWebSocket.reset(); FakeWebSocket.autoAckInit = true; (globalThis as any).WebSocket = FakeWebSocket;
      const mgr = manager();
      mgr.initialized = true;
      vi.spyOn(mgr, 'injectRAGContext').mockImplementation(async (_id: string, p: string) => p);
      vi.spyOn(mgr, 'postSessionAuth').mockResolvedValue({ delivered: true });
      await register(mgr, { sessionId: 1145n, jobId: 2290n, authorisation: AUTH, nodeHttpUrl: BASE.hostUrl, ...(withLora ? { lora: LORA } : {}) });
      // sendPromptStreaming wraps every failure as WS_PROMPT_ERROR; the inner timeout is in the message.
      const outcome = mgr.sendPromptStreaming(1145n, 'hello').then(() => 'resolved', (e: any) => `${e?.code}: ${e?.message}`);
      await vi.advanceTimersByTimeAsync(50);                                   // socket opens, init acked, prompt sent, timeout armed
      const init = JSON.parse(FakeWebSocket.instances[0].sent.find((f) => f.includes('encrypted_session_init'))!);
      return { mgr, outcome, init };
    }

    it('re-sends lora from the registry entry on the init the SDK builds, and waits 480 s — not 180 s — for the first response', async () => {
      const { mgr, outcome, init } = await firstPrompt(true);
      expect(init.payload.__init.lora).toMatchObject({ manifestCID: LORA.manifestCID, file: LORA.file });
      expect(mgr.loraSessionActive).toBe(true);
      await vi.advanceTimersByTimeAsync(180_000 + 10_000);                     // a 180 s budget would have fired by now
      let settled = 'pending'; outcome.then((v) => { settled = v; });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe('pending');                                          // still waiting: the adapter is staging
      await vi.advanceTimersByTimeAsync(ADAPTER_STAGE_BUDGET_MS);              // now past 480 s
      expect(await outcome).toMatch(/response timeout/i);
    });

    it('without an adapter the same path keeps the plain 180 s budget (no false allowance)', async () => {
      const { mgr, outcome, init } = await firstPrompt(false);
      expect(init.payload.__init.lora).toBeUndefined();
      expect(mgr.loraSessionActive).toBe(false);
      await vi.advanceTimersByTimeAsync(180_000 + 10_000);
      expect(await outcome).toMatch(/response timeout/i);
    });
  });
});
