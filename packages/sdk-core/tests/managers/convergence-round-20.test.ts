// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 20 — plan §33 NN1: a superseded bridge attempt never opens a socket, nor asks the proof service.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import { realSdk } from '../helpers/sdk-instance';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A WebSocket double that opens after `FakeSocket.openAfterMs`; `close()` only records. */
class FakeSocket {
  static all: FakeSocket[] = [];
  static openAfterMs = 0;
  onopen?: () => void; onerror?: (e: unknown) => void; onclose?: () => void; onmessage?: (e: unknown) => void;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => this.onopen?.(), FakeSocket.openAfterMs);
  }
  close() { this.closed = true; }
  send() {}
}

function bridge(url = 'http://bridge.invalid') {
  const b = new UnifiedBridgeClient({ bridgeUrl: url } as any);
  const proof = { connect: vi.fn(async () => {}), isAvailable: () => true };
  Object.assign(b as any, { checkHealth: async () => ({ healthy: true }), proofClient: proof, startHealthMonitoring: vi.fn() });
  return { b, proof };
}

beforeEach(() => {
  FakeSocket.all = [];
  FakeSocket.openAfterMs = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NN1 — a superseded attempt checks before each step', () => {
  test('a sign-out during the health check: the attempt never asks for a socket — BRIDGE_CLOSED', async () => {
    const { b } = bridge();
    let healthy!: () => void;
    (b as any).checkHealth = () => new Promise((r) => { healthy = () => r({ healthy: true }); });
    const connecting = b.connect().catch((e: unknown) => e);
    await tick();
    await b.disconnect();
    healthy();
    expect(await connecting).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' }, retryable: false } });
    expect(FakeSocket.all).toHaveLength(0);
  });

  test('through the SDK: connectToBridge(), then a sign-out during its health check — no socket after the sign-out', async () => {
    const s = realSdk({ authenticated: true });
    const { b } = bridge(s.config.bridgeConfig.url);
    let healthy!: () => void;
    (b as any).checkHealth = () => new Promise((r) => { healthy = () => r({ healthy: true }); });
    s.bridgeClient = b;
    const connecting = s.connectToBridge().catch((e: unknown) => e);
    await tick();
    await s.disconnect();
    healthy();
    expect(await connecting).toMatchObject({ details: { cause: { code: 'BRIDGE_CLOSED' } } });
    expect(FakeSocket.all).toHaveLength(0);
  });

  test('a socket that opens after the sign-out (it was already asked for): the proof service is never asked', async () => {
    FakeSocket.openAfterMs = 30;
    const { b, proof } = bridge();
    const connecting = b.connect().catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 10));                      // the socket is asked for, still opening
    await b.disconnect();
    await new Promise((r) => setTimeout(r, 60));                      // a (non-conforming) late open
    expect(await connecting).toMatchObject({ details: { cause: { code: 'BRIDGE_CLOSED' } } });
    expect(proof.connect).not.toHaveBeenCalled();
  });
});
