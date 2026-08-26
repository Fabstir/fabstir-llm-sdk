// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Session key lifetime is bound to connection identity.
 *
 * A key minted on connection A is meaningless on connection B: the node
 * registered it against A and has no session for B. When the connection
 * identity changes the key must be dropped and in-flight encrypted work
 * rejected, rather than left to fail as aead::Error or hang to the 480 s
 * first-response timeout.
 *
 * See docs/platformless-ui/SDK-BUG-SESSION-KEY-MISMATCH-AFTER-INIT.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';

/** SessionManager is large; these tests exercise the invalidation logic alone. */
function createManager(): any {
  const mgr: any = new SessionManager({} as any, {} as any);
  mgr.sessionKey = new Uint8Array(32).fill(7);
  mgr.messageIndex = 4;
  mgr.wsSessionId = '1133';
  mgr.sessionKeyGeneration = 1;
  return mgr;
}

describe('session key invalidation on connection change', () => {
  let mgr: any;

  beforeEach(() => {
    mgr = createManager();
  });

  it('drops the key when the connection identity changes', () => {
    mgr.handleConnectionChange(2);

    expect(mgr.sessionKey).toBeUndefined();
    expect(mgr.messageIndex).toBe(0);
    expect(mgr.sessionKeyGeneration).toBeUndefined();
  });

  it('preserves session ownership of the client - identity changed, not the session', () => {
    mgr.handleConnectionChange(2);

    expect(mgr.wsSessionId).toBe('1133');
  });

  it('keeps the key when the generation is unchanged', () => {
    mgr.handleConnectionChange(1);

    expect(mgr.sessionKey).toBeDefined();
    expect(mgr.messageIndex).toBe(4);
  });

  it('rejects in-flight encrypted work with a distinguishable code', async () => {
    const rejected: any[] = [];
    const pending = new Promise((_resolve, reject) => {
      mgr.registerEncryptedWaiter(reject);
    }).catch((err) => {
      rejected.push(err);
    });

    mgr.handleConnectionChange(2);
    await pending;

    expect(rejected).toHaveLength(1);
    expect(rejected[0].code).toBe('SESSION_KEY_INVALIDATED');
  });

  it('marks the invalidation error retryable so the caller can resend', async () => {
    let captured: any;
    const pending = new Promise((_r, reject) => {
      mgr.registerEncryptedWaiter(reject);
    }).catch((err) => { captured = err; });

    mgr.handleConnectionChange(2);
    await pending;

    expect(captured.retryable).toBe(true);
    expect(captured.message).toMatch(/connection/i);
  });

  it('does not reject in-flight work when the generation is unchanged', async () => {
    let settled = false;
    new Promise((_r, reject) => {
      mgr.registerEncryptedWaiter(reject);
    }).catch(() => { settled = true; });

    mgr.handleConnectionChange(1);
    await Promise.resolve();

    expect(settled).toBe(false);
  });

  it('clears waiters after rejecting so a later change does not double-reject', async () => {
    const reject = vi.fn();
    mgr.registerEncryptedWaiter(reject);

    mgr.handleConnectionChange(2);
    mgr.sessionKeyGeneration = 2;
    mgr.handleConnectionChange(3);

    expect(reject).toHaveBeenCalledTimes(1);
  });

  it('unregisters a waiter that completed normally', () => {
    const reject = vi.fn();
    const done = mgr.registerEncryptedWaiter(reject);
    done();

    mgr.handleConnectionChange(2);

    expect(reject).not.toHaveBeenCalled();
  });

  it('treats a session with no key as nothing to invalidate', () => {
    mgr.sessionKey = undefined;
    mgr.sessionKeyGeneration = undefined;

    expect(() => mgr.handleConnectionChange(2)).not.toThrow();
  });
});

describe('re-init decision after invalidation', () => {
  it('reports that a re-init is needed when the generation moved', () => {
    const mgr = createManager();
    mgr.wsClient = { isConnected: () => true, getConnectionGeneration: () => 2 };

    expect(mgr.needsSessionInit()).toBe(true);
  });

  it('reports no re-init needed while the connection holds', () => {
    const mgr = createManager();
    mgr.wsClient = { isConnected: () => true, getConnectionGeneration: () => 1 };

    expect(mgr.needsSessionInit()).toBe(false);
  });

  it('reports a re-init is needed when there is no client at all', () => {
    const mgr = createManager();
    mgr.wsClient = undefined;

    expect(mgr.needsSessionInit()).toBe(true);
  });

  it('reports a re-init is needed when the socket is closed', () => {
    const mgr = createManager();
    mgr.wsClient = { isConnected: () => false, getConnectionGeneration: () => 1 };

    expect(mgr.needsSessionInit()).toBe(true);
  });
});
