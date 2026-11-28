// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * closeUnsubmittedSession (1.39.29): the session start a job makes (connect + encrypted init + ack), then a clean close,
 * with no job frame, so the host's last-connection-closed path completes a session it would otherwise never hear of.
 * Plan: docs/development/IMPLEMENTATION-CLOSE-UNSUBMITTED-SESSION.md (C1–C8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { FakeWebSocket, makeFakeEncryptionManager, fakeHostManager, activeOnChain } from '../helpers/session-doubles';
import { RegionPolicy } from '../../src/utils/region-policy';
import { STORAGE_REGIONS } from '../../src/config/storage-regions';
import { SDK_CAPABILITIES } from '../../src/capabilities';

const BASE = {
  hostUrl: 'https://host2.fabstir.net', hostAddress: `0x${'20'.repeat(20)}`, model: 'base-model', chainId: 84532,
  depositAmount: '1', pricePerToken: 904, proofInterval: 1000, duration: 3600,
};
const SID = '1145';

async function manager() {
  const storage = { storeConversation: vi.fn(async () => undefined), updateConversationMetadata: vi.fn(async () => undefined) };
  const mgr: any = new SessionManager({} as any, storage as any);
  mgr.encryptionManager = makeFakeEncryptionManager({ clientAddress: `0x${'ab'.repeat(20)}` });
  mgr.hostManager = fakeHostManager();
  activeOnChain(mgr);
  await mgr.registerDelegatedSession({ ...BASE, sessionId: 1145n, jobId: 2290n });
  return mgr;
}
const frames = (ws: FakeWebSocket) => ws.sent.map((f) => JSON.parse(f).type);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network is forbidden in unit tests'); }));
  FakeWebSocket.reset();
  FakeWebSocket.autoAckInit = true;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); FakeWebSocket.reset(); });

describe('closeUnsubmittedSession', () => {
  it('C1: one socket, exactly one encrypted_session_init and nothing else, closed cleanly; the session is ended', async () => {
    const mgr = await manager();
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('closed');
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://host2.fabstir.net/v1/ws');
    expect(frames(ws)).toEqual(['encrypted_session_init']);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    expect(mgr.sessions.get(SID).status).toBe('ended');
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
  });

  it('C1: a string id works the same', async () => {
    const mgr = await manager();
    expect(await mgr.closeUnsubmittedSession(SID)).toBe('closed');
    expect(frames(FakeWebSocket.instances[0])).toEqual(['encrypted_session_init']);
  });

  it('C2: an init the host refuses throws; its socket is closed, the session stays active, the slot is free again', async () => {
    FakeWebSocket.autoAckInit = false;
    const mgr = await manager();
    const epochBefore = mgr.maySettleEpoch;
    const pending = mgr.closeUnsubmittedSession(1145n).catch((e: any) => e);
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]?.sent.length).toBe(1));
    const ws = FakeWebSocket.instances[0];
    const init = JSON.parse(ws.sent[0]);
    ws.onmessage?.({ data: JSON.stringify({ type: 'error', session_id: init.session_id, code: 'INIT_REFUSED', message: 'no' }) });
    const err = await pending;
    expect(err).toBeInstanceOf(Error);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    expect(mgr.sessions.get(SID).status).toBe('active');
    expect(mgr.maySettle.get(SID).epoch).toBeGreaterThan(epochBefore);   // marked by this failure: the host may have registered it
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
    expect(frames(ws)).toEqual(['encrypted_session_init']);
  });

  it('C3: a job in flight is refused before any socket; while a close runs, a job is refused', async () => {
    const mgr = await manager();
    mgr.jobsInFlight.set(SID, 'ltx');
    await expect(mgr.closeUnsubmittedSession(1145n)).rejects.toMatchObject({ code: 'SESSION_JOB_IN_FLIGHT' });
    expect(FakeWebSocket.instances).toHaveLength(0);
    mgr.jobsInFlight.delete(SID);

    FakeWebSocket.autoAckInit = false;
    const pending = mgr.closeUnsubmittedSession(1145n).catch((e: any) => e);
    await vi.waitFor(() => expect(FakeWebSocket.instances[0]?.sent.length).toBe(1));
    expect(() => mgr.refuseIfJobInFlight(SID)).toThrow(expect.objectContaining({ code: 'SESSION_JOB_IN_FLIGHT' }));
    const ws = FakeWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: 'session_init_ack', session_id: JSON.parse(ws.sent[0]).session_id, status: 'success' }) });
    expect(await pending).toBe('closed');
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
  });

  it('C4: settled on chain already: "already-settled", no socket', async () => {
    const mgr = await manager();
    mgr.setSessionJobReader(() => ({ getSessionJobOnChain: vi.fn(async () => ({ status: 1, startTime: 1n, maxDuration: 3600n })) }));
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('already-settled');
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(mgr.sessions.get(SID).status).not.toBe('active');
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
  });

  it('C4: settled by the node already: "already-settled", no socket', async () => {
    const mgr = await manager();
    mgr.markSettledByNode(SID, 'completion');
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('already-settled');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('C5: not found, or ended here (not settled), is refused with its code and no socket', async () => {
    const mgr = await manager();
    await expect(mgr.closeUnsubmittedSession(999n)).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    await mgr.endSession(1145n);
    const read = vi.fn(async () => ({ status: 0, startTime: 1n, maxDuration: 3600n }));
    mgr.setSessionJobReader(() => ({ getSessionJobOnChain: read }));
    await expect(mgr.closeUnsubmittedSession(1145n)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    expect(read).not.toHaveBeenCalled();   // refused on its status, before any chain read
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
  });

  it('C6 (review M1): a shared socket for the session, never acked: a dedicated init still goes out, and the shared one is closed', async () => {
    const mgr = await manager();
    const shared = { disconnect: vi.fn(async () => undefined), isConnected: () => true };
    mgr.wsClient = shared;
    mgr.wsSessionId = SID;   // set by a prompt before its init, which then failed
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('closed');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(frames(FakeWebSocket.instances[0])).toEqual(['encrypted_session_init']);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
    expect(shared.disconnect).toHaveBeenCalledTimes(1);
    expect(mgr.wsClient).toBeUndefined();
    expect(mgr.sessions.get(SID).status).toBe('ended');
  });

  it('C6 (review M1): a shared socket the host acked is never reused for the close: a dedicated one is, and the shared one closes', async () => {
    const mgr = await manager();
    const shared = { disconnect: vi.fn(async () => undefined), isConnected: () => true };
    const key = new Uint8Array(32).fill(7);
    mgr.wsClient = shared; mgr.wsSessionId = SID; mgr.sessionKey = key;
    mgr.sessionCrypto.set(SID, { key, index: 0 });
    mgr.needsSessionInit = () => false;
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('closed');
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(frames(FakeWebSocket.instances[0])).toEqual(['encrypted_session_init']);
    expect(shared.disconnect).toHaveBeenCalledTimes(1);
  });

  it('C6 (review M1): settled on chain with a shared socket open: "already-settled", no init', async () => {
    const mgr = await manager();
    mgr.wsClient = { disconnect: vi.fn(async () => undefined), isConnected: () => true }; mgr.wsSessionId = SID;
    mgr.setSessionJobReader(() => ({ getSessionJobOnChain: vi.fn(async () => ({ status: 1, startTime: 1n, maxDuration: 3600n })) }));
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('already-settled');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('review m2: the close-time init carries no adapter (lora), so the host does not stage one before the close', async () => {
    const mgr = await manager();
    mgr.sessions.get(SID).lora = { manifestCID: 'bafyadapter', file: 'adapter.safetensors' };
    await mgr.closeUnsubmittedSession(1145n);
    expect(JSON.parse(FakeWebSocket.instances[0].sent[0]).payload.__init.lora).toBeUndefined();
  });

  it('review m4: the dedicated socket is closed even when ending the session locally throws', async () => {
    const mgr = await manager();
    vi.spyOn(mgr, 'endSession').mockRejectedValue(Object.assign(new Error('end failed'), { code: 'SESSION_END_ERROR' }));
    await expect(mgr.closeUnsubmittedSession(1145n)).rejects.toMatchObject({ code: 'SESSION_END_ERROR' });
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
    expect(mgr.jobsInFlight.has(SID)).toBe(false);
  });

  it('the session is ended before the close, and the close is awaited', async () => {
    const mgr = await manager();
    const { WebSocketClient } = await import('../../src/websocket/WebSocketClient');
    const statusAtClose: string[] = [];
    let closed = false;
    const orig = WebSocketClient.prototype.disconnect;
    vi.spyOn(WebSocketClient.prototype, 'disconnect').mockImplementation(async function (this: any) {
      statusAtClose.push(mgr.sessions.get(SID).status);
      await new Promise((r) => setTimeout(r, 5));
      await orig.call(this);
      closed = true;
    });
    await mgr.closeUnsubmittedSession(1145n);
    expect(statusAtClose).toEqual(['ended']);
    expect(closed).toBe(true);
  });

  it('settled by the node during the close (its notice after the ack): "already-settled", the status is kept', async () => {
    const mgr = await manager();
    const acquire = mgr.acquireSessionTransport.bind(mgr);
    mgr.acquireSessionTransport = async (...a: any[]) => { const t = await acquire(...a); mgr.markSettledByNode(SID, 'completion'); return t; };
    expect(await mgr.closeUnsubmittedSession(1145n)).toBe('already-settled');
    expect(mgr.sessions.get(SID).status).toBe('completed');
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('C2: no ack at all: the init times out, its socket closes, the session stays active', async () => {
    FakeWebSocket.autoAckInit = false;
    const mgr = await manager();
    vi.useFakeTimers();
    try {
      const pending = mgr.closeUnsubmittedSession(1145n).catch((e: any) => e);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await pending).toBeInstanceOf(Error);
      expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED);
      expect(mgr.sessions.get(SID).status).toBe('active');
      expect(mgr.jobsInFlight.has(SID)).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('C7: a regional session with no listed host is refused before any socket', async () => {
    const mgr = await manager();
    mgr.setRegionPolicy(new RegionPolicy('uk', STORAGE_REGIONS.uk.hosts));
    await expect(mgr.closeUnsubmittedSession(1145n)).rejects.toMatchObject({ code: 'REGION_HOST_NOT_ALLOWED' });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(mgr.sessions.get(SID).status).toBe('active');
  });

  it('C8: public: on the class and advertised as a capability', () => {
    expect(typeof (SessionManager.prototype as any).closeUnsubmittedSession).toBe('function');
    expect(SDK_CAPABILITIES.closeUnsubmittedSession).toBe(true);
  });
});
