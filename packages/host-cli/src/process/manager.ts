/**
 * Process management module
 * Manages fabstir-llm-node Rust process lifecycle
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ProcessLogger } from './logger';
import { verifyPublicEndpoint } from '../utils/network';
import { showNetworkTroubleshooting } from '../utils/diagnostics';
import chalk from 'chalk';

/**
 * Process configuration
 */
export interface ProcessConfig {
  port: number;
  host: string;
  publicUrl?: string;        // NEW: Public URL for verification
  models: string[];
  maxConnections?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
  gpuEnabled?: boolean;
  memoryLimit?: string;
  env?: Record<string, string>;
  workingDir?: string;
  maxLogLines?: number;
  skipStartupWait?: boolean; // Skip log monitoring for daemon mode
}

/**
 * Process handle
 */
export interface ProcessHandle {
  pid: number;
  process: ChildProcess;
  config: ProcessConfig;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
  startTime: Date;
  logs: string[];
  logger?: ProcessLogger;
}

/**
 * Process manager events
 */
export interface ProcessManagerEvents {
  'started': (handle: ProcessHandle) => void;
  'stopped': (handle: ProcessHandle) => void;
  'crashed': (handle: ProcessHandle, exitCode: number) => void;
  'error': (error: Error) => void;
  'log': (message: string, level: 'stdout' | 'stderr') => void;
}

/**
 * Process manager class
 */
export class ProcessManager extends EventEmitter {
  private handles: Map<number, ProcessHandle> = new Map();
  private executablePath?: string;

  constructor() {
    super();
  }

  on<K extends keyof ProcessManagerEvents>(
    event: K,
    listener: ProcessManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  emit<K extends keyof ProcessManagerEvents>(
    event: K,
    ...args: Parameters<ProcessManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Get all process handles
   */
  getHandles(): ProcessHandle[] {
    return Array.from(this.handles.values());
  }

  /**
   * Get process handle by PID
   */
  getHandle(pid: number): ProcessHandle | undefined {
    return this.handles.get(pid);
  }

  /**
   * Spawn inference server
   */
  async spawn(config: ProcessConfig): Promise<ProcessHandle> {
    const execPath = await this.getExecutablePath();
    if (!execPath) {
      throw new Error('fabstir-llm-node not found. Please install it first.');
    }

    // Build environment variables (fabstir-llm-node v7 uses env vars, not CLI args)
    const nodeEnv = this.buildEnvironment(config);

    // Build spawn options
    // In daemon mode, fully ignore stdio to avoid keeping parent attached
    const stdio = config.skipStartupWait
      ? ['ignore', 'ignore', 'ignore']  // Daemon: ignore all stdio
      : ['ignore', 'pipe', 'pipe'];      // Normal: pipe stdout/stderr for monitoring

    // For true daemon mode, use setsid to create new session
    let childProcess: ChildProcess;
    if (config.skipStartupWait) {
      // Use setsid to create a new session (survives parent exit)
      const spawnOptions: any = {
        env: { ...process.env, ...nodeEnv, ...config.env },
        cwd: config.workingDir || process.cwd(),
        detached: true,
        stdio
      };

      // Wrap with setsid to create new session
      childProcess = spawn('setsid', [execPath], spawnOptions);
    } else {
      const spawnOptions: any = {
        env: { ...process.env, ...nodeEnv, ...config.env },
        cwd: config.workingDir || process.cwd(),
        detached: true,
        stdio
      };

      // Normal foreground mode
      childProcess = spawn(execPath, [], spawnOptions);
    }

    if (!childProcess.pid) {
      throw new Error('Failed to spawn process');
    }

    // Create process handle
    const handle: ProcessHandle = {
      pid: childProcess.pid,
      process: childProcess,
      config,
      status: 'starting',
      startTime: new Date(),
      logs: []
    };

    // Setup logger if log file is specified
    if (config.logLevel) {
      handle.logger = new ProcessLogger(handle.pid.toString());
    }

    // Setup event handlers
    this.setupProcessHandlers(handle);

    // Store handle
    this.handles.set(handle.pid, handle);

    // Wait for process to be ready (unless skipped for daemon mode)
    if (!config.skipStartupWait) {
      await this.waitForReady(handle);
    } else {
      // In daemon mode, just wait a moment to ensure spawn succeeded
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    handle.status = 'running';
    this.emit('started', handle);

    return handle;
  }

  /**
   * Stop a process
   */
  async stop(handle: ProcessHandle, force: boolean = false): Promise<void> {
    if (handle.status === 'stopped') {
      return;
    }

    handle.status = 'stopping';

    if (force) {
      handle.process.kill('SIGKILL');
    } else {
      handle.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill after timeout
          handle.process.kill('SIGKILL');
          resolve();
        }, 10000); // 10 seconds timeout

        handle.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    handle.status = 'stopped';
    this.handles.delete(handle.pid);
    this.emit('stopped', handle);
  }

  /**
   * Stop all processes
   */
  async stopAll(force: boolean = false): Promise<void> {
    const handles = Array.from(this.handles.values());
    await Promise.all(handles.map(handle => this.stop(handle, force)));
  }

  /**
   * Verify public URL is accessible (NEW for Sub-phase 2.1)
   * @param handle - Process handle to verify
   * @returns true if public URL is accessible or no URL to verify
   */
  async verifyPublicAccess(handle: ProcessHandle): Promise<boolean> {
    if (!handle.config.publicUrl) {
      return true; // No public URL to verify
    }
    return await verifyPublicEndpoint(handle.config.publicUrl);
  }

  /**
   * Get running node information (NEW for Sub-phase 2.1)
   * @param handle - Process handle to get info from
   * @returns Node information including pid, port, uptime, status
   */
  getNodeInfo(handle: ProcessHandle): {
    pid: number;
    port: number;
    publicUrl?: string;
    uptime: number;
    status: string;
  } {
    const startTime = handle.startTime.getTime();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    return {
      pid: handle.pid,
      port: handle.config.port,
      publicUrl: handle.config.publicUrl,
      uptime,
      status: handle.status
    };
  }

  /**
   * Get executable path
   */
  private async getExecutablePath(): Promise<string | null> {
    if (this.executablePath) {
      return this.executablePath;
    }

    // Check common locations
    const locations = [
      'fabstir-llm-node', // In PATH
      '/usr/local/bin/fabstir-llm-node',
      '/usr/bin/fabstir-llm-node',
      path.join(process.env.HOME || '', '.cargo/bin/fabstir-llm-node'),
      path.join(process.cwd(), 'fabstir-llm-node')
    ];

    for (const location of locations) {
      if (await this.checkExecutable(location)) {
        this.executablePath = location;
        return location;
      }
    }

    return null;
  }

  /**
   * Check if executable exists
   */
  private async checkExecutable(path: string): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`which ${path}`, (error: any) => {
          resolve(!error);
        });
      });
    } catch {
      return existsSync(path);
    }
  }

  /**
   * Build environment variables for fabstir-llm-node
   * Note: fabstir-llm-node v7 uses environment variables, NOT CLI arguments
   */
  private buildEnvironment(config: ProcessConfig): Record<string, string> {
    // Extract model filename from config.models
    // Model format: "repo:filename" or just "filename"
    let modelFilename = '';
    if (config.models && config.models.length > 0) {
      const modelSpec = config.models[0];
      // If model has format "repo:filename", extract filename after colon
      if (modelSpec.includes(':')) {
        modelFilename = modelSpec.split(':')[1];
      } else {
        modelFilename = modelSpec;
      }
    }

    const env: Record<string, string> = {
      // Required: API port
      API_PORT: config.port.toString(),

      // Model path (relative to /app working directory, symlinked to /models)
      MODEL_PATH: modelFilename ? `./models/${modelFilename}` : '',

      // Optional: P2P port
      P2P_PORT: process.env.P2P_PORT || '9000',

      // Logging
      RUST_LOG: config.logLevel || 'info',

      // Chain configuration
      CHAIN_ID: process.env.CHAIN_ID || '84532', // Default: Base Sepolia

      // Host wallet private key (required for P2P)
      HOST_PRIVATE_KEY: process.env.HOST_PRIVATE_KEY || '',

      // Contract addresses (from .env.test)
      CONTRACT_JOB_MARKETPLACE: process.env.CONTRACT_JOB_MARKETPLACE || '',
      CONTRACT_NODE_REGISTRY: process.env.CONTRACT_NODE_REGISTRY || '',
      CONTRACT_PROOF_SYSTEM: process.env.CONTRACT_PROOF_SYSTEM || '',
      CONTRACT_HOST_EARNINGS: process.env.CONTRACT_HOST_EARNINGS || '',

      // RPC URL
      RPC_URL: process.env.RPC_URL_BASE_SEPOLIA || '',
    };

    // Add GPU configuration if enabled
    if (config.gpuEnabled && process.env.CUDA_VISIBLE_DEVICES) {
      env.CUDA_VISIBLE_DEVICES = process.env.CUDA_VISIBLE_DEVICES;
    }

    return env;
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(handle: ProcessHandle): void {
    const { process: proc, logs, logger } = handle;

    // Handle stdout
    proc.stdout?.on('data', (data: Buffer) => {
      const message = data.toString();
      logs.push(`[stdout] ${message}`);

      if (logs.length > (handle.config.maxLogLines || 1000)) {
        logs.shift();
      }

      if (logger) {
        logger.log(message, 'info');
      }

      this.emit('log', message, 'stdout');
    });

    // Handle stderr
    proc.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      logs.push(`[stderr] ${message}`);

      if (logs.length > (handle.config.maxLogLines || 1000)) {
        logs.shift();
      }

      if (logger) {
        logger.log(message, 'error');
      }

      this.emit('log', message, 'stderr');
    });

    // Handle process exit
    proc.on('exit', (code: number | null) => {
      handle.status = code === 0 ? 'stopped' : 'crashed';
      this.handles.delete(handle.pid);

      if (code !== 0) {
        this.emit('crashed', handle, code || -1);
      }
    });

    // Handle errors
    proc.on('error', (error: Error) => {
      handle.status = 'crashed';
      this.emit('error', error);
    });
  }

  /**
   * Wait for process to be ready (log-based monitoring)
   */
  private async waitForReady(handle: ProcessHandle): Promise<void> {
    const timeout = 60000; // 60 seconds for model loading
    const { publicUrl } = handle.config;

    console.log(chalk.gray('  Waiting for node to start (monitoring logs)...'));

    // Monitor logs for startup sequence
    const logMonitor = new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Node startup timeout - model may not have loaded'));
      }, timeout);

      handle.process.stdout?.on('data', (data: Buffer) => {
        const message = data.toString();

        // Watch for specific startup messages
        if (message.includes('Model loaded successfully')) {
          console.log(chalk.green('   ✅ Model loaded'));
        }
        if (message.includes('P2P node started')) {
          console.log(chalk.green('   ✅ P2P started'));
        }
        if (message.includes('API server started')) {
          console.log(chalk.green('   ✅ API started'));
        }
        if (message.includes('Fabstir LLM Node is running')) {
          clearTimeout(timeoutId);
          resolve();
        }
      });
    });

    await logMonitor;

    // Verify API is accessible on internal port (not publicUrl which may be host-mapped)
    const internalUrl = `http://localhost:${handle.config.port}`;
    console.log(chalk.gray(`  Verifying internal API at ${internalUrl}...`));
    const isAccessible = await verifyPublicEndpoint(internalUrl);

    if (!isAccessible) {
      showNetworkTroubleshooting(internalUrl);
      throw new Error(`Node not accessible at internal port: ${internalUrl}`);
    }

    console.log(chalk.green('   ✅ API is accessible'));
  }
}

/**
 * Global process manager instance
 */
let globalManager: ProcessManager | null = null;

/**
 * Get or create process manager
 */
export function getProcessManager(): ProcessManager {
  if (!globalManager) {
    globalManager = new ProcessManager();
  }
  return globalManager;
}

/**
 * Check if inference server is installed
 */
export async function checkInferenceServerInstalled(): Promise<boolean> {
  const manager = getProcessManager();
  const path = await (manager as any).getExecutablePath();
  return path !== null;
}

/**
 * Get inference server executable path
 */
export async function getInferenceServerPath(): Promise<string | null> {
  const manager = getProcessManager();
  return await (manager as any).getExecutablePath();
}

/**
 * Spawn inference server
 */
export async function spawnInferenceServer(config: ProcessConfig): Promise<ProcessHandle> {
  const manager = getProcessManager();
  return await manager.spawn(config);
}

/**
 * Stop inference server
 */
export async function stopInferenceServer(handle: ProcessHandle, force: boolean = false): Promise<void> {
  const manager = getProcessManager();
  return await manager.stop(handle, force);
}

/**
 * Get default process configuration
 */
export function getDefaultProcessConfig(): ProcessConfig {
  return {
    port: 8080,
    host: '0.0.0.0',      // Bind to all interfaces for production
    models: [],           // Empty by default - user must specify
    maxConnections: 10,
    logLevel: 'info'
  };
}

/**
 * Validate process configuration
 */
export function validateProcessConfig(config: ProcessConfig): boolean {
  if (config.port < 1 || config.port > 65535) {
    return false;
  }

  if (!config.models || config.models.length === 0) {
    return false;
  }

  if (!config.host || config.host.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Merge process configurations
 */
export function mergeProcessConfig(
  defaultConfig: ProcessConfig,
  customConfig: Partial<ProcessConfig>
): ProcessConfig {
  return { ...defaultConfig, ...customConfig } as ProcessConfig;
}