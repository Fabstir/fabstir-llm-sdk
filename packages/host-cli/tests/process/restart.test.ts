// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RestartManager,
  restartProcess,
  enableAutoRestart,
  RestartPolicy,
  RestartStats
} from '../../src/process/restart';
import { ProcessHandle } from '../../src/process/manager';
import { initializeSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Process Restart', () => {
  let mockHandle: ProcessHandle;

  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();

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

  describe('Manual Restart', () => {
    it('should restart process gracefully', async () => {
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 67890,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      const newHandle = await restartProcess(mockHandle, { spawn: mockSpawn });

      expect(mockHandle.process.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockSpawn).toHaveBeenCalled();
      expect(newHandle.pid).toBe(67890);
      expect(newHandle.config).toEqual(mockHandle.config);
    });

    it('should force kill if graceful shutdown fails', async () => {
      // Mock process that doesn't respond to SIGTERM
      mockHandle.process.kill = vi.fn().mockImplementation((signal: string) => {
        if (signal === 'SIGTERM') {
          // Don't trigger exit event
          return true;
        }
        if (signal === 'SIGKILL') {
          // Trigger exit after SIGKILL
          const exitCallback = mockHandle.process.on.mock.calls.find(
            call => call[0] === 'exit'
          )?.[1];
          if (exitCallback) setTimeout(() => exitCallback(137), 10);
          return true;
        }
      });

      const mockSpawn = vi.fn().mockReturnValue({
        pid: 99999,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      const newHandle = await restartProcess(mockHandle, {
        spawn: mockSpawn,
        gracefulTimeout: 100
      });

      expect(mockHandle.process.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockHandle.process.kill).toHaveBeenCalledWith('SIGKILL');
      expect(newHandle.pid).toBe(99999);
    });

    it('should preserve configuration on restart', async () => {
      const originalConfig = {
        port: 8081,
        host: '0.0.0.0',
        models: ['gpt-3.5-turbo'],
        env: { CUDA_VISIBLE_DEVICES: '0' }
      };
      mockHandle.config = originalConfig;

      const mockSpawn = vi.fn().mockReturnValue({
        pid: 11111,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      const newHandle = await restartProcess(mockHandle, { spawn: mockSpawn });

      expect(newHandle.config).toEqual(originalConfig);
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['--port', '8081']),
        expect.objectContaining({
          env: expect.objectContaining({ CUDA_VISIBLE_DEVICES: '0' })
        })
      );
    });

    it('should handle restart failure', async () => {
      const mockSpawn = vi.fn().mockImplementation(() => {
        throw new Error('Failed to spawn process');
      });

      await expect(restartProcess(mockHandle, { spawn: mockSpawn }))
        .rejects.toThrow('Failed to spawn process');

      expect(mockHandle.process.kill).toHaveBeenCalled();
    });
  });

  describe('Auto-Restart', () => {
    it('should enable auto-restart on crash', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 22222,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        spawn: mockSpawn
      });

      // Simulate process crash
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(1); // Exit code 1 indicates failure
      }

      expect(mockSpawn).toHaveBeenCalled();
      expect(restartManager.getStats(mockHandle).restartCount).toBe(1);
    });

    it('should respect max restart attempts', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 33333,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event: string, callback: any) => {
          if (event === 'exit') {
            // Immediately crash new process
            setTimeout(() => callback(1), 10);
          }
        }),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        maxAttempts: 3,
        spawn: mockSpawn
      });

      // Simulate multiple crashes
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      for (let i = 0; i < 5; i++) {
        if (exitCallback) {
          await exitCallback(1);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      expect(mockSpawn).toHaveBeenCalledTimes(3); // Max attempts
      expect(restartManager.getStats(mockHandle).restartCount).toBe(3);
      expect(restartManager.getStats(mockHandle).maxAttemptsReached).toBe(true);
    });

    it('should implement exponential backoff', async () => {
      const restartManager = new RestartManager();
      const spawnTimes: number[] = [];
      const mockSpawn = vi.fn().mockImplementation(() => {
        spawnTimes.push(Date.now());
        return {
          pid: 44444,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event: string, callback: any) => {
            if (event === 'exit') {
              setTimeout(() => callback(1), 10);
            }
          }),
          kill: vi.fn()
        };
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelay: 100,
        spawn: mockSpawn
      });

      // Trigger crashes
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      for (let i = 0; i < 3; i++) {
        if (exitCallback) {
          await exitCallback(1);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      expect(spawnTimes.length).toBe(3);

      // Check exponential delays (100ms, 200ms, 400ms)
      if (spawnTimes.length >= 2) {
        const delay1 = spawnTimes[1] - spawnTimes[0];
        expect(delay1).toBeGreaterThanOrEqual(90); // Allow some margin
        expect(delay1).toBeLessThanOrEqual(150);
      }
    });

    it('should not restart on clean exit', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn();

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        spawn: mockSpawn
      });

      // Simulate clean exit
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(0); // Exit code 0 indicates success
      }

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(restartManager.getStats(mockHandle).restartCount).toBe(0);
    });

    it('should reset restart count after stable period', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 55555,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        resetPeriod: 100, // Reset after 100ms of stability
        spawn: mockSpawn
      });

      // First crash and restart
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(1);
      }

      expect(restartManager.getStats(mockHandle).restartCount).toBe(1);

      // Wait for reset period
      await new Promise(resolve => setTimeout(resolve, 150));

      // Check if restart count was reset
      const stats = restartManager.getStats(mockHandle);
      expect(stats.restartCount).toBe(0);
    });
  });

  describe('Restart Policies', () => {
    it('should support always restart policy', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 66666,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'always',
        spawn: mockSpawn
      });

      // Simulate clean exit
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(0); // Clean exit
      }

      expect(mockSpawn).toHaveBeenCalled(); // Should restart even on clean exit
    });

    it('should support never restart policy', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn();

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'never',
        spawn: mockSpawn
      });

      // Simulate crash
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(1); // Crash
      }

      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should support custom restart condition', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 77777,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'custom',
        shouldRestart: (exitCode: number) => exitCode === 42,
        spawn: mockSpawn
      });

      // Test with exit code 42 (should restart)
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(42);
      }

      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Test with exit code 1 (should not restart)
      mockSpawn.mockClear();
      if (exitCallback) {
        await exitCallback(1);
      }

      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('Restart Statistics', () => {
    it('should track restart statistics', () => {
      const restartManager = new RestartManager();

      const stats = restartManager.getStats(mockHandle);

      expect(stats).toHaveProperty('restartCount');
      expect(stats).toHaveProperty('lastRestartTime');
      expect(stats).toHaveProperty('totalDowntime');
      expect(stats).toHaveProperty('maxAttemptsReached');
      expect(stats.restartCount).toBe(0);
    });

    it('should track downtime between restarts', async () => {
      const restartManager = new RestartManager();
      const downtime = 200; // ms

      const mockSpawn = vi.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              pid: 88888,
              stdout: { on: vi.fn() },
              stderr: { on: vi.fn() },
              on: vi.fn(),
              kill: vi.fn()
            });
          }, downtime);
        });
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        spawn: mockSpawn
      });

      // Trigger restart
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      if (exitCallback) {
        await exitCallback(1);
        await new Promise(resolve => setTimeout(resolve, downtime + 50));
      }

      const stats = restartManager.getStats(mockHandle);
      expect(stats.totalDowntime).toBeGreaterThanOrEqual(downtime);
    });

    it('should track restart history', async () => {
      const restartManager = new RestartManager();
      const mockSpawn = vi.fn().mockReturnValue({
        pid: 99999,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      });

      restartManager.enableAutoRestart(mockHandle, {
        policy: 'on-failure',
        maxAttempts: 5,
        spawn: mockSpawn
      });

      // Trigger multiple restarts
      const exitCallback = mockHandle.process.on.mock.calls.find(
        call => call[0] === 'exit'
      )?.[1];

      for (let i = 0; i < 3; i++) {
        if (exitCallback) {
          await exitCallback(1);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      const history = restartManager.getRestartHistory(mockHandle);
      expect(history).toHaveLength(3);
      expect(history[0]).toHaveProperty('timestamp');
      expect(history[0]).toHaveProperty('exitCode');
      expect(history[0]).toHaveProperty('reason');
    });
  });
});