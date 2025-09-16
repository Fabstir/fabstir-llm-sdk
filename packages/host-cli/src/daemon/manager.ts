import { spawn, fork, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DaemonConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  useNodeFork?: boolean;
  logFile?: string;
  errorFile?: string;
}

export interface DaemonStatus {
  pid: number;
  running: boolean;
  uptime?: number;
}

export interface StopOptions {
  timeout?: number;
  force?: boolean;
}

export class DaemonManager {
  private startTimes: Map<number, number> = new Map();

  async startDaemon(config: DaemonConfig): Promise<number> {
    try {
      let child: ChildProcess;

      const env = {
        ...process.env,
        ...config.env
      };

      const options: any = {
        detached: true,
        stdio: 'ignore',
        cwd: config.cwd,
        env
      };

      // Handle log file redirection
      if (config.logFile || config.errorFile) {
        const stdoutFd = config.logFile ? fs.openSync(config.logFile, 'a') : 'ignore';
        const stderrFd = config.errorFile ? fs.openSync(config.errorFile, 'a') : 'ignore';
        options.stdio = ['ignore', stdoutFd, stderrFd];
      }

      if (config.useNodeFork) {
        // For Node.js scripts, use fork
        const scriptPath = config.args?.[0] || config.command;
        const args = config.args?.slice(1) || [];

        options.silent = true;
        child = fork(scriptPath, args, options);
      } else {
        // For binary executables, use spawn
        child = spawn(config.command, config.args || [], options);
      }

      // Detach from parent process
      child.unref();

      if (child.pid) {
        this.startTimes.set(child.pid, Date.now());
        return child.pid;
      }

      throw new Error('Failed to get process PID');
    } catch (error: any) {
      throw new Error(`Failed to start daemon: ${error.message}`);
    }
  }

  isDaemonRunning(pid: number): boolean {
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async stopDaemon(pid: number, options: StopOptions = {}): Promise<void> {
    const { timeout = 10000, force = false } = options;

    try {
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');

      // Wait for process to stop
      const startTime = Date.now();
      while (this.isDaemonRunning(pid)) {
        if (Date.now() - startTime > timeout) {
          if (force) {
            // Force kill if timeout exceeded
            process.kill(pid, 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 100));
            break;
          }
          throw new Error('Timeout waiting for daemon to stop');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Clean up start time
      this.startTimes.delete(pid);
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // Process already stopped
        this.startTimes.delete(pid);
        return;
      }
      throw error;
    }
  }

  getDaemonStatus(pid: number): DaemonStatus {
    const running = this.isDaemonRunning(pid);
    const startTime = this.startTimes.get(pid);

    const status: DaemonStatus = {
      pid,
      running
    };

    if (running && startTime) {
      status.uptime = Math.floor((Date.now() - startTime) / 1000);
    }

    return status;
  }

  setStartTime(pid: number, time: number): void {
    this.startTimes.set(pid, time);
  }
}