// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import DiscoveryManager from '../../src/managers/DiscoveryManager';
import HttpDiscoveryClient from '../../src/discovery/HttpDiscoveryClient';
import type { Host, DiscoveryStats } from '../../src/types/discovery';

// Mock the HTTP discovery client
vi.mock('../../src/discovery/HttpDiscoveryClient');

describe('Unified Discovery Interface', () => {
  let discoveryManager: DiscoveryManager;
  let mockP2PClient: any;
  let mockAuthManager: any;
  let mockHttpClient: HttpDiscoveryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock P2P client
    mockP2PClient = {
      discoverLocal: vi.fn().mockResolvedValue([]),
      discoverGlobal: vi.fn().mockResolvedValue([]),
      getBootstrapPeers: vi.fn().mockResolvedValue([]),
      dial: vi.fn(),
      peerId: { toString: () => 'mock-peer-id' }
    };

    // Create mock auth manager
    mockAuthManager = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      getAddress: vi.fn().mockReturnValue('0x123')
    };

    // Create mock HTTP client
    mockHttpClient = {
      discoverHosts: vi.fn().mockResolvedValue([])
    } as any;

    (HttpDiscoveryClient as any).mockImplementation(() => mockHttpClient);

    discoveryManager = new DiscoveryManager(mockP2PClient, mockAuthManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Combining Discovery Sources', () => {
    it('should discover hosts from all enabled sources', async () => {
      const p2pLocalHosts = [
        { id: 'local-1', peerId: 'peer-1', url: 'ws://localhost:8001' }
      ];
      const p2pGlobalHosts = [
        { id: 'global-1', peerId: 'peer-2', url: 'wss://global.host:8002' }
      ];
      const httpHosts = [
        { id: 'http-1', url: 'wss://discovery.host:8003' }
      ];

      mockP2PClient.discoverLocal.mockResolvedValue(p2pLocalHosts);
      mockP2PClient.discoverGlobal.mockResolvedValue(p2pGlobalHosts);
      mockHttpClient.discoverHosts.mockResolvedValue(httpHosts);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(3);
      expect(hosts.map(h => h.id)).toContain('local-1');
      expect(hosts.map(h => h.id)).toContain('global-1');
      expect(hosts.map(h => h.id)).toContain('http-1');
    });

    it('should handle partial source failures gracefully', async () => {
      mockP2PClient.discoverLocal.mockRejectedValue(new Error('Local discovery failed'));
      mockP2PClient.discoverGlobal.mockResolvedValue([
        { id: 'global-1', peerId: 'peer-1' }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'http-1', url: 'wss://host.com' }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(2);
      expect(mockP2PClient.discoverLocal).toHaveBeenCalled();
    });

    it('should return empty array when all sources fail', async () => {
      mockP2PClient.discoverLocal.mockRejectedValue(new Error('Failed'));
      mockP2PClient.discoverGlobal.mockRejectedValue(new Error('Failed'));
      mockHttpClient.discoverHosts.mockRejectedValue(new Error('Failed'));

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toEqual([]);
    });

    it('should apply global filters to all discovered hosts', async () => {
      const allHosts = [
        { id: 'host-1', pricePerToken: 0.001, models: ['gpt-4'] },
        { id: 'host-2', pricePerToken: 0.005, models: ['llama-70b'] },
        { id: 'host-3', pricePerToken: 0.002, models: ['gpt-4'] }
      ];

      mockP2PClient.discoverLocal.mockResolvedValue([allHosts[0]]);
      mockP2PClient.discoverGlobal.mockResolvedValue([allHosts[1]]);
      mockHttpClient.discoverHosts.mockResolvedValue([allHosts[2]]);

      const hosts = await discoveryManager.discoverAllHosts({
        maxPrice: 0.003,
        model: 'gpt-4'
      });

      expect(hosts).toHaveLength(2);
      expect(hosts.every(h => h.pricePerToken! <= 0.003)).toBe(true);
      expect(hosts.every(h => h.models?.includes('gpt-4'))).toBe(true);
    });
  });

  describe('Deduplication', () => {
    it('should remove duplicate hosts by ID', async () => {
      const duplicateHost = { id: 'dup-1', url: 'wss://host.com' };
      
      mockP2PClient.discoverLocal.mockResolvedValue([duplicateHost]);
      mockP2PClient.discoverGlobal.mockResolvedValue([duplicateHost]);
      mockHttpClient.discoverHosts.mockResolvedValue([duplicateHost]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe('dup-1');
    });

    it('should merge host information from different sources', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'host-1', peerId: 'peer-1', latency: 50 }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'host-1', url: 'wss://host.com', pricePerToken: 0.001 }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].peerId).toBe('peer-1');
      expect(hosts[0].url).toBe('wss://host.com');
      expect(hosts[0].latency).toBe(50);
      expect(hosts[0].pricePerToken).toBe(0.001);
    });

    it('should prioritize newer information when merging', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'host-1', latency: 100, timestamp: Date.now() - 10000 }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'host-1', latency: 50, timestamp: Date.now() }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts[0].latency).toBe(50);
    });
  });

  describe('Priority Ordering', () => {
    it('should respect discovery source priority order', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'local-1', source: 'p2p-local' }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'http-1', source: 'http' }
      ]);

      discoveryManager.setDiscoveryPriority(['http', 'p2p-local', 'p2p-global']);
      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts[0].id).toBe('http-1');
      expect(hosts[1].id).toBe('local-1');
    });

    it('should allow dynamic priority changes', async () => {
      const localHost = { id: 'local-1', source: 'p2p-local' };
      const httpHost = { id: 'http-1', source: 'http' };
      
      mockP2PClient.discoverLocal.mockResolvedValue([localHost]);
      mockHttpClient.discoverHosts.mockResolvedValue([httpHost]);

      // First discovery with default priority (p2p-local first)
      let hosts = await discoveryManager.discoverAllHosts({ forceRefresh: true });
      const firstOrder = hosts.map(h => h.id);

      // Change priority to http first
      discoveryManager.setDiscoveryPriority(['http', 'p2p-local']);
      hosts = await discoveryManager.discoverAllHosts({ forceRefresh: true });
      const secondOrder = hosts.map(h => h.id);

      // Verify order changed
      expect(firstOrder[0]).toBe('local-1');
      expect(secondOrder[0]).toBe('http-1');
    });

    it('should handle invalid priority sources gracefully', async () => {
      discoveryManager.setDiscoveryPriority(['invalid-source', 'p2p-local']);
      
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'local-1' }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();
      
      expect(hosts).toHaveLength(1);
    });
  });

  describe('Fallback Chain', () => {
    it('should fallback to next source when primary fails', async () => {
      mockP2PClient.discoverLocal.mockRejectedValue(new Error('Failed'));
      mockP2PClient.discoverGlobal.mockResolvedValue([
        { id: 'fallback-1' }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe('fallback-1');
    });

    it('should try all sources in fallback chain', async () => {
      mockP2PClient.discoverLocal.mockRejectedValue(new Error('Failed'));
      mockP2PClient.discoverGlobal.mockRejectedValue(new Error('Failed'));
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'last-resort' }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe('last-resort');
    });

    it('should combine results from successful sources in fallback', async () => {
      mockP2PClient.discoverLocal.mockRejectedValue(new Error('Failed'));
      mockP2PClient.discoverGlobal.mockResolvedValue([
        { id: 'global-1' }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'http-1' }
      ]);

      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(2);
    });
  });

  describe('Discovery Caching', () => {
    it('should cache discovery results', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'cached-1' }
      ]);

      await discoveryManager.discoverAllHosts();
      await discoveryManager.discoverAllHosts();

      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      const localMock = vi.fn().mockResolvedValue([{ id: 'ttl-test' }]);
      const globalMock = vi.fn().mockResolvedValue([]);
      const httpMock = vi.fn().mockResolvedValue([]);
      
      const testP2PClient = {
        ...mockP2PClient,
        discoverLocal: localMock,
        discoverGlobal: globalMock
      };
      
      const testHttpClient = {
        discoverHosts: httpMock
      } as any;
      (HttpDiscoveryClient as any).mockImplementation(() => testHttpClient);

      const manager = new DiscoveryManager(testP2PClient, mockAuthManager);
      manager.setCacheTTL(100); // 100ms TTL

      await manager.discoverAllHosts();
      
      // Before TTL expires - should use cache
      await manager.discoverAllHosts();
      expect(localMock).toHaveBeenCalledTimes(1);
      
      // After TTL expires - should fetch again
      await new Promise(resolve => setTimeout(resolve, 150));
      await manager.discoverAllHosts();

      expect(localMock).toHaveBeenCalledTimes(2);
    });

    it('should allow force refresh bypassing cache', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'force-refresh' }
      ]);
      mockP2PClient.discoverGlobal.mockResolvedValue([]);
      mockHttpClient.discoverHosts.mockResolvedValue([]);

      // First call - should fetch from sources
      await discoveryManager.discoverAllHosts();
      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(1);
      
      // Second call without force - should use cache  
      await discoveryManager.discoverAllHosts();
      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(1);
      
      // Third call with force - should fetch again
      await discoveryManager.discoverAllHosts({ forceRefresh: true });
      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(2);
    });
  });

  describe('Source Management', () => {
    it('should enable/disable discovery sources', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([
        { id: 'local-1' }
      ]);
      mockHttpClient.discoverHosts.mockResolvedValue([
        { id: 'http-1' }
      ]);

      discoveryManager.enableDiscoverySource('p2p-local', false);
      const hosts = await discoveryManager.discoverAllHosts();

      expect(hosts).toHaveLength(1);
      expect(hosts[0].id).toBe('http-1');
      expect(mockP2PClient.discoverLocal).not.toHaveBeenCalled();
    });

    it('should track discovery statistics', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([{ id: 'local-1' }]);
      mockP2PClient.discoverGlobal.mockRejectedValue(new Error('Failed'));
      mockHttpClient.discoverHosts.mockResolvedValue([{ id: 'http-1' }]);

      await discoveryManager.discoverAllHosts({ forceRefresh: true });
      const stats = discoveryManager.getDiscoveryStats();

      expect(stats.sourceStats['p2p-local']).toBeDefined();
      expect(stats.sourceStats['p2p-local'].attempts).toBe(1);
      expect(stats.sourceStats['p2p-local'].successes).toBe(1);
      
      expect(stats.sourceStats['p2p-global']).toBeDefined();
      expect(stats.sourceStats['p2p-global'].failures).toBe(1);
      
      expect(stats.sourceStats['http']).toBeDefined();
      expect(stats.sourceStats['http'].successes).toBe(1);
    });

    it('should calculate average discovery time', async () => {
      mockP2PClient.discoverLocal.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([{ id: 'slow' }]), 50))
      );

      await discoveryManager.discoverAllHosts();
      const stats = discoveryManager.getDiscoveryStats();

      expect(stats.sourceStats['p2p-local'].averageTime).toBeGreaterThan(40);
    });

    it('should track cache hit rates', async () => {
      mockP2PClient.discoverLocal.mockResolvedValue([{ id: 'cached' }]);

      await discoveryManager.discoverAllHosts(); // Cache miss
      await discoveryManager.discoverAllHosts(); // Cache hit
      await discoveryManager.discoverAllHosts(); // Cache hit

      const stats = discoveryManager.getDiscoveryStats();

      expect(stats.cacheHitRate).toBeGreaterThan(0.6); // 2 hits out of 3 attempts
    });
  });
});