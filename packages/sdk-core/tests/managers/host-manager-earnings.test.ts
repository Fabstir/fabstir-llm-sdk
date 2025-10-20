// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HostManager } from '../../src/managers/HostManager';
import { ContractManager } from '../../src/contracts/ContractManager';
import { ModelManager } from '../../src/managers/ModelManager';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

describe('HostManager Earnings (Multi-Chain)', () => {
  let hostManager: HostManager;
  let mockProvider: ethers.JsonRpcProvider;
  let mockWallet: ethers.Wallet;
  let mockContractManager: ContractManager;
  let mockModelManager: ModelManager;
  let mockHostEarnings: any;

  beforeEach(async () => {
    // Create mock provider and wallet
    mockProvider = new ethers.JsonRpcProvider('http://localhost:8545');
    mockWallet = new ethers.Wallet('0x' + '1'.repeat(64), mockProvider);

    // Create mock contract manager
    mockContractManager = {
      getContractABI: vi.fn().mockResolvedValue([
        {
          type: 'function',
          name: 'earnings',
          stateMutability: 'view',
          inputs: [
            { name: 'host', type: 'address' },
            { name: 'token', type: 'address' }
          ],
          outputs: [{ name: '', type: 'uint256' }]
        }
      ]),
      getContractAddress: vi.fn().mockImplementation((name: string) => {
        const addresses: Record<string, string> = {
          hostEarnings: process.env.CONTRACT_HOST_EARNINGS!,
          nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
          usdcToken: process.env.CONTRACT_USDC_TOKEN!,
          modelRegistry: '0x' + '3'.repeat(40)
        };
        return Promise.resolve(addresses[name]);
      }),
      setSigner: vi.fn()
    } as any;

    // Mock model manager
    mockModelManager = {
      isModelApproved: vi.fn().mockResolvedValue(true)
    } as any;

    // Create host manager instance
    hostManager = new HostManager(
      mockWallet,
      process.env.CONTRACT_NODE_REGISTRY!,
      mockModelManager,
      process.env.CONTRACT_FAB_TOKEN!,
      process.env.CONTRACT_HOST_EARNINGS!,
      mockContractManager
    );

    // Initialize
    await hostManager.initialize();

    // Mock the HostEarnings contract
    mockHostEarnings = {
      earnings: vi.fn(),
      withdrawEarnings: vi.fn(),
      connect: vi.fn(() => mockHostEarnings),
      interface: {
        parseLog: vi.fn()
      }
    };

    // Mock ethers.Contract constructor
    vi.spyOn(ethers, 'Contract').mockReturnValue(mockHostEarnings as any);
  });

  describe('getHostEarnings', () => {
    it('should read USDC earnings for a host', async () => {
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN!;
      const mockEarnings = ethers.parseUnits('1000', 6); // 1000 USDC

      // Mock contract response
      mockHostEarnings.earnings.mockResolvedValue(mockEarnings);

      // Call getHostEarnings
      const earnings = await hostManager.getHostEarnings(hostAddress, usdcAddress);

      // Verify contract was called with correct parameters
      expect(mockHostEarnings.earnings).toHaveBeenCalledWith(
        hostAddress,
        usdcAddress
      );
      expect(earnings).toBe(mockEarnings);
    });

    it('should read ETH earnings for a host', async () => {
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const ethAddress = ethers.ZeroAddress;
      const mockEarnings = ethers.parseEther('2.5'); // 2.5 ETH

      // Mock contract response
      mockHostEarnings.earnings.mockResolvedValue(mockEarnings);

      // Call getHostEarnings with ETH address
      const earnings = await hostManager.getHostEarnings(hostAddress, ethAddress);

      // Verify contract was called with correct parameters
      expect(mockHostEarnings.earnings).toHaveBeenCalledWith(
        hostAddress,
        ethAddress
      );
      expect(earnings).toBe(mockEarnings);
    });

    it('should throw error for invalid host address', async () => {
      const invalidAddress = 'invalid-address';
      const tokenAddress = process.env.CONTRACT_USDC_TOKEN!;

      // Should throw error for invalid address
      await expect(
        hostManager.getHostEarnings(invalidAddress, tokenAddress)
      ).rejects.toThrow();
    });

    it('should throw error for invalid token address', async () => {
      const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
      const invalidToken = 'not-an-address';

      // Should throw error for invalid token
      await expect(
        hostManager.getHostEarnings(hostAddress, invalidToken)
      ).rejects.toThrow();
    });
  });

  describe('withdrawEarnings', () => {
    it('should withdraw USDC earnings', async () => {
      const usdcAddress = process.env.CONTRACT_USDC_TOKEN!;

      // Mock successful transaction
      const mockTx = {
        hash: '0xabc123',
        wait: vi.fn().mockResolvedValue({
          hash: '0xabc123',
          status: 1
        })
      };

      mockHostEarnings.withdrawEarnings.mockResolvedValue(mockTx);

      // Call withdrawEarnings
      const txHash = await hostManager.withdrawEarnings(usdcAddress);

      // Verify contract was called with correct parameters
      expect(mockHostEarnings.withdrawEarnings).toHaveBeenCalledWith(usdcAddress);
      expect(txHash).toBe('0xabc123');
    });

    it('should withdraw ETH earnings', async () => {
      const ethAddress = ethers.ZeroAddress;

      // Mock successful transaction
      const mockTx = {
        hash: '0xdef456',
        wait: vi.fn().mockResolvedValue({
          hash: '0xdef456',
          status: 1
        })
      };

      mockHostEarnings.withdrawEarnings.mockResolvedValue(mockTx);

      // Call withdrawEarnings with ETH address
      const txHash = await hostManager.withdrawEarnings(ethAddress);

      // Verify contract was called with correct parameters
      expect(mockHostEarnings.withdrawEarnings).toHaveBeenCalledWith(ethAddress);
      expect(txHash).toBe('0xdef456');
    });

    it('should throw error if withdrawal fails', async () => {
      const tokenAddress = process.env.CONTRACT_USDC_TOKEN!;

      // Mock failed transaction
      mockHostEarnings.withdrawEarnings.mockRejectedValue(
        new Error('No earnings to withdraw')
      );

      // Verify error is thrown
      await expect(
        hostManager.withdrawEarnings(tokenAddress)
      ).rejects.toThrow('No earnings to withdraw');
    });
  });
});