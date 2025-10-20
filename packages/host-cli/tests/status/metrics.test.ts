// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSessionMetrics,
  calculatePerformance,
  getUptimeMetrics,
  getAverageMetrics,
  SessionMetrics,
  PerformanceMetrics
} from '../../src/monitoring/metrics';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Metrics Calculation', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Session Count Tracking', () => {
    it('should track total session count', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await getSessionMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalSessions');
      expect(metrics).toHaveProperty('successfulSessions');
      expect(metrics).toHaveProperty('failedSessions');
      expect(metrics.totalSessions).toBeGreaterThanOrEqual(0);
    });

    it('should track sessions by model', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await getSessionMetrics();

      expect(metrics).toHaveProperty('byModel');
      expect(typeof metrics.byModel).toBe('object');

      for (const model in metrics.byModel) {
        expect(metrics.byModel[model]).toHaveProperty('count');
        expect(metrics.byModel[model]).toHaveProperty('earnings');
      }
    });

    it('should track sessions by time period', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await getSessionMetrics();

      expect(metrics).toHaveProperty('last24Hours');
      expect(metrics).toHaveProperty('last7Days');
      expect(metrics).toHaveProperty('last30Days');
      expect(metrics.last24Hours).toBeGreaterThanOrEqual(0);
    });

    it('should calculate session success rate', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const metrics = await getSessionMetrics();

      expect(metrics).toHaveProperty('successRate');
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Uptime Calculation', () => {
    it('should calculate uptime metrics', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const uptime = await getUptimeMetrics();

      expect(uptime).toBeDefined();
      expect(uptime).toHaveProperty('startTime');
      expect(uptime).toHaveProperty('totalUptime');
      expect(uptime).toHaveProperty('totalDowntime');
      expect(uptime).toHaveProperty('uptimePercentage');
    });

    it('should track current status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const uptime = await getUptimeMetrics();

      expect(uptime).toHaveProperty('currentStatus');
      expect(['online', 'offline']).toContain(uptime.currentStatus);
      expect(uptime).toHaveProperty('lastStatusChange');
    });

    it('should calculate uptime streaks', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const uptime = await getUptimeMetrics();

      expect(uptime).toHaveProperty('currentStreak');
      expect(uptime).toHaveProperty('longestStreak');
      expect(uptime.currentStreak).toBeGreaterThanOrEqual(0);
      expect(uptime.longestStreak).toBeGreaterThanOrEqual(0);
    });

    it('should track downtime incidents', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const uptime = await getUptimeMetrics();

      expect(uptime).toHaveProperty('downtimeIncidents');
      expect(Array.isArray(uptime.downtimeIncidents)).toBe(true);

      if (uptime.downtimeIncidents.length > 0) {
        expect(uptime.downtimeIncidents[0]).toHaveProperty('start');
        expect(uptime.downtimeIncidents[0]).toHaveProperty('end');
        expect(uptime.downtimeIncidents[0]).toHaveProperty('duration');
      }
    });
  });

  describe('Average Metrics Calculation', () => {
    it('should calculate average session duration', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const averages = await getAverageMetrics();

      expect(averages).toBeDefined();
      expect(averages).toHaveProperty('sessionDuration');
      expect(averages.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average earnings per session', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const averages = await getAverageMetrics();

      expect(averages).toHaveProperty('earningsPerSession');
      expect(typeof averages.earningsPerSession).toBe('bigint');
      expect(averages.earningsPerSession).toBeGreaterThanOrEqual(0n);
    });

    it('should calculate average response time', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const averages = await getAverageMetrics();

      expect(averages).toHaveProperty('responseTime');
      expect(averages.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average tokens per second', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const averages = await getAverageMetrics();

      expect(averages).toHaveProperty('tokensPerSecond');
      expect(averages.tokensPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate performance score', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const performance = await calculatePerformance();

      expect(performance).toBeDefined();
      expect(performance).toHaveProperty('overallScore');
      expect(performance.overallScore).toBeGreaterThanOrEqual(0);
      expect(performance.overallScore).toBeLessThanOrEqual(100);
    });

    it('should calculate reliability score', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const performance = await calculatePerformance();

      expect(performance).toHaveProperty('reliability');
      expect(performance.reliability).toBeGreaterThanOrEqual(0);
      expect(performance.reliability).toBeLessThanOrEqual(100);
    });

    it('should calculate speed score', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const performance = await calculatePerformance();

      expect(performance).toHaveProperty('speed');
      expect(performance.speed).toBeGreaterThanOrEqual(0);
      expect(performance.speed).toBeLessThanOrEqual(100);
    });

    it('should provide performance ranking', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const performance = await calculatePerformance();

      expect(performance).toHaveProperty('ranking');
      expect(performance.ranking).toHaveProperty('position');
      expect(performance.ranking).toHaveProperty('totalHosts');
      expect(performance.ranking).toHaveProperty('percentile');
    });

    it('should identify performance trends', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const performance = await calculatePerformance();

      expect(performance).toHaveProperty('trend');
      expect(['improving', 'stable', 'declining']).toContain(performance.trend);
    });
  });
});