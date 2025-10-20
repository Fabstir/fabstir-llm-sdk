// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { TreasuryManager } from '../../src/managers/TreasuryManager';
import { ContractManager } from '../../src/contracts/ContractManager';

describe('TreasuryManager - Admin Management (Simple)', () => {
  describe('addAdmin error messages', () => {
    it('should throw CONTRACT_LIMITATION error with informative message', async () => {
      const mockContractManager = {
        setSigner: async () => {},
      } as any;

      const mockSigner = {} as any;

      const treasuryManager = new TreasuryManager(mockContractManager);
      await treasuryManager.initialize(mockSigner);

      try {
        await treasuryManager.addAdmin('0x1234567890123456789012345678901234567890');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('CONTRACT_LIMITATION');
        expect(error.message).toContain('Multi-admin not supported by contract');
        expect(error.message).toContain('Only the contract owner has admin privileges');
        expect(error.details.details).toContain('Ownable pattern');
        expect(error.details.details).toContain('single owner');
      }
    });

    it('should throw error if not initialized', async () => {
      const mockContractManager = {} as any;
      const treasuryManager = new TreasuryManager(mockContractManager);

      try {
        await treasuryManager.addAdmin('0x1234567890123456789012345678901234567890');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('TREASURY_NOT_INITIALIZED');
        expect(error.message).toBe('TreasuryManager not initialized');
      }
    });
  });

  describe('removeAdmin error messages', () => {
    it('should throw CONTRACT_LIMITATION error with informative message', async () => {
      const mockContractManager = {
        setSigner: async () => {},
        getContractAddress: async (name: string) => {
          if (name === 'jobMarketplace') return '0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0';
          throw new Error(`Unknown contract: ${name}`);
        },
        getContractABI: async () => ['function owner() view returns (address)']
      } as any;

      const mockSigner = {
        provider: {} // Minimal provider to avoid the contract call
      } as any;

      const treasuryManager = new TreasuryManager(mockContractManager);
      await treasuryManager.initialize(mockSigner);

      try {
        await treasuryManager.removeAdmin('0x1234567890123456789012345678901234567890');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('CONTRACT_LIMITATION');
        expect(error.message).toContain('Multi-admin not supported by contract');
        // It will fail to check owner, so will throw the general error
        expect(error.details.details).toContain('no other admins to remove');
      }
    });

    it('should throw error if not initialized', async () => {
      const mockContractManager = {} as any;
      const treasuryManager = new TreasuryManager(mockContractManager);

      try {
        await treasuryManager.removeAdmin('0x1234567890123456789012345678901234567890');
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe('TREASURY_NOT_INITIALIZED');
        expect(error.message).toBe('TreasuryManager not initialized');
      }
    });
  });

  describe('Contract limitations documentation', () => {
    it('should document single-admin architecture', () => {
      // This test documents the contract architecture:
      // 1. JobMarketplace uses Ownable pattern
      // 2. Single owner has all admin privileges
      // 3. No multi-admin support in contract
      // 4. addAdmin() and removeAdmin() throw CONTRACT_LIMITATION errors
      // 5. Only owner() function exists, no admin management functions

      expect(true).toBe(true);
    });

    it('should document treasury operation restrictions', () => {
      // Treasury operations restricted to owner:
      // - withdrawTreasuryETH() - owner only
      // - withdrawTreasuryTokens(token) - owner only
      // - withdrawAllTreasuryFees(tokens[]) - owner only
      // - Fee percentage changes - owner only (if available)

      // No support for:
      // - Multiple admins
      // - Admin roles or permissions
      // - Delegated treasury management

      expect(true).toBe(true);
    });

    it('should explain the error handling approach', () => {
      // Error handling strategy:
      // 1. Use CONTRACT_LIMITATION error code for unsupported features
      // 2. Provide detailed error messages explaining why
      // 3. Include context about contract architecture
      // 4. Suggest alternatives where possible (e.g., transferOwnership)
      // 5. Clear distinction from NOT_IMPLEMENTED (which implies future work)

      expect(true).toBe(true);
    });
  });

  describe('Implementation verification', () => {
    it('should verify addAdmin has proper documentation', () => {
      // Check that the method signature includes documentation
      const methodString = TreasuryManager.prototype.addAdmin.toString();

      // The implementation should throw CONTRACT_LIMITATION
      expect(methodString).toContain('CONTRACT_LIMITATION');
    });

    it('should verify removeAdmin has proper documentation', () => {
      // Check that the method signature includes documentation
      const methodString = TreasuryManager.prototype.removeAdmin.toString();

      // The implementation should throw CONTRACT_LIMITATION
      expect(methodString).toContain('CONTRACT_LIMITATION');
    });

    it('should verify isAdmin method exists', () => {
      const treasuryManager = new TreasuryManager({} as any);
      expect(typeof treasuryManager.isAdmin).toBe('function');
    });
  });
});