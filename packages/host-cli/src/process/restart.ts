// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Process restart module
 * Handles automatic restart and recovery strategies
 */

import { EventEmitter } from 'events';
import { ProcessHandle, spawnInferenceServer, stopInferenceServer } from './manager';
import { ProcessMonitor } from './monitor';

/**
 * Restart policy types
 */
export type RestartPolicy = 'always' | 'on-failure' | 'never' | 'custom';

/**
 * Restart options
 */
export interface RestartOptions {
  policy: RestartPolicy;
  maxAttempts?: number;
  initialDelay?: number; // milliseconds
  backoffMultiplier?: number;
  maxDelay?: number; // milliseconds
  resetPeriod?: number; // milliseconds - period of stability before resetting counter
  gracefulTimeout?: number; // milliseconds
  shouldRestart?: (exitCode: number) => boolean; // For custom policy
  spawn?: (...args: any[]) => any; // For testing
}

/**
 * Restart statistics
 */
export interface RestartStats {
  restartCount: number;
  lastRestartTime?: Date;
  totalDowntime: number; // milliseconds
  maxAttemptsReached: boolean;
  consecutiveFailures: number;
}

/**
 * Restart history entry
 */
export interface RestartHistoryEntry {
  timestamp: Date;
  exitCode: number;
  reason: string;
  downtime: number; // milliseconds
}

/**
 * Restart manager events
 */
export interface RestartManagerEvents {
  'restarting': (handle: ProcessHandle, attempt: number) => void;
  'restarted': (handle: ProcessHandle) => void;
  'restart-failed': (handle: ProcessHandle, error: Error) => void;
  'max-attempts-reached': (handle: ProcessHandle) => void;
}

/**
 * Restart manager class
 */
export class RestartManager extends EventEmitter {
  private stats: Map<ProcessHandle, RestartStats> = new Map();
  private history: Map<ProcessHandle, RestartHistoryEntry[]> = new Map();
  private monitors: Map<ProcessHandle, ProcessMonitor> = new Map();
  private resetTimers: Map<ProcessHandle, NodeJS.Timeout> = new Map();

  on<K extends keyof RestartManagerEvents>(
    event: K,
    listener: RestartManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof RestartManagerEvents>(
    event: K,
    ...args: Parameters<RestartManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Enable auto-restart for a process
   */
  enableAutoRestart(handle: ProcessHandle, options: RestartOptions): void {
    // Initialize stats
    if (!this.stats.has(handle)) {
      this.stats.set(handle, {
        restartCount: 0,
        totalDowntime: 0,
        maxAttemptsReached: false,
        consecutiveFailures: 0
      });
    }

    // Initialize history
    if (!this.history.has(handle)) {
      this.history.set(handle, []);
    }

    // Setup process exit handler
    handle.process.on('exit', async (code: number | null) => {
      const exitCode = code ?? -1;
      await this.handleProcessExit(handle, exitCode, options);
    });

    // Setup monitoring if not already done
    if (!this.monitors.has(handle)) {
      const monitor = new ProcessMonitor(handle);
      monitor.on('unhealthy', () => {
        // Could trigger restart on unhealthy state if desired
      });
      this.monitors.set(handle, monitor);
    }
  }

  /**
   * Disable auto-restart for a process
   */
  disableAutoRestart(handle: ProcessHandle): void {
    // Stop monitor
    const monitor = this.monitors.get(handle);
    if (monitor) {
      monitor.stop();
      this.monitors.delete(handle);
    }

    // Clear reset timer
    const timer = this.resetTimers.get(handle);
    if (timer) {
      clearTimeout(timer);
      this.resetTimers.delete(handle);
    }

    // Remove handlers (Note: in real implementation, we'd need to store handler references)
    handle.process.removeAllListeners('exit');
  }

  /**
   * Get restart statistics
   */
  getStats(handle: ProcessHandle): RestartStats {
    return this.stats.get(handle) || {
      restartCount: 0,
      totalDowntime: 0,
      maxAttemptsReached: false,
      consecutiveFailures: 0
    };
  }

  /**
   * Get restart history
   */
  getRestartHistory(handle: ProcessHandle): RestartHistoryEntry[] {
    return this.history.get(handle) || [];
  }

  /**
   * Handle process exit
   */
  private async handleProcessExit(
    handle: ProcessHandle,
    exitCode: number,
    options: RestartOptions
  ): Promise<void> {
    const stats = this.stats.get(handle)!;
    const history = this.history.get(handle)!;
    const crashTime = Date.now();

    // Record in history
    history.push({
      timestamp: new Date(),
      exitCode,
      reason: this.getExitReason(exitCode),
      downtime: 0 // Will be updated after restart
    });

    // Check if should restart
    if (!this.shouldRestart(exitCode, options, stats)) {
      return;
    }

    // Check max attempts
    if (options.maxAttempts && stats.restartCount >= options.maxAttempts) {
      stats.maxAttemptsReached = true;
      this.emit('max-attempts-reached', handle);
      return;
    }

    // Calculate delay with exponential backoff
    const delay = this.calculateDelay(stats.restartCount, options);

    // Wait before restarting
    await new Promise(resolve => setTimeout(resolve, delay));

    // Update stats
    stats.restartCount++;
    stats.consecutiveFailures++;
    stats.lastRestartTime = new Date();

    const downtime = Date.now() - crashTime;
    stats.totalDowntime += downtime;

    if (history.length > 0) {
      history[history.length - 1].downtime = downtime;
    }

    // Emit restarting event
    this.emit('restarting', handle, stats.restartCount);

    try {
      // Restart the process
      const newHandle = await this.doRestart(handle, options);

      // Update handle reference
      Object.assign(handle, newHandle);

      // Re-enable auto-restart for new process
      this.enableAutoRestart(handle, options);

      // Setup reset timer
      this.setupResetTimer(handle, options);

      // Emit restarted event
      this.emit('restarted', handle);
    } catch (error: any) {
      this.emit('restart-failed', handle, error);
      throw error;
    }
  }

  /**
   * Check if should restart based on policy
   */
  private shouldRestart(
    exitCode: number,
    options: RestartOptions,
    stats: RestartStats
  ): boolean {
    switch (options.policy) {
      case 'always':
        return true;
      case 'on-failure':
        return exitCode !== 0;
      case 'never':
        return false;
      case 'custom':
        return options.shouldRestart ? options.shouldRestart(exitCode) : false;
      default:
        return false;
    }
  }

  /**
   * Calculate restart delay with exponential backoff
   */
  private calculateDelay(restartCount: number, options: RestartOptions): number {
    const initialDelay = options.initialDelay || 1000;
    const multiplier = options.backoffMultiplier || 1.5;
    const maxDelay = options.maxDelay || 60000;

    const delay = Math.min(
      initialDelay * Math.pow(multiplier, restartCount),
      maxDelay
    );

    return Math.round(delay);
  }

  /**
   * Setup reset timer
   */
  private setupResetTimer(handle: ProcessHandle, options: RestartOptions): void {
    // Clear existing timer
    const existingTimer = this.resetTimers.get(handle);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Setup new timer
    if (options.resetPeriod) {
      const timer = setTimeout(() => {
        const stats = this.stats.get(handle);
        if (stats) {
          stats.restartCount = 0;
          stats.consecutiveFailures = 0;
        }
      }, options.resetPeriod);

      this.resetTimers.set(handle, timer);
    }
  }

  /**
   * Perform the actual restart
   */
  private async doRestart(
    handle: ProcessHandle,
    options: RestartOptions
  ): Promise<ProcessHandle> {
    // Use custom spawn function if provided (for testing)
    if (options.spawn) {
      const newProcess = await options.spawn(
        'fabstir-llm-node',
        this.buildArguments(handle.config),
        {
          env: { ...process.env, ...handle.config.env },
          cwd: handle.config.workingDir
        }
      );

      return {
        ...handle,
        pid: newProcess.pid,
        process: newProcess,
        startTime: new Date(),
        logs: []
      };
    }

    // Normal restart using manager
    return await spawnInferenceServer(handle.config);
  }

  /**
   * Build command arguments
   */
  private buildArguments(config: any): string[] {
    const args: string[] = [];

    args.push('--port', config.port.toString());
    args.push('--host', config.host);

    for (const model of config.models) {
      args.push('--model', model);
    }

    return args;
  }

  /**
   * Get human-readable exit reason
   */
  private getExitReason(exitCode: number): string {
    switch (exitCode) {
      case 0:
        return 'Clean exit';
      case 1:
        return 'General error';
      case 2:
        return 'Misuse of shell command';
      case 126:
        return 'Command cannot execute';
      case 127:
        return 'Command not found';
      case 130:
        return 'Script terminated by Ctrl+C';
      case 137:
        return 'Process killed (SIGKILL)';
      case 143:
        return 'Process terminated (SIGTERM)';
      default:
        return `Exit code ${exitCode}`;
    }
  }
}

/**
 * Global restart manager
 */
let globalRestartManager: RestartManager | null = null;

/**
 * Get or create restart manager
 */
export function getRestartManager(): RestartManager {
  if (!globalRestartManager) {
    globalRestartManager = new RestartManager();
  }
  return globalRestartManager;
}

/**
 * Restart a process
 */
export async function restartProcess(
  handle: ProcessHandle,
  options?: Partial<RestartOptions> & { spawn?: any }
): Promise<ProcessHandle> {
  // Stop the current process
  await stopInferenceServer(handle, false);

  // Wait for graceful shutdown or timeout
  const gracefulTimeout = options?.gracefulTimeout || 5000;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      handle.process.kill('SIGKILL');
      resolve();
    }, gracefulTimeout);

    handle.process.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  // Use custom spawn if provided (for testing)
  if (options?.spawn) {
    const newProcess = await options.spawn(
      'fabstir-llm-node',
      [],
      {}
    );

    return {
      ...handle,
      pid: newProcess.pid,
      process: newProcess,
      startTime: new Date(),
      logs: []
    };
  }

  // Spawn new process with same configuration
  return await spawnInferenceServer(handle.config);
}

/**
 * Enable auto-restart for a process
 */
export function enableAutoRestart(
  handle: ProcessHandle,
  options: Partial<RestartOptions> = {}
): void {
  const manager = getRestartManager();
  const defaultOptions: RestartOptions = {
    policy: 'on-failure',
    maxAttempts: 5,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 60000,
    resetPeriod: 300000, // 5 minutes
    gracefulTimeout: 10000
  };

  manager.enableAutoRestart(handle, { ...defaultOptions, ...options } as RestartOptions);
}

/**
 * Disable auto-restart for a process
 */
export function disableAutoRestart(handle: ProcessHandle): void {
  const manager = getRestartManager();
  manager.disableAutoRestart(handle);
}