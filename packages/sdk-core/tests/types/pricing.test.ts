/**
 * @file Pricing Types Tests
 * @description Tests for HostInfo pricing fields and HostRegistrationWithModels pricing parameter
 *
 * Sub-phase 2.1: HostInfo Type Updates
 * Tests pricing fields added for host-controlled pricing marketplace
 */

import { describe, it, expect } from 'vitest';
import { HostInfo } from '../../src/types/models';
import { HostRegistrationWithModels } from '../../src/managers/HostManager';

describe('Pricing Types', () => {
  describe('HostInfo pricing fields', () => {
    it('should include required minPricePerToken field', () => {
      const hostInfo: HostInfo = {
        address: '0x1234567890123456789012345678901234567890',
        apiUrl: 'http://localhost:8083',
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference', 'streaming'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.002,
        },
        supportedModels: ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'],
        isActive: true,
        stake: 1000n * 10n ** 18n, // 1000 FAB
        minPricePerToken: 2000n, // Required: 0.002 USDC per token
      };

      expect(hostInfo.minPricePerToken).toBeDefined();
      expect(hostInfo.minPricePerToken).toBe(2000n);
    });

    it('should include optional advertisedPrice field', () => {
      const hostWithAdvertisedPrice: HostInfo = {
        address: '0x1234567890123456789012345678901234567890',
        apiUrl: 'http://localhost:8083',
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference'],
          location: 'us-west-2',
          maxConcurrent: 5,
          costPerToken: 0.003,
        },
        supportedModels: ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'],
        isActive: true,
        stake: 1000n * 10n ** 18n,
        minPricePerToken: 2000n,
        advertisedPrice: 3000n, // Optional: recommended price
      };

      expect(hostWithAdvertisedPrice.advertisedPrice).toBeDefined();
      expect(hostWithAdvertisedPrice.advertisedPrice).toBe(3000n);

      // Should also work without advertisedPrice
      const hostWithoutAdvertisedPrice: HostInfo = {
        address: '0x1234567890123456789012345678901234567890',
        apiUrl: 'http://localhost:8083',
        metadata: {
          hardware: { gpu: 'RTX 3090', vram: 24, ram: 32 },
          capabilities: ['inference'],
          location: 'eu-west-1',
          maxConcurrent: 8,
          costPerToken: 0.002,
        },
        supportedModels: ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'],
        isActive: true,
        stake: 1000n * 10n ** 18n,
        minPricePerToken: 2000n,
        // advertisedPrice is optional
      };

      expect(hostWithoutAdvertisedPrice.advertisedPrice).toBeUndefined();
    });

    it('should use bigint type for price values', () => {
      const hostInfo: HostInfo = {
        address: '0x1234567890123456789012345678901234567890',
        apiUrl: 'http://localhost:8083',
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.002,
        },
        supportedModels: ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'],
        isActive: true,
        stake: 1000n * 10n ** 18n,
        minPricePerToken: 5000n,
        advertisedPrice: 6000n,
      };

      // Verify types are bigint
      expect(typeof hostInfo.minPricePerToken).toBe('bigint');
      expect(typeof hostInfo.advertisedPrice).toBe('bigint');
      expect(typeof hostInfo.stake).toBe('bigint');

      // Verify bigint arithmetic works
      const priceDifference = hostInfo.advertisedPrice - hostInfo.minPricePerToken;
      expect(priceDifference).toBe(1000n);
    });
  });

  describe('HostRegistrationWithModels pricing parameter', () => {
    it('should include required minPricePerToken parameter', () => {
      const registration: HostRegistrationWithModels = {
        metadata: {
          hardware: { gpu: 'RTX 4090', vram: 24, ram: 32 },
          capabilities: ['inference', 'streaming'],
          location: 'us-east-1',
          maxConcurrent: 10,
          costPerToken: 0.002,
        },
        apiUrl: 'http://localhost:8083',
        supportedModels: [
          {
            repo: 'CohereForAI/TinyVicuna-1B-32k-GGUF',
            file: 'tiny-vicuna-1b.q4_k_m.gguf',
          },
        ],
        minPricePerToken: '2000', // Required: string format (will be parsed to bigint)
      };

      expect(registration.minPricePerToken).toBeDefined();
      expect(registration.minPricePerToken).toBe('2000');
      expect(typeof registration.minPricePerToken).toBe('string');
    });
  });
});
