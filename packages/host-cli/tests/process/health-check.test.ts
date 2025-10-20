// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Health check enhancement tests
 * Tests for log-based startup detection instead of polling
 *
 * Sub-phase 2.2: Health Check Enhancement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessManager, ProcessHandle, ProcessConfig } from '../../src/process/manager';
import { EventEmitter } from 'events';

describe('Health Check Enhancement - Sub-phase 2.2', () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  describe('Log-Based Startup Detection', () => {
    it('should monitor logs for model loaded message', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const handle: ProcessHandle = {
        pid: 12345,
        process: mockProcess,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: ['test-model'],
        },
        status: 'starting',
        startTime: new Date(),
        logs: [],
      };

      // Simulate startup sequence
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ Model loaded successfully'));
      }, 100);
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ P2P node started'));
      }, 200);
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ API server started'));
      }, 300);
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('🎉 Fabstir LLM Node is running'));
      }, 400);

      await expect((manager as any).waitForReady(handle)).resolves.toBeUndefined();
    });

    it('should timeout if startup sequence incomplete', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const handle: ProcessHandle = {
        pid: 12345,
        process: mockProcess,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: ['test-model'],
        },
        status: 'starting',
        startTime: new Date(),
        logs: [],
      };

      // Never emit the final message
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ Model loaded successfully'));
      }, 100);

      await expect((manager as any).waitForReady(handle)).rejects.toThrow('timeout');
    }, 65000); // 65 seconds to allow for 60-second implementation timeout

    it('should detect model loaded message', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      const handle: ProcessHandle = {
        pid: 12345,
        process: mockProcess,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: ['test-model'],
        },
        status: 'starting',
        startTime: new Date(),
        logs: [],
      };

      let modelLoadedDetected = false;

      // Spy on console.log to detect progress messages
      const originalLog = console.log;
      console.log = vi.fn((...args: any[]) => {
        const message = args.join(' ');
        if (message.includes('Model loaded')) {
          modelLoadedDetected = true;
        }
        originalLog(...args);
      });

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ Model loaded successfully'));
        mockProcess.stdout.emit('data', Buffer.from('✅ P2P node started'));
        mockProcess.stdout.emit('data', Buffer.from('✅ API server started'));
        mockProcess.stdout.emit('data', Buffer.from('🎉 Fabstir LLM Node is running'));
      }, 100);

      await (manager as any).waitForReady(handle);

      console.log = originalLog;
      expect(modelLoadedDetected).toBe(true);
    });

    it('should verify publicUrl after log confirmation', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      // Mock fetch for health check (should NOT be called before log confirmation)
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const handle: ProcessHandle = {
        pid: 12345,
        process: mockProcess,
        config: {
          port: 8080,
          host: '0.0.0.0',
          models: ['test-model'],
          publicUrl: 'http://example.com:8080',
        },
        status: 'starting',
        startTime: new Date(),
        logs: [],
      };

      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('✅ Model loaded successfully'));
        mockProcess.stdout.emit('data', Buffer.from('✅ P2P node started'));
        mockProcess.stdout.emit('data', Buffer.from('✅ API server started'));
        mockProcess.stdout.emit('data', Buffer.from('🎉 Fabstir LLM Node is running'));
      }, 100);

      await (manager as any).waitForReady(handle);

      // Verify fetch was called for public URL verification
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('example.com:8080'),
        expect.any(Object)
      );
    });
  });
});
