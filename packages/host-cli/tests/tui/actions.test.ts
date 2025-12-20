// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Action Handlers Tests
 * TDD tests for dashboard action handlers
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Action Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should export handleStart function', async () => {
    const { handleStart } = await import('../../src/tui/actions');
    expect(typeof handleStart).toBe('function');
  });

  test('should export handleStop function', async () => {
    const { handleStop } = await import('../../src/tui/actions');
    expect(typeof handleStop).toBe('function');
  });

  test('should export showMessage function', async () => {
    const { showMessage } = await import('../../src/tui/actions');
    expect(typeof showMessage).toBe('function');
  });

  test('should export showError function', async () => {
    const { showError } = await import('../../src/tui/actions');
    expect(typeof showError).toBe('function');
  });

  describe('handleStart', () => {
    test('should call start API and return success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { handleStart } = await import('../../src/tui/actions');
      const onComplete = vi.fn();

      const result = await handleStart('http://localhost:3001', onComplete);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/start',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.success).toBe(true);
      expect(onComplete).toHaveBeenCalled();
    });

    test('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Already running' }),
      });

      const { handleStart } = await import('../../src/tui/actions');
      const onComplete = vi.fn();

      const result = await handleStart('http://localhost:3001', onComplete);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already running');
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('handleStop', () => {
    test('should call stop API and return success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const { handleStop } = await import('../../src/tui/actions');
      const onComplete = vi.fn();

      const result = await handleStop('http://localhost:3001', onComplete);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/stop',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.success).toBe(true);
      expect(onComplete).toHaveBeenCalled();
    });

    test('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not running' }),
      });

      const { handleStop } = await import('../../src/tui/actions');
      const onComplete = vi.fn();

      const result = await handleStop('http://localhost:3001', onComplete);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not running');
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
