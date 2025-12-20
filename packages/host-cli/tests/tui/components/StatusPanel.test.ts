// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StatusPanel Component Tests
 * TDD tests for the node status panel formatting
 */

import { describe, test, expect } from 'vitest';
import { formatStatusPanel, formatUptime } from '../../../src/tui/components/StatusPanel';

describe('StatusPanel Component', () => {
  describe('formatUptime', () => {
    test('should format seconds to hours and minutes', () => {
      expect(formatUptime(3661)).toBe('1h 1m');
    });

    test('should handle zero seconds', () => {
      expect(formatUptime(0)).toBe('0h 0m');
    });

    test('should handle large values', () => {
      expect(formatUptime(86400)).toBe('24h 0m'); // 24 hours
    });

    test('should handle minutes only', () => {
      expect(formatUptime(600)).toBe('0h 10m'); // 10 minutes
    });
  });

  describe('formatStatusPanel', () => {
    test('should format running status correctly', () => {
      const result = formatStatusPanel({
        status: 'running',
        pid: 1234,
        uptime: 19920, // 5h 32m
        publicUrl: 'http://localhost:8080',
        version: 'v1.2.3',
      });
      expect(result).toContain('🟢');
      expect(result).toContain('RUNNING');
      expect(result).toContain('1234');
      expect(result).toContain('5h 32m');
      expect(result).toContain('http://localhost:8080');
      expect(result).toContain('v1.2.3');
    });

    test('should format stopped status correctly', () => {
      const result = formatStatusPanel({
        status: 'stopped',
      });
      expect(result).toContain('🔴');
      expect(result).toContain('STOPPED');
      expect(result).not.toContain('PID');
    });

    test('should show PID when available', () => {
      const result = formatStatusPanel({
        status: 'running',
        pid: 5678,
      });
      expect(result).toContain('PID: 5678');
    });

    test('should show uptime when available', () => {
      const result = formatStatusPanel({
        status: 'running',
        uptime: 7200, // 2h 0m
      });
      expect(result).toContain('Uptime: 2h 0m');
    });

    test('should show URL when available', () => {
      const result = formatStatusPanel({
        status: 'running',
        publicUrl: 'http://my-host.example.com:8080',
      });
      expect(result).toContain('URL: http://my-host.example.com:8080');
    });

    test('should show version when available', () => {
      const result = formatStatusPanel({
        status: 'running',
        version: 'v2.0.0-beta',
      });
      expect(result).toContain('Version: v2.0.0-beta');
    });
  });
});
