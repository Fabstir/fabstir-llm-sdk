// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * 1.39.32: the UK host list holds host2, the owner's choice, verified on-chain (NodeRegistry: active, apiUrl =
 * TEST_HOST_2_URL). The address and URL come from .env.test, the one source of truth; nothing is written here.
 */
import { describe, test, expect } from 'vitest';
import { STORAGE_REGIONS } from '../../src/config/storage-regions';
import { RegionPolicy } from '../../src/utils/region-policy';

const HOST2 = process.env.TEST_HOST_2_ADDRESS!;
const HOST2_URL = process.env.TEST_HOST_2_URL!;
const OTHER = process.env.TEST_HOST_1_ADDRESS!;

describe('UK host list (1.39.32)', () => {
  test('.env.test names host2 and its URL', () => {
    expect(HOST2).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(HOST2_URL).toMatch(/^https:\/\//);
    expect(OTHER.toLowerCase()).not.toBe(HOST2.toLowerCase());
  });

  test('exactly host2, at its own https origin; still frozen', () => {
    expect(STORAGE_REGIONS.uk.hosts).toEqual([{ address: HOST2, apiOrigin: new URL(HOST2_URL).origin }]);
    expect(Object.isFrozen(STORAGE_REGIONS.uk.hosts)).toBe(true);
    expect(Object.isFrozen(STORAGE_REGIONS.uk.hosts![0])).toBe(true);
    expect(STORAGE_REGIONS.global.hosts).toBeNull();
  });

  const uk = new RegionPolicy('uk');

  test('UK jobs are no longer all refused', () => {
    expect(() => uk.assertOpen('chat')).not.toThrow();
  });

  test('host2 at its URL is allowed, in any letter case of the address, with a path', () => {
    expect(uk.allows({ address: HOST2, endpoint: HOST2_URL })).toBe(true);
    expect(uk.allows({ address: HOST2.toLowerCase(), endpoint: `${HOST2_URL}/v1/ws` })).toBe(true);
    expect(uk.allows({ endpoint: `${HOST2_URL}/v1/embed` })).toBe(true);   // a URL-only path, at the listed origin
  });

  test('refused: another host, host2 at another origin or scheme, or another host at host2\'s URL', () => {
    const refused = (t: { address?: string; endpoint?: string }) =>
      expect(() => uk.assertHost({ ...t, job: 'chat' })).toThrow(expect.objectContaining({ code: 'REGION_HOST_NOT_ALLOWED' }));
    refused({ address: OTHER });
    refused({ address: HOST2, endpoint: HOST2_URL.replace('https://', 'http://') });
    refused({ address: HOST2, endpoint: `${HOST2_URL}:8443` });
    refused({ address: HOST2, endpoint: 'https://example.invalid' });
    refused({ address: OTHER, endpoint: HOST2_URL });
    refused({ endpoint: 'https://example.invalid/v1/embed' });
  });

  test('host discovery keeps only host2 at its own URL', () => {
    const candidates = [
      { address: HOST2, apiUrl: HOST2_URL },
      { address: OTHER, apiUrl: HOST2_URL },
      { address: HOST2, apiUrl: 'https://example.invalid' },
    ];
    expect(uk.filter(candidates)).toEqual([candidates[0]]);
  });
});
