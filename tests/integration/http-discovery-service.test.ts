// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import HttpDiscoveryClient from '../../src/discovery/HttpDiscoveryClient';
import type { Host, HostFilter, HostDetails } from '../../src/types/discovery';

// Mock fetch for HTTP requests
global.fetch = vi.fn();

describe('HTTP Discovery Service Integration', () => {
  let discoveryClient: HttpDiscoveryClient;
  const mockDiscoveryUrl = 'https://discovery.fabstir.net';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    // Create fresh client for each test to avoid cache pollution
    discoveryClient = new HttpDiscoveryClient(mockDiscoveryUrl);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  describe('Discovery Service Queries', () => {
    it('should query discovery service for available hosts', async () => {
      const mockHosts: Host[] = [
        { 
          id: 'host-1', 
          url: 'wss://host1.fabstir.net', 
          models: ['llama-70b'], 
          pricePerToken: 0.001,
          latency: 50 
        },
        { 
          id: 'host-2', 
          url: 'wss://host2.fabstir.net', 
          models: ['gpt-4'], 
          pricePerToken: 0.002,
          latency: 100 
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const hosts = await discoveryClient.discoverHosts();

      expect(hosts).toHaveLength(2);
      expect(hosts[0].id).toBe('host-1');
      expect(fetch).toHaveBeenCalledWith(
        `${mockDiscoveryUrl}/api/hosts`,
        expect.any(Object)
      );
    });

    it('should filter hosts by model capability', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', models: ['llama-70b'], url: 'wss://host1.test' },
        { id: 'host-2', models: ['gpt-4'], url: 'wss://host2.test' },
        { id: 'host-3', models: ['llama-70b', 'gpt-4'], url: 'wss://host3.test' }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const filter: HostFilter = { model: 'llama-70b' };
      const hosts = await discoveryClient.discoverHosts(filter);

      expect(hosts).toHaveLength(2);
      expect(hosts.every(h => h.models?.includes('llama-70b'))).toBe(true);
    });

    it('should filter hosts by maximum price', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', pricePerToken: 0.001, url: 'wss://host1.test' },
        { id: 'host-2', pricePerToken: 0.005, url: 'wss://host2.test' },
        { id: 'host-3', pricePerToken: 0.002, url: 'wss://host3.test' }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const filter: HostFilter = { maxPrice: 0.002 };
      const hosts = await discoveryClient.discoverHosts(filter);

      expect(hosts).toHaveLength(2);
      expect(hosts.every(h => (h.pricePerToken || 0) <= 0.002)).toBe(true);
    });

    it('should filter hosts by region', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', region: 'us-east', url: 'wss://host1.test' },
        { id: 'host-2', region: 'eu-west', url: 'wss://host2.test' },
        { id: 'host-3', region: 'us-east', url: 'wss://host3.test' }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const filter: HostFilter = { region: 'us-east' };
      const hosts = await discoveryClient.discoverHosts(filter);

      expect(hosts).toHaveLength(2);
      expect(hosts.every(h => h.region === 'us-east')).toBe(true);
    });
  });

  describe('Host Details and Latency', () => {
    it('should get detailed information about a specific host', async () => {
      const mockDetails: HostDetails = {
        id: 'host-1',
        url: 'wss://host1.fabstir.net',
        models: ['llama-70b', 'gpt-4'],
        pricePerToken: 0.001,
        region: 'us-east',
        uptime: 99.9,
        totalRequests: 10000,
        averageResponseTime: 150,
        capabilities: ['streaming', 'batch', 'embedding']
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetails
      });

      const details = await discoveryClient.getHostDetails('host-1');

      expect(details.id).toBe('host-1');
      expect(details.uptime).toBe(99.9);
      expect(details.capabilities).toContain('streaming');
      expect(fetch).toHaveBeenCalledWith(
        `${mockDiscoveryUrl}/api/hosts/host-1`,
        expect.any(Object)
      );
    });

    it('should measure latency to a host', async () => {
      const mockLatency = 75;
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1075);

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pong: true })
      });

      const latency = await discoveryClient.pingHost('wss://host1.fabstir.net');

      expect(latency).toBe(75);
    });

    it('should sort hosts by latency', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', latency: 100, url: 'wss://host1.test' },
        { id: 'host-2', latency: 50, url: 'wss://host2.test' },
        { id: 'host-3', latency: 150, url: 'wss://host3.test' }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const filter: HostFilter = { sortBy: 'latency' };
      const hosts = await discoveryClient.discoverHosts(filter);

      expect(hosts[0].id).toBe('host-2');
      expect(hosts[1].id).toBe('host-1');
      expect(hosts[2].id).toBe('host-3');
    });

    it('should handle latency measurement timeout', async () => {
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const latency = await discoveryClient.pingHost('wss://slow-host.test');

      expect(latency).toBe(-1); // Timeout indicator
    });
  });

  describe('Caching and Performance', () => {
    it('should cache discovery results', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', url: 'wss://host1.test' }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      await discoveryClient.discoverHosts();
      await discoveryClient.discoverHosts();

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL expiration', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', url: 'wss://host1.test' }
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      const client = new HttpDiscoveryClient(mockDiscoveryUrl, { cacheTTL: 100 });
      
      await client.discoverHosts();
      await new Promise(resolve => setTimeout(resolve, 150));
      await client.discoverHosts();

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should force refresh cache when requested', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', url: 'wss://host1.test' }
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ hosts: mockHosts })
      });

      await discoveryClient.discoverHosts();
      await discoveryClient.discoverHosts({ forceRefresh: true });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should cache host details separately', async () => {
      const mockDetails: HostDetails = {
        id: 'host-1',
        url: 'wss://host1.test',
        models: ['gpt-4']
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetails
      });

      await discoveryClient.getHostDetails('host-1');
      await discoveryClient.getHostDetails('host-1');

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling and Fallback', () => {
    it('should handle discovery service failure gracefully', async () => {
      // Create a fresh client to ensure no cached data
      const freshClient = new HttpDiscoveryClient(mockDiscoveryUrl);
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      const hosts = await freshClient.discoverHosts();

      expect(hosts).toEqual([]);
    });

    it('should retry failed requests with exponential backoff', async () => {
      let attempts = 0;
      (global.fetch as any).mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ hosts: [{ id: 'host-1' }] })
        });
      });

      const hosts = await discoveryClient.discoverHosts();

      expect(hosts).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should fall back to cached data on service failure', async () => {
      const mockHosts: Host[] = [
        { id: 'host-1', url: 'wss://host1.test' }
      ];

      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ hosts: mockHosts })
        })
        .mockRejectedValueOnce(new Error('Service unavailable'));

      await discoveryClient.discoverHosts();
      const hosts = await discoveryClient.discoverHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe('host-1');
    });

    it('should handle malformed responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' })
      });

      const hosts = await discoveryClient.discoverHosts();

      expect(hosts).toEqual([]);
    });

    it('should handle HTTP error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      const hosts = await discoveryClient.discoverHosts();

      expect(hosts).toEqual([]);
    });
  });

  describe('Host Reporting', () => {
    it('should report problematic hosts to discovery service', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reported: true })
      });

      await discoveryClient.reportHost('host-1', 'Connection timeout');

      expect(fetch).toHaveBeenCalledWith(
        `${mockDiscoveryUrl}/api/hosts/host-1/report`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ issue: 'Connection timeout' })
        })
      );
    });

    it('should handle report submission failures', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        discoveryClient.reportHost('host-1', 'Issue')
      ).resolves.toBeUndefined();
    });

    it('should batch multiple host reports efficiently', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ reported: true })
      });

      await Promise.all([
        discoveryClient.reportHost('host-1', 'Slow response'),
        discoveryClient.reportHost('host-2', 'Connection error'),
        discoveryClient.reportHost('host-3', 'Invalid response')
      ]);

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/report'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});