// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  estimateWithdrawalGas,
  calculateGasCost,
  getGasPrice,
  GasEstimate
} from '../../src/withdrawal/gas';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import { ethers } from 'ethers';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Gas Estimation', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Gas Price Fetching', () => {
    it('should fetch current gas price', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const gasPrice = await getGasPrice();

      expect(gasPrice).toBeDefined();
      expect(gasPrice).toBeGreaterThan(0n);
      expect(typeof gasPrice).toBe('bigint');
    });

    it('should include EIP-1559 fee data', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const feeData = await getGasPrice({ includeEIP1559: true });

      expect(feeData).toHaveProperty('maxFeePerGas');
      expect(feeData).toHaveProperty('maxPriorityFeePerGas');
    });

    it('should handle network congestion', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const normalPrice = await getGasPrice();
      const priorityPrice = await getGasPrice({ priority: 'fast' });

      expect(priorityPrice).toBeGreaterThanOrEqual(normalPrice);
    });
  });

  describe('Withdrawal Gas Estimation', () => {
    it('should estimate gas for host withdrawal', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.1');
      const estimate = await estimateWithdrawalGas('host', amount);

      expect(estimate).toBeDefined();
      expect(estimate).toHaveProperty('gasLimit');
      expect(estimate).toHaveProperty('gasPrice');
      expect(estimate).toHaveProperty('totalCost');
    });

    it('should estimate gas for treasury withdrawal', async () => {
      const privateKey = process.env.TEST_TREASURY_PRIVATE_KEY || process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.05');
      const estimate = await estimateWithdrawalGas('treasury', amount);

      expect(estimate).toBeDefined();
      expect(estimate.gasLimit).toBeGreaterThan(0n);
    });

    it('should include buffer in gas limit', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.1');
      const estimate = await estimateWithdrawalGas('host', amount, { buffer: 1.2 });

      expect(estimate.gasLimit).toBeGreaterThan(21000n); // Base transfer cost
    });

    it('should handle zero amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const estimate = await estimateWithdrawalGas('host', 0n);

      expect(estimate).toBeDefined();
      expect(estimate.totalCost).toBe(0n);
    });
  });

  describe('Gas Cost Calculation', () => {
    it('should calculate gas cost in ETH', async () => {
      const gasLimit = 50000n;
      const gasPrice = 30000000000n; // 30 gwei

      const cost = calculateGasCost(gasLimit, gasPrice);

      expect(cost).toBeDefined();
      expect(cost).toHaveProperty('wei');
      expect(cost).toHaveProperty('eth');
      expect(cost).toHaveProperty('formatted');
    });

    it('should format gas cost correctly', async () => {
      const gasLimit = 21000n;
      const gasPrice = 20000000000n; // 20 gwei

      const cost = calculateGasCost(gasLimit, gasPrice);

      expect(cost.formatted).toContain('ETH');
      expect(cost.eth).toBe('0.00042');
    });

    it('should handle high gas prices', async () => {
      const gasLimit = 100000n;
      const gasPrice = 500000000000n; // 500 gwei

      const cost = calculateGasCost(gasLimit, gasPrice);

      expect(Number(cost.eth)).toBeGreaterThan(0.01);
    });
  });

  describe('Gas Optimization', () => {
    it('should suggest optimal gas settings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.1');
      const estimate = await estimateWithdrawalGas('host', amount, {
        optimize: true
      });

      expect(estimate).toHaveProperty('recommended');
      expect(estimate.recommended).toHaveProperty('gasLimit');
      expect(estimate.recommended).toHaveProperty('maxFeePerGas');
    });

    it('should compare different priority levels', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.1');

      const lowEstimate = await estimateWithdrawalGas('host', amount, { priority: 'low' });
      const normalEstimate = await estimateWithdrawalGas('host', amount, { priority: 'normal' });
      const highEstimate = await estimateWithdrawalGas('host', amount, { priority: 'high' });

      expect(lowEstimate.totalCost).toBeLessThanOrEqual(normalEstimate.totalCost);
      expect(normalEstimate.totalCost).toBeLessThanOrEqual(highEstimate.totalCost);
    });

    it('should estimate confirmation time', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amount = ethers.parseEther('0.1');
      const estimate = await estimateWithdrawalGas('host', amount);

      expect(estimate).toHaveProperty('estimatedTime');
      expect(estimate.estimatedTime).toHaveProperty('blocks');
      expect(estimate.estimatedTime).toHaveProperty('seconds');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle gas estimation failures', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Try to estimate for invalid amount
      const hugeAmount = ethers.parseEther('1000000');

      await expect(estimateWithdrawalGas('host', hugeAmount))
        .rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Disconnect SDK to simulate network error
      await cleanupSDK();

      await expect(getGasPrice()).rejects.toThrow();
    });
  });
});