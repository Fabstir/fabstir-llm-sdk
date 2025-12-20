// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * MgmtClient Service Tests
 * TDD tests for the management API client
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchStatus } from '../../../src/tui/services/MgmtClient';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MgmtClient Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchStatus', () => {
    test('should fetch status from management API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'running',
          pid: 1234,
          uptime: 3600,
          publicUrl: 'http://localhost:8080',
          version: 'v1.0.0',
        }),
      });

      const result = await fetchStatus('http://localhost:3001');

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/api/status');
      expect(result).toEqual({
        status: 'running',
        pid: 1234,
        uptime: 3600,
        publicUrl: 'http://localhost:8080',
        version: 'v1.0.0',
      });
    });

    test('should return null on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await fetchStatus('http://localhost:3001');

      expect(result).toBeNull();
    });

    test('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await fetchStatus('http://localhost:3001');

      expect(result).toBeNull();
    });

    test('should handle stopped status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'stopped',
        }),
      });

      const result = await fetchStatus('http://localhost:3001');

      expect(result).toEqual({
        status: 'stopped',
      });
    });
  });
});
