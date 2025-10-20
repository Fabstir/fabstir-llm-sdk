// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientManager } from '../../src/managers/ClientManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { HostManager } from '../../src/managers/HostManager';
import { ContractManager } from '../../src/contracts/ContractManager';
import { ChainId } from '../../src/types/chain.types';
import { ethers } from 'ethers';

// Mock dependencies
vi.mock('../../src/managers/ModelManager');
vi.mock('../../src/managers/HostManager');
vi.mock('../../src/contracts/ContractManager');

describe('ClientManager Multi-Chain Support', () => {
  let clientManager: ClientManager;
  let mockModelManager: any;
  let mockHostManager: any;
  let mockContractManager: any;
  let originalFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    global.fetch = vi.fn();

    mockModelManager = {
      initialize: vi.fn(),
      getApprovedModels: vi.fn().mockResolvedValue(['llama-3', 'gpt-4']),
      getModelSpec: vi.fn().mockResolvedValue({ id: 'llama-3', name: 'Llama 3', requirements: { minVram: 8 } })
    };

    mockHostManager = {
      initialize: vi.fn(),
      getAvailableHosts: vi.fn().mockResolvedValue([
        { address: 'host1', endpoint: 'http://host1.com' },
        { address: 'host2', endpoint: 'http://host2.com' }
      ])
    };

    mockContractManager = {
      setSigner: vi.fn(),
      getJobMarketplace: vi.fn().mockReturnValue({ address: '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0' }),
      getContractAddress: vi.fn().mockResolvedValue('0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0'),
      getContractABI: vi.fn().mockResolvedValue([])
    };

    clientManager = new ClientManager(mockModelManager as any, mockHostManager as any, mockContractManager as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Chain-Aware Node Discovery', () => {
    it('should discover nodes for a specific chain', async () => {
      const mockNodes = [
        { id: 'node1', url: 'http://node1.com', models: ['llama-3'] },
        { id: 'node2', url: 'http://node2.com', models: ['gpt-4'] }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: mockNodes })
      });

      const nodes = await clientManager.discoverNodes(ChainId.BASE_SEPOLIA);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`chain_id=${ChainId.BASE_SEPOLIA}`)
      );
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('node1');
    });

    it('should filter nodes by chain support', async () => {
      const mockNodes = [
        { id: 'node1', url: 'http://node1.com', chains: [ChainId.BASE_SEPOLIA] },
        { id: 'node2', url: 'http://node2.com', chains: [ChainId.OPBNB_TESTNET] },
        { id: 'node3', url: 'http://node3.com', chains: [ChainId.BASE_SEPOLIA, ChainId.OPBNB_TESTNET] }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: mockNodes })
      });

      const nodes = await clientManager.discoverNodes(ChainId.BASE_SEPOLIA);

      // Should return only nodes that support Base Sepolia
      expect(nodes).toHaveLength(2);
      expect(nodes.map(n => n.id)).toContain('node1');
      expect(nodes.map(n => n.id)).toContain('node3');
      expect(nodes.map(n => n.id)).not.toContain('node2');
    });

    it('should get supported chains for a node', async () => {
      const mockChains = {
        chains: [
          { chain_id: ChainId.BASE_SEPOLIA, name: 'Base Sepolia' },
          { chain_id: ChainId.OPBNB_TESTNET, name: 'opBNB Testnet' }
        ]
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockChains)
      });

      const chains = await clientManager.getNodeChains('http://node1.com');

      expect(global.fetch).toHaveBeenCalledWith('http://node1.com/v1/chains');
      expect(chains).toHaveLength(2);
      expect(chains).toContain(ChainId.BASE_SEPOLIA);
      expect(chains).toContain(ChainId.OPBNB_TESTNET);
    });

    it('should handle nodes with no chain information', async () => {
      const mockNodes = [
        { id: 'node1', url: 'http://node1.com', models: ['llama-3'] }
        // No chains field
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ nodes: mockNodes })
      });

      const nodes = await clientManager.discoverNodes(ChainId.BASE_SEPOLIA);

      // Should assume node supports the requested chain if no chain info
      expect(nodes).toHaveLength(1);
    });

    it('should validate chain support during health check', async () => {
      await clientManager.initialize();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          healthy: true,
          chain_id: ChainId.BASE_SEPOLIA
        })
      });

      const isHealthy = await clientManager.checkNodeHealth(
        'http://node1.com',
        ChainId.BASE_SEPOLIA
      );

      expect(isHealthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://node1.com/v1/health');
    });

    it('should reject unhealthy nodes for chain', async () => {
      await clientManager.initialize();

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          healthy: true,
          chain_id: ChainId.OPBNB_TESTNET // Wrong chain
        })
      });

      const isHealthy = await clientManager.checkNodeHealth(
        'http://node1.com',
        ChainId.BASE_SEPOLIA
      );

      expect(isHealthy).toBe(false);
    });
  });
});