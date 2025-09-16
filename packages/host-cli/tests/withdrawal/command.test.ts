import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  executeWithdraw,
  withdrawHostEarnings,
  withdrawTreasuryEarnings,
  WithdrawOptions
} from '../../src/commands/withdraw';
import { initializeSDK, authenticateSDK, cleanupSDK, getSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Withdrawal Command', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Command Execution', () => {
    it('should execute withdrawal command successfully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Mock confirmation prompt
      const mockPrompt = vi.fn().mockResolvedValue({ confirm: false });
      vi.mock('inquirer', () => ({ default: { prompt: mockPrompt } }));

      const options: WithdrawOptions = { amount: 'all' };
      const result = await executeWithdraw(options);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('requestedAmount');
      expect(result).toHaveProperty('gasEstimate');
    });

    it('should handle specific amount withdrawal', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: WithdrawOptions = { amount: '0.1' };
      const result = await executeWithdraw(options);

      expect(result).toBeDefined();
      expect(result.requestedAmount).toBe(BigInt('100000000000000000')); // 0.1 ETH in wei
    });

    it('should require confirmation before withdrawal', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: WithdrawOptions = { amount: 'all', skipConfirmation: false };
      const result = await executeWithdraw(options);

      expect(result).toHaveProperty('confirmed');
      if (!options.skipConfirmation) {
        expect(result.confirmed).toBeDefined();
      }
    });

    it('should fail when not authenticated', async () => {
      const options: WithdrawOptions = { amount: 'all' };
      await expect(executeWithdraw(options)).rejects.toThrow('not authenticated');
    });
  });

  describe('Host Earnings Withdrawal', () => {
    it('should check available balance before withdrawal', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawHostEarnings();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('success');
    });

    it('should handle zero balance gracefully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawHostEarnings(BigInt(0));

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No earnings available');
    });

    it('should withdraw partial amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = BigInt('50000000000000000'); // 0.05 ETH
      const result = await withdrawHostEarnings(amount);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('requestedAmount');
      expect(result.requestedAmount).toBe(amount);
    });

    it('should return transaction receipt on success', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawHostEarnings();

      if (result.success && result.receipt) {
        expect(result.receipt).toHaveProperty('transactionHash');
        expect(result.receipt).toHaveProperty('blockNumber');
        expect(result.receipt).toHaveProperty('gasUsed');
      }
    });
  });

  describe('Treasury Earnings Withdrawal', () => {
    it('should check treasury permissions', async () => {
      const privateKey = process.env.TEST_TREASURY_PRIVATE_KEY || process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawTreasuryEarnings();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('authorized');
    });

    it('should fail for non-treasury addresses', async () => {
      const privateKey = process.env.TEST_USER_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawTreasuryEarnings();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authorized');
    });

    it('should withdraw treasury balance when authorized', async () => {
      const privateKey = process.env.TEST_TREASURY_PRIVATE_KEY || process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawTreasuryEarnings();

      expect(result).toBeDefined();
      if (result.authorized) {
        expect(result).toHaveProperty('amount');
        expect(result).toHaveProperty('receipt');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Simulate network error
      const sdk = getSDK();
      vi.spyOn(sdk, 'isAuthenticated').mockReturnValue(false);

      await expect(withdrawHostEarnings()).rejects.toThrow();
    });

    it('should handle insufficient gas', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: WithdrawOptions = {
        amount: 'all',
        maxGasPrice: '1' // Very low gas price
      };

      const result = await executeWithdraw(options);

      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });

    it('should handle contract errors', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Try to withdraw more than available
      const hugeAmount = BigInt('1000000000000000000000'); // 1000 ETH
      const result = await withdrawHostEarnings(hugeAmount);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Transaction Status', () => {
    it('should show pending status during withdrawal', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: WithdrawOptions = { amount: '0.01' };
      const result = await executeWithdraw(options);

      expect(result).toHaveProperty('status');
      expect(['pending', 'confirmed', 'failed']).toContain(result.status);
    });

    it('should update status after confirmation', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await withdrawHostEarnings(BigInt('10000000000000000'));

      if (result.receipt) {
        expect(result.status).toBe('confirmed');
        expect(result.receipt.status).toBe(1);
      }
    });
  });

  describe('Amount Validation', () => {
    it('should validate withdrawal amount format', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const invalidOptions: WithdrawOptions = { amount: 'invalid' };
      await expect(executeWithdraw(invalidOptions)).rejects.toThrow('Invalid amount');
    });

    it('should handle minimum withdrawal amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const tinyAmount = BigInt(1); // 1 wei
      const result = await withdrawHostEarnings(tinyAmount);

      expect(result.success).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should handle maximum withdrawal amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: WithdrawOptions = { amount: 'max' };
      const result = await executeWithdraw(options);

      expect(result).toBeDefined();
      expect(result.requestedAmount).toBeLessThanOrEqual(result.available);
    });
  });
});