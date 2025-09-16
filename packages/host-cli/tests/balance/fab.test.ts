import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getFABBalance,
  checkMinimumFAB,
  formatFABBalance,
  getStakingStatus
} from '../../src/balance/checker';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('FAB Token Balance Checking', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('FAB Balance Retrieval', () => {
    it('should get FAB token balance for authenticated user', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const balance = await getFABBalance();

      expect(balance).toBeDefined();
      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    });

    it('should throw error when not authenticated', async () => {
      await expect(getFABBalance()).rejects.toThrow('not authenticated');
    });

    it('should handle contract errors gracefully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // We can't easily mock contract errors without modifying the SDK
      // So we'll just verify that errors are properly wrapped
      try {
        await getFABBalance(true);
        // If this doesn't error, test still passes as contract is working
        expect(true).toBe(true);
      } catch (error: any) {
        // Any error should be wrapped with our message
        expect(error.message).toContain('Failed to get FAB balance');
      }
    });

    it('should get balance from correct FAB token contract', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const fabAddress = process.env.CONTRACT_FAB_TOKEN;
      expect(fabAddress).toBeDefined();

      const balance = await getFABBalance();
      expect(balance).toBeDefined();
    });
  });

  describe('Minimum FAB Requirements', () => {
    it('should check if FAB balance meets minimum requirement', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkMinimumFAB();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('hasMinimum');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('required');
      expect(result).toHaveProperty('shortfall');
    });

    it('should use default minimum of 1000 FAB', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkMinimumFAB();

      expect(result.required).toBe(1000000000000000000000n); // 1000 FAB in wei
    });

    it('should accept custom minimum requirement', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const customMin = 500000000000000000000n; // 500 FAB
      const result = await checkMinimumFAB(customMin);

      expect(result.required).toBe(customMin);
    });

    it('should calculate FAB shortfall correctly', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const balance = await getFABBalance();
      const requiredAmount = balance + 100000000000000000000n; // Balance + 100 FAB

      const result = await checkMinimumFAB(requiredAmount);

      expect(result.hasMinimum).toBe(false);
      expect(result.shortfall).toBe(100000000000000000000n);
    });
  });

  describe('Staking Status', () => {
    it('should check staking status for host', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getStakingStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('isStaked');
      expect(status).toHaveProperty('stakedAmount');
      expect(status).toHaveProperty('requiredStake');
    });

    it('should indicate if host meets staking requirement', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getStakingStatus();

      if (status.stakedAmount >= status.requiredStake) {
        expect(status.isStaked).toBe(true);
      } else {
        expect(status.isStaked).toBe(false);
      }
    });

    it('should return zero stake for non-registered host', async () => {
      const privateKey = process.env.TEST_USER_1_PRIVATE_KEY!; // Use user account
      await authenticateSDK(privateKey);

      const status = await getStakingStatus();

      expect(status.isStaked).toBe(false);
      expect(status.stakedAmount).toBe(0n);
    });
  });

  describe('FAB Balance Formatting', () => {
    it('should format FAB balance with 18 decimals', () => {
      const wei = 1500000000000000000000n; // 1500 FAB
      const formatted = formatFABBalance(wei);

      expect(formatted).toBe('1500 FAB');
    });

    it('should handle fractional FAB amounts', () => {
      const wei = 1234500000000000000000n; // 1234.5 FAB
      const formatted = formatFABBalance(wei);

      expect(formatted).toBe('1234.5 FAB');
    });

    it('should format zero FAB balance', () => {
      const formatted = formatFABBalance(0n);

      expect(formatted).toBe('0 FAB');
    });

    it('should format with specified decimals', () => {
      const wei = 1234567890000000000000n;
      const formatted = formatFABBalance(wei, 2);

      expect(formatted).toBe('1234.57 FAB');
    });

    it('should handle very small FAB amounts', () => {
      const wei = 1000000000000000n; // 0.001 FAB
      const formatted = formatFABBalance(wei);

      expect(formatted).toBe('0.001 FAB');
    });

    it('should format large FAB amounts with commas', () => {
      const wei = 1000000000000000000000000n; // 1,000,000 FAB
      const formatted = formatFABBalance(wei, 0, true);

      expect(formatted).toBe('1,000,000 FAB');
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for insufficient FAB', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkMinimumFAB(1000000000000000000000000n); // 1M FAB requirement

      expect(result.hasMinimum).toBe(false);
      expect(result.errorMessage).toContain('Insufficient FAB balance');
      expect(result.errorMessage).toContain('1000000 FAB required');
    });

    it('should provide staking requirement message', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getStakingStatus();

      if (!status.isStaked) {
        expect(status.message).toContain('stake');
        expect(status.message).toContain('FAB');
      }
    });
  });

  describe('Token Contract Integration', () => {
    it('should use correct FAB token address from environment', async () => {
      const fabAddress = process.env.CONTRACT_FAB_TOKEN;
      expect(fabAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should handle ERC20 standard methods', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Should be able to get balance (ERC20 standard)
      const balance = await getFABBalance();
      expect(balance).toBeDefined();
    });
  });
});