// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Per-session crypto state
 *
 * The node keeps one key PER session; the SDK kept one key TOTAL, in shared
 * fields overwritten by every init on any path. The moment two sessions
 * interleave on one manager, frames for one session are decrypted (and prompts
 * encrypted) with the other's key — aead::Error immediately after a clean init,
 * no reconnect, node correctly reporting one key and no re-init per session.
 *
 * Also on the wire but ignored until now: session_init_ack and encrypted_chunk
 * both carry session_id (node API.md:2059, :2087). Acks and frames must be
 * correlated, not matched by type alone.
 *
 * See docs/platformless-ui/SDK-BUG-SESSION-KEY-MISMATCH-AFTER-INIT.md (and the
 * retraction chain ending in SDK-BUG-SHARED-SESSION-CRYPTO-STATE.md).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';

/** Short stand-in for a key fingerprint: first 4 bytes joined. */
const fpOf = (key: Uint8Array) => Array.from(key.slice(0, 4)).join('.');

/** Fake transport: records sends, lets tests script or auto-emit acks. */
class FakeWs {
  handlers = new Set<(d: any) => void>();
  sent: any[] = [];
  events: string[] = [];
  autoAck = true;
  ackDelayMs = 0;

  onMessage(h: (d: any) => void) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
  emit(d: any) {
    if (d.type === 'session_init_ack') this.events.push(`ack:${d.session_id}`);
    [...this.handlers].forEach((h) => h(d));
  }
  async sendWithoutResponse(m: any) {
    this.sent.push(m);
    if (m.type === 'encrypted_session_init') {
      this.events.push(`send:${m.session_id}`);
      if (this.autoAck) {
        const sid = m.session_id;
        setTimeout(() => this.emit({ type: 'session_init_ack', session_id: sid, status: 'success' }), this.ackDelayMs);
      }
    }
  }
  isConnected() { return true; }
  getConnectionGeneration() { return 1; }
  onConnectionChange() { return () => {}; }
  async disconnect() {}
}

/**
 * Fake AEAD: decryption authenticates iff the caller's key matches the key the
 * "node" encrypted under, exactly as XChaCha20-Poly1305 would fail otherwise.
 */
function createEncryptionManager() {
  return {
    getRecoveryPublicKey: () => '0x02' + 'ab'.repeat(32),
    encryptSessionInit: vi.fn(async (_hostPub: string, payload: any) => ({
      type: 'encrypted_session_init',
      payload: { __initFor: payload.sessionKey },
    })),
    encryptMessage: vi.fn((key: Uint8Array, _msg: string, idx: number) => ({
      ciphertextHex: 'ct', nonceHex: 'nn', aadHex: 'aa',
      __encKeyFp: fpOf(key), __idx: idx,
    })),
    decryptMessage: vi.fn((key: Uint8Array, payload: any) => {
      if (payload.__encKeyFp !== fpOf(key)) {
        throw new Error('Decryption failed (authentication error): aead::Error');
      }
      return payload.__plain ?? 'plain';
    }),
  };
}

function createManager(ws: FakeWs) {
  const mgr: any = new SessionManager({} as any, {} as any);
  mgr.encryptionManager = createEncryptionManager();
  mgr.hostManager = { getHostPublicKey: vi.fn(async () => '02' + 'cd'.repeat(32)) };
  mgr.wsClient = ws;
  return mgr;
}

const CONFIG = {
  chainId: 84532,
  host: '0x' + '11'.repeat(20),
  modelId: 'tiny-vicuna',
  endpoint: 'http://host.example:8080',
  paymentMethod: 'deposit',
  encryption: true,
} as any;

/** Run an init and return the key hex the "node" registered for it. */
async function initSession(mgr: any, ws: FakeWs, sessionId: bigint): Promise<string> {
  await mgr.sendEncryptedInit(ws, CONFIG, sessionId, 7n);
  const call = mgr.encryptionManager.encryptSessionInit.mock.calls.at(-1);
  return call[1].sessionKey; // hex the node-side session now holds
}

const keyFromHex = (hex: string) => {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

describe('per-session key scoping', () => {
  let ws: FakeWs;
  let mgr: any;

  beforeEach(() => {
    ws = new FakeWs();
    mgr = createManager(ws);
  });

  it("decrypts a session's frames with that session's key even after another init overwrote the shared field", async () => {
    const keyA = await initSession(mgr, ws, 1133n);
    await initSession(mgr, ws, 2001n); // RAG/image/any concurrent flow — clobbers legacy field

    const frameForA = {
      type: 'encrypted_chunk',
      session_id: '1133',
      payload: { __encKeyFp: fpOf(keyFromHex(keyA)), __plain: 'hello from 1133' },
    };

    // Today this throws aead::Error: the legacy shared key now belongs to 2001.
    await expect(mgr.decryptIncomingMessage(frameForA)).resolves.toBe('hello from 1133');
  });

  it('encrypts an outgoing prompt with the key of the session stamped on the frame', async () => {
    await initSession(mgr, ws, 1133n);
    const keyB = await initSession(mgr, ws, 2001n);

    // The active chat is 1133; the legacy shared key is 2001's.
    mgr.sessions = new Map([['1133', { sessionId: 1133n, status: 'active', model: 'tiny-vicuna' }]]);

    await mgr.sendEncryptedMessage('hi');

    const frame = ws.sent.find((m) => m.type === 'encrypted_message');
    expect(frame.session_id).toBe('1133');
    // The key used must be 1133's — not 2001's, which is what the shared field holds.
    expect(frame.payload.__encKeyFp).not.toBe(fpOf(keyFromHex(keyB)));
  });

  it('keeps a per-session outgoing message index for replay protection', async () => {
    const keyA = await initSession(mgr, ws, 1133n);
    mgr.sessions = new Map([['1133', { sessionId: 1133n, status: 'active', model: 'tiny-vicuna' }]]);
    await mgr.sendEncryptedMessage('first');   // index 0

    await initSession(mgr, ws, 2001n);         // resets the LEGACY index to 0

    await mgr.sendEncryptedMessage('second');  // must be 1133's index 1, not the reset 0

    const frames = ws.sent.filter((m) => m.type === 'encrypted_message');
    expect(frames[0].payload.__idx).toBe(0);
    expect(frames[1].payload.__idx).toBe(1);
    void keyA;
  });

  it('clears per-session keys when the connection identity changes', async () => {
    const keyA = await initSession(mgr, ws, 1133n);
    mgr.handleConnectionChange(2);

    const frameForA = {
      type: 'encrypted_chunk',
      session_id: '1133',
      payload: { __encKeyFp: fpOf(keyFromHex(keyA)), __plain: 'stale' },
    };
    // The key died with the connection it was registered on.
    await expect(mgr.decryptIncomingMessage(frameForA)).rejects.toThrow();
  });
});

describe('init ack correlation', () => {
  let ws: FakeWs;
  let mgr: any;

  beforeEach(() => {
    ws = new FakeWs();
    ws.autoAck = false;
    mgr = createManager(ws);
  });

  it("ignores another session's ack and resolves on its own", async () => {
    let settled = false;
    const init = mgr.sendEncryptedInit(ws, CONFIG, 1133n, 7n).then(() => { settled = true; });

    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    ws.emit({ type: 'session_init_ack', session_id: '2001', status: 'success' });
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false); // foreign ack must not complete this init

    ws.emit({ type: 'session_init_ack', session_id: '1133', status: 'success' });
    await init;
    expect(settled).toBe(true);
  });

  it('still resolves on an ack that carries no session_id', async () => {
    const init = mgr.sendEncryptedInit(ws, CONFIG, 1133n, 7n);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    ws.emit({ type: 'session_init_ack', status: 'success' });
    await expect(init).resolves.toBeUndefined();
  });
});

describe('init serialization', () => {
  it('never interleaves two init handshakes on one manager', async () => {
    const ws = new FakeWs();
    ws.ackDelayMs = 10;
    const mgr = createManager(ws);

    await Promise.all([
      mgr.sendEncryptedInit(ws, CONFIG, 1133n, 7n),
      mgr.sendEncryptedInit(ws, CONFIG, 2001n, 7n),
    ]);

    // Interleaved today: send:1133, send:2001, ack:1133, ack:2001.
    expect(ws.events).toEqual(['send:1133', 'ack:1133', 'send:2001', 'ack:2001']);
  });
});

describe('frame-session correlation', () => {
  const ws = new FakeWs();
  const mgr: any = createManager(ws);

  it('rejects a frame stamped for a different session', () => {
    expect(mgr.frameTargetsSession({ type: 'encrypted_chunk', session_id: '2001' }, '1133')).toBe(false);
  });

  it('accepts a frame stamped for this session', () => {
    expect(mgr.frameTargetsSession({ type: 'encrypted_chunk', session_id: '1133' }, '1133')).toBe(true);
  });

  it('accepts a frame that carries no session_id (e.g. stream_end)', () => {
    expect(mgr.frameTargetsSession({ type: 'stream_end', reason: 'complete' }, '1133')).toBe(true);
  });

  it('tolerates bigint/string representation differences', () => {
    expect(mgr.frameTargetsSession({ type: 'encrypted_chunk', session_id: 1133 }, '1133')).toBe(true);
  });
});

describe('wire recording', () => {
  it('logs the same key fingerprint at mint and at successful decrypt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ws = new FakeWs();
    const mgr = createManager(ws);

    const keyA = await initSession(mgr, ws, 1133n);
    await mgr.decryptIncomingMessage({
      type: 'encrypted_chunk',
      session_id: '1133',
      payload: { __encKeyFp: fpOf(keyFromHex(keyA)), __plain: 'x' },
    });

    const wire = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[SDK:wire]'));
    const mint = wire.find((l) => l.includes('mint') && l.includes('1133'));
    const dec = wire.find((l) => l.includes('decrypt') && l.includes('1133'));
    expect(mint).toBeDefined();
    expect(dec).toBeDefined();

    const fp = /fp=([0-9a-f]{8})/;
    expect(mint!.match(fp)![1]).toBe(dec!.match(fp)![1]);
    warn.mockRestore();
  });
});
