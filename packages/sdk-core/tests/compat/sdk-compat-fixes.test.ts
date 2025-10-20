// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FabstirSDKCompat } from '../../src/compat/FabstirSDKCompat';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

describe('FabstirSDKCompat fixes', () => {
  let sdkCompat: FabstirSDKCompat;
  let mockProvider: ethers.JsonRpcProvider;
  let mockNodeRegistry: ethers.Contract;

  beforeEach(() => {
    // Create mock provider
    mockProvider = new ethers.JsonRpcProvider('http://localhost:8545');

    // Create SDK with mocked provider
    const sdk = new FabstirSDKCore({
      rpcUrl: 'http://localhost:8545',
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!
      }
    });

    // Create compat layer
    sdkCompat = new FabstirSDKCompat(sdk);

    // Mock NodeRegistry contract
    mockNodeRegistry = {
      getAllHosts: vi.fn(),
      getHost: vi.fn(),
      connect: vi.fn(() => mockNodeRegistry)
    };
  });

  describe('findHost', () => {
    it('should return a random active host from NodeRegistry', async () => {
      const activeHosts = [
        {
          hostAddress: '0x1111111111111111111111111111111111111111',
          apiUrl: 'https://host1.example.com',
          isActive: true,
          stake: ethers.parseEther('1000')
        },
        {
          hostAddress: '0x2222222222222222222222222222222222222222',
          apiUrl: 'https://host2.example.com',
          isActive: true,
          stake: ethers.parseEther('2000')
        },
        {
          hostAddress: '0x3333333333333333333333333333333333333333',
          apiUrl: 'https://host3.example.com',
          isActive: false, // Inactive
          stake: ethers.parseEther('500')
        }
      ];

      // Mock getAllHosts to return the hosts
      mockNodeRegistry.getAllHosts.mockResolvedValue(activeHosts);

      // Replace internal contract
      (sdkCompat as any).sdk.nodeRegistryContract = mockNodeRegistry;

      // Find a host
      const host = await sdkCompat.findHost();

      // Should return one of the active hosts
      expect(host).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect([
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222'
      ]).toContain(host);

      // Should NOT return the hardcoded fallback
      expect(host).not.toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
    });

    it('should throw error if no active hosts found', async () => {
      // Mock getAllHosts to return empty array
      mockNodeRegistry.getAllHosts.mockResolvedValue([]);

      // Replace internal contract
      (sdkCompat as any).sdk.nodeRegistryContract = mockNodeRegistry;

      // Should throw error
      await expect(sdkCompat.findHost()).rejects.toThrow(
        'No active hosts available'
      );
    });

    it('should filter out inactive hosts', async () => {
      const hosts = [
        {
          hostAddress: '0x4444444444444444444444444444444444444444',
          isActive: false,
          stake: ethers.parseEther('1000')
        },
        {
          hostAddress: '0x5555555555555555555555555555555555555555',
          isActive: false,
          stake: ethers.parseEther('2000')
        }
      ];

      mockNodeRegistry.getAllHosts.mockResolvedValue(hosts);
      (sdkCompat as any).sdk.nodeRegistryContract = mockNodeRegistry;

      // Should throw error since no active hosts
      await expect(sdkCompat.findHost()).rejects.toThrow(
        'No active hosts available'
      );
    });

    it('should filter out hosts with zero stake', async () => {
      const hosts = [
        {
          hostAddress: '0x6666666666666666666666666666666666666666',
          isActive: true,
          stake: ethers.parseEther('0') // Zero stake
        }
      ];

      mockNodeRegistry.getAllHosts.mockResolvedValue(hosts);
      (sdkCompat as any).sdk.nodeRegistryContract = mockNodeRegistry;

      // Should throw error since host has no stake
      await expect(sdkCompat.findHost()).rejects.toThrow(
        'No active hosts available'
      );
    });
  });

  describe('getPeerId removal', () => {
    it('should not have getPeerId method', () => {
      // getPeerId should either not exist or throw clear error
      const hasMethod = 'getPeerId' in sdkCompat;

      if (hasMethod) {
        // If method exists, it should throw clear error
        expect(() => (sdkCompat as any).getPeerId()).toThrow(
          /not supported|deprecated|use getClientId/i
        );
      } else {
        // Method should not exist
        expect(hasMethod).toBe(false);
      }
    });

    it('should have getClientId method if needed', () => {
      // Check if getClientId exists as replacement
      if ('getClientId' in sdkCompat) {
        const clientId = (sdkCompat as any).getClientId();
        // Should return a valid client identifier
        expect(clientId).toBeTruthy();
        expect(clientId).not.toBe('mock-peer-id');
      }
    });
  });

  describe('hardcoded addresses removal', () => {
    it('should not contain hardcoded TEST_USER_1 address', async () => {
      // Check that no methods return the hardcoded test address
      const TEST_USER_1 = '0x45E3D7c678B5Cc5978766348d3AaE364EB5194Ba';

      // Test various methods that might have hardcoded addresses
      const methods = [
        'getDefaultUserAddress',
        'getUserAddress',
        'getTestAddress'
      ];

      for (const method of methods) {
        if (method in sdkCompat) {
          const result = await (sdkCompat as any)[method]();
          expect(result).not.toBe(TEST_USER_1);
        }
      }
    });
  });

  describe('integration with Base Sepolia', () => {
    it('should find real active host from testnet', async () => {
      // Skip if not running integration tests
      if (!process.env.RUN_INTEGRATION_TESTS) {
        return;
      }

      // Use real provider
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);

      // Create real SDK
      const realSdk = new FabstirSDKCore({
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
        contractAddresses: {
          jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
          usdcToken: process.env.CONTRACT_USDC_TOKEN!
        }
      });

      // Authenticate
      await realSdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);

      // Create compat layer
      const realCompat = new FabstirSDKCompat(realSdk);

      try {
        // Try to find a host
        const host = await realCompat.findHost();

        // Should be a valid address
        expect(host).toMatch(/^0x[a-fA-F0-9]{40}$/);

        // Should NOT be the old fallback
        expect(host).not.toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      } catch (error: any) {
        // If no hosts registered, should get clear error
        expect(error.message).toContain('No active hosts');
      }
    }, 30000);
  });
});