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
});
