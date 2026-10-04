// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * A host that is down during the init's public-key fetch must be classifiable as TRANSPORT by the
 * training path — which needs a `code` on the error. A bare Error lands in "our wiring" (terminal,
 * never retried) for what is a transient host outage on a paid session.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestHostPublicKey } from '../../src/managers/HostKeyRecovery';

afterEach(() => { vi.unstubAllGlobals(); });

describe('requestHostPublicKey error codes', () => {
  it('a non-2xx challenge response carries code HOST_PUBKEY_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' })));
    await expect(requestHostPublicKey('https://host2.fabstir.net', `0x${'20'.repeat(20)}`))
      .rejects.toMatchObject({ code: 'HOST_PUBKEY_UNAVAILABLE', message: expect.stringMatching(/503/) });
  });

  it('a malformed challenge response carries the same code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    await expect(requestHostPublicKey('https://host2.fabstir.net', `0x${'20'.repeat(20)}`))
      .rejects.toMatchObject({ code: 'HOST_PUBKEY_UNAVAILABLE' });
  });

  it('a host that is DOWN — fetch itself rejects (ECONNREFUSED / ENOTFOUND) — carries the code and the cause', async () => {
    // Round 4: the fetch sat outside any try/catch, so undici's uncoded `TypeError: fetch failed` reached
    // the training classifier as "our wiring" — terminal, requiresFreshSession true — for a host outage.
    const down = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    vi.stubGlobal('fetch', vi.fn(async () => { throw down; }));
    const e: any = await requestHostPublicKey('https://host2.fabstir.net', `0x${'20'.repeat(20)}`).catch((x) => x);
    expect(e.code).toBe('HOST_PUBKEY_UNAVAILABLE');
    expect(e.cause).toBe(down);
    expect(e.message).toMatch(/fetch failed/);
  });

  it('a 200 whose body is not JSON carries the code too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } })));
    await expect(requestHostPublicKey('https://host2.fabstir.net', `0x${'20'.repeat(20)}`))
      .rejects.toMatchObject({ code: 'HOST_PUBKEY_UNAVAILABLE', message: expect.stringMatching(/Unexpected token/) });
  });
});
