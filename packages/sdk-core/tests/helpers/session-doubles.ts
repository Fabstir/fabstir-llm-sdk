// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Test doubles for the SessionManager transport seam. One home, so the ack protocol that
 * `sendEncryptedInit` waits on is encoded once. (session-crypto-scoping.test.ts,
 * ws-connection-generation.test.ts and serve-back.test.ts still carry inline copies —
 * migration follow-up, recorded in EXECUTION-TRAINING-EXISTING-SESSION.md.)
 */
import { vi } from 'vitest';

/** A WebSocketClient-shaped double: records sends, auto-acks `encrypted_session_init`.
 *  ⚠️ The ack rides a REAL setTimeout — under full `vi.useFakeTimers()` advance the clock or the
 *  30 s ack wait in sendEncryptedInit never fires. */
export class FakeWs {
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

/** The EncryptionManager surface `sendEncryptedInit` touches; captures the init payload. */
export function makeFakeEncryptionManager(opts: { clientAddress?: string } = {}) {
  return {
    getRecoveryPublicKey: () => '0x02' + 'ab'.repeat(32),
    encryptSessionInit: vi.fn(async (_hostPub: string, payload: any) => ({
      type: 'encrypted_session_init', payload: { __init: payload },
    })),
    getWsClientAddress: () => opts.clientAddress ?? `0x${'ab'.repeat(20)}`,
    encryptMessage: vi.fn(() => ({ ciphertextHex: 'ct', nonceHex: 'nn', aadHex: 'aa' })),
    decryptMessage: vi.fn(() => 'plain'),
  };
}

/** The host-pubkey lookup `sendEncryptedInit` makes (compressed, `02`-prefixed). */
export const fakeHostManager = () => ({ getHostPublicKey: vi.fn(async () => '02' + 'cd'.repeat(32)) });

/**
 * A global `WebSocket` double for WebSocketClient. Opens on the next tick by default (transport
 * tests); set `FakeWebSocket.autoOpen = false` to drive `open()` / `drop()` by hand (reconnect tests).
 */
export class FakeWebSocket {
  static OPEN = 1; static CLOSED = 3; static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];
  static urls: string[] = [];
  static autoOpen = true;
  /** Reply to an `encrypted_session_init` frame with a `session_init_ack` on the next tick, so the
   *  REAL sendEncryptedInit can complete over this socket (end-to-end chat-path tests). */
  static autoAckInit = false;
  static reset() { this.instances = []; this.urls = []; this.autoOpen = true; this.autoAckInit = false; }

  readyState = 0;
  sent: string[] = [];
  onopen?: () => void; onmessage?: (e: any) => void; onerror?: (e: any) => void; onclose?: (e: any) => void;
  private listeners: Record<string, Array<(e: any) => void>> = {};
  /** WebSocketClient.disconnect() waits for a 'close' EVENT via addEventListener — support both styles. */
  addEventListener(type: string, fn: (e: any) => void) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type: string, fn: (e: any) => void) { this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn); }

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
    FakeWebSocket.urls.push(url);
    if (FakeWebSocket.autoOpen) setTimeout(() => this.open(), 0);
  }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  drop() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({ code: 1006, reason: 'idle' }); }
  send(data: string) {
    this.sent.push(data);
    if (!FakeWebSocket.autoAckInit) return;
    try {
      const frame = JSON.parse(data);
      if (frame.type === 'encrypted_session_init') {
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'session_init_ack', session_id: frame.session_id, status: 'success' }) }), 0);
      }
    } catch { /* not JSON — nothing to ack */ }
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    const e = { code: 1000, reason: 'Client disconnect' };
    this.onclose?.(e);
    (this.listeners['close'] ?? []).forEach((fn) => fn(e));
  }
}
