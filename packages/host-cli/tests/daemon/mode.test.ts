// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DaemonManager } from '../../src/daemon/manager';
import { spawn, fork } from 'child_process';
import * as path from 'path';

vi.mock('child_process');
vi.mock('fs');

describe('Daemon Mode', () => {
  let manager: DaemonManager;
  let mockSpawn: any;
  let mockFork: any;

  beforeEach(async () => {
    const fs = await import('fs');
    manager = new DaemonManager();
    mockSpawn = vi.mocked(spawn);
    mockFork = vi.mocked(fork);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockReturnValue('12345' as any);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
    vi.mocked(fs.openSync).mockReturnValue(3 as any);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startDaemon', () => {
    it('should start process in daemon mode', async () => {
      const mockChild = {
        unref: vi.fn(),
        disconnect: vi.fn(),
        pid: 12345
      };

      mockSpawn.mockReturnValue(mockChild);

      const pid = await manager.startDaemon({
        command: 'fabstir-host',
        args: ['start'],
        cwd: '/tmp'
      });

      expect(pid).toBe(12345);
      expect(mockSpawn).toHaveBeenCalledWith(
        'fabstir-host',
        ['start'],
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          cwd: '/tmp'
        })
      );
      expect(mockChild.unref).toHaveBeenCalled();
    });

    it('should handle spawn errors', async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(manager.startDaemon({
        command: 'invalid',
        args: []
      })).rejects.toThrow('Failed to start daemon');
    });

    it('should use fork for Node.js scripts', async () => {
      const mockChild = {
        unref: vi.fn(),
        disconnect: vi.fn(),
        pid: 54321
      };

      mockFork.mockReturnValue(mockChild);

      const pid = await manager.startDaemon({
        command: 'node',
        args: ['script.js'],
        useNodeFork: true
      });

      expect(pid).toBe(54321);
      expect(mockFork).toHaveBeenCalledWith(
        'script.js',
        [],
        expect.objectContaining({
          detached: true,
          silent: true
        })
      );
    });
  });

  describe('isDaemonRunning', () => {
    it('should detect running daemon', () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      const isRunning = manager.isDaemonRunning(12345);

      expect(isRunning).toBe(true);
      expect(mockKill).toHaveBeenCalledWith(12345, 0);
    });

    it('should detect stopped daemon', () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockImplementation(() => {
        throw new Error('No such process');
      });

      const isRunning = manager.isDaemonRunning(12345);

      expect(isRunning).toBe(false);
    });
  });

  describe('stopDaemon', () => {
    it('should send SIGTERM to daemon', async () => {
      const mockKill = vi.spyOn(process, 'kill');
      let killCount = 0;

      mockKill.mockImplementation((pid, signal) => {
        if (signal === 0) {
          killCount++;
          if (killCount > 1) {
            throw new Error('Process stopped');
          }
        }
        return true;
      });

      await manager.stopDaemon(12345, { timeout: 200 });

      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
    });

    it('should wait for graceful shutdown', async () => {
      const mockKill = vi.spyOn(process, 'kill');
      let callCount = 0;

      mockKill.mockImplementation((pid, signal) => {
        if (signal === 0) {
          callCount++;
          if (callCount > 2) throw new Error('Process terminated');
          return true;
        }
        return true;
      });

      await manager.stopDaemon(12345, { timeout: 100 });

      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(callCount).toBeGreaterThan(1);
    });

    it('should force kill after timeout', async () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      await manager.stopDaemon(12345, { timeout: 100, force: true });

      expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
      // Should eventually call SIGKILL
      await new Promise(resolve => setTimeout(resolve, 150));
    });
  });

  describe('getDaemonStatus', () => {
    it('should return detailed daemon status', () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      const status = manager.getDaemonStatus(12345);

      expect(status).toEqual({
        pid: 12345,
        running: true,
        uptime: undefined
      });
    });

    it('should include uptime if start time is known', () => {
      const startTime = Date.now() - 60000;
      manager.setStartTime(12345, startTime);

      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      const status = manager.getDaemonStatus(12345);

      expect(status.uptime).toBeGreaterThan(59);
    });
  });

  describe('environment variables', () => {
    it('should pass environment to daemon', async () => {
      const mockChild = { unref: vi.fn(), pid: 12345 };
      mockSpawn.mockReturnValue(mockChild);

      await manager.startDaemon({
        command: 'test',
        args: [],
        env: { NODE_ENV: 'production', PORT: '3000' }
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'test',
        [],
        expect.objectContaining({
          env: expect.objectContaining({
            NODE_ENV: 'production',
            PORT: '3000',
            PATH: process.env.PATH
          })
        })
      );
    });
  });

  describe('working directory', () => {
    it('should set daemon working directory', async () => {
      const mockChild = { unref: vi.fn(), pid: 12345 };
      mockSpawn.mockReturnValue(mockChild);

      await manager.startDaemon({
        command: 'test',
        args: [],
        cwd: '/opt/app'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'test',
        [],
        expect.objectContaining({
          cwd: '/opt/app'
        })
      );
    });
  });

  describe('log redirection', () => {
    it('should redirect logs to files', async () => {
      const mockChild = { unref: vi.fn(), pid: 12345 };
      mockSpawn.mockReturnValue(mockChild);

      const fs = await import('fs');
      vi.mocked(fs.openSync).mockReturnValue(3);

      await manager.startDaemon({
        command: 'test',
        args: [],
        logFile: '/var/log/daemon.log',
        errorFile: '/var/log/daemon.err'
      });

      expect(fs.openSync).toHaveBeenCalledWith('/var/log/daemon.log', 'a');
      expect(fs.openSync).toHaveBeenCalledWith('/var/log/daemon.err', 'a');
    });
  });
});