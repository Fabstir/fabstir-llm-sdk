/**
 * PID Manager tests
 * Tests for PID file management with metadata and validation
 *
 * Sub-phase 3.2: PID File Management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PIDManager, PIDInfo } from '../../src/daemon/pid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PID Manager - Sub-phase 3.2', () => {
  let pidManager: PIDManager;
  let testPidPath: string;

  beforeEach(() => {
    // Use test-specific PID file path
    testPidPath = path.join(os.tmpdir(), `fabstir-test-${Date.now()}.pid`);
    pidManager = new PIDManager(testPidPath);
  });

  afterEach(() => {
    // Clean up test PID file
    try {
      if (fs.existsSync(testPidPath)) {
        fs.unlinkSync(testPidPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('savePIDWithUrl', () => {
    it('should save PID with URL and timestamp', () => {
      const pid = process.pid;
      const publicUrl = 'http://example.com:8080';

      pidManager.savePIDWithUrl(pid, publicUrl);

      // Verify file was created
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Verify content
      const content = fs.readFileSync(testPidPath, 'utf8');
      const data = JSON.parse(content);

      expect(data.pid).toBe(pid);
      expect(data.publicUrl).toBe(publicUrl);
      expect(data.startTime).toBeDefined();
      expect(typeof data.startTime).toBe('string');
    });

    it('should create valid ISO timestamp', () => {
      pidManager.savePIDWithUrl(process.pid, 'http://localhost:8080');

      const content = fs.readFileSync(testPidPath, 'utf8');
      const data = JSON.parse(content);

      // Verify ISO 8601 format
      const timestamp = new Date(data.startTime);
      expect(timestamp.toISOString()).toBe(data.startTime);
    });

    it('should overwrite existing PID file', () => {
      pidManager.savePIDWithUrl(12345, 'http://old.com:8080');
      pidManager.savePIDWithUrl(54321, 'http://new.com:9000');

      const content = fs.readFileSync(testPidPath, 'utf8');
      const data = JSON.parse(content);

      expect(data.pid).toBe(54321);
      expect(data.publicUrl).toBe('http://new.com:9000');
    });
  });

  describe('getPIDInfo', () => {
    it('should return PID info for running process', () => {
      const pid = process.pid; // Current test process
      const publicUrl = 'http://example.com:8080';

      pidManager.savePIDWithUrl(pid, publicUrl);

      const info = pidManager.getPIDInfo();

      expect(info).toBeDefined();
      expect(info?.pid).toBe(pid);
      expect(info?.publicUrl).toBe(publicUrl);
      expect(info?.startTime).toBeDefined();
    });

    it('should return null for non-existent PID file', () => {
      const info = pidManager.getPIDInfo();
      expect(info).toBeNull();
    });

    it('should return null for stale PID (non-running process)', () => {
      const stalePid = 999999; // Very unlikely to be a running process
      pidManager.savePIDWithUrl(stalePid, 'http://example.com:8080');

      const info = pidManager.getPIDInfo();
      expect(info).toBeNull();
    });

    it('should validate process is still running', () => {
      // Save with current process PID (running)
      pidManager.savePIDWithUrl(process.pid, 'http://localhost:8080');
      const validInfo = pidManager.getPIDInfo();
      expect(validInfo).not.toBeNull();

      // Manually update file with stale PID
      const staleData = {
        pid: 999999,
        publicUrl: 'http://localhost:8080',
        startTime: new Date().toISOString(),
      };
      fs.writeFileSync(testPidPath, JSON.stringify(staleData, null, 2));

      const staleInfo = pidManager.getPIDInfo();
      expect(staleInfo).toBeNull();
    });

    it('should return null for malformed PID file', () => {
      fs.writeFileSync(testPidPath, 'invalid json content');

      const info = pidManager.getPIDInfo();
      expect(info).toBeNull();
    });
  });

  describe('cleanupStalePID', () => {
    it('should remove PID file if process not running', () => {
      const stalePid = 999999;
      pidManager.savePIDWithUrl(stalePid, 'http://example.com:8080');

      expect(fs.existsSync(testPidPath)).toBe(true);

      const cleaned = pidManager.cleanupStalePID();

      expect(cleaned).toBe(true);
      expect(fs.existsSync(testPidPath)).toBe(false);
    });

    it('should not remove PID file if process is running', () => {
      pidManager.savePIDWithUrl(process.pid, 'http://example.com:8080');

      expect(fs.existsSync(testPidPath)).toBe(true);

      const cleaned = pidManager.cleanupStalePID();

      expect(cleaned).toBe(false);
      expect(fs.existsSync(testPidPath)).toBe(true);
    });

    it('should handle missing PID file gracefully', () => {
      const cleaned = pidManager.cleanupStalePID();
      expect(cleaned).toBe(true);
    });

    it('should return true when cleanup performed', () => {
      // Create file with stale PID
      pidManager.savePIDWithUrl(999999, 'http://example.com:8080');

      const result = pidManager.cleanupStalePID();
      expect(result).toBe(true);
    });

    it('should return false when no cleanup needed', () => {
      // Create file with running PID
      pidManager.savePIDWithUrl(process.pid, 'http://example.com:8080');

      const result = pidManager.cleanupStalePID();
      expect(result).toBe(false);
    });
  });

  describe('PIDInfo interface', () => {
    it('should have correct structure', () => {
      pidManager.savePIDWithUrl(process.pid, 'http://localhost:8080');
      const info = pidManager.getPIDInfo();

      expect(info).toHaveProperty('pid');
      expect(info).toHaveProperty('publicUrl');
      expect(info).toHaveProperty('startTime');

      expect(typeof info?.pid).toBe('number');
      expect(typeof info?.publicUrl).toBe('string');
      expect(typeof info?.startTime).toBe('string');
    });
  });
});
