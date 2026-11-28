// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The region host gate (1.39.27, plan R10). Invariant: in a regional session no request, socket or funding step goes
 * to a host unless its address is on the region's list AND the URL is at the origin listed for it; with an empty list,
 * nothing goes to any host. One synchronous predicate for every path — those that know an address, those that know only
 * a URL, and those that know both (an address alone cannot check the URL it is reached at).
 */

import { SDKError } from '../types';
import { storageRegionEntry, type BuiltStorageRegion, type RegionHost } from '../config/storage-regions';

export type RegionHostRefusal = 'NO_HOSTS' | 'HOST_NOT_LISTED' | 'ENDPOINT_NOT_LISTED';

/** `scheme://host[:port]`, lowercase, ws → http and wss → https (one host serves its API and its socket there). */
export function hostOrigin(url: string): string | undefined {
  try {
    const u = new URL(url.trim());
    const scheme = ({ 'ws:': 'http:', 'wss:': 'https:' } as Record<string, string>)[u.protocol] ?? u.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return undefined;
    return `${scheme}//${u.host}`.toLowerCase();
  } catch {
    return undefined;
  }
}

export class RegionPolicy {
  private readonly hosts: readonly RegionHost[] | null;

  /** `hosts` defaults to the region table; an explicit list is for tests only. */
  constructor(readonly region: BuiltStorageRegion, hosts?: readonly RegionHost[] | null) {
    this.hosts = hosts !== undefined ? hosts : storageRegionEntry(region).hosts;
  }

  /** A region other than 'global' (web search is refused there whatever the host list says). */
  get regional(): boolean {
    return this.region !== 'global';
  }

  /** Whether hosts are restricted at all ('global': no). */
  get restricted(): boolean {
    return this.hosts !== null;
  }

  /** Refuses (`NO_HOSTS`) when the region lists no host at all — before even choosing one. */
  assertOpen(job: string): void {
    if (this.hosts !== null && this.hosts.length === 0) this.assertHost({ job });
  }

  /** The hosts of `candidates` this region allows (their own apiUrl at the listed origin when they carry one). */
  filter<T extends { address: string; apiUrl?: string }>(candidates: readonly T[], transform?: (url: string) => string): T[] {
    return candidates.filter((c) => this.allows({ address: c.address, endpoint: c.apiUrl }, transform));
  }

  /** Whether the region allows this host — `assertHost` without the refusal. */
  allows(target: { address?: string; endpoint?: string }, transform?: (url: string) => string): boolean {
    return this.refusal(target, transform) === undefined;
  }

  /**
   * Refuses (`REGION_HOST_NOT_ALLOWED`) unless the host is allowed. `address` and `endpoint` are each checked when given:
   * the address must be listed, and the endpoint's origin must be the listed origin of that address (of any listed host
   * when only a URL is known). `transform`: the SDK's endpoint transform — its output for a listed origin is accepted too.
   */
  assertHost(target: { address?: string; endpoint?: string; job: string }, transform?: (url: string) => string): void {
    const refused = this.refusal(target, transform);
    if (!refused) return;
    const { address, endpoint, job } = target;
    throw new SDKError(`storageRegion '${this.region}': ${refused.why} — no ${job} request sent`, 'REGION_HOST_NOT_ALLOWED',
      { region: this.region, reason: refused.reason, host: address, endpoint, job, retryable: false });
  }

  /** Why the host is refused, or undefined when it is allowed (unrestricted: always allowed). */
  private refusal(target: { address?: string; endpoint?: string }, transform?: (url: string) => string): { reason: RegionHostRefusal; why: string } | undefined {
    if (this.hosts === null) return undefined;
    const { address, endpoint } = target;
    if (this.hosts.length === 0) return { reason: 'NO_HOSTS', why: 'no host is listed for this region, so every job is refused' };
    if (address === undefined && endpoint === undefined) return { reason: 'HOST_NOT_LISTED', why: 'no host named' };
    const listed = address !== undefined ? this.hosts.filter((h) => h.address.toLowerCase() === String(address).toLowerCase()) : this.hosts;
    if (listed.length === 0) return { reason: 'HOST_NOT_LISTED', why: `host ${address} is not on this region's host list` };
    if (endpoint === undefined) return undefined;
    const origin = hostOrigin(endpoint);
    const allowed = listed.flatMap((h) => [hostOrigin(h.apiOrigin), transform ? hostOrigin(transform(h.apiOrigin)) : undefined]);
    if (origin && allowed.includes(origin)) return undefined;
    return { reason: 'ENDPOINT_NOT_LISTED', why: `${endpoint} is not a listed origin${address ? ` for host ${address}` : ''}` };
  }
}

/** The SDK's host-gate refusals, relayed by the job managers as their own error types with the code unchanged. */
export const HOST_GATE_CODES: ReadonlySet<string> = new Set(['CONFIDENTIAL_HOST_NOT_ALLOWED', 'REGION_HOST_NOT_ALLOWED']);

/** Web search sends prompt text to a provider outside any region: refused in a regional session (plan R12). */
export function webSearchRefusedInRegion(region: string, where: string): SDKError {
  return new SDKError(`storageRegion '${region}': web search is refused in a regional session (${where})`, 'WEB_SEARCH_REFUSED_IN_REGION',
    { region, retryable: false });
}
