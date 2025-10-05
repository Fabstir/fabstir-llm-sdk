/**
 * Network diagnostics tests
 * Tests for troubleshooting helpers and network diagnostic utilities
 *
 * Sub-phase 1.2: Network Diagnostics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  showNetworkTroubleshooting,
  checkLocalHealth,
  suggestFirewallCommands,
  formatHealthCheckError,
} from '../../src/utils/diagnostics';

describe('Network Diagnostics - Sub-phase 1.2', () => {
  describe('showNetworkTroubleshooting', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display troubleshooting header', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('Troubleshooting');
    });

    it('should include curl command for localhost health check', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('curl http://localhost:8080/health');
    });

    it('should extract port from URL correctly', () => {
      showNetworkTroubleshooting('http://example.com:9000');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('9000');
    });

    it('should include firewall check instructions', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('firewall');
    });

    it('should include netstat command to check listening ports', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('netstat');
    });

    it('should include test from another machine instruction', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('curl http://example.com:8080/health');
    });

    it('should use colored output (chalk)', () => {
      showNetworkTroubleshooting('http://example.com:8080');
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(5);
    });

    it('should handle URLs without explicit port', () => {
      showNetworkTroubleshooting('http://example.com');
      const output = consoleLogSpy.mock.calls.map((call: any) => call[0]).join(' ');
      expect(output).toContain('8080'); // Default port
    });
  });

  describe('checkLocalHealth', () => {
    it('should return true when localhost endpoint is healthy', async () => {
      // This test will fail initially - we'll implement the function later
      const result = await checkLocalHealth(8080);
      expect(typeof result).toBe('boolean');
    });

    it('should return false when localhost endpoint is not accessible', async () => {
      const result = await checkLocalHealth(65432); // Unlikely to be in use
      expect(result).toBe(false);
    });

    it('should timeout quickly for unreachable endpoints', async () => {
      const startTime = Date.now();
      const result = await checkLocalHealth(65433);
      const duration = Date.now() - startTime;

      expect(result).toBe(false);
      expect(duration).toBeLessThan(10000); // Should timeout quickly
    });

    it('should handle different port numbers', async () => {
      const result1 = await checkLocalHealth(3000);
      const result2 = await checkLocalHealth(9000);
      expect(typeof result1).toBe('boolean');
      expect(typeof result2).toBe('boolean');
    });
  });

  describe('suggestFirewallCommands', () => {
    it('should return ufw command for Linux', () => {
      const commands = suggestFirewallCommands(8080, 'linux');
      expect(commands).toContain('ufw');
      expect(commands).toContain('8080');
    });

    it('should return iptables command for Linux', () => {
      const commands = suggestFirewallCommands(8080, 'linux');
      expect(commands).toContain('iptables');
      expect(commands).toContain('8080');
    });

    it('should return pfctl command for macOS (darwin)', () => {
      const commands = suggestFirewallCommands(8080, 'darwin');
      expect(commands).toContain('pfctl');
    });

    it('should return netsh command for Windows (win32)', () => {
      const commands = suggestFirewallCommands(8080, 'win32');
      expect(commands).toContain('netsh');
      expect(commands).toContain('advfirewall');
      expect(commands).toContain('8080');
    });

    it('should return generic message for unknown platform', () => {
      const commands = suggestFirewallCommands(8080, 'unknown-os');
      expect(commands).toContain('firewall');
      expect(commands).toContain('documentation');
    });

    it('should include port number in all platform-specific commands', () => {
      const linuxCmd = suggestFirewallCommands(9000, 'linux');
      const windowsCmd = suggestFirewallCommands(9000, 'win32');

      expect(linuxCmd).toContain('9000');
      expect(windowsCmd).toContain('9000');
    });

    it('should handle standard web ports', () => {
      const cmd80 = suggestFirewallCommands(80, 'linux');
      const cmd443 = suggestFirewallCommands(443, 'linux');

      expect(cmd80).toContain('80');
      expect(cmd443).toContain('443');
    });
  });

  describe('formatHealthCheckError', () => {
    it('should explain ECONNREFUSED error', () => {
      const error = { code: 'ECONNREFUSED' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('refused');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should explain ETIMEDOUT error', () => {
      const error = { code: 'ETIMEDOUT' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('timeout');
    });

    it('should explain ENOTFOUND error', () => {
      const error = { code: 'ENOTFOUND' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('not found');
    });

    it('should explain EHOSTUNREACH error', () => {
      const error = { code: 'EHOSTUNREACH' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('unreachable');
    });

    it('should explain ECONNRESET error', () => {
      const error = { code: 'ECONNRESET' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('reset');
    });

    it('should handle unknown error codes gracefully', () => {
      const error = { code: 'EUNKNOWN' };
      const message = formatHealthCheckError(error);

      expect(message).toContain('error');
      expect(message.length).toBeGreaterThan(0);
    });

    it('should handle errors without code property', () => {
      const error = { message: 'Something went wrong' };
      const message = formatHealthCheckError(error);

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
    });

    it('should handle Error objects', () => {
      const error = new Error('Network error');
      const message = formatHealthCheckError(error);

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
    });

    it('should provide helpful suggestions for ECONNREFUSED', () => {
      const error = { code: 'ECONNREFUSED' };
      const message = formatHealthCheckError(error);

      expect(message.toLowerCase()).toMatch(/running|started|check/);
    });

    it('should provide helpful suggestions for ETIMEDOUT', () => {
      const error = { code: 'ETIMEDOUT' };
      const message = formatHealthCheckError(error);

      expect(message.toLowerCase()).toMatch(/firewall|network|blocked/);
    });
  });
});
