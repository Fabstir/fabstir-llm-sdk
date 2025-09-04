import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import { ethers } from 'ethers';

// Mock ethers
vi.mock('ethers', () => ({
  ethers: {
    providers: {
      JsonRpcProvider: vi.fn().mockImplementation(() => ({
        getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' })
      }))
    },
    Wallet: vi.fn().mockImplementation(() => ({
      address: '0xUser123',
      provider: {},
      connect: vi.fn().mockReturnThis(),
      getAddress: vi.fn().mockResolvedValue('0xUser123'),
      signMessage: vi.fn().mockResolvedValue('0xSignature123')
    })),
    Contract: vi.fn().mockImplementation(() => ({
      address: '0xContract456',
      connect: vi.fn().mockReturnThis()
    })),
    utils: {
      parseEther: vi.fn(v => `${v}_ETH`),
      parseUnits: vi.fn((v, d) => `${v}_${d}`),
      arrayify: vi.fn(() => new Uint8Array(32).fill(1)),
      keccak256: vi.fn(() => '0xHash'),
      toUtf8Bytes: vi.fn(s => new TextEncoder().encode(s))
    },
    BigNumber: {
      from: vi.fn(v => ({ toString: () => v.toString() }))
    }
  }
}));

// Mock libp2p modules
vi.doMock('libp2p', () => ({
  createLibp2p: vi.fn().mockResolvedValue({
    peerId: { toString: () => '12D3KooWMockPeer' },
    start: vi.fn(),
    stop: vi.fn(),
    dial: vi.fn(),
    dialProtocol: vi.fn().mockResolvedValue({
      sink: vi.fn(),
      close: vi.fn()
    }),
    getConnections: vi.fn(() => []),
    handle: vi.fn()
  })
}));

vi.doMock('@libp2p/tcp', () => ({
  tcp: vi.fn(() => 'tcp-transport')
}));

vi.doMock('@chainsafe/libp2p-noise', () => ({
  noise: vi.fn(() => 'noise-encryption')
}));

vi.doMock('@chainsafe/libp2p-yamux', () => ({
  yamux: vi.fn(() => 'yamux-muxer')
}));

describe('FabstirSDK - DiscoveryManager Integration', () => {
  let sdk: FabstirSDK;

  beforeEach(() => {
    vi.clearAllMocks();
    sdk = new FabstirSDK({
      rpcUrl: 'https://base-sepolia.test',
      contractAddresses: {
        jobMarketplace: '0xJobMarketplace123',
        nodeRegistry: '0xNodeRegistry456',
        fabToken: '0xFabToken789',
        usdcToken: '0xUSDC012'
      }
    });
  });

  describe('DiscoveryManager Access', () => {
    it('should throw error when accessing DiscoveryManager without authentication', () => {
      expect(() => sdk.getDiscoveryManager()).toThrow('Must authenticate before accessing DiscoveryManager');
    });

    it('should provide DiscoveryManager after authentication', async () => {
      await sdk.authenticate('0xPrivateKey123');
      
      const discoveryManager = sdk.getDiscoveryManager();
      expect(discoveryManager).toBeDefined();
      expect(discoveryManager.constructor.name).toBe('DiscoveryManager');
    });

    it('should return same DiscoveryManager instance on multiple calls', async () => {
      await sdk.authenticate('0xPrivateKey123');
      
      const discovery1 = sdk.getDiscoveryManager();
      const discovery2 = sdk.getDiscoveryManager();
      
      expect(discovery1).toBe(discovery2);
    });
  });

  describe('P2P Operations via SDK', () => {
    beforeEach(async () => {
      await sdk.authenticate('0xPrivateKey123');
    });

    it('should create P2P node through DiscoveryManager', async () => {
      const discoveryManager = sdk.getDiscoveryManager();
      const peerId = await discoveryManager.createNode();
      
      expect(peerId).toBe('12D3KooWMockPeer');
      expect(discoveryManager.isRunning()).toBe(true);
    });

    it('should connect to peers through DiscoveryManager', async () => {
      const discoveryManager = sdk.getDiscoveryManager();
      await discoveryManager.createNode();
      
      await expect(
        discoveryManager.connectToPeer('/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWPeer')
      ).resolves.not.toThrow();
    });

    it('should handle messages through DiscoveryManager', async () => {
      const discoveryManager = sdk.getDiscoveryManager();
      await discoveryManager.createNode();
      
      const handler = vi.fn();
      discoveryManager.onMessage(handler);
      
      await expect(
        discoveryManager.sendMessage('12D3KooWPeer', { test: 'data' })
      ).resolves.not.toThrow();
    });

    it('should stop P2P node on cleanup', async () => {
      const discoveryManager = sdk.getDiscoveryManager();
      await discoveryManager.createNode();
      
      expect(discoveryManager.isRunning()).toBe(true);
      
      await discoveryManager.stop();
      expect(discoveryManager.isRunning()).toBe(false);
    });
  });
});