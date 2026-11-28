// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Which S5 portal and registration token a registration call uses (sdk-core 1.39.27). The SDK sends `region` in both
 * calls of a regional session and nothing for Global. Each region's token stays here, server-side; a region with no
 * token is refused, never registered on another region's portal.
 *
 * The portal URLs mirror sdk-core's STORAGE_REGIONS table; the tokens come from the environment.
 */

const PORTALS: Record<string, { portalUrl: string; tokenEnv: string }> = {
  global: { portalUrl: 'https://s5.platformlessai.ai', tokenEnv: 'S5_MASTER_TOKEN' },
  uk: { portalUrl: 'https://s5-uk.platformlessai.ai', tokenEnv: 'S5_UK_MASTER_TOKEN' },
};

export type RegionPortal =
  | { ok: true; portalUrl: string; token: string }
  | { ok: false; status: 400 | 500; error: string };

export function regionPortal(region: unknown, env: Record<string, string | undefined> = process.env): RegionPortal {
  const key = region === undefined ? 'global' : region;
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(PORTALS, key)) {
    return { ok: false, status: 400, error: `Unknown or unavailable storage region: ${String(region)}` };
  }
  const { portalUrl, tokenEnv } = PORTALS[key];
  const token = env[tokenEnv];
  if (!token) {
    // Global without its token is this server's misconfiguration (as before); a region without one is not offered here.
    return key === 'global'
      ? { ok: false, status: 500, error: 'Server configuration error' }
      : { ok: false, status: 400, error: `No registration token for storage region '${key}' on this server` };
  }
  return { ok: true, portalUrl, token };
}

/** What a reply adds so the SDK knows this server used the region it asked for (sdk-core 1.39.28): the request's region,
 *  once accepted by regionPortal; nothing for Global, whose replies are unchanged. */
export function regionEcho(region: unknown): { region?: string } {
  return typeof region === 'string' ? { region } : {};
}
