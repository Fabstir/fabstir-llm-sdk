/**
 * Test to ensure no mock fallbacks in production code
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';
import { ModelManager } from '../../src/managers/ModelManager';
import { SmartAccountProvider } from '../../src/providers/SmartAccountProvider';
import { ethers } from 'ethers';

describe('No Mock Fallbacks in Production', () => {
  describe('FabstirSDKCore', () => {
    it('should throw error when trying to use VoidSigner', async () => {
      const sdk = new FabstirSDKCore({
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      // Mock wallet provider
      const mockWalletProvider = {
        connect: vi.fn().mockResolvedValue(undefined),
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
        isConnected: vi.fn().mockReturnValue(true),
        disconnect: vi.fn(),
        getCapabilities: vi.fn().mockReturnValue({
          hasSigning: true,
          hasGaslessTransactions: false
        })
      };

      // Should throw when trying to authenticate with wallet provider
      // because it cannot create a proper signer from it
      await expect(
        sdk.authenticateWithWallet(mockWalletProvider)
      ).rejects.toThrow('Cannot create signer from wallet provider');
    });

    it('should throw error when S5 seed generation fails without fallback', async () => {
      const sdk = new FabstirSDKCore({
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org',
        contractAddresses: {
          jobMarketplace: '0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944',
          nodeRegistry: '0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218',
          fabToken: '0xC78949004B4EB6dEf2D66e49Cd81231472612D62',
          usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        }
      });

      // Mock the private key authentication to trigger seed generation
      const testPrivateKey = '0x' + '1'.repeat(64);

      // Since seed generation is part of authentication, we test it indirectly
      // The SDK should not fall back to config seeds or generate test seeds
      const spy = vi.spyOn(console, 'log');

      try {
        await sdk.authenticateWithPrivateKey(testPrivateKey);
      } catch (error) {
        // Expected to fail in test environment
      }

      // Should NOT log fallback messages
      expect(spy).not.toHaveBeenCalledWith(
        expect.stringContaining('Using seed phrase from config as fallback')
      );
      expect(spy).not.toHaveBeenCalledWith(
        expect.stringContaining('Generated temporary seed for development mode')
      );

      spy.mockRestore();
    });
  });

  describe('ModelManager', () => {
    it('should throw error when contract is not deployed, not run in mock mode', async () => {
      // Create a mock contract that simulates not being deployed
      const mockProvider = {
        getCode: vi.fn().mockResolvedValue('0x') // Empty code = not deployed
      };

      const mockContract = {
        runner: { provider: mockProvider },
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
        APPROVAL_THRESHOLD: vi.fn().mockRejectedValue(new Error('Contract not found'))
      };

      const manager = new ModelManager(mockContract as any);

      // Should throw error, not silently continue in "mock mode"
      await expect(manager.initialize()).rejects.toThrow(
        'ModelRegistry contract not deployed'
      );

      // Should NOT be initialized after failure
      expect(manager['initialized']).toBe(false);
    });

    it('should throw error on listApprovedModels failure without fallback', async () => {
      const mockContract = {
        runner: {
          provider: {
            getCode: vi.fn().mockResolvedValue('0x1234') // Has code
          }
        },
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
        APPROVAL_THRESHOLD: vi.fn().mockResolvedValue(3),
        getAllModels: vi.fn().mockRejectedValue(new Error('Contract method failed'))
      };

      const manager = new ModelManager(mockContract as any);
      await manager.initialize();

      // Should throw error without trying fallback approaches
      await expect(manager.listApprovedModels()).rejects.toThrow(
        'Failed to list models'
      );

      // Should NOT have called any fallback methods
      expect(mockContract.getAllModels).toHaveBeenCalledTimes(1);
    });
  });

  describe('SmartAccountProvider', () => {
    it('should throw error when Base Account SDK is not available, no mock fallback', async () => {
      // Mock the dynamic import to return null (SDK not available)
      vi.mock('@base-org/account', () => null);

      const provider = new SmartAccountProvider();

      // Should throw error about Base Account SDK not being available
      await expect(provider.connect()).rejects.toThrow(
        'Base Account SDK not available'
      );

      // Should NOT be connected after failure
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('Code Analysis', () => {
    it('should not contain VoidSigner references in production code', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const srcDir = path.join(__dirname, '../../src');

      const checkFile = (filePath: string) => {
        if (!filePath.endsWith('.ts')) return;

        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for VoidSigner usage (except in error messages)
        if (content.includes('new ethers.VoidSigner')) {
          throw new Error(`Found VoidSigner usage in ${filePath}`);
        }

        // Check for mock mode fallbacks
        if (content.includes('running in mock mode') && !content.includes('throw')) {
          throw new Error(`Found mock mode fallback in ${filePath}`);
        }
      };

      const walkDir = (dir: string) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory() && !file.startsWith('.')) {
            walkDir(filePath);
          } else if (stat.isFile()) {
            checkFile(filePath);
          }
        }
      };

      // This should not throw if all mocks are removed
      expect(() => walkDir(srcDir)).not.toThrow();
    });
  });
});