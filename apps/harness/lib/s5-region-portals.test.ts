// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The registration backend's region choice (sdk-core 1.39.27): each region's portal and token stay server-side;
 * no `region` = Global (as before); a region with no token configured is refused, never sent to another portal.
 */

import { describe, test, expect } from 'vitest';
import { regionPortal, regionEcho } from './s5-region-portals';

const env = { S5_MASTER_TOKEN: 'global-token', S5_UK_MASTER_TOKEN: 'uk-token' };

describe('regionPortal', () => {
  test('no region, or global: the Global portal and S5_MASTER_TOKEN (unchanged)', () => {
    expect(regionPortal(undefined, env)).toEqual({ ok: true, portalUrl: 'https://s5.platformlessai.ai', token: 'global-token' });
    expect(regionPortal('global', env)).toEqual({ ok: true, portalUrl: 'https://s5.platformlessai.ai', token: 'global-token' });
  });
  test('uk: the UK portal and S5_UK_MASTER_TOKEN', () => {
    expect(regionPortal('uk', env)).toEqual({ ok: true, portalUrl: 'https://s5-uk.platformlessai.ai', token: 'uk-token' });
  });
  test('a region with no token, an unbuilt region or an unknown one is refused (400), never another portal', () => {
    expect(regionPortal('uk', { S5_MASTER_TOKEN: 'global-token' })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('uk') });
    expect(regionPortal('eu', env)).toMatchObject({ ok: false, status: 400 });
    expect(regionPortal('mars', env)).toMatchObject({ ok: false, status: 400 });
    expect(regionPortal(42, env)).toMatchObject({ ok: false, status: 400 });
  });
  test('no Global token: a server configuration error (500), as before', () => {
    expect(regionPortal(undefined, {})).toMatchObject({ ok: false, status: 500 });
  });
});

describe('regionEcho (sdk-core 1.39.28)', () => {
  test('a regional request gets its region back in the reply; Global replies are unchanged', () => {
    expect(regionEcho('uk')).toEqual({ region: 'uk' });
    expect(regionEcho(undefined)).toEqual({});
  });
});
