// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Header Component Tests
 * TDD tests for the dashboard header component
 */

import { describe, test, expect } from 'vitest';
import { formatHeader, truncateAddress } from '../../../src/tui/components/Header';

describe('Header Component', () => {
  describe('truncateAddress', () => {
    test('should truncate long addresses to 0x1234...abcd format', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const result = truncateAddress(address);
      expect(result).toBe('0x1234...5678');
    });

    test('should handle short addresses without truncation', () => {
      const address = '0x1234';
      const result = truncateAddress(address);
      expect(result).toBe('0x1234');
    });

    test('should return empty string for empty input', () => {
      const result = truncateAddress('');
      expect(result).toBe('');
    });
  });

  describe('formatHeader', () => {
    test('should format header with host address, chain, and stake', () => {
      const result = formatHeader(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Base Sepolia',
        '1000'
      );
      expect(result).toContain('0x1234...5678');
      expect(result).toContain('Base Sepolia');
      expect(result).toContain('1,000 FAB');
    });

    test('should include proper separators', () => {
      const result = formatHeader(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Base Sepolia',
        '500'
      );
      expect(result).toContain('|');
      expect(result.split('|').length).toBe(3);
    });

    test('should handle zero stake', () => {
      const result = formatHeader(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Base Sepolia',
        '0'
      );
      expect(result).toContain('0 FAB');
    });

    test('should format large stake with commas', () => {
      const result = formatHeader(
        '0x1234567890abcdef1234567890abcdef12345678',
        'Base Sepolia',
        '1000000'
      );
      expect(result).toContain('1,000,000 FAB');
    });
  });
});
