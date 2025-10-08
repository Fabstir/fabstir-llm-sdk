/**
 * @file Host Manager Pricing Tests
 * @description Tests for host-controlled pricing methods (Sub-phase 2.2)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostManager, HostRegistrationWithModels } from '../../src/managers/HostManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { PricingValidationError } from '../../src/errors/pricing-errors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Mock ethers to provide both v5 and v6 compatibility
vi.mock('ethers', async () => {
  const actual: any = await vi.importActual('ethers');
  const zeroAddr = '0x0000000000000000000000000000000000000000';

  // Create custom Contract class that returns appropriate mocks
  class MockContract {
    constructor(public address: string, public abi: any, public signerOrProvider: any) {
      // Return mock FAB token for FAB token address
      if (address === '0xC78949004B4EB6dEf2D66e49Cd81231472612D62') {
        return {
          balanceOf: vi.fn().mockResolvedValue(1000n * (10n ** 18n)),
          approve: vi.fn().mockResolvedValue({
            wait: vi.fn().mockResolvedValue({ status: 1 })
          }),
          allowance: vi.fn().mockResolvedValue(1000n * (10n ** 18n))
        } as any;
      }
    }
  }

  return {
    ...actual,
    Contract: MockContract,
    isAddress: (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address),
    ZeroAddress: zeroAddr, // v6
    constants: { // v5
      ...actual.constants,
      AddressZero: zeroAddr
    }
  };
});

describe('HostManager Pricing Methods', () => {
  let hostManager: HostManager;
  let mockProvider: ethers.JsonRpcProvider;
  let mockWallet: ethers.Wallet;
  let mockModelManager: ModelManager;
  let mockNodeRegistry: any;

  beforeEach(async () => {
    // Fix ethers v5/v6 compatibility: Add missing v6 functions
    if (!ethers.ZeroAddress) {
      (ethers as any).ZeroAddress = '0x0000000000000000000000000000000000000000';
    }
    if (!(ethers as any).parseEther && (ethers as any).utils?.parseEther) {
      (ethers as any).parseEther = (ethers as any).utils.parseEther;
    }
    if (!(ethers as any).formatEther && (ethers as any).utils?.formatEther) {
      (ethers as any).formatEther = (ethers as any).utils.formatEther;
    }

    // Create mock provider with working call method for FAB token queries
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      call: vi.fn().mockResolvedValue('0x' + '0'.repeat(64)), // Return 0 for contract calls
      estimateGas: vi.fn().mockResolvedValue(100000n)
    } as any;

    // Create mock wallet with all required properties for ethers v5
    mockWallet = {
      address: '0x' + '1'.repeat(40),
      provider: mockProvider,
      _isSigner: true,
      getAddress: vi.fn().mockResolvedValue('0x' + '1'.repeat(40)),
      signMessage: vi.fn().mockResolvedValue('0xmocksignature')
    } as any;

    // Mock model manager
    mockModelManager = {
      isModelApproved: vi.fn().mockResolvedValue(true),
      getModelId: vi.fn().mockResolvedValue('0x' + '2'.repeat(64)),
      initialize: vi.fn().mockResolvedValue(undefined)
    } as any;

    // Mock NodeRegistry contract
    mockNodeRegistry = {
      registerNode: vi.fn().mockResolvedValue({
        hash: '0x' + '3'.repeat(64),
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0x' + '3'.repeat(64)
        })
      }),
      updatePricing: vi.fn().mockResolvedValue({
        hash: '0x' + '4'.repeat(64),
        wait: vi.fn().mockResolvedValue({
          status: 1,
          hash: '0x' + '4'.repeat(64)
        })
      }),
      getNodePricing: vi.fn().mockResolvedValue(2000n),
      getNodeFullInfo: vi.fn().mockResolvedValue([
        mockWallet.address, // operator
        1000n * (10n ** 18n), // stakedAmount (1000 FAB)
        true, // active
        '{"hardware":{"gpu":"RTX 4090","vram":24,"ram":32}}', // metadata
        'http://localhost:8083', // apiUrl
        ['0x' + '2'.repeat(64)], // supportedModels
        2000n // minPricePerToken (7th field)
      ]),
      nodes: vi.fn().mockResolvedValue([
        '0x0000000000000000000000000000000000000000', // operator (not registered)
        0n, // stakedAmount
        false // active
      ]),
      address: process.env.CONTRACT_NODE_REGISTRY
    };

    // Create host manager instance
    hostManager = new HostManager(
      mockWallet,
      '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7', // NODE_REGISTRY address
      mockModelManager,
      '0xC78949004B4EB6dEf2D66e49Cd81231472612D62', // FAB_TOKEN address
      '0x908962e8c6CE72610021586f85ebDE09aAc97776', // HOST_EARNINGS address
      null
    );

    // Replace nodeRegistry with mock
    (hostManager as any).nodeRegistry = mockNodeRegistry;
    (hostManager as any).initialized = true;
  });

  describe('registerHostWithModels with pricing', () => {
    it('should register host with valid minPricePerToken', async () => {
      const request: HostRegistrationWithModels = {
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference', 'streaming'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.002,
          stakeAmount: '1000'
        },
        apiUrl: 'http://localhost:8083',
        supportedModels: [
          {
            repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF',
            file: 'tiny-vicuna-1b.q4_k_m.gguf'
          }
        ],
        minPricePerToken: '2000' // Valid: 0.002 USDC per token
      };

      const txHash = await hostManager.registerHostWithModels(request);

      expect(txHash).toBeDefined();
      expect(mockNodeRegistry.registerNode).toHaveBeenCalledWith(
        expect.any(String), // metadata JSON
        'http://localhost:8083',
        [expect.any(String)], // model IDs
        2000n, // minPricePerToken as bigint
        expect.any(Object) // gas limit options
      );
    });

    it('should reject price below minimum (100)', async () => {
      const request: HostRegistrationWithModels = {
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.0001,
          stakeAmount: '1000'
        },
        apiUrl: 'http://localhost:8083',
        supportedModels: [
          {
            repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF',
            file: 'tiny-vicuna-1b.q4_k_m.gguf'
          }
        ],
        minPricePerToken: '50' // Invalid: below minimum
      };

      await expect(hostManager.registerHostWithModels(request))
        .rejects
        .toThrow(PricingValidationError);
    });

    it('should reject price above maximum (100000)', async () => {
      const request: HostRegistrationWithModels = {
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.15,
          stakeAmount: '1000'
        },
        apiUrl: 'http://localhost:8083',
        supportedModels: [
          {
            repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF',
            file: 'tiny-vicuna-1b.q4_k_m.gguf'
          }
        ],
        minPricePerToken: '150000' // Invalid: above maximum
      };

      await expect(hostManager.registerHostWithModels(request))
        .rejects
        .toThrow(PricingValidationError);
    });
  });

  describe('updatePricing', () => {
    it('should update host minimum pricing successfully', async () => {
      const newPrice = '3000';

      const txHash = await hostManager.updatePricing(newPrice);

      expect(txHash).toBeDefined();
      expect(mockNodeRegistry.updatePricing).toHaveBeenCalledWith(
        3000n,
        expect.any(Object) // gas limit options
      );
    });
  });

  describe('getPricing', () => {
    it('should return correct pricing for registered host', async () => {
      mockNodeRegistry.getNodePricing.mockResolvedValue(2000n);

      const pricing = await hostManager.getPricing(mockWallet.address);

      expect(pricing).toBe(2000n);
      expect(mockNodeRegistry.getNodePricing).toHaveBeenCalledWith(mockWallet.address);
    });

    it('should return 0n for unregistered host', async () => {
      mockNodeRegistry.getNodePricing.mockResolvedValue(0n);

      const pricing = await hostManager.getPricing('0x' + '9'.repeat(40));

      expect(pricing).toBe(0n);
    });
  });
});
