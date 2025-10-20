// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PIDManager } from '../../src/daemon/pid';
import * as path from 'path';

vi.mock('fs');
vi.mock('os');

describe('PID File Management', () => {
  let pidManager: PIDManager;
  const testPidPath = '/tmp/test.pid';

  beforeEach(async () => {
    const fs = await import('fs');
    const os = await import('os');

    pidManager = new PIDManager(testPidPath);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.readFileSync).mockReturnValue('12345' as any);
    vi.mocked(fs.unlinkSync).mockImplementation(() => {});
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as any);
    vi.mocked(os.homedir).mockReturnValue('/home/user');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writePID', () => {
    it('should write PID to file', async () => {
      const fs = await import('fs');
      pidManager.writePID(12345);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testPidPath,
        '12345',
        'utf8'
      );
    });

    it('should create directory if it does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      pidManager.writePID(12345);

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(testPidPath),
        { recursive: true }
      );
    });

    it('should overwrite existing PID file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      pidManager.writePID(54321);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testPidPath,
        '54321',
        'utf8'
      );
    });
  });

  describe('readPID', () => {
    it('should read PID from file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('12345' as any);

      const pid = pidManager.readPID();

      expect(pid).toBe(12345);
      expect(fs.readFileSync).toHaveBeenCalledWith(testPidPath, 'utf8');
    });

    it('should return null if file does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const pid = pidManager.readPID();

      expect(pid).toBeNull();
    });

    it('should handle invalid PID content', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid' as any);

      const pid = pidManager.readPID();

      expect(pid).toBeNull();
    });
  });

  describe('removePID', () => {
    it('should remove PID file', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      pidManager.removePID();

      expect(fs.unlinkSync).toHaveBeenCalledWith(testPidPath);
    });

    it('should not throw if file does not exist', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => pidManager.removePID()).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('isProcessRunning', () => {
    it('should check if process is running', () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      const running = pidManager.isProcessRunning(12345);

      expect(running).toBe(true);
      expect(mockKill).toHaveBeenCalledWith(12345, 0);
    });

    it('should return false for non-existent process', () => {
      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const running = pidManager.isProcessRunning(99999);

      expect(running).toBe(false);
    });
  });

  describe('lock functionality', () => {
    it('should acquire lock on PID file', async () => {
      const fs = await import('fs');
      const acquired = pidManager.acquireLock(12345);

      expect(acquired).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should fail to acquire lock if already locked', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('54321' as any);

      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockReturnValue(true);

      const acquired = pidManager.acquireLock(12345);

      expect(acquired).toBe(false);
    });

    it('should override stale lock', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('99999' as any);

      const mockKill = vi.spyOn(process, 'kill');
      mockKill.mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const acquired = pidManager.acquireLock(12345);

      expect(acquired).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        testPidPath,
        '12345',
        'utf8'
      );
    });
  });

  describe('default paths', () => {
    it('should use default PID directory', () => {
      const defaultManager = new PIDManager();
      const expectedPath = path.join('/home/user', '.fabstir', 'host.pid');

      expect(defaultManager.getPath()).toBe(expectedPath);
    });
  });
});