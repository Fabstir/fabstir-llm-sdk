import type { Host, HostFilter, HostDetails, DiscoveryClientOptions } from '../types/discovery';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export default class HttpDiscoveryClient {
  private readonly discoveryUrl: string;
  private readonly cacheTTL: number;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private cache = new Map<string, CacheEntry<any>>();

  constructor(discoveryUrl: string, options?: DiscoveryClientOptions) {
    this.discoveryUrl = discoveryUrl;
    this.cacheTTL = options?.cacheTTL || 60000;
    this.maxRetries = options?.maxRetries || 3;
    this.timeout = options?.timeout || 5000;
  }

  async discoverHosts(filter?: HostFilter): Promise<Host[]> {
    const cacheKey = 'hosts-' + JSON.stringify(filter || {});
    
    if (!filter?.forceRefresh) {
      const cached = this.getCache<{ hosts: Host[] }>(cacheKey);
      if (cached?.hosts) return filter ? this.applyFilters(cached.hosts, filter) : cached.hosts;
    }

    try {
      const response = await this.fetchWithRetry(`${this.discoveryUrl}/api/hosts`);
      if (!response.ok) {
        const cached = this.cache.get(cacheKey);
        return cached?.data?.hosts || [];
      }
      const data = await response.json();
      const hosts = data.hosts || [];
      this.setCache(cacheKey, { hosts });
      return filter ? this.applyFilters(hosts, filter) : hosts;
    } catch {
      const cached = this.cache.get(cacheKey);
      return cached?.data?.hosts || [];
    }
  }

  async getHostDetails(hostId: string): Promise<HostDetails> {
    const cacheKey = `details-${hostId}`;
    const cached = this.getCache<HostDetails>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.fetchWithRetry(`${this.discoveryUrl}/api/hosts/${hostId}`);
      if (!response.ok) throw new Error(`Failed to get host details: ${response.statusText}`);
      const details = await response.json();
      this.setCache(cacheKey, details);
      return details;
    } catch (error) {
      throw new Error(`Failed to get host details: ${(error as Error).message}`);
    }
  }

  async pingHost(url: string): Promise<number> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(
        url.replace('wss://', 'https://').replace('ws://', 'http://') + '/ping',
        { method: 'GET', signal: controller.signal }
      );
      clearTimeout(timeoutId);
      return response.ok ? Math.round(performance.now() - start) : -1;
    } catch {
      return -1;
    }
  }

  async reportHost(hostId: string, issue: string): Promise<void> {
    try {
      await fetch(`${this.discoveryUrl}/api/hosts/${hostId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue })
      });
    } catch (error) {
      console.error('Failed to report host:', error);
    }
  }

  private applyFilters(hosts: Host[], filter: HostFilter): Host[] {
    let filtered = [...hosts];
    
    if (filter.model) {
      filtered = filtered.filter(h => h.models?.includes(filter.model!));
    }
    if (filter.maxPrice !== undefined) {
      filtered = filtered.filter(h => (h.pricePerToken || 0) <= filter.maxPrice!);
    }
    if (filter.region) {
      filtered = filtered.filter(h => h.region === filter.region);
    }
    if (filter.sortBy === 'latency') {
      filtered.sort((a, b) => (a.latency || 999999) - (b.latency || 999999));
    } else if (filter.sortBy === 'price') {
      filtered.sort((a, b) => (a.pricePerToken || 999999) - (b.pricePerToken || 999999));
    }
    
    return filtered;
  }

  private async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', ...options?.headers }
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        }
      }
    }
    throw lastError || new Error('Failed after retries');
  }

  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }
}