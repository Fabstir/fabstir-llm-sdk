// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Connection identity vs transport liveness
 *
 * A silent reconnect gives a live socket the SDK has never inited, so a session
 * key minted on the previous connection is used against a connection the node
 * registered no key for — every frame after fails with aead::Error.
 *
 * See docs/platformless-ui/SDK-BUG-SESSION-KEY-MISMATCH-AFTER-INIT.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';

/** Minimal controllable WebSocket double. */
class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (e: any) => void;
  onerror?: (e: any) => void;
  onclose?: (e: any) => void;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1006, reason: 'idle' });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

describe('WebSocketClient connection generation', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    (globalThis as any).WebSocket = FakeWebSocket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function connectClient(opts: any = {}) {
    const client = new WebSocketClient('ws://node.example/v1/ws', opts);
    const p = client.connect();
    FakeWebSocket.instances[0].open();
    await p;
    return client;
  }

  it('starts at generation 1 after the first connect', async () => {
    const client = await connectClient();
    expect(client.getConnectionGeneration()).toBe(1);
  });

  it('increments the generation when the socket silently reconnects', async () => {
    const client = await connectClient({ reconnectInterval: 10 });

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(10);

    expect(client.getConnectionGeneration()).toBe(2);
  });

  it('reports connected on the replacement socket - liveness cannot see the swap', async () => {
    const client = await connectClient({ reconnectInterval: 10 });

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(10);

    // This is the trap the bug report identified: still "connected".
    expect(client.isConnected()).toBe(true);
    // ...but a different connection, which the generation exposes.
    expect(client.getConnectionGeneration()).not.toBe(1);
  });

  it('notifies subscribers when the connection identity changes', async () => {
    const client = await connectClient({ reconnectInterval: 10 });
    const seen: number[] = [];
    client.onConnectionChange((generation: number) => seen.push(generation));

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(10);

    expect(seen).toContain(2);
  });

  it('unsubscribes cleanly', async () => {
    const client = await connectClient({ reconnectInterval: 10 });
    const seen: number[] = [];
    const off = client.onConnectionChange((g: number) => seen.push(g));
    off();

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(10);

    expect(seen).toHaveLength(0);
  });

  it('discards queued frames across a connection boundary rather than replaying them', async () => {
    const client = await connectClient({ reconnectInterval: 10 });

    // A frame queued while the socket is down carries the old connection's key.
    FakeWebSocket.instances[0].drop();
    const sendPromise = client
      .sendWithoutResponse({ type: 'encrypted_message', payload: { ciphertextHex: 'deadbeef' } } as any)
      .catch(() => { /* the send itself may fail; the queue is what matters */ });

    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(1200);
    await sendPromise;

    // Replay onto the new connection would be a *wrong* request, not a failed one.
    const replayed = FakeWebSocket.instances[1].sent.filter((s) => s.includes('deadbeef'));
    expect(replayed.length).toBeLessThanOrEqual(1);
    expect((client as any).messageQueue).toHaveLength(0);
  });

  it('discards queued plaintext frames too - the rule has no encryption exception', async () => {
    const client = await connectClient({ reconnectInterval: 10 });

    (client as any).messageQueue.push({ type: 'session_init', marker: 'plaintext-frame' });

    FakeWebSocket.instances[0].drop();
    await vi.advanceTimersByTimeAsync(50);
    FakeWebSocket.instances[1]?.open();
    await vi.advanceTimersByTimeAsync(10);

    const replayed = FakeWebSocket.instances[1].sent.filter((s) => s.includes('plaintext-frame'));
    expect(replayed).toHaveLength(0);
    expect((client as any).messageQueue).toHaveLength(0);
  });
});
