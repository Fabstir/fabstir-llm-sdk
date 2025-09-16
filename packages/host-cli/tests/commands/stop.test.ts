import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stopCommand } from '../../src/commands/stop';
import { PIDManager } from '../../src/daemon/pid';
import { DaemonManager } from '../../src/daemon/manager';
import * as fs from 'fs';

vi.mock('../../src/daemon/pid');
vi.mock('../../src/daemon/manager');

describe('Stop Command', () => {
  let mockPIDManager: any;
  let mockDaemonManager: any;

  beforeEach(() => {
    mockPIDManager = {
      readPID: vi.fn(),
      removePID: vi.fn(),
      isProcessRunning: vi.fn()
    };
    mockDaemonManager = {
      stopDaemon: vi.fn(),
      isDaemonRunning: vi.fn()
    };

    vi.mocked(PIDManager).mockImplementation(() => mockPIDManager);
    vi.mocked(DaemonManager).mockImplementation(() => mockDaemonManager);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stop functionality', () => {
    it('should stop running daemon', async () => {
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(true);
      mockDaemonManager.stopDaemon.mockResolvedValue(undefined);

      await stopCommand.action();

      expect(mockPIDManager.readPID).toHaveBeenCalled();
      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(12345, expect.any(Object));
      expect(mockPIDManager.removePID).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('stopped successfully'));
    });

    it('should handle no PID file', async () => {
      mockPIDManager.readPID.mockReturnValue(null);

      await stopCommand.action();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not running'));
      expect(mockDaemonManager.stopDaemon).not.toHaveBeenCalled();
    });

    it('should handle stale PID file', async () => {
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(false);

      await stopCommand.action();

      expect(mockPIDManager.removePID).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not running'));
      expect(mockDaemonManager.stopDaemon).not.toHaveBeenCalled();
    });

    it('should force kill with --force option', async () => {
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(true);
      mockDaemonManager.stopDaemon.mockResolvedValue(undefined);

      await stopCommand.action({ force: true });

      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ force: true })
      );
    });

    it('should use custom timeout', async () => {
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(true);
      mockDaemonManager.stopDaemon.mockResolvedValue(undefined);

      await stopCommand.action({ timeout: 5000 });

      expect(mockDaemonManager.stopDaemon).toHaveBeenCalledWith(
        12345,
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should handle stop errors', async () => {
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(true);
      mockDaemonManager.stopDaemon.mockRejectedValue(new Error('Permission denied'));

      await stopCommand.action();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to stop'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should use custom PID file path', async () => {
      const customPath = '/custom/path.pid';
      mockPIDManager.readPID.mockReturnValue(12345);
      mockPIDManager.isProcessRunning.mockReturnValue(true);
      mockDaemonManager.stopDaemon.mockResolvedValue(undefined);

      await stopCommand.action({ pidFile: customPath });

      expect(PIDManager).toHaveBeenCalledWith(customPath);
    });
  });
});