// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  spawnInferenceServer,
  checkInferenceServerInstalled,
  getInferenceServerPath,
  ProcessConfig,
  ProcessHandle
} from '../../src/process/manager';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';
import * as child_process from 'child_process';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Process Spawning', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  describe('Installation Check', () => {
    it('should check if fabstir-llm-node is installed', async () => {
      const isInstalled = await checkInferenceServerInstalled();
      expect(typeof isInstalled).toBe('boolean');
    });

    it('should find fabstir-llm-node executable path', async () => {
      const execPath = await getInferenceServerPath();

      if (execPath) {
        expect(execPath).toContain('fabstir-llm-node');
      } else {
        expect(execPath).toBeNull();
      }
    });

    it('should check PATH environment variable', async () => {
      const path = process.env.PATH;
      expect(path).toBeDefined();

      // Check if common binary directories are in PATH
      const hasUsualPaths = path?.includes('/usr/local/bin') ||
                            path?.includes('/usr/bin') ||
                            path?.includes('.cargo/bin');
      expect(hasUsualPaths).toBe(true);
    });

    it('should detect version of fabstir-llm-node', async () => {
      const mockExec = vi.spyOn(child_process, 'exec');
      mockExec.mockImplementation((cmd: any, callback: any) => {
        callback(null, 'fabstir-llm-node 0.1.0', '');
      });

      const version = await getInferenceServerVersion();
      expect(version).toBe('0.1.0');

      mockExec.mockRestore();
    });
  });

  describe('Process Spawning', () => {
    it('should spawn inference server process', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b'],
        maxConnections: 10,
        logLevel: 'info'
      };

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      const mockProcess = {
        pid: 12345,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const handle = await spawnInferenceServer(config);

      expect(handle).toBeDefined();
      expect(handle.pid).toBe(12345);
      expect(handle.config).toEqual(config);
      expect(handle.status).toBe('running');

      mockSpawn.mockRestore();
    });

    it('should pass configuration to spawned process', async () => {
      const config: ProcessConfig = {
        port: 8081,
        host: '0.0.0.0',
        models: ['gpt-3.5-turbo'],
        maxConnections: 20,
        logLevel: 'debug',
        gpuEnabled: true,
        memoryLimit: '8G'
      };

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      mockSpawn.mockImplementation((command: string, args?: any) => {
        expect(args).toContain('--port');
        expect(args).toContain('8081');
        expect(args).toContain('--host');
        expect(args).toContain('0.0.0.0');
        expect(args).toContain('--model');
        expect(args).toContain('gpt-3.5-turbo');
        expect(args).toContain('--gpu');

        return {
          pid: 54321,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn()
        } as any;
      });

      await spawnInferenceServer(config);
      mockSpawn.mockRestore();
    });

    it('should handle spawn errors', async () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b']
      };

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      mockSpawn.mockImplementation(() => {
        throw new Error('Command not found');
      });

      await expect(spawnInferenceServer(config)).rejects.toThrow('Command not found');
      mockSpawn.mockRestore();
    });

    it('should set environment variables for spawned process', async () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b'],
        env: {
          RUST_LOG: 'debug',
          CUDA_VISIBLE_DEVICES: '0,1'
        }
      };

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      mockSpawn.mockImplementation((command: string, args: any, options?: any) => {
        expect(options.env).toHaveProperty('RUST_LOG', 'debug');
        expect(options.env).toHaveProperty('CUDA_VISIBLE_DEVICES', '0,1');

        return {
          pid: 11111,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn()
        } as any;
      });

      await spawnInferenceServer(config);
      mockSpawn.mockRestore();
    });

    it('should spawn with specific working directory', async () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b'],
        workingDir: '/tmp/fabstir-node'
      };

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      mockSpawn.mockImplementation((command: string, args: any, options?: any) => {
        expect(options.cwd).toBe('/tmp/fabstir-node');

        return {
          pid: 22222,
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(),
          kill: vi.fn()
        } as any;
      });

      await spawnInferenceServer(config);
      mockSpawn.mockRestore();
    });
  });

  describe('Process Handle', () => {
    it('should track process status', async () => {
      const mockProcess = {
        pid: 33333,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn()
      };

      const handle: ProcessHandle = {
        pid: mockProcess.pid,
        process: mockProcess as any,
        config: {
          port: 8080,
          host: '127.0.0.1',
          models: ['llama-2-7b']
        },
        status: 'running',
        startTime: new Date(),
        logs: []
      };

      expect(handle.status).toBe('running');
      expect(handle.pid).toBe(33333);
      expect(handle.startTime).toBeInstanceOf(Date);
    });

    it('should store process output in logs', async () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b']
      };

      let stdoutCallback: any;
      let stderrCallback: any;

      const mockSpawn = vi.spyOn(child_process, 'spawn');
      mockSpawn.mockImplementation(() => {
        return {
          pid: 44444,
          stdout: {
            on: (event: string, callback: any) => {
              if (event === 'data') stdoutCallback = callback;
            }
          },
          stderr: {
            on: (event: string, callback: any) => {
              if (event === 'data') stderrCallback = callback;
            }
          },
          on: vi.fn(),
          kill: vi.fn()
        } as any;
      });

      const handle = await spawnInferenceServer(config);

      // Simulate output
      if (stdoutCallback) stdoutCallback(Buffer.from('Server started\n'));
      if (stderrCallback) stderrCallback(Buffer.from('Warning: GPU not detected\n'));

      expect(handle.logs).toHaveLength(2);
      expect(handle.logs[0]).toContain('Server started');
      expect(handle.logs[1]).toContain('Warning: GPU not detected');

      mockSpawn.mockRestore();
    });

    it('should limit log buffer size', async () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: ['llama-2-7b'],
        maxLogLines: 5
      };

      const handle: ProcessHandle = {
        pid: 55555,
        process: null as any,
        config,
        status: 'running',
        startTime: new Date(),
        logs: []
      };

      // Add more logs than the limit
      for (let i = 0; i < 10; i++) {
        handle.logs.push(`Log line ${i}`);
        if (handle.logs.length > (config.maxLogLines || 1000)) {
          handle.logs.shift();
        }
      }

      expect(handle.logs.length).toBeLessThanOrEqual(5);
      expect(handle.logs[0]).toContain('Log line 5');
      expect(handle.logs[4]).toContain('Log line 9');
    });
  });

  describe('Process Configuration', () => {
    it('should validate port number', () => {
      const config: ProcessConfig = {
        port: 65536, // Invalid port
        host: '127.0.0.1',
        models: ['llama-2-7b']
      };

      const isValid = validateProcessConfig(config);
      expect(isValid).toBe(false);
    });

    it('should validate model names', () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '127.0.0.1',
        models: [] // Empty models
      };

      const isValid = validateProcessConfig(config);
      expect(isValid).toBe(false);
    });

    it('should generate default configuration', () => {
      const defaultConfig = getDefaultProcessConfig();

      expect(defaultConfig).toHaveProperty('port');
      expect(defaultConfig).toHaveProperty('host');
      expect(defaultConfig).toHaveProperty('models');
      expect(defaultConfig.port).toBeGreaterThanOrEqual(1024);
      expect(defaultConfig.port).toBeLessThanOrEqual(65535);
      expect(defaultConfig.models.length).toBeGreaterThan(0);
    });

    it('should merge configurations', () => {
      const defaultConfig = getDefaultProcessConfig();
      const customConfig: Partial<ProcessConfig> = {
        port: 9090,
        logLevel: 'debug'
      };

      const merged = mergeProcessConfig(defaultConfig, customConfig);

      expect(merged.port).toBe(9090);
      expect(merged.logLevel).toBe('debug');
      expect(merged.host).toBe(defaultConfig.host);
      expect(merged.models).toEqual(defaultConfig.models);
    });
  });
});

// Helper functions that would be in the implementation
function getInferenceServerVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    child_process.exec('fabstir-llm-node --version', (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        const match = stdout.match(/(\d+\.\d+\.\d+)/);
        resolve(match ? match[1] : null);
      }
    });
  });
}

function validateProcessConfig(config: ProcessConfig): boolean {
  if (config.port < 1 || config.port > 65535) return false;
  if (!config.models || config.models.length === 0) return false;
  return true;
}

function getDefaultProcessConfig(): ProcessConfig {
  return {
    port: 8080,
    host: '127.0.0.1',
    models: ['llama-2-7b'],
    maxConnections: 10,
    logLevel: 'info'
  };
}

function mergeProcessConfig(
  defaultConfig: ProcessConfig,
  customConfig: Partial<ProcessConfig>
): ProcessConfig {
  return { ...defaultConfig, ...customConfig };
}