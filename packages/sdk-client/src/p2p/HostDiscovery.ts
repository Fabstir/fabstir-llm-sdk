// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { Host, HostFilter, HostDetails } from './types';

export class HostDiscovery {
  private url: string;
  private cache: { hosts: Host[], timestamp: number } | null = null;
  private cacheTTL = 60000; // 60 seconds

  constructor(discoveryUrl: string) { this.url = discoveryUrl; }

  async discoverHosts(filter?: HostFilter, forceRefresh = false): Promise<Host[]> {
    if (!forceRefresh && this.cache && Date.now() - this.cache.timestamp < this.cacheTTL) {
      return this.applyFilter(this.cache.hosts, filter);
    }
    try {
      const res = await fetch(`${this.url}/hosts`);
      const data = await res.json();
      this.cache = { hosts: data.hosts, timestamp: Date.now() };
      return this.applyFilter(data.hosts, filter);
    } catch { return []; }
  }

  async getHostInfo(hostId: string): Promise<HostDetails> {
    const res = await fetch(`${this.url}/hosts/${hostId}`);
    return res.json();
  }

  async pingHost(url: string): Promise<number> {
    const start = Date.now();
    try {
      await fetch(`${url}/ping`);
      const latency = Date.now() - start;
      return latency || 1; // Ensure minimum 1ms for successful pings
    } catch { return -1; }
  }

  private applyFilter(hosts: Host[], filter?: HostFilter): Host[] {
    if (!filter) return hosts;
    return hosts.filter(h => {
      if (filter.model && !h.models.includes(filter.model)) return false;
      if (filter.maxPrice && BigInt(h.pricePerToken) > BigInt(filter.maxPrice)) return false;
      if (filter.minAvailability !== undefined && !h.available) return false;
      return true;
    });
  }
}