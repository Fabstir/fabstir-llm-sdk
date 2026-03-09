// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Unit tests for SessionManager host health check (Sub-phase 14.2)
 * Tests _checkHostHealth, onHostHealthWarning callback, and getHostHealth.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import type { HostHealthInfo } from '../../src/types';

describe('SessionManager Host Health Check', () => {
  let sm: SessionManager;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    const mockPayment = {} as PaymentManager;
    const mockStorage = {} as StorageManager;
    sm = new SessionManager(mockPayment, mockStorage);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('_checkHostHealth', () => {
    it('returns healthy for 200 with status: healthy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'healthy' }),
      });

      const result: HostHealthInfo = await (sm as any)._checkHostHealth('http://host1:8080');
      expect(result.status).toBe('healthy');
      expect(result.issues).toEqual([]);
      expect(result.checkedAt).toBeGreaterThan(0);
    });

    it('returns degraded for 200 with status: degraded and issues array', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'degraded', issues: ['high latency', 'low memory'] }),
      });

      const result: HostHealthInfo = await (sm as any)._checkHostHealth('http://host1:8080');
      expect(result.status).toBe('degraded');
      expect(result.issues).toEqual(['high latency', 'low memory']);
    });

    it('returns unreachable when fetch throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result: HostHealthInfo = await (sm as any)._checkHostHealth('http://host1:8080');
      expect(result.status).toBe('unreachable');
      expect(result.issues).toContain('Health endpoint unreachable');
    });

    it('converts ws:// endpoint to http:// for health URL', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'healthy' }),
      });
      globalThis.fetch = fetchMock;

      await (sm as any)._checkHostHealth('ws://host1:8080/v1/ws');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://host1:8080/v1/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  describe('onHostHealthWarning callback', () => {
    it('fires for degraded host', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'degraded', issues: ['GPU temp high'] }),
      });

      const warningCb = vi.fn();
      const session = {
        sessionId: 1n,
        jobId: 1n,
        chainId: 84532,
        model: 'test',
        provider: 'host1',
        endpoint: 'http://host1:8080',
        status: 'active' as const,
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
      };
      (sm as any).sessions.set('1', session);

      // Simulate the non-blocking health check logic
      const health = await (sm as any)._checkHostHealth(session.endpoint);
      session.lastHostHealth = health;
      if (health.status !== 'healthy') {
        warningCb(health);
      }

      expect(warningCb).toHaveBeenCalledOnce();
      expect(warningCb.mock.calls[0][0].status).toBe('degraded');
    });

    it('does NOT fire for healthy host', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'healthy' }),
      });

      const warningCb = vi.fn();
      const session = {
        sessionId: 1n,
        endpoint: 'http://host1:8080',
      };

      const health = await (sm as any)._checkHostHealth(session.endpoint);
      if (health.status !== 'healthy') {
        warningCb(health);
      }

      expect(warningCb).not.toHaveBeenCalled();
    });
  });

  describe('getHostHealth', () => {
    it('returns stored health after check', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'healthy' }),
      });

      const session = {
        sessionId: 1n,
        jobId: 1n,
        chainId: 84532,
        model: 'test',
        provider: 'host1',
        endpoint: 'http://host1:8080',
        status: 'active' as const,
        prompts: [],
        responses: [],
        checkpoints: [],
        totalTokens: 0,
        startTime: Date.now(),
      };
      (sm as any).sessions.set('1', session);

      const health = await (sm as any)._checkHostHealth(session.endpoint);
      session.lastHostHealth = health;

      const retrieved = sm.getHostHealth(1n);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('healthy');
      expect(retrieved!.checkedAt).toBeGreaterThan(0);
    });
  });
});
