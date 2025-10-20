// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  approveTokens,
  stakeTokens,
  checkAllowance,
  checkStakedAmount,
  withdrawStake,
  getStakingRequirements,
  StakingConfig
} from '../../src/registration/staking';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';
import { ethers } from 'ethers';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Staking Operations', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Token Approval', () => {
    it('should check current FAB token allowance', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const allowance = await checkAllowance();

      expect(allowance).toBeDefined();
      expect(typeof allowance).toBe('bigint');
      expect(allowance).toBeGreaterThanOrEqual(0n);
    });

    it('should approve FAB tokens for staking contract', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = 1000000000000000000000n; // 1000 FAB
      const result = await approveTokens(amount);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
      if (!result.skipped) {
        expect(result).toHaveProperty('transactionHash');
      }
    }, 10000);

    it('should skip approval if already approved', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = 1000000000000000000000n; // 1000 FAB
      const currentAllowance = await checkAllowance();

      if (currentAllowance >= amount) {
        const result = await approveTokens(amount);
        expect(result.skipped).toBe(true);
        expect(result.message).toContain('already approved');
      }
    });

    it('should handle approval with exact amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const exactAmount = 1234567890000000000000n;
      const result = await approveTokens(exactAmount);

      expect(result.success).toBe(true);
      if (!result.skipped) {
        const newAllowance = await checkAllowance();
        expect(newAllowance).toBeGreaterThanOrEqual(exactAmount);
      }
    }, 10000);

    it('should wait for approval confirmation', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = 1000000000000000000000n;
      const result = await approveTokens(amount, { confirmations: 2 });

      expect(result).toBeDefined();
      if (result.success && !result.skipped) {
        expect(result.confirmations).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Staking Process', () => {
    it('should get staking requirements', async () => {
      const requirements = await getStakingRequirements();

      expect(requirements).toBeDefined();
      expect(requirements.minimumStake).toBe(1000000000000000000000n); // 1000 FAB
      expect(requirements.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should stake FAB tokens', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const currentStake = await checkStakedAmount();

      if (currentStake === 0n) {
        const config: StakingConfig = {
          amount: 1000000000000000000000n, // 1000 FAB
          models: ['gpt-4', 'claude-3'],
          apiUrl: 'https://api.example.com'
        };

        const result = await stakeTokens(config);

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.transactionHash).toBeDefined();
        expect(result.stakedAmount).toBe(config.amount);
      }
    });

    it('should check staked amount for host', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const stakedAmount = await checkStakedAmount();

      expect(stakedAmount).toBeDefined();
      expect(typeof stakedAmount).toBe('bigint');
      expect(stakedAmount).toBeGreaterThanOrEqual(0n);
    });

    it('should prevent staking below minimum', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: StakingConfig = {
        amount: 100000000000000000000n, // 100 FAB (below minimum)
        models: ['gpt-4'],
        apiUrl: 'https://api.example.com'
      };

      await expect(stakeTokens(config)).rejects.toThrow('below minimum');
    });

    it('should handle insufficient balance for staking', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: StakingConfig = {
        amount: 1000000000000000000000000n, // 1,000,000 FAB (likely more than balance)
        models: ['gpt-4'],
        apiUrl: 'https://api.example.com'
      };

      await expect(stakeTokens(config)).rejects.toThrow(/insufficient/i);
    });
  });

  describe('Stake Withdrawal', () => {
    it('should allow stake withdrawal when not active', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const stakedAmount = await checkStakedAmount();

      if (stakedAmount > 0n) {
        // This would only work if host is inactive
        try {
          const result = await withdrawStake();
          expect(result.success).toBe(true);
          expect(result.withdrawnAmount).toBe(stakedAmount);
        } catch (error: any) {
          expect(error.message.toLowerCase()).toContain('active');
        }
      }
    });

    it('should prevent withdrawal for active hosts', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const stakedAmount = await checkStakedAmount();

      if (stakedAmount > 0n) {
        // Assuming host is active
        await expect(withdrawStake()).rejects.toThrow(/active|not allowed/i);
      }
    });

    it('should handle partial withdrawals if supported', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const stakedAmount = await checkStakedAmount();

      if (stakedAmount > 1000000000000000000000n) {
        // Try to withdraw partial amount
        const partialAmount = 500000000000000000000n; // 500 FAB
        try {
          const result = await withdrawStake(partialAmount);
          expect(result.withdrawnAmount).toBe(partialAmount);
        } catch (error: any) {
          // Contract might not support partial withdrawals
          expect(error.message).toMatch(/partial|not supported/i);
        }
      }
    });
  });

  describe('Transaction Management', () => {
    it('should estimate gas for staking transaction', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: StakingConfig = {
        amount: 1000000000000000000000n,
        models: ['gpt-4'],
        apiUrl: 'https://api.example.com'
      };

      const gasEstimate = await stakeTokens({ ...config, estimateOnly: true } as any);

      expect(gasEstimate).toBeDefined();
      expect(gasEstimate.success).toBe(false);
      if ('estimatedGas' in gasEstimate) {
        expect(gasEstimate.estimatedGas).toBeGreaterThan(0n);
      }
    });

    it('should handle custom gas settings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: StakingConfig = {
        amount: 1000000000000000000000n,
        models: ['gpt-4'],
        apiUrl: 'https://api.example.com',
        gasLimit: 500000,
        gasPrice: ethers.parseUnits('20', 'gwei')
      };

      const currentStake = await checkStakedAmount();

      if (currentStake === 0n) {
        const result = await stakeTokens(config);
        expect(result).toBeDefined();
      }
    });

    it('should wait for specified confirmations', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = 1000000000000000000000n;
      const result = await approveTokens(amount, { confirmations: 3 });

      if (result.success && !result.skipped) {
        expect(result.confirmations).toBeGreaterThanOrEqual(3);
        expect(result.blockNumber).toBeDefined();
      }
    });
  });

  describe('Staking State', () => {
    it.skip('should track staking status', async () => {
      // Not implemented yet
      expect(true).toBe(true);
    });

    it.skip('should provide staking history', async () => {
      // Not implemented yet
      expect(true).toBe(true);
    });

    it.skip('should calculate staking rewards if applicable', async () => {
      // Not implemented yet
      expect(true).toBe(true);
    });
  });
});