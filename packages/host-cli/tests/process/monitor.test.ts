// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  monitorProcess,
  checkProcessHealth,
  getProcessMetrics,
  ProcessMonitor,
  HealthStatus,
  ProcessMetrics
} from '../../src/process/monitor';
import { ProcessHandle } from '../../src/process/manager';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Process Monitoring', () => {
  let mockHandle: ProcessHandle;

  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();

    // Create mock process handle
    mockHandle = {
      pid: 12345,
      process: {
        pid: 12345,
        kill: vi.fn(),
        on: vi.fn()
      } as any,
      config: {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b']
      },
      status: 'running',
      startTime: new Date(),
      logs: []
    };
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Health Checking', () => {
    it('should check process health status', async () => {
      const health = await checkProcessHealth(mockHandle);

      expect(health).toBeDefined();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('memoryUsage');
      expect(health).toHaveProperty('cpuUsage');
    });

    it('should detect healthy process', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'healthy' })
      });
      global.fetch = mockFetch as any;

      const health = await checkProcessHealth(mockHandle);

      expect(health.status).toBe('healthy');
      expect(health.isResponding).toBe(true);

      mockFetch.mockRestore();
    });

    it('should detect unhealthy process', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      global.fetch = mockFetch as any;

      const health = await checkProcessHealth(mockHandle);

      expect(health.status).toBe('unhealthy');
      expect(health.isResponding).toBe(false);

      mockFetch.mockRestore();
    });

    it('should calculate process uptime', async () => {
      // Set start time to 1 hour ago
      mockHandle.startTime = new Date(Date.now() - 3600000);

      const health = await checkProcessHealth(mockHandle);

      expect(health.uptime).toBeGreaterThanOrEqual(3600);
      expect(health.uptime).toBeLessThanOrEqual(3601);
    });

    it('should detect process not running', async () => {
      mockHandle.status = 'stopped';

      const health = await checkProcessHealth(mockHandle);

      expect(health.status).toBe('stopped');
      expect(health.isResponding).toBe(false);
    });
  });

  describe('Process Metrics', () => {
    it('should collect process metrics', async () => {
      const metrics = await getProcessMetrics(mockHandle.pid);

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('threads');
      expect(metrics).toHaveProperty('handles');
    });

    it('should track CPU usage', async () => {
      const metrics = await getProcessMetrics(mockHandle.pid);

      expect(typeof metrics.cpu).toBe('number');
      expect(metrics.cpu).toBeGreaterThanOrEqual(0);
      expect(metrics.cpu).toBeLessThanOrEqual(100);
    });

    it('should track memory usage', async () => {
      const metrics = await getProcessMetrics(mockHandle.pid);

      expect(metrics.memory).toHaveProperty('rss');
      expect(metrics.memory).toHaveProperty('heapTotal');
      expect(metrics.memory).toHaveProperty('heapUsed');
      expect(metrics.memory.rss).toBeGreaterThan(0);
    });

    it('should handle metrics for non-existent process', async () => {
      const metrics = await getProcessMetrics(999999);

      expect(metrics).toBeDefined();
      expect(metrics.cpu).toBe(0);
      expect(metrics.memory.rss).toBe(0);
    });

    it('should calculate memory percentage', async () => {
      const metrics = await getProcessMetrics(mockHandle.pid);

      if (metrics.memory.rss > 0) {
        const totalMemory = require('os').totalmem();
        const memoryPercentage = (metrics.memory.rss / totalMemory) * 100;

        expect(memoryPercentage).toBeGreaterThan(0);
        expect(memoryPercentage).toBeLessThan(100);
      }
    });
  });

  describe('Continuous Monitoring', () => {
    it('should start monitoring process', async () => {
      const monitor = new ProcessMonitor(mockHandle);

      expect(monitor).toBeDefined();
      expect(monitor.isMonitoring).toBe(false);

      monitor.start();
      expect(monitor.isMonitoring).toBe(true);

      monitor.stop();
      expect(monitor.isMonitoring).toBe(false);
    });

    it('should emit health events', async () => {
      const monitor = new ProcessMonitor(mockHandle);
      const healthCallback = vi.fn();

      monitor.on('health', healthCallback);
      monitor.start();

      // Wait for first health check
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(healthCallback).toHaveBeenCalled();

      monitor.stop();
    });

    it('should emit unhealthy events', async () => {
      const monitor = new ProcessMonitor(mockHandle);
      const unhealthyCallback = vi.fn();

      // Mock unhealthy response
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      global.fetch = mockFetch as any;

      monitor.on('unhealthy', unhealthyCallback);
      monitor.start();

      // Wait for health check
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(unhealthyCallback).toHaveBeenCalled();

      monitor.stop();
      mockFetch.mockRestore();
    });

    it('should configurable monitoring interval', async () => {
      const monitor = new ProcessMonitor(mockHandle, { interval: 500 });
      const healthCallback = vi.fn();

      monitor.on('health', healthCallback);
      monitor.start();

      // Wait for multiple intervals
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(healthCallback).toHaveBeenCalledTimes(2);

      monitor.stop();
    });

    it('should stop monitoring on process exit', async () => {
      const monitor = new ProcessMonitor(mockHandle);

      monitor.start();
      expect(monitor.isMonitoring).toBe(true);

      // Simulate process exit
      mockHandle.status = 'stopped';
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        exitCallback(0);
      }

      expect(monitor.isMonitoring).toBe(false);
    });
  });

  describe('Resource Monitoring', () => {
    it('should monitor port availability', async () => {
      const isAvailable = await checkPortAvailable(8080);
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should monitor disk usage', async () => {
      const diskUsage = await getDiskUsage('/tmp');

      expect(diskUsage).toHaveProperty('total');
      expect(diskUsage).toHaveProperty('used');
      expect(diskUsage).toHaveProperty('available');
      expect(diskUsage).toHaveProperty('percentage');
    });

    it('should monitor system load', async () => {
      const load = await getSystemLoad();

      expect(load).toHaveProperty('load1');
      expect(load).toHaveProperty('load5');
      expect(load).toHaveProperty('load15');
      expect(load.load1).toBeGreaterThanOrEqual(0);
    });

    it('should detect resource constraints', async () => {
      const constraints = await checkResourceConstraints();

      expect(constraints).toHaveProperty('hasEnoughMemory');
      expect(constraints).toHaveProperty('hasEnoughDisk');
      expect(constraints).toHaveProperty('cpuNotOverloaded');
    });
  });

  describe('Alert Thresholds', () => {
    it('should trigger high memory alert', async () => {
      const monitor = new ProcessMonitor(mockHandle, {
        thresholds: {
          memory: 80 // 80% threshold
        }
      });

      const alertCallback = vi.fn();
      monitor.on('alert', alertCallback);

      // Mock high memory usage
      vi.spyOn(monitor as any, 'getProcessMetrics').mockResolvedValue({
        memory: { percentage: 85 }
      });

      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(alertCallback).toHaveBeenCalledWith({
        type: 'memory',
        threshold: 80,
        value: 85
      });

      monitor.stop();
    });

    it('should trigger high CPU alert', async () => {
      const monitor = new ProcessMonitor(mockHandle, {
        thresholds: {
          cpu: 90 // 90% threshold
        }
      });

      const alertCallback = vi.fn();
      monitor.on('alert', alertCallback);

      // Mock high CPU usage
      vi.spyOn(monitor as any, 'getProcessMetrics').mockResolvedValue({
        cpu: 95
      });

      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(alertCallback).toHaveBeenCalledWith({
        type: 'cpu',
        threshold: 90,
        value: 95
      });

      monitor.stop();
    });

    it('should trigger unresponsive alert', async () => {
      const monitor = new ProcessMonitor(mockHandle, {
        thresholds: {
          unresponsiveTimeout: 5000 // 5 seconds
        }
      });

      const alertCallback = vi.fn();
      monitor.on('alert', alertCallback);

      // Mock unresponsive
      const mockFetch = vi.fn().mockRejectedValue(new Error('Timeout'));
      global.fetch = mockFetch as any;

      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(alertCallback).toHaveBeenCalledWith({
        type: 'unresponsive',
        message: expect.stringContaining('not responding')
      });

      monitor.stop();
      mockFetch.mockRestore();
    });
  });
});

// Helper functions that would be in the implementation
async function checkPortAvailable(port: number): Promise<boolean> {
  const net = require('net');
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function getDiskUsage(path: string): Promise<any> {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec(`df -k "${path}"`, (error: any, stdout: string) => {
      if (error) {
        resolve({ total: 0, used: 0, available: 0, percentage: 0 });
      } else {
        const lines = stdout.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].split(/\s+/);
          const total = parseInt(parts[1]) * 1024;
          const used = parseInt(parts[2]) * 1024;
          const available = parseInt(parts[3]) * 1024;
          const percentage = parseInt(parts[4]);
          resolve({ total, used, available, percentage });
        } else {
          resolve({ total: 0, used: 0, available: 0, percentage: 0 });
        }
      }
    });
  });
}

async function getSystemLoad(): Promise<any> {
  const os = require('os');
  const loads = os.loadavg();
  return {
    load1: loads[0],
    load5: loads[1],
    load15: loads[2]
  };
}

async function checkResourceConstraints(): Promise<any> {
  const os = require('os');
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const memoryPercentage = ((totalMemory - freeMemory) / totalMemory) * 100;

  const diskUsage = await getDiskUsage('/');
  const load = await getSystemLoad();

  return {
    hasEnoughMemory: memoryPercentage < 90,
    hasEnoughDisk: diskUsage.percentage < 95,
    cpuNotOverloaded: load.load1 < os.cpus().length * 2
  };
}