import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import DiscoveryManager from '../../src/managers/DiscoveryManager';
import AuthManager from '../../src/managers/AuthManager';

// Mock dynamic imports
const mockCreateLibp2p = vi.fn();
const mockTcp = vi.fn(() => 'tcp-transport');
const mockNoise = vi.fn(() => 'noise-encryption');
const mockYamux = vi.fn(() => 'yamux-muxer');

vi.doMock('libp2p', () => ({
  createLibp2p: mockCreateLibp2p
}));

vi.doMock('@libp2p/tcp', () => ({
  tcp: mockTcp
}));

vi.doMock('@chainsafe/libp2p-noise', () => ({
  noise: mockNoise
}));

vi.doMock('@chainsafe/libp2p-yamux', () => ({
  yamux: mockYamux
}));

describe('DiscoveryManager', () => {
  let discoveryManager: DiscoveryManager;
  let mockAuthManager: AuthManager;
  let mockNode: any;

  beforeEach(() => {
    // Mock AuthManager
    mockAuthManager = {
      getSigner: vi.fn(),
      getS5Seed: vi.fn(() => 'mock seed phrase'),
      getUserAddress: vi.fn(() => '0xUser123'),
      isAuthenticated: vi.fn(() => true)
    } as any;

    // Mock libp2p node
    mockNode = {
      peerId: { toString: vi.fn(() => '12D3KooWMockPeerId123') },
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      dial: vi.fn().mockResolvedValue(undefined),
      getConnections: vi.fn(() => []),
      handle: vi.fn(),
      unhandle: vi.fn(),
      services: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    // Setup mock to return node
    mockCreateLibp2p.mockResolvedValue(mockNode);

    discoveryManager = new DiscoveryManager(mockAuthManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Node Management', () => {
    it('should create and start a P2P node', async () => {
      const peerId = await discoveryManager.createNode();

      expect(peerId).toBe('12D3KooWMockPeerId123');
      expect(mockNode.start).toHaveBeenCalled();
      expect(discoveryManager.isRunning()).toBe(true);
    });

    it('should create node with custom options', async () => {
      await discoveryManager.createNode({
        listen: ['/ip4/0.0.0.0/tcp/4002'],
        bootstrap: ['/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWBootstrap']
      });

      expect(mockCreateLibp2p).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: { listen: ['/ip4/0.0.0.0/tcp/4002'] }
        })
      );
    });

    it('should use default options when none provided', async () => {
      await discoveryManager.createNode();

      expect(mockCreateLibp2p).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] }
        })
      );
    });

    it('should stop the P2P node', async () => {
      await discoveryManager.createNode();
      await discoveryManager.stop();

      expect(mockNode.stop).toHaveBeenCalled();
      expect(discoveryManager.isRunning()).toBe(false);
    });

    it('should handle stop when node not created', async () => {
      await expect(discoveryManager.stop()).resolves.not.toThrow();
      expect(discoveryManager.isRunning()).toBe(false);
    });
  });

  describe('Peer Connection', () => {
    beforeEach(async () => {
      await discoveryManager.createNode();
    });

    it('should connect to a peer via multiaddr', async () => {
      const multiaddr = '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWPeer456';
      
      await discoveryManager.connectToPeer(multiaddr);

      expect(mockNode.dial).toHaveBeenCalledWith(multiaddr);
    });

    it('should track connected peers', async () => {
      mockNode.getConnections.mockReturnValue([
        { remotePeer: { toString: () => '12D3KooWPeer1' } },
        { remotePeer: { toString: () => '12D3KooWPeer2' } }
      ]);

      const peers = discoveryManager.getConnectedPeers();

      expect(peers).toEqual(['12D3KooWPeer1', '12D3KooWPeer2']);
    });

    it('should return empty array when no peers connected', () => {
      const peers = discoveryManager.getConnectedPeers();
      expect(peers).toEqual([]);
    });

    it('should throw error when connecting without node', async () => {
      const newManager = new DiscoveryManager(mockAuthManager);
      
      await expect(
        newManager.connectToPeer('/ip4/127.0.0.1/tcp/4001')
      ).rejects.toThrow('Node not initialized');
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await discoveryManager.createNode();
    });

    it('should send message to peer', async () => {
      const peerId = '12D3KooWPeer789';
      const message = { type: 'test', data: 'hello' };

      // Mock stream handling
      const mockStream = {
        sink: vi.fn().mockResolvedValue(undefined),
        close: vi.fn()
      };
      mockNode.dialProtocol = vi.fn().mockResolvedValue(mockStream);

      await discoveryManager.sendMessage(peerId, message);

      expect(mockNode.dialProtocol).toHaveBeenCalledWith(
        expect.stringContaining(peerId),
        '/fabstir-llm/1.0.0/message'
      );
    });

    it('should register message handler', () => {
      const handler = vi.fn();
      
      discoveryManager.onMessage(handler);

      expect(mockNode.handle).toHaveBeenCalledWith(
        '/fabstir-llm/1.0.0/message',
        expect.any(Function)
      );
    });

    it('should handle incoming messages', async () => {
      const handler = vi.fn();
      discoveryManager.onMessage(handler);

      // Get the registered handler
      const registeredHandler = mockNode.handle.mock.calls[0][1];

      // Mock incoming stream
      const mockStream = {
        source: (async function* () {
          yield new Uint8Array(Buffer.from(JSON.stringify({ test: 'data' })));
        })(),
        sink: vi.fn()
      };

      // Trigger the handler
      await registeredHandler({ stream: mockStream });

      expect(handler).toHaveBeenCalledWith({ test: 'data' });
    });

    it('should throw error when sending without node', async () => {
      const newManager = new DiscoveryManager(mockAuthManager);
      
      await expect(
        newManager.sendMessage('peer123', { test: 'data' })
      ).rejects.toThrow('Node not initialized');
    });
  });

  describe('Error Handling', () => {
    it('should handle node creation failure', async () => {
      mockCreateLibp2p.mockRejectedValue(new Error('Failed to create node'));

      await expect(discoveryManager.createNode()).rejects.toThrow('Failed to create P2P node');
    });

    it('should handle connection failure', async () => {
      await discoveryManager.createNode();
      mockNode.dial.mockRejectedValue(new Error('Connection refused'));

      await expect(
        discoveryManager.connectToPeer('/ip4/127.0.0.1/tcp/4001')
      ).rejects.toThrow('Failed to connect to peer');
    });

    it('should handle message sending failure', async () => {
      await discoveryManager.createNode();
      mockNode.dialProtocol = vi.fn().mockRejectedValue(new Error('Stream error'));

      await expect(
        discoveryManager.sendMessage('peer123', { test: 'data' })
      ).rejects.toThrow('Failed to send message');
    });
  });

  describe('Authentication Integration', () => {
    it('should require authenticated AuthManager', () => {
      const unauthManager = {
        isAuthenticated: vi.fn(() => false)
      } as any;

      const manager = new DiscoveryManager(unauthManager);
      expect(() => manager.getAuthManager()).toThrow('AuthManager not authenticated');
    });

    it('should return AuthManager when authenticated', () => {
      const authManager = discoveryManager.getAuthManager();
      expect(authManager).toBe(mockAuthManager);
    });
  });
});