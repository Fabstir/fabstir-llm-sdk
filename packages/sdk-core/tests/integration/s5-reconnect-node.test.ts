// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * S5 reconnect in Node, end to end (1.39.30, IMPLEMENTATION-S5-RECONNECT.md §3 "Integration"): the real
 * StorageManager on the real s5js P2P (beta.56), against a local WebSocket server that speaks the S5 handshake and
 * then closes the socket or goes away. No document, no window, no external network.
 *
 * Only what needs a portal is stubbed: identity recovery, portal registration, and the `fs` (a recording `put` that
 * notes whether s5js had a connected peer when it ran).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { createRequire } from 'node:module';

// The Node build of ws (vitest would otherwise resolve its browser stub).
const { WebSocketServer } = createRequire(import.meta.url)('ws');

const live = vi.hoisted(() => ({ s5: undefined as any, puts: [] as Array<{ path: string; connected: boolean }> }));

vi.mock('@julesl23/s5js', async (importOriginal) => {
  const real: any = await importOriginal();
  return {
    ...real,
    S5: {
      create: async (opts: any) => {
        const s5 = await real.S5.create(opts);
        s5.recoverIdentityFromSeedPhrase = async () => {};
        s5.registerOnNewPortal = async () => {};
        Object.defineProperty(s5, 'fs', {
          configurable: true,
          value: {
            ensureIdentityInitialized: async () => {},
            put: async (path: string) => { live.puts.push({ path, connected: s5.node.p2p.isConnectedToNetwork }); },
          },
        });
        live.s5 = s5;
        return s5;
      },
    },
  };
});

import { StorageManager } from '../../src/managers/StorageManager';

/** A minimal S5 peer: answers the client's HandshakeOpen with a signed HandshakeDone (s5js `node/p2p.js`). */
class FakeS5Peer {
  private server?: any;
  private readonly key = generateKeyPairSync('ed25519');
  private readonly pub = Buffer.from(this.key.publicKey.export({ format: 'jwk' }).x!, 'base64url');
  handshakes = 0;
  constructor(readonly port: number) {}

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = new WebSocketServer({ host: '127.0.0.1', port: this.port }, () => resolve());
      this.server.on('connection', (socket: any) => socket.on('message', (raw: Buffer) => this.onMessage(socket, raw)));
    });
  }

  private onMessage(socket: any, data: Buffer): void {
    if (data[0] !== 1 || data[1] !== 0xc4 || data[2] !== 64) return; // [1, bin8(64) challenge]
    const challenge = data.subarray(3, 67);
    const message = Buffer.concat([Buffer.from([2, 0xc4, 64]), challenge, Buffer.from([3, 0])]);
    const signature = edSign(null, message, this.key.privateKey);
    const bin8 = (b: Buffer) => Buffer.concat([Buffer.from([0xc4, b.length]), b]);
    socket.send(Buffer.concat([Buffer.from([10]), bin8(Buffer.concat([Buffer.from([0xed]), this.pub])), bin8(signature), bin8(message)]));
    this.handshakes++;
  }

  /** The server stays up; every client socket is closed (a portal's web front reloading). */
  closeSockets(): void {
    for (const c of this.server!.clients) c.terminate();
  }

  /** The server goes away: sockets closed, port no longer listening. */
  stop(): Promise<void> {
    this.closeSockets();
    return new Promise((resolve) => this.server!.close(() => resolve()));
  }
}

const until = async (check: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('condition not reached');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('S5 reconnect in Node, real s5js P2P (1.39.30)', () => {
  const peer = new FakeS5Peer(47391);
  let sm: StorageManager;
  let lines: string[];

  beforeAll(() => peer.start());
  afterAll(() => peer.stop().catch(() => {}));

  beforeEach(async () => {
    expect(typeof (globalThis as any).document).toBe('undefined');
    expect(typeof (globalThis as any).window).toBe('undefined');
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((l: unknown) => { lines.push(String(l)); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    live.puts = [];
    sm = new StorageManager(`ws://127.0.0.1:${peer.port}`);
    await sm.initialize('test-seed', '0x1234');
    expect(sm.getConnectionStatus()).toBe('connected');
  }, 30_000);

  afterEach(() => {
    sm.dispose();
    vi.restoreAllMocks();
  });

  it('the server closes the socket: the manager is connected again without a restart', async () => {
    const before = peer.handshakes;
    peer.closeSockets();
    await until(() => sm.getConnectionStatus() === 'disconnected', 5000);
    await until(() => sm.getConnectionStatus() === 'connected', 5000);
    expect(peer.handshakes).toBe(before + 1);
    expect(lines.filter((l) => l.includes(' S5 '))).toEqual([
      '[StorageManager] S5 connection lost; reconnecting',
      expect.stringMatching(/^\[StorageManager\] S5 reconnected after 1 attempt, \ds$/),
    ]);
  }, 20_000);

  it('a storage call made while disconnected waits for the reconnect, then reaches a connected S5', async () => {
    peer.closeSockets();
    await until(() => sm.getConnectionStatus() === 'disconnected', 5000);
    await sm.getS5Client().fs.put('home/after-drop', 1);
    expect(live.puts).toEqual([{ path: 'home/after-drop', connected: true }]);
  }, 20_000);

  it('portal down then back: the call in the outage fails STORAGE_OFFLINE without reaching S5; the loop heals; a call after succeeds', async () => {
    await peer.stop();
    await until(() => sm.getConnectionStatus() === 'disconnected', 5000);
    const during = await sm.getS5Client().fs.put('home/during', 1).catch((e: any) => e);
    expect(during.code).toBe('STORAGE_OFFLINE');
    expect(live.puts).toEqual([]);
    await peer.start();
    await until(() => sm.getConnectionStatus() === 'connected', 40_000);   // the loop's next attempt, no call needed
    await sm.getS5Client().fs.put('home/after', 1);
    expect(live.puts).toEqual([{ path: 'home/after', connected: true }]);
  }, 60_000);

});
