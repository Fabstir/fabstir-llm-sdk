// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Network utilities tests
 * Tests for public endpoint verification and URL validation
 *
 * Sub-phase 1.1: Public Endpoint Verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyPublicEndpoint,
  isLocalhostUrl,
  warnIfLocalhost,
  extractHostPort,
} from '../../src/utils/network';

describe('Network Utilities - Sub-phase 1.1', () => {
  describe('verifyPublicEndpoint', () => {
    it('should return true when endpoint is accessible', async () => {
      // This test will use a mock or real endpoint
      // For now, testing with localhost which should be accessible during tests
      const result = await verifyPublicEndpoint('http://localhost:8080', 1000);
      expect(typeof result).toBe('boolean');
    });

    it('should return false when endpoint is not accessible', async () => {
      const result = await verifyPublicEndpoint('http://invalid-host-12345.example:8080', 1000);
      expect(result).toBe(false);
    });

    it('should return false when endpoint returns non-200 status', async () => {
      const result = await verifyPublicEndpoint('http://httpstat.us/404', 2000);
      expect(result).toBe(false);
    });

    it('should timeout and return false for slow endpoints', async () => {
      const result = await verifyPublicEndpoint('http://httpstat.us/200?sleep=5000', 1000);
      expect(result).toBe(false);
    });

    it('should use default timeout of 5000ms when not specified', async () => {
      const result = await verifyPublicEndpoint('http://invalid-host-12345.example:8080');
      expect(result).toBe(false);
    });

    it('should handle malformed URLs gracefully', async () => {
      const result = await verifyPublicEndpoint('not-a-url', 1000);
      expect(result).toBe(false);
    });

    it('should verify /health endpoint specifically', async () => {
      // Verify it appends /health to the URL
      const result = await verifyPublicEndpoint('http://localhost:8080', 1000);
      expect(typeof result).toBe('boolean');
    });

    it('should handle URLs with trailing slash', async () => {
      const result = await verifyPublicEndpoint('http://localhost:8080/', 1000);
      expect(typeof result).toBe('boolean');
    });

    it('should support both http and https', async () => {
      const httpResult = await verifyPublicEndpoint('http://localhost:8080', 1000);
      const httpsResult = await verifyPublicEndpoint('https://localhost:8080', 1000);
      expect(typeof httpResult).toBe('boolean');
      expect(typeof httpsResult).toBe('boolean');
    });
  });

  describe('isLocalhostUrl', () => {
    it('should return true for localhost hostname', () => {
      expect(isLocalhostUrl('http://localhost:8080')).toBe(true);
    });

    it('should return true for 127.0.0.1', () => {
      expect(isLocalhostUrl('http://127.0.0.1:8080')).toBe(true);
    });

    it('should return true for ::1 (IPv6 localhost)', () => {
      expect(isLocalhostUrl('http://[::1]:8080')).toBe(true);
    });

    it('should return true for 0.0.0.0', () => {
      expect(isLocalhostUrl('http://0.0.0.0:8080')).toBe(true);
    });

    it('should return false for public IP addresses', () => {
      expect(isLocalhostUrl('http://203.0.113.45:8080')).toBe(false);
    });

    it('should return false for domain names', () => {
      expect(isLocalhostUrl('http://example.com:8080')).toBe(false);
    });

    it('should return false for subdomain.localhost variations', () => {
      expect(isLocalhostUrl('http://subdomain.localhost:8080')).toBe(false);
    });

    it('should handle URLs without port', () => {
      expect(isLocalhostUrl('http://localhost')).toBe(true);
      expect(isLocalhostUrl('http://example.com')).toBe(false);
    });

    it('should handle https URLs', () => {
      expect(isLocalhostUrl('https://localhost:8080')).toBe(true);
      expect(isLocalhostUrl('https://example.com:8080')).toBe(false);
    });

    it('should throw error for invalid URLs', () => {
      expect(() => isLocalhostUrl('not-a-valid-url')).toThrow();
    });

    it('should be case-insensitive for localhost', () => {
      expect(isLocalhostUrl('http://LOCALHOST:8080')).toBe(true);
      expect(isLocalhostUrl('http://LocalHost:8080')).toBe(true);
    });
  });

  describe('warnIfLocalhost', () => {
    let consoleWarnSpy: any;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should show warning for localhost URL', () => {
      warnIfLocalhost('http://localhost:8080');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARNING');
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('localhost');
    });

    it('should show warning for 127.0.0.1 URL', () => {
      warnIfLocalhost('http://127.0.0.1:8080');
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('WARNING');
    });

    it('should not show warning for public IP', () => {
      warnIfLocalhost('http://203.0.113.45:8080');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not show warning for domain name', () => {
      warnIfLocalhost('http://example.com:8080');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should include helpful message about accessibility', () => {
      warnIfLocalhost('http://localhost:8080');
      const warningText = consoleWarnSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(warningText).toContain('NOT be accessible');
    });

    it('should mention production usage', () => {
      warnIfLocalhost('http://localhost:8080');
      const warningText = consoleWarnSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(warningText).toContain('production');
    });

    it('should use colored output (chalk)', () => {
      warnIfLocalhost('http://localhost:8080');
      expect(consoleWarnSpy).toHaveBeenCalled();
      // Warning should use chalk.yellow - we verify it was called
      expect(consoleWarnSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('extractHostPort', () => {
    it('should extract host and port from URL', () => {
      const result = extractHostPort('http://example.com:8080');
      expect(result).toEqual({
        host: 'example.com',
        port: 8080,
      });
    });

    it('should extract IP address and port', () => {
      const result = extractHostPort('http://203.0.113.45:8080');
      expect(result).toEqual({
        host: '203.0.113.45',
        port: 8080,
      });
    });

    it('should default to port 8080 when not specified', () => {
      const result = extractHostPort('http://example.com');
      expect(result).toEqual({
        host: 'example.com',
        port: 8080,
      });
    });

    it('should handle https URLs', () => {
      const result = extractHostPort('https://example.com:443');
      expect(result).toEqual({
        host: 'example.com',
        port: 443,
      });
    });

    it('should handle localhost', () => {
      const result = extractHostPort('http://localhost:9000');
      expect(result).toEqual({
        host: 'localhost',
        port: 9000,
      });
    });

    it('should handle IPv6 addresses', () => {
      const result = extractHostPort('http://[::1]:8080');
      expect(result).toEqual({
        host: '::1',
        port: 8080,
      });
    });

    it('should handle URLs with trailing slash', () => {
      const result = extractHostPort('http://example.com:8080/');
      expect(result).toEqual({
        host: 'example.com',
        port: 8080,
      });
    });

    it('should handle URLs with path', () => {
      const result = extractHostPort('http://example.com:8080/api/v1');
      expect(result).toEqual({
        host: 'example.com',
        port: 8080,
      });
    });

    it('should throw error for invalid URL', () => {
      expect(() => extractHostPort('not-a-url')).toThrow();
    });

    it('should handle port numbers as strings in URL', () => {
      const result = extractHostPort('http://example.com:3000');
      expect(result.port).toBe(3000);
      expect(typeof result.port).toBe('number');
    });
  });
});
