import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeStatus, StatusOptions } from '../../src/commands/status';
import { getHostStatus } from '../../src/monitoring/tracker';
import { getEarningsInfo } from '../../src/monitoring/metrics';
import { formatStatusDisplay } from '../../src/monitoring/display';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Status Command', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Command Execution', () => {
    it('should execute status command successfully', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const result = await executeStatus();

      expect(result).toBeDefined();
      expect(result).toHaveProperty('registration');
      expect(result).toHaveProperty('staking');
      expect(result).toHaveProperty('earnings');
      expect(result).toHaveProperty('sessions');
    });

    it('should handle JSON output format', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: StatusOptions = { json: true };
      const result = await executeStatus(options);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(JSON.stringify(result)).toBeDefined();
    });

    it('should handle verbose output', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: StatusOptions = { verbose: true };
      const result = await executeStatus(options);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('detailedMetrics');
      expect(result).toHaveProperty('sessionHistory');
    });

    it('should fail when not authenticated', async () => {
      await expect(executeStatus()).rejects.toThrow('not authenticated');
    });
  });

  describe('Registration Status Display', () => {
    it('should display registration status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('isRegistered');
      expect(status).toHaveProperty('hostAddress');
      expect(status).toHaveProperty('apiUrl');
      expect(status).toHaveProperty('models');
    });

    it('should show registration timestamp', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      if (status.isRegistered) {
        expect(status).toHaveProperty('registrationDate');
        expect(status.registrationDate).toBeInstanceOf(Date);
      }
    });

    it('should display active/inactive status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status).toHaveProperty('isActive');
      expect(typeof status.isActive).toBe('boolean');
    });
  });

  describe('Staking Amount Display', () => {
    it('should display staked FAB amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status).toHaveProperty('staking');
      expect(status.staking).toHaveProperty('amount');
      expect(typeof status.staking.amount).toBe('bigint');

      if (status.isRegistered) {
        expect(status.staking.amount).toBeGreaterThanOrEqual(1000000000000000000000n);
      }
    });

    it('should format staking amount correctly', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();
      const display = formatStatusDisplay(status);

      expect(display).toContain('FAB');
      if (status.isRegistered) {
        expect(display).toMatch(/1,?000/); // 1000 FAB
      }
    });
  });

  describe('Earnings Display', () => {
    it('should display earnings balance', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const earnings = await getEarningsInfo();

      expect(earnings).toBeDefined();
      expect(earnings).toHaveProperty('totalEarned');
      expect(earnings).toHaveProperty('available');
      expect(earnings).toHaveProperty('withdrawn');
    });

    it('should show earnings in both ETH and USD', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const earnings = await getEarningsInfo();

      expect(earnings).toHaveProperty('totalEarnedETH');
      expect(earnings).toHaveProperty('totalEarnedUSD');
      expect(typeof earnings.totalEarnedETH).toBe('bigint');
    });

    it('should display treasury vs host earnings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const earnings = await getEarningsInfo();

      expect(earnings).toHaveProperty('hostEarnings');
      expect(earnings).toHaveProperty('treasuryEarnings');
      expect(earnings.hostEarnings).toHaveProperty('amount');
      expect(earnings.treasuryEarnings).toHaveProperty('amount');
    });
  });

  describe('Session Metrics Display', () => {
    it('should display session count', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status).toHaveProperty('sessions');
      expect(status.sessions).toHaveProperty('total');
      expect(status.sessions).toHaveProperty('successful');
      expect(status.sessions).toHaveProperty('failed');
    });

    it('should show recent session history', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status.sessions).toHaveProperty('recent');
      expect(Array.isArray(status.sessions.recent)).toBe(true);

      if (status.sessions.recent.length > 0) {
        expect(status.sessions.recent[0]).toHaveProperty('timestamp');
        expect(status.sessions.recent[0]).toHaveProperty('jobId');
        expect(status.sessions.recent[0]).toHaveProperty('earnings');
      }
    });

    it('should calculate success rate', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status.sessions).toHaveProperty('successRate');
      expect(status.sessions.successRate).toBeGreaterThanOrEqual(0);
      expect(status.sessions.successRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Uptime Information', () => {
    it('should display uptime information', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      expect(status).toHaveProperty('uptime');
      expect(status.uptime).toHaveProperty('since');
      expect(status.uptime).toHaveProperty('duration');
      expect(status.uptime).toHaveProperty('percentage');
    });

    it('should calculate uptime percentage', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const status = await getHostStatus();

      if (status.isRegistered) {
        expect(status.uptime.percentage).toBeGreaterThanOrEqual(0);
        expect(status.uptime.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('JSON Output Format', () => {
    it('should output valid JSON', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: StatusOptions = { json: true };
      const result = await executeStatus(options);
      const json = JSON.stringify(result);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all fields in JSON', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const options: StatusOptions = { json: true };
      const result = await executeStatus(options);

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('registration');
      expect(result).toHaveProperty('staking');
      expect(result).toHaveProperty('earnings');
      expect(result).toHaveProperty('sessions');
      expect(result).toHaveProperty('uptime');
    });
  });
});