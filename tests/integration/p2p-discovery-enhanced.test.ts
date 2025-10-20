// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import DiscoveryManager from '../../src/managers/DiscoveryManager';
import type { Node, PeerInfo, DiscoveryStrategy, DiscoveryOptions } from '../../src/types/discovery';

// Mock libp2p components
vi.mock('@libp2p/mdns', () => ({
  mdns: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn()
  }))
}));

vi.mock('@libp2p/kad-dht', () => ({
  kadDHT: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    findProviders: vi.fn(),
    provide: vi.fn(),
    get: vi.fn(),
    put: vi.fn()
  }))
}));

vi.mock('@libp2p/bootstrap', () => ({
  bootstrap: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn()
  }))
}));

describe('P2P Discovery Enhancement', () => {
  let discoveryManager: DiscoveryManager;
  let mockP2PClient: any;
  let mockAuthManager: any;

  beforeEach(() => {
    // Create mock P2P client
    mockP2PClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      dial: vi.fn().mockResolvedValue({ id: 'peer-123' }),
      hangUp: vi.fn().mockResolvedValue(undefined),
      getPeers: vi.fn().mockReturnValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      broadcast: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue({ success: true }),
      peerId: { toString: () => 'self-peer-id' }
    };

    // Create mock auth manager
    mockAuthManager = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      getAddress: vi.fn().mockReturnValue('0x123'),
      getSigner: vi.fn().mockReturnValue({ signMessage: vi.fn() })
    };

    discoveryManager = new DiscoveryManager(mockP2PClient, mockAuthManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('mDNS Local Discovery', () => {
    it('should discover nodes on local network via mDNS', async () => {
      const mockLocalNodes = [
        { peerId: 'local-1', address: '192.168.1.100', capabilities: ['llama-70b'] },
        { peerId: 'local-2', address: '192.168.1.101', capabilities: ['gpt-4'] }
      ];
      
      mockP2PClient.discoverLocal = vi.fn().mockResolvedValue(mockLocalNodes);
      
      const nodes = await discoveryManager.discoverLocalNodes();
      
      expect(nodes).toHaveLength(2);
      expect(nodes[0].peerId).toBe('local-1');
      expect(mockP2PClient.discoverLocal).toHaveBeenCalled();
    });

    it('should handle mDNS discovery timeout gracefully', async () => {
      mockP2PClient.discoverLocal = vi.fn().mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve([]), 5000))
      );
      
      const nodes = await discoveryManager.discoverLocalNodes({ timeout: 1000 });
      
      expect(nodes).toEqual([]);
    });

    it('should filter local nodes by capability', async () => {
      const mockLocalNodes = [
        { peerId: 'local-1', capabilities: ['llama-70b', 'embedding'] },
        { peerId: 'local-2', capabilities: ['gpt-4'] },
        { peerId: 'local-3', capabilities: ['llama-70b'] }
      ];
      
      mockP2PClient.discoverLocal = vi.fn().mockResolvedValue(mockLocalNodes);
      
      const nodes = await discoveryManager.discoverLocalNodes({ 
        capabilities: ['llama-70b'] 
      });
      
      expect(nodes).toHaveLength(2);
      expect(nodes.every(n => n.capabilities.includes('llama-70b'))).toBe(true);
    });

    it('should cache local discovery results', async () => {
      const mockNodes = [{ peerId: 'local-1', capabilities: ['gpt-4'] }];
      mockP2PClient.discoverLocal = vi.fn().mockResolvedValue(mockNodes);
      
      await discoveryManager.discoverLocalNodes();
      await discoveryManager.discoverLocalNodes();
      
      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after TTL expires', async () => {
      const mockNodes = [{ peerId: 'local-1' }];
      mockP2PClient.discoverLocal = vi.fn().mockResolvedValue(mockNodes);
      
      await discoveryManager.discoverLocalNodes({ cacheTTL: 100 });
      await new Promise(resolve => setTimeout(resolve, 150));
      await discoveryManager.discoverLocalNodes({ cacheTTL: 100 });
      
      expect(mockP2PClient.discoverLocal).toHaveBeenCalledTimes(2);
    });
  });

  describe('DHT Global Discovery', () => {
    it('should discover nodes globally via Kademlia DHT', async () => {
      const mockGlobalNodes = [
        { peerId: 'global-1', address: '/ip4/1.2.3.4/tcp/4001', capabilities: ['llama-70b'] },
        { peerId: 'global-2', address: '/ip4/5.6.7.8/tcp/4001', capabilities: ['gpt-4'] }
      ];
      
      mockP2PClient.discoverGlobal = vi.fn().mockResolvedValue(mockGlobalNodes);
      
      const nodes = await discoveryManager.discoverGlobalNodes();
      
      expect(nodes).toHaveLength(2);
      expect(nodes[0].peerId).toBe('global-1');
      expect(mockP2PClient.discoverGlobal).toHaveBeenCalled();
    });

    it('should query DHT for specific content hash', async () => {
      const contentHash = 'QmNodeCapabilities123';
      mockP2PClient.findProviders = vi.fn().mockResolvedValue([
        { peerId: 'provider-1' },
        { peerId: 'provider-2' }
      ]);
      
      const nodes = await discoveryManager.findProviders(contentHash);
      
      expect(nodes).toHaveLength(2);
      expect(mockP2PClient.findProviders).toHaveBeenCalledWith(contentHash);
    });

    it('should handle DHT query failures', async () => {
      mockP2PClient.discoverGlobal = vi.fn().mockRejectedValue(new Error('DHT error'));
      mockP2PClient.getBootstrapPeers = vi.fn().mockResolvedValue([]); // No bootstrap nodes
      
      await expect(discoveryManager.discoverGlobalNodes()).rejects.toThrow('DHT error');
    });

    it('should limit global discovery results', async () => {
      const manyNodes = Array.from({ length: 50 }, (_, i) => ({
        peerId: `global-${i}`,
        capabilities: ['gpt-4']
      }));
      
      mockP2PClient.discoverGlobal = vi.fn().mockResolvedValue(manyNodes);
      
      const nodes = await discoveryManager.discoverGlobalNodes({ maxNodes: 10 });
      
      expect(nodes).toHaveLength(10);
    });

    it('should merge local and global discovery results', async () => {
      mockP2PClient.discoverLocal = vi.fn().mockResolvedValue([
        { peerId: 'local-1', capabilities: ['gpt-4'] }
      ]);
      mockP2PClient.discoverGlobal = vi.fn().mockResolvedValue([
        { peerId: 'global-1', capabilities: ['llama-70b'] }
      ]);
      
      const nodes = await discoveryManager.discoverHybrid();
      
      expect(nodes).toHaveLength(2);
      expect(nodes.some(n => n.peerId === 'local-1')).toBe(true);
      expect(nodes.some(n => n.peerId === 'global-1')).toBe(true);
    });
  });

  describe('Bootstrap Node Connection', () => {
    it('should connect to bootstrap nodes on startup', async () => {
      const bootstrapNodes = [
        '/ip4/bootstrap1.fabstir.net/tcp/4001/p2p/QmBootstrap1',
        '/ip4/bootstrap2.fabstir.net/tcp/4001/p2p/QmBootstrap2'
      ];
      
      await discoveryManager.connectBootstrapNodes(bootstrapNodes);
      
      expect(mockP2PClient.dial).toHaveBeenCalledTimes(2);
      expect(mockP2PClient.dial).toHaveBeenCalledWith(bootstrapNodes[0]);
    });

    it('should fallback to bootstrap nodes when DHT fails', async () => {
      mockP2PClient.discoverGlobal = vi.fn().mockRejectedValue(new Error('DHT failed'));
      mockP2PClient.getBootstrapPeers = vi.fn().mockResolvedValue([
        { peerId: 'bootstrap-1', capabilities: ['gpt-4'] }
      ]);
      
      const nodes = await discoveryManager.discoverGlobalNodes();
      
      expect(nodes).toHaveLength(1);
      expect(nodes[0].peerId).toBe('bootstrap-1');
    });

    it('should retry failed bootstrap connections', async () => {
      let attempts = 0;
      mockP2PClient.dial = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) throw new Error('Connection failed');
        return Promise.resolve({ id: 'bootstrap-peer' });
      });
      
      await discoveryManager.connectBootstrapNodes(['/ip4/1.2.3.4/tcp/4001']);
      
      expect(mockP2PClient.dial).toHaveBeenCalledTimes(3);
    });

    it('should maintain minimum bootstrap connections', async () => {
      mockP2PClient.getBootstrapConnections = vi.fn().mockReturnValue(1);
      
      await discoveryManager.maintainBootstrapConnections(3);
      
      expect(mockP2PClient.dial).toHaveBeenCalledTimes(2);
    });
  });

  describe('Peer Capability Announcement', () => {
    it('should announce node capabilities to network', async () => {
      const capabilities = ['llama-70b', 'embedding', 'code-generation'];
      
      await discoveryManager.announceCapabilities(capabilities);
      
      expect(mockP2PClient.broadcast).toHaveBeenCalledWith({
        type: 'capability_announcement',
        capabilities
      });
    });

    it('should publish capabilities to DHT', async () => {
      const capabilities = ['gpt-4', 'vision'];
      mockP2PClient.publishToDHT = vi.fn().mockResolvedValue(true);
      
      await discoveryManager.announceCapabilities(capabilities);
      
      expect(mockP2PClient.publishToDHT).toHaveBeenCalledWith(
        expect.stringContaining('capabilities'),
        expect.objectContaining({ capabilities })
      );
    });

    it('should search for nodes by specific capability', async () => {
      mockP2PClient.searchByCapability = vi.fn().mockResolvedValue([
        { peerId: 'node-1', capabilities: ['llama-70b', 'embedding'] },
        { peerId: 'node-2', capabilities: ['llama-70b'] }
      ]);
      
      const nodes = await discoveryManager.searchByCapability('llama-70b');
      
      expect(nodes).toHaveLength(2);
      expect(nodes.every(n => n.capabilities.includes('llama-70b'))).toBe(true);
    });

    it('should update peer capabilities on announcement receipt', async () => {
      const announcement = {
        peerId: 'peer-123',
        capabilities: ['new-model', 'updated-capability']
      };
      
      await discoveryManager.handleCapabilityAnnouncement(announcement);
      
      const peer = await discoveryManager.getPeerInfo('peer-123');
      expect(peer.capabilities).toEqual(announcement.capabilities);
    });
  });

  describe('Network Topology and Peer Management', () => {
    it('should map network topology', async () => {
      mockP2PClient.getPeers = vi.fn().mockReturnValue([
        { peerId: 'peer-1', connections: ['peer-2', 'peer-3'] },
        { peerId: 'peer-2', connections: ['peer-1', 'peer-3'] },
        { peerId: 'peer-3', connections: ['peer-1', 'peer-2'] }
      ]);
      
      const topology = await discoveryManager.getNetworkTopology();
      
      expect(topology.nodes).toHaveLength(3);
      expect(topology.edges).toHaveLength(3);
    });

    it('should track peer reputation scores', async () => {
      await discoveryManager.updatePeerReputation('peer-1', { 
        successfulRequests: 10,
        failedRequests: 1
      });
      
      const reputation = await discoveryManager.getPeerReputation('peer-1');
      
      expect(reputation.score).toBeGreaterThan(0.9);
    });

    it('should maintain connection quality metrics', async () => {
      await discoveryManager.recordConnectionMetrics('peer-1', {
        latency: 50,
        bandwidth: 1000000,
        packetLoss: 0.01
      });
      
      const metrics = await discoveryManager.getConnectionMetrics('peer-1');
      
      expect(metrics.averageLatency).toBe(50);
      expect(metrics.quality).toBe('excellent');
    });

    it('should blacklist problematic peers', async () => {
      await discoveryManager.blacklistPeer('bad-peer', 'Excessive failures');
      
      const nodes = await discoveryManager.discoverLocalNodes();
      
      expect(nodes.every(n => n.peerId !== 'bad-peer')).toBe(true);
    });

    it('should maintain preferred peer list', async () => {
      await discoveryManager.addPreferredPeer('good-peer', { priority: 1 });
      
      const nodes = await discoveryManager.getPreferredPeers();
      
      expect(nodes[0].peerId).toBe('good-peer');
    });

    it('should auto-remove blacklisted peers after timeout', async () => {
      await discoveryManager.blacklistPeer('temp-bad-peer', 'Temporary issue', 100);
      
      let blacklisted = await discoveryManager.isBlacklisted('temp-bad-peer');
      expect(blacklisted).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      blacklisted = await discoveryManager.isBlacklisted('temp-bad-peer');
      expect(blacklisted).toBe(false);
    });

    it('should prioritize peers by combined score', async () => {
      await discoveryManager.updatePeerReputation('peer-1', { score: 0.9 });
      await discoveryManager.updatePeerReputation('peer-2', { score: 0.7 });
      await discoveryManager.recordConnectionMetrics('peer-1', { latency: 100 });
      await discoveryManager.recordConnectionMetrics('peer-2', { latency: 50 });
      
      const ranked = await discoveryManager.getRankedPeers();
      
      expect(ranked[0].peerId).toBe('peer-1'); // Better reputation wins over latency
    });
  });
});