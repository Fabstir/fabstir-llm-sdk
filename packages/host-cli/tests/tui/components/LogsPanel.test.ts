// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LogsPanel Component Tests
 * TDD tests for log entry formatting
 */

import { describe, test, expect } from 'vitest';
import { formatLogEntry, formatTimestamp } from '../../../src/tui/components/LogsPanel';
import { LogEntry } from '../../../src/tui/types';

describe('LogsPanel Component', () => {
  describe('formatTimestamp', () => {
    test('should format ISO timestamp to HH:MM:SS', () => {
      const result = formatTimestamp('2025-12-19T10:30:45Z');
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    test('should handle empty timestamp', () => {
      const result = formatTimestamp('');
      expect(result).toBe('--:--:--');
    });

    test('should handle invalid timestamp', () => {
      const result = formatTimestamp('invalid');
      expect(result).toBe('--:--:--');
    });
  });

  describe('formatLogEntry', () => {
    test('should format info log entry', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'info',
        message: 'Node started successfully',
      };
      const result = formatLogEntry(entry);
      expect(result).toContain('Node started successfully');
      expect(result).toContain('[INFO]');
    });

    test('should format warn log entry', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'warn',
        message: 'High memory usage',
      };
      const result = formatLogEntry(entry);
      expect(result).toContain('High memory usage');
      expect(result).toContain('[WARN]');
    });

    test('should format error log entry', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'error',
        message: 'Connection failed',
      };
      const result = formatLogEntry(entry);
      expect(result).toContain('Connection failed');
      expect(result).toContain('[ERROR]');
    });

    test('should format stdout log entry', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'stdout',
        message: 'Model loaded',
      };
      const result = formatLogEntry(entry);
      expect(result).toContain('Model loaded');
    });

    test('should format stderr log entry', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'stderr',
        message: 'Warning from subprocess',
      };
      const result = formatLogEntry(entry);
      expect(result).toContain('Warning from subprocess');
    });

    test('should include timestamp in formatted output', () => {
      const entry: LogEntry = {
        timestamp: '2025-12-19T10:30:45Z',
        level: 'info',
        message: 'Test message',
      };
      const result = formatLogEntry(entry);
      // Should contain time portion
      expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });
});
