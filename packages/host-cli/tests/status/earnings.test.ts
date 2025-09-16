import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEarningsBalance,
  getEarningsHistory,
  calculateProfitability,
  getTreasuryEarnings,
  getHostEarnings,
  EarningsInfo
} from '../../src/monitoring/metrics';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Earnings Tracking', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Earnings Balance', () => {
    it('should fetch current earnings balance', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const balance = await getEarningsBalance();

      expect(balance).toBeDefined();
      expect(balance).toHaveProperty('total');
      expect(balance).toHaveProperty('available');
      expect(balance).toHaveProperty('pending');
      expect(typeof balance.total).toBe('bigint');
    });

    it('should track withdrawn amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const balance = await getEarningsBalance();

      expect(balance).toHaveProperty('withdrawn');
      expect(typeof balance.withdrawn).toBe('bigint');
      expect(balance.withdrawn).toBeGreaterThanOrEqual(0n);
    });

    it('should calculate net earnings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const balance = await getEarningsBalance();
      const net = balance.total - balance.withdrawn;

      expect(net).toBeGreaterThanOrEqual(0n);
      expect(net).toBe(balance.available + balance.pending);
    });
  });

  describe('Treasury vs Host Earnings', () => {
    it('should fetch treasury earnings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const treasury = await getTreasuryEarnings();

      expect(treasury).toBeDefined();
      expect(treasury).toHaveProperty('balance');
      expect(treasury).toHaveProperty('percentage');
      expect(treasury).toHaveProperty('totalReceived');
    });

    it('should fetch host earnings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const host = await getHostEarnings();

      expect(host).toBeDefined();
      expect(host).toHaveProperty('balance');
      expect(host).toHaveProperty('percentage');
      expect(host).toHaveProperty('totalReceived');
    });

    it('should calculate correct split percentages', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const treasury = await getTreasuryEarnings();
      const host = await getHostEarnings();

      // Treasury gets 10%, host gets 90%
      expect(treasury.percentage).toBe(10);
      expect(host.percentage).toBe(90);
    });

    it('should verify total equals treasury + host', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const treasury = await getTreasuryEarnings();
      const host = await getHostEarnings();
      const balance = await getEarningsBalance();

      const total = treasury.totalReceived + host.totalReceived;
      expect(total).toBeLessThanOrEqual(balance.total);
    });
  });

  describe('Earnings History', () => {
    it('should track earnings history', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const history = await getEarningsHistory();

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);

      if (history.length > 0) {
        expect(history[0]).toHaveProperty('timestamp');
        expect(history[0]).toHaveProperty('amount');
        expect(history[0]).toHaveProperty('jobId');
        expect(history[0]).toHaveProperty('type');
      }
    });

    it('should filter history by date range', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const history = await getEarningsHistory({ since: weekAgo });

      for (const entry of history) {
        expect(entry.timestamp).toBeInstanceOf(Date);
        expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(weekAgo.getTime());
      }
    });

    it('should sort history by timestamp', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const history = await getEarningsHistory();

      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp.getTime()).toBeLessThanOrEqual(
          history[i - 1].timestamp.getTime()
        );
      }
    });
  });

  describe('Profitability Metrics', () => {
    it('should calculate profitability metrics', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await calculateProfitability();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalRevenue');
      expect(metrics).toHaveProperty('totalCosts');
      expect(metrics).toHaveProperty('netProfit');
      expect(metrics).toHaveProperty('profitMargin');
    });

    it('should calculate daily earnings average', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await calculateProfitability();

      expect(metrics).toHaveProperty('dailyAverage');
      expect(typeof metrics.dailyAverage).toBe('bigint');
      expect(metrics.dailyAverage).toBeGreaterThanOrEqual(0n);
    });

    it('should calculate hourly earnings rate', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await calculateProfitability();

      expect(metrics).toHaveProperty('hourlyRate');
      expect(typeof metrics.hourlyRate).toBe('bigint');
      expect(metrics.hourlyRate).toBeGreaterThanOrEqual(0n);
    });

    it('should calculate ROI on stake', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await calculateProfitability();

      expect(metrics).toHaveProperty('stakingROI');
      expect(metrics.stakingROI).toHaveProperty('percentage');
      expect(metrics.stakingROI).toHaveProperty('daysToBreakeven');
    });

    it('should project future earnings', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await calculateProfitability();

      expect(metrics).toHaveProperty('projections');
      expect(metrics.projections).toHaveProperty('nextWeek');
      expect(metrics.projections).toHaveProperty('nextMonth');
      expect(metrics.projections).toHaveProperty('nextYear');
    });
  });
});