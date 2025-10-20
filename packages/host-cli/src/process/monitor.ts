// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Process monitoring module
 * Monitors health and performance of running processes
 */

import { EventEmitter } from 'events';
import { ProcessHandle } from './manager';
import * as os from 'os';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Health status
 */
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'stopped' | 'unknown';
  isResponding: boolean;
  uptime: number; // seconds
  memoryUsage: number; // bytes
  cpuUsage: number; // percentage
  lastCheck: Date;
  error?: string;
}

/**
 * Process metrics
 */
export interface ProcessMetrics {
  cpu: number; // percentage
  memory: {
    rss: number; // resident set size
    heapTotal: number;
    heapUsed: number;
    percentage?: number;
  };
  threads: number;
  handles: number;
}

/**
 * Monitor options
 */
export interface MonitorOptions {
  interval?: number; // milliseconds
  thresholds?: {
    cpu?: number; // percentage
    memory?: number; // percentage
    unresponsiveTimeout?: number; // milliseconds
  };
}

/**
 * Alert event
 */
export interface AlertEvent {
  type: 'cpu' | 'memory' | 'unresponsive';
  threshold?: number;
  value?: number;
  message?: string;
}

/**
 * Process monitor events
 */
export interface ProcessMonitorEvents {
  'health': (status: HealthStatus) => void;
  'unhealthy': (status: HealthStatus) => void;
  'alert': (alert: AlertEvent) => void;
  'error': (error: Error) => void;
}

/**
 * Process monitor class
 */
export class ProcessMonitor extends EventEmitter {
  private handle: ProcessHandle;
  private options: MonitorOptions;
  private interval?: NodeJS.Timeout;
  public isMonitoring: boolean = false;
  private lastHealthStatus?: HealthStatus;

  constructor(handle: ProcessHandle, options: MonitorOptions = {}) {
    super();
    this.handle = handle;
    this.options = {
      interval: options.interval || 5000,
      thresholds: {
        cpu: options.thresholds?.cpu || 90,
        memory: options.thresholds?.memory || 85,
        unresponsiveTimeout: options.thresholds?.unresponsiveTimeout || 10000
      }
    };
  }

  on<K extends keyof ProcessMonitorEvents>(
    event: K,
    listener: ProcessMonitorEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ProcessMonitorEvents>(
    event: K,
    ...args: Parameters<ProcessMonitorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;

    // Setup process exit handler
    this.handle.process.on('exit', () => {
      this.stop();
    });

    // Start monitoring loop
    this.interval = setInterval(async () => {
      try {
        const health = await checkProcessHealth(this.handle);

        // Check thresholds
        this.checkThresholds(health);

        // Emit health status
        this.emit('health', health);

        // Check if unhealthy
        if (health.status === 'unhealthy' && this.lastHealthStatus?.status !== 'unhealthy') {
          this.emit('unhealthy', health);
        }

        this.lastHealthStatus = health;
      } catch (error: any) {
        this.emit('error', error);
      }
    }, this.options.interval);

    // Initial check
    this.checkHealth();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  /**
   * Check health immediately
   */
  async checkHealth(): Promise<HealthStatus> {
    const health = await checkProcessHealth(this.handle);
    this.checkThresholds(health);
    return health;
  }

  /**
   * Check thresholds and emit alerts
   */
  private checkThresholds(health: HealthStatus): void {
    const thresholds = this.options.thresholds!;

    // Check CPU threshold
    if (health.cpuUsage > thresholds.cpu!) {
      this.emit('alert', {
        type: 'cpu',
        threshold: thresholds.cpu,
        value: health.cpuUsage
      });
    }

    // Check memory threshold
    const memoryPercentage = (health.memoryUsage / os.totalmem()) * 100;
    if (memoryPercentage > thresholds.memory!) {
      this.emit('alert', {
        type: 'memory',
        threshold: thresholds.memory,
        value: memoryPercentage
      });
    }

    // Check if unresponsive
    if (!health.isResponding) {
      this.emit('alert', {
        type: 'unresponsive',
        message: 'Process is not responding'
      });
    }
  }

  /**
   * Get process metrics (internal use)
   */
  private async getProcessMetrics(): Promise<any> {
    return await getProcessMetrics(this.handle.pid);
  }
}

/**
 * Check process health
 */
export async function checkProcessHealth(handle: ProcessHandle): Promise<HealthStatus> {
  // Check if process is running
  if (handle.status === 'stopped' || handle.status === 'crashed') {
    return {
      status: 'stopped',
      isResponding: false,
      uptime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      lastCheck: new Date()
    };
  }

  // Calculate uptime
  const uptime = Math.floor((Date.now() - handle.startTime.getTime()) / 1000);

  // Get process metrics
  const metrics = await getProcessMetrics(handle.pid);

  // Check if service is responding
  let isResponding = false;
  try {
    const response = await Promise.race([
      fetch(`http://${handle.config.host}:${handle.config.port}/health`),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);
    isResponding = response.ok;
  } catch {
    isResponding = false;
  }

  return {
    status: isResponding ? 'healthy' : 'unhealthy',
    isResponding,
    uptime,
    memoryUsage: metrics.memory.rss,
    cpuUsage: metrics.cpu,
    lastCheck: new Date()
  };
}

/**
 * Get process metrics
 */
export async function getProcessMetrics(pid: number): Promise<ProcessMetrics> {
  try {
    // Try to get metrics using ps command
    const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,rss,nlwp`);
    const lines = stdout.trim().split('\n');

    if (lines.length < 2) {
      // Process not found
      return {
        cpu: 0,
        memory: { rss: 0, heapTotal: 0, heapUsed: 0 },
        threads: 0,
        handles: 0
      };
    }

    const parts = lines[1].trim().split(/\s+/);
    const cpu = parseFloat(parts[0]) || 0;
    const rss = parseInt(parts[1]) * 1024 || 0; // Convert KB to bytes
    const threads = parseInt(parts[2]) || 1;

    // Get Node.js process memory if available
    let heapTotal = 0;
    let heapUsed = 0;

    if (process.pid === pid) {
      const memUsage = process.memoryUsage();
      heapTotal = memUsage.heapTotal;
      heapUsed = memUsage.heapUsed;
    }

    return {
      cpu,
      memory: {
        rss,
        heapTotal,
        heapUsed,
        percentage: (rss / os.totalmem()) * 100
      },
      threads,
      handles: 0 // Would need platform-specific code to get handle count
    };
  } catch (error) {
    // Process likely doesn't exist
    return {
      cpu: 0,
      memory: { rss: 0, heapTotal: 0, heapUsed: 0, percentage: 0 },
      threads: 0,
      handles: 0
    };
  }
}

/**
 * Check if port is available
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Get disk usage
 */
export async function getDiskUsage(path: string): Promise<{
  total: number;
  used: number;
  available: number;
  percentage: number;
}> {
  try {
    const { stdout } = await execAsync(`df -k "${path}"`);
    const lines = stdout.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('Unable to get disk usage');
    }

    const parts = lines[1].split(/\s+/);
    const total = parseInt(parts[1]) * 1024;
    const used = parseInt(parts[2]) * 1024;
    const available = parseInt(parts[3]) * 1024;
    const percentage = parseInt(parts[4]);

    return { total, used, available, percentage };
  } catch {
    return { total: 0, used: 0, available: 0, percentage: 0 };
  }
}

/**
 * Get system load average
 */
export async function getSystemLoad(): Promise<{
  load1: number;
  load5: number;
  load15: number;
}> {
  const loads = os.loadavg();
  return {
    load1: loads[0],
    load5: loads[1],
    load15: loads[2]
  };
}

/**
 * Check resource constraints
 */
export async function checkResourceConstraints(): Promise<{
  hasEnoughMemory: boolean;
  hasEnoughDisk: boolean;
  cpuNotOverloaded: boolean;
}> {
  const freeMemory = os.freemem();
  const totalMemory = os.totalmem();
  const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

  const diskUsage = await getDiskUsage('/');
  const load = await getSystemLoad();
  const cpuCount = os.cpus().length;

  return {
    hasEnoughMemory: memoryUsage < 90,
    hasEnoughDisk: diskUsage.percentage < 95,
    cpuNotOverloaded: load.load1 < cpuCount * 2
  };
}

/**
 * Monitor process with default settings
 */
export function monitorProcess(handle: ProcessHandle, options?: MonitorOptions): ProcessMonitor {
  const monitor = new ProcessMonitor(handle, options);
  monitor.start();
  return monitor;
}