import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * PID information with metadata (Sub-phase 3.2)
 */
export interface PIDInfo {
  pid: number;
  publicUrl: string;
  startTime: string;
}

export class PIDManager {
  private pidPath: string;

  constructor(pidPath?: string) {
    this.pidPath = pidPath || path.join(os.homedir(), '.fabstir', 'host.pid');
  }

  writePID(pid: number): void {
    const dir = path.dirname(this.pidPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.pidPath, pid.toString(), 'utf8');
  }

  readPID(): number | null {
    if (!fs.existsSync(this.pidPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.pidPath, 'utf8').trim();
      const pid = parseInt(content, 10);

      if (isNaN(pid)) {
        return null;
      }

      return pid;
    } catch {
      return null;
    }
  }

  removePID(): void {
    if (fs.existsSync(this.pidPath)) {
      fs.unlinkSync(this.pidPath);
    }
  }

  isProcessRunning(pid: number): boolean {
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  acquireLock(pid: number): boolean {
    // Check if PID file exists and has a running process
    const existingPID = this.readPID();

    if (existingPID !== null) {
      // Check if the process is still running
      if (this.isProcessRunning(existingPID)) {
        // Lock is held by running process
        return false;
      }

      // Stale lock, can override
      this.removePID();
    }

    // Acquire the lock
    this.writePID(pid);
    return true;
  }

  getPath(): string {
    return this.pidPath;
  }

  /**
   * Save PID with metadata (Sub-phase 3.2)
   */
  savePIDWithUrl(pid: number, publicUrl: string): void {
    const dir = path.dirname(this.pidPath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const info: PIDInfo = {
      pid,
      publicUrl,
      startTime: new Date().toISOString(),
    };

    fs.writeFileSync(this.pidPath, JSON.stringify(info, null, 2), 'utf8');
  }

  /**
   * Get PID info with validation (Sub-phase 3.2)
   */
  getPIDInfo(): PIDInfo | null {
    if (!fs.existsSync(this.pidPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.pidPath, 'utf8');
      const info: PIDInfo = JSON.parse(content);

      // Validate process is still running
      if (!this.isProcessRunning(info.pid)) {
        return null; // Stale PID
      }

      return info;
    } catch {
      return null;
    }
  }

  /**
   * Remove stale PID files (Sub-phase 3.2)
   */
  cleanupStalePID(): boolean {
    const info = this.getPIDInfo();
    if (!info) {
      this.removePID();
      return true;
    }
    return false;
  }
}