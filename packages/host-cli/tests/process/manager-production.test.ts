// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * ProcessManager production updates tests
 * Tests for production-ready process management with environment variables
 *
 * Sub-phase 2.1: Update ProcessManager for Production
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProcessManager,
  getDefaultProcessConfig,
  ProcessConfig,
  ProcessHandle,
} from '../../src/process/manager';

// Mock network utilities
vi.mock('../../src/utils/network', () => ({
  verifyPublicEndpoint: vi.fn(),
  extractHostPort: vi.fn((url: string) => {
    const match = url.match(/:(\d+)/);
    return {
      host: 'example.com',
      port: match ? parseInt(match[1]) : 8080,
    };
  }),
}));

import { verifyPublicEndpoint } from '../../src/utils/network';
const mockVerifyPublicEndpoint = vi.mocked(verifyPublicEndpoint);

describe('ProcessManager Production Updates - Sub-phase 2.1', () => {
  describe('Default Configuration', () => {
    it('should have host set to 0.0.0.0 by default', () => {
      const config = getDefaultProcessConfig();
      expect(config.host).toBe('0.0.0.0');
    });

    it('should bind to all interfaces for production', () => {
      const config = getDefaultProcessConfig();
      expect(config.host).not.toBe('127.0.0.1');
      expect(config.host).toBe('0.0.0.0');
    });

    it('should have default port 8080', () => {
      const config = getDefaultProcessConfig();
      expect(config.port).toBe(8080);
    });

    it('should have empty models array by default', () => {
      const config = getDefaultProcessConfig();
      expect(config.models).toEqual([]);
    });

    it('should have info log level by default', () => {
      const config = getDefaultProcessConfig();
      expect(config.logLevel).toBe('info');
    });
  });

  describe('ProcessConfig with publicUrl', () => {
    it('should accept publicUrl field in config', () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '0.0.0.0',
        models: ['test-model'],
        publicUrl: 'http://example.com:8080',
      };

      expect(config.publicUrl).toBe('http://example.com:8080');
    });

    it('should allow publicUrl to be undefined', () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '0.0.0.0',
        models: ['test-model'],
      };

      expect(config.publicUrl).toBeUndefined();
    });

    it('should preserve publicUrl in config', () => {
      const publicUrl = 'https://my-host.example.com:9000';
      const config: ProcessConfig = {
        port: 9000,
        host: '0.0.0.0',
        models: [],
        publicUrl,
      };

      expect(config.publicUrl).toBe(publicUrl);
    });
  });

  describe('verifyPublicAccess', () => {
    let manager: ProcessManager;

    beforeEach(() => {
      manager = new ProcessManager();
      mockVerifyPublicEndpoint.mockClear();
    });

    it('should return true when no publicUrl is provided', async () => {
      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
        },
        status: 'running',
        startTime: new Date(),
        logs: [],
      };

      const result = await manager.verifyPublicAccess(handle);
      expect(result).toBe(true);
      expect(mockVerifyPublicEndpoint).not.toHaveBeenCalled();
    });

    it('should call verifyPublicEndpoint when publicUrl is provided', async () => {
      mockVerifyPublicEndpoint.mockResolvedValue(true);

      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
          publicUrl: 'http://example.com:8080',
        },
        status: 'running',
        startTime: new Date(),
        logs: [],
      };

      const result = await manager.verifyPublicAccess(handle);
      expect(result).toBe(true);
      expect(mockVerifyPublicEndpoint).toHaveBeenCalledWith('http://example.com:8080');
    });

    it('should return false when public endpoint is not accessible', async () => {
      mockVerifyPublicEndpoint.mockResolvedValue(false);

      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
          publicUrl: 'http://unreachable.example.com:8080',
        },
        status: 'running',
        startTime: new Date(),
        logs: [],
      };

      const result = await manager.verifyPublicAccess(handle);
      expect(result).toBe(false);
    });
  });

  describe('getNodeInfo', () => {
    let manager: ProcessManager;

    beforeEach(() => {
      manager = new ProcessManager();
    });

    it('should return node information with all fields', () => {
      const startTime = new Date(Date.now() - 5000); // 5 seconds ago
      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
          publicUrl: 'http://example.com:8080',
        },
        status: 'running',
        startTime,
        logs: [],
      };

      const info = manager.getNodeInfo(handle);

      expect(info.pid).toBe(12345);
      expect(info.port).toBe(8080);
      expect(info.publicUrl).toBe('http://example.com:8080');
      expect(info.status).toBe('running');
      expect(info.uptime).toBeGreaterThanOrEqual(5);
    });

    it('should calculate uptime correctly', () => {
      const startTime = new Date(Date.now() - 10000); // 10 seconds ago
      const handle: ProcessHandle = {
        pid: 99999,
        process: {} as any,
        config: {
          port: 9000,
          host: '0.0.0.0',
          models: [],
        },
        status: 'running',
        startTime,
        logs: [],
      };

      const info = manager.getNodeInfo(handle);

      expect(info.uptime).toBeGreaterThanOrEqual(10);
      expect(info.uptime).toBeLessThan(15); // Allow some margin
    });

    it('should handle missing publicUrl', () => {
      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
        },
        status: 'running',
        startTime: new Date(),
        logs: [],
      };

      const info = manager.getNodeInfo(handle);

      expect(info.publicUrl).toBeUndefined();
    });

    it('should reflect current status', () => {
      const handle: ProcessHandle = {
        pid: 12345,
        process: {} as any,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: [],
        },
        status: 'starting',
        startTime: new Date(),
        logs: [],
      };

      const info = manager.getNodeInfo(handle);
      expect(info.status).toBe('starting');
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should support env field in ProcessConfig', () => {
      const config: ProcessConfig = {
        port: 8080,
        host: '0.0.0.0',
        models: ['model1'],
        env: {
          MODEL_PATH: '/path/to/model.gguf',
          GPU_LAYERS: '35',
        },
      };

      expect(config.env).toBeDefined();
      expect(config.env?.MODEL_PATH).toBe('/path/to/model.gguf');
    });

    it('should preserve custom environment variables', () => {
      const customEnv = {
        API_PORT: '9000',
        P2P_PORT: '9001',
        HOST_PRIVATE_KEY: '0xabc123',
      };

      const config: ProcessConfig = {
        port: 9000,
        host: '0.0.0.0',
        models: [],
        env: customEnv,
      };

      expect(config.env).toEqual(customEnv);
    });
  });
});
