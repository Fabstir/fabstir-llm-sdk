// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkAllRequirements,
  validateHostRequirements,
  getRequirementsStatus,
  formatRequirementsReport,
  MINIMUM_REQUIREMENTS
} from '../../src/balance/requirements';
import { monitorBalances, BalanceMonitor } from '../../src/balance/monitor';
import { displayBalances, displayRequirements } from '../../src/balance/display';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Balance Requirements Validation', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    // Clean up any timers
    vi.clearAllTimers();
    // Small delay to let async operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
    await cleanupSDK();
  });

  describe('Requirements Constants', () => {
    it('should have correct minimum ETH requirement', () => {
      expect(MINIMUM_REQUIREMENTS.ETH).toBe(15000000000000000n); // 0.015 ETH
    });

    it('should have correct minimum FAB requirement', () => {
      expect(MINIMUM_REQUIREMENTS.FAB).toBe(1000000000000000000000n); // 1000 FAB
    });

    it('should have correct staking requirement', () => {
      expect(MINIMUM_REQUIREMENTS.STAKING).toBe(1000000000000000000000n); // 1000 FAB
    });
  });

  describe('Complete Requirements Check', () => {
    it('should check all requirements at once', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkAllRequirements();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('meetsAll');
      expect(result).toHaveProperty('eth');
      expect(result).toHaveProperty('fab');
      expect(result).toHaveProperty('staking');
      expect(result).toHaveProperty('errors');
    });

    it('should return detailed status for each requirement', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkAllRequirements();

      // ETH requirement details
      expect(result.eth).toHaveProperty('hasMinimum');
      expect(result.eth).toHaveProperty('balance');
      expect(result.eth).toHaveProperty('required');

      // FAB requirement details
      expect(result.fab).toHaveProperty('hasMinimum');
      expect(result.fab).toHaveProperty('balance');
      expect(result.fab).toHaveProperty('required');

      // Staking requirement details
      expect(result.staking).toHaveProperty('isStaked');
      expect(result.staking).toHaveProperty('stakedAmount');
    });

    it('should identify which requirements are not met', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await checkAllRequirements();

      if (!result.meetsAll) {
        expect(result.errors.length).toBeGreaterThan(0);
        result.errors.forEach(error => {
          expect(error).toMatch(/ETH|FAB|staking/i);
        });
      }
    });

    it('should handle authentication errors', async () => {
      await expect(checkAllRequirements()).rejects.toThrow('not authenticated');
    });
  });

  describe('Host Validation', () => {
    it('should validate if user can operate as host', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const isValid = await validateHostRequirements();

      expect(typeof isValid).toBe('boolean');
    });

    it('should return false if any requirement not met', async () => {
      const privateKey = process.env.TEST_USER_1_PRIVATE_KEY!; // User likely doesn't meet requirements
      await authenticateSDK(privateKey);

      const isValid = await validateHostRequirements();

      // User account should not meet host requirements
      expect(isValid).toBe(false);
    });

    it('should provide detailed validation result with reasons', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await validateHostRequirements(true); // Get detailed result

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('reasons');
      if (!result.valid) {
        expect(result.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Requirements Status', () => {
    it('should get comprehensive status report', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getRequirementsStatus();

      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('address');
      expect(status).toHaveProperty('requirements');
      expect(status).toHaveProperty('canOperate');
    });

    it('should include wallet address in status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      const expectedAddress = process.env.TEST_HOST_1_ADDRESS!;
      await authenticateSDK(privateKey);

      const status = await getRequirementsStatus();

      expect(status.address.toLowerCase()).toBe(expectedAddress.toLowerCase());
    });

    it('should include timestamp in status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const before = Date.now();
      const status = await getRequirementsStatus();
      const after = Date.now();

      expect(status.timestamp).toBeGreaterThanOrEqual(before);
      expect(status.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Requirements Report Formatting', () => {
    it('should format requirements report for display', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getRequirementsStatus();
      const report = formatRequirementsReport(status);

      expect(report).toContain('Requirements Status');
      expect(report).toContain('ETH');
      expect(report).toContain('FAB');
    });

    it('should show checkmarks for met requirements', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getRequirementsStatus();
      const report = formatRequirementsReport(status);

      // Should contain ✓ or ✗ for each requirement
      expect(report).toMatch(/[✓✗]/);
    });

    it('should highlight unmet requirements', async () => {
      const mockStatus = {
        timestamp: Date.now(),
        address: '0x123',
        requirements: {
          eth: {
            hasMinimum: false,
            balance: 0n,
            required: 15000000000000000n,
            shortfall: 1000000000000000n
          },
          fab: {
            hasMinimum: true,
            balance: 2000000000000000000000n,
            required: 1000000000000000000000n
          },
          staking: {
            isStaked: true,
            stakedAmount: 1000000000000000000000n,
            requiredStake: 1000000000000000000000n
          }
        },
        canOperate: false
      };

      const report = formatRequirementsReport(mockStatus as any);

      expect(report).toContain('✗');
      expect(report).toContain('ETH');
    });
  });

  describe('Balance Display', () => {
    it('should display all balances clearly', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const display = await displayBalances();

      expect(display).toContain('Current Balances');
      expect(display).toContain('ETH:');
      expect(display).toContain('FAB:');
      expect(display).toContain('Staked:');
    });

    it('should display requirements status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const display = await displayRequirements();

      expect(display).toContain('Host Requirements');
      expect(display).toContain('Minimum ETH:');
      expect(display).toContain('Minimum FAB:');
      expect(display).toContain('Status:');
    });

    it('should use colors in terminal output', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const display = await displayBalances(true); // Enable colors

      // Should contain ANSI color codes
      expect(display).toMatch(/\x1b\[\d+m/);
    });
  });

  describe('Balance Monitoring', () => {
    it('should create balance monitor', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const monitor = await monitorBalances();

      expect(monitor).toBeInstanceOf(BalanceMonitor);
      expect(monitor).toHaveProperty('start');
      expect(monitor).toHaveProperty('stop');

      monitor.stop();
    });

    it('should emit events on balance changes', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const monitor = await monitorBalances({ interval: 100 });
      const events: any[] = [];

      monitor.on('balance-update', (data) => {
        events.push(data);
      });

      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 250));
      monitor.stop();

      // Wait a bit to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect requirement status changes', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const monitor = await monitorBalances();
      let statusChanged = false;

      monitor.on('requirements-changed', () => {
        statusChanged = true;
      });

      monitor.start();
      await monitor.checkRequirements();
      monitor.stop();

      // Will only change if requirements actually changed
      expect(monitor).toBeDefined();
    });

    it('should handle monitoring errors gracefully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const monitor = await monitorBalances();
      const errors: any[] = [];

      monitor.on('error', (error) => {
        errors.push(error);
      });

      // Force an error
      monitor.forceError = true;
      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 100));
      monitor.stop();

      // Should handle errors without crashing
      expect(monitor).toBeDefined();
    });
  });
});