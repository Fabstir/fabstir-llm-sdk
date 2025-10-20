// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostDiscovery } from '../../packages/sdk-client/src/p2p/HostDiscovery';
import type { Host, HostFilter } from '../../packages/sdk-client/src/p2p/types';

// Mock fetch for Node.js environment
global.fetch = vi.fn();

describe('HostDiscovery', () => {
  let discovery: HostDiscovery;
  
  beforeEach(() => {
    discovery = new HostDiscovery('http://localhost:3000');
    vi.clearAllMocks();
  });

  it('discovers available hosts', async () => {
    const mockHosts: Host[] = [
      {
        id: 'host1',
        address: '0x123...',
        url: 'ws://host1.com',
        models: ['gpt-3.5', 'gpt-4'],
        pricePerToken: '1000000000',
        available: true
      }
    ];
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hosts: mockHosts })
    });
    
    const hosts = await discovery.discoverHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe('host1');
  });

  it('gets detailed host information', async () => {
    const mockDetails = {
      id: 'host1',
      address: '0x123...',
      url: 'ws://host1.com',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true,
      latency: 50,
      reputation: 95,
      totalJobs: 1000
    };
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDetails
    });
    
    const details = await discovery.getHostInfo('host1');
    expect(details.reputation).toBe(95);
    expect(details.totalJobs).toBe(1000);
  });

  it('pings host and returns latency', async () => {
    // Mock successful ping
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ timestamp: Date.now() })
    });
    
    const latency = await discovery.pingHost('http://host1.com');
    expect(latency).toBeGreaterThan(0);
    expect(latency).toBeLessThan(5000); // Under 5 seconds
  });

  it('filters hosts by requirements', async () => {
    const mockHosts: Host[] = [
      {
        id: 'host1',
        address: '0x123...',
        url: 'ws://host1.com',
        models: ['gpt-4'],
        pricePerToken: '2000000000',
        available: true
      },
      {
        id: 'host2',
        address: '0x456...',
        url: 'ws://host2.com',
        models: ['gpt-3.5'],
        pricePerToken: '1000000000',
        available: true
      }
    ];
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hosts: mockHosts })
    });
    
    const filter: HostFilter = {
      model: 'gpt-3.5',
      maxPrice: '1500000000'
    };
    
    const hosts = await discovery.discoverHosts(filter);
    expect(hosts).toHaveLength(1);
    expect(hosts[0].id).toBe('host2');
  });

  it('handles unreachable hosts', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
    
    const latency = await discovery.pingHost('http://unreachable.com');
    expect(latency).toBe(-1); // Indicates unreachable
  });

  it('caches discovery results', async () => {
    const mockHosts = [{ id: 'host1', available: true }];
    
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ hosts: mockHosts })
    });
    
    // First call
    await discovery.discoverHosts();
    
    // Second call should use cache
    const cached = await discovery.discoverHosts();
    
    // Fetch should only be called once
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cached[0].id).toBe('host1');
  });

  it('refreshes stale cache', async () => {
    const mockHosts1 = [{ id: 'host1', available: true }];
    const mockHosts2 = [{ id: 'host2', available: true }];
    
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts1 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hosts: mockHosts2 })
      });
    
    // First discovery
    await discovery.discoverHosts();
    
    // Force cache refresh
    await discovery.discoverHosts(undefined, true);
    
    // Should have called fetch twice
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});