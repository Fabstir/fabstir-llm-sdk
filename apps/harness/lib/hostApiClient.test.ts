/**
 * Tests for Host API Client (Sub-phase 4.1)
 * TDD: These tests are written FIRST and should FAIL until implementation is complete
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { HostApiClient } from './hostApiClient';

// Mock fetch for testing
global.fetch = vi.fn();

describe('HostApiClient', () => {
  let client: HostApiClient;
  const baseUrl = 'http://localhost:3001';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    client = new HostApiClient({ baseUrl });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Status & Discovery', () => {
    test('should call GET /api/status', async () => {
      const mockResponse = {
        status: 'running',
        pid: 12345,
        publicUrl: 'http://localhost:8080',
        startTime: '2025-01-07T00:00:00.000Z',
        uptime: 3600
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.getStatus();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/status`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call GET /api/discover-nodes', async () => {
      const mockResponse = {
        hosts: [
          {
            address: '0x1234...',
            apiUrl: 'http://localhost:8080',
            models: ['model1', 'model2'],
            isActive: true
          }
        ],
        count: 1
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.discoverNodes();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/discover-nodes`,
        expect.objectContaining({
          method: 'GET'
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Lifecycle Management', () => {
    test('should call POST /api/start with daemon flag', async () => {
      const mockResponse = {
        status: 'running',
        pid: 12345,
        publicUrl: 'http://localhost:8080'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.start(true);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/start`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ daemon: true })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call POST /api/stop with force flag', async () => {
      const mockResponse = { success: true };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.stop(true);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/stop`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ force: true })
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Registration & Stake Management', () => {
    test('should call POST /api/register with params', async () => {
      const params = {
        walletAddress: '0xabcd...',
        publicUrl: 'http://localhost:8080',
        models: ['model1'],
        stakeAmount: '1000',
        metadata: { gpu: 'RTX 4090' }
      };

      const mockResponse = {
        transactionHash: '0xtxhash...',
        hostAddress: params.walletAddress,
        success: true
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.register(params);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/register`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(params)
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call POST /api/unregister', async () => {
      const mockResponse = {
        transactionHash: '0xtxhash...',
        success: true
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.unregister();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/unregister`,
        expect.objectContaining({
          method: 'POST'
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call POST /api/add-stake with amount', async () => {
      const mockResponse = {
        transactionHash: '0xtxhash...',
        newStake: '2000'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.addStake('1000');

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/add-stake`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ amount: '1000' })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call POST /api/withdraw-earnings', async () => {
      const mockResponse = {
        success: true,
        amount: '500',
        transactionHash: '0xtxhash...'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.withdrawEarnings();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/withdraw-earnings`,
        expect.objectContaining({
          method: 'POST'
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Host Configuration', () => {
    test('should call POST /api/update-models with model IDs', async () => {
      const modelIds = ['model1', 'model2', 'model3'];
      const mockResponse = {
        transactionHash: '0xtxhash...',
        updatedModels: modelIds
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.updateModels(modelIds);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/update-models`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ modelIds })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    test('should call POST /api/update-metadata with metadata object', async () => {
      const metadata = {
        hardware: { gpu: 'RTX 4090', vram: 24, ram: 64 },
        location: 'US-East'
      };

      const mockResponse = {
        transactionHash: '0xtxhash...',
        updatedMetadata: metadata
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.updateMetadata(metadata);

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/update-metadata`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ metadata })
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getStatus()).rejects.toThrow('Network error');
    });

    test('should handle HTTP error responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' })
      });

      await expect(client.getStatus()).rejects.toThrow();
    });

    test('should include API key in headers when provided', async () => {
      const clientWithKey = new HostApiClient({ baseUrl, apiKey });

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'stopped' })
      });

      await clientWithKey.getStatus();

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/api/status`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          })
        })
      );
    });
  });
});
