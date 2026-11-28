// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The registration routes echo the region (sdk-core 1.39.28): a regional request's successful replies carry the same
 * `region`; Global replies are unchanged. The portal is stubbed; the routes themselves run.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import register from '../pages/api/s5/register';
import registerComplete from '../pages/api/s5/register-complete';

function call(handler: any, body: any): Promise<{ status: number; json: any }> {
  return new Promise((resolve) => {
    const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(j: any) { resolve({ status: this.statusCode, json: j }); return this; } };
    handler({ method: 'POST', body }, res);
  });
}

let portalUrls: string[];
beforeEach(() => {
  portalUrls = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('S5_MASTER_TOKEN', 'global-token');
  vi.stubEnv('S5_UK_MASTER_TOKEN', 'uk-token');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    portalUrls.push(url);
    return url.includes('?pubKey=')
      ? new Response(JSON.stringify({ challenge: 'CH' }), { status: 200 })
      : new Response(JSON.stringify({ authToken: 'AT' }), { status: 200 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const done = { pubKey: 'PK', response: 'R', signature: 'S' };

describe('the registration routes', () => {
  test('uk: both replies echo region "uk", from the UK portal', async () => {
    expect(await call(register, { pubKey: 'PK', region: 'uk' })).toEqual({ status: 200, json: { challenge: 'CH', region: 'uk' } });
    expect(await call(registerComplete, { ...done, region: 'uk' })).toEqual({ status: 200, json: { authToken: 'AT', region: 'uk' } });
    expect(portalUrls.every((u) => u.startsWith('https://s5-uk.platformlessai.ai/'))).toBe(true);
  });
  test('Global (no region): both replies are unchanged, from the Global portal', async () => {
    expect(await call(register, { pubKey: 'PK' })).toEqual({ status: 200, json: { challenge: 'CH' } });
    expect(await call(registerComplete, done)).toEqual({ status: 200, json: { authToken: 'AT' } });
    expect(portalUrls.every((u) => u.startsWith('https://s5.platformlessai.ai/'))).toBe(true);
  });
  test('a region with no token: refused (400), no portal contacted, no echo', async () => {
    vi.stubEnv('S5_UK_MASTER_TOKEN', '');
    const r = await call(register, { pubKey: 'PK', region: 'uk' });
    expect(r.status).toBe(400);
    expect(r.json.region).toBeUndefined();
    expect(portalUrls).toEqual([]);
  });
});
