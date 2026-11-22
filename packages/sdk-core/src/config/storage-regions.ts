// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage regions (1.39.27). A client who chooses a region other than 'global' has all of its storage on that region's
 * S5 portal and all of its jobs on that region's hosts, with no fallback to another region, ever. Regional portals do
 * not peer with the Global one or with each other, so a file stored in a region can only be fetched there.
 *
 * The table is SDK configuration, versioned with the release and never fetched at run time.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md (R1, R10).
 */

import { SDKError } from '../types';

export type StorageRegion = 'global' | 'uk' | 'eu';
/** The regions that exist in this release. */
export type BuiltStorageRegion = 'global' | 'uk';

/** One host trusted with a region's jobs: its address and the API origin (scheme://host[:port]) it is reached at. */
export interface RegionHost {
  readonly address: string;
  readonly apiOrigin: string;
}

export interface StorageRegionEntry {
  /** The region's S5 portal (HTTP API: registration, uploads). */
  readonly portalUrl: string;
  /** The portal's host name, as signed into the registration challenge. */
  readonly portalHost: string;
  /** The region's one S5 peer (`initialPeers`). */
  readonly peer: string;
  /** The hosts its jobs may go to. `null` = unrestricted (Global, as before); `[]` = every job refused. */
  readonly hosts: readonly RegionHost[] | null;
}

const entry = (e: StorageRegionEntry): StorageRegionEntry =>
  Object.freeze({ ...e, hosts: e.hosts === null ? null : Object.freeze(e.hosts.map((h) => Object.freeze({ ...h }))) });

export const STORAGE_REGIONS: Readonly<Record<BuiltStorageRegion, StorageRegionEntry>> = Object.freeze({
  global: entry({
    portalUrl: 'https://s5.platformlessai.ai',
    portalHost: 's5.platformlessai.ai',
    peer: 'wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p',
    hosts: null,
  }),
  uk: entry({
    portalUrl: 'https://s5-uk.platformlessai.ai',
    portalHost: 's5-uk.platformlessai.ai',
    peer: 'wss://z2DXG8VjbxzY23kt6nJuYPriFEjQKHXJSpnWGSc7SPCgwvc@s5-uk.platformlessai.ai/s5/p2p',
    hosts: [], // no UK host yet: every UK job is refused until the first one is added here
  }),
});

/** Regions that are named but not built: chosen, they are refused at construction. */
const UNBUILT: readonly string[] = ['eu'];

/** The region a configuration names: default 'global'; an unbuilt one is STORAGE_REGION_UNAVAILABLE; anything else
 *  STORAGE_REGION_INVALID. Never a fallback: a wrong value is an error, not Global. */
export function resolveStorageRegion(value: unknown): BuiltStorageRegion {
  if (value === undefined) return 'global';
  if (typeof value === 'string' && UNBUILT.includes(value)) {
    throw new SDKError(`Storage region '${value}' is not available in this release`, 'STORAGE_REGION_UNAVAILABLE', { region: value, retryable: false });
  }
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(STORAGE_REGIONS, value)) {
    throw new SDKError(`storageRegion must be one of ${Object.keys(STORAGE_REGIONS).join(', ')}; got ${String(value)}`, 'STORAGE_REGION_INVALID', { region: value, retryable: false });
  }
  return value as BuiltStorageRegion;
}

/** The table entry of a built region. */
export function storageRegionEntry(region: BuiltStorageRegion): StorageRegionEntry {
  return STORAGE_REGIONS[region];
}

/** A regional seed is never handed back or replaced by a legacy seed path (owner §0 S5): fed in again as seedPhrase it
 *  would derive a third identity, and the user's files would appear lost. */
export function regionalSeedSealed(region: string): SDKError {
  return new SDKError(`storageRegion '${region}': the S5 seed is not handed out or replaced in a regional session; supply the base seed as s5Config.seedPhrase`,
    'STORAGE_REGION_SEED_SEALED', { region, retryable: false });
}

/** The configuration refusals a sign-in can raise in a region: they reach `authenticate()`'s caller with their own code. */
export const STORAGE_REGION_REFUSALS: ReadonlySet<string> = new Set([
  'STORAGE_REGION_INVALID', 'STORAGE_REGION_UNAVAILABLE', 'STORAGE_REGION_CONFIG_REFUSED',
  'STORAGE_REGION_SEED_REQUIRED', 'STORAGE_REGION_SEED_REFUSED', 'STORAGE_REGION_SEED_SEALED',
  'STORAGE_REGION_REGISTRATION_REFUSED',   // 1.39.28: the backend's replies did not echo the region
]);
