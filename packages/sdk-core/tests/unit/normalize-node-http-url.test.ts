// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * normalizeNodeHttpUrl — the Q8 rule in one place, shared by the LTX and training existingSession
 * paths. Its contract: return the http(s) BASE the WS derivation in acquireSessionTransport can
 * convert (`base + '/v1/ws'`), or undefined for anything that would silently mistarget.
 */
import { describe, it, expect } from 'vitest';
import { normalizeNodeHttpUrl } from '../../src/utils/validation';

describe('normalizeNodeHttpUrl', () => {
  it.each([
    ['https://host2.fabstir.net', 'https://host2.fabstir.net'],
    ['https://host2.fabstir.net/', 'https://host2.fabstir.net'],
    ['HTTPS://host2.fabstir.net//', 'https://host2.fabstir.net'],
    ['http://10.0.0.7:8080', 'http://10.0.0.7:8080'],
    ['https://host/base', 'https://host/base'],           // a reverse-proxy base path: WS becomes /base/v1/ws, auth /base/v1/session-auth
  ])('normalises %s → %s', (input, expected) => {
    expect(normalizeNodeHttpUrl(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'wss://host2.fabstir.net/v1/ws',                 // not http(s)
    'ws://host',
    'https://proxy.example/?u=ws://host',            // ws:// substring anywhere — the derivation treats it as already-WS
    'https://proxy.example/?u=wss://host',           // the wss:// clause is the only guard for this shape
    'https://n.example/?token=abc',                  // a query: '/v1/ws' would be appended AFTER it → socket at the root
    'https://n.example#f',                           // a fragment, same failure
    'ftp://host',
  ])('refuses %s', (input) => {
    expect(normalizeNodeHttpUrl(input as string | undefined)).toBeUndefined();
  });

  it('refuses a non-string without throwing (a JS caller passing a URL object)', () => {
    expect(normalizeNodeHttpUrl(new URL('https://host2.fabstir.net') as unknown as string)).toBeUndefined();
  });
});
