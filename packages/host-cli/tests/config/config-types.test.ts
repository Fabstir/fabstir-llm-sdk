/**
 * Configuration types tests
 * Tests for process tracking fields in ConfigData
 *
 * Sub-phase 3.1: Add Process Tracking to Config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigData } from '../../src/config/types';
import { saveConfig, loadConfig, getConfigPath } from '../../src/config/storage';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Config Types - Sub-phase 3.1', () => {
  const testConfigDir = path.join(process.cwd(), '.test-fabstir');
  const testConfigPath = path.join(testConfigDir, 'config.json');

  beforeEach(async () => {
    // Override config path for testing
    process.env.HOME = process.cwd();
    await fs.mkdir(path.join(process.cwd(), '.fabstir'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.rm(path.join(process.cwd(), '.fabstir'), { recursive: true });
    } catch {
      // Ignore errors
    }
  });

  describe('Process Tracking Fields', () => {
    it('should include processPid field in ConfigData', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
        processPid: 12345,
      };

      expect(config.processPid).toBe(12345);
    });

    it('should allow processPid to be undefined', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
      };

      expect(config.processPid).toBeUndefined();
    });

    it('should include nodeStartTime field in ConfigData', () => {
      const startTime = new Date().toISOString();
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
        nodeStartTime: startTime,
      };

      expect(config.nodeStartTime).toBe(startTime);
    });

    it('should allow nodeStartTime to be undefined', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
      };

      expect(config.nodeStartTime).toBeUndefined();
    });

    it('should preserve publicUrl field', () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://203.0.113.45:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
      };

      expect(config.publicUrl).toBe('http://203.0.113.45:8080');
    });
  });

  describe('Save and Load with Process Tracking', () => {
    it('should save config with processPid', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
        processPid: 12345,
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      expect(loaded).toBeDefined();
      expect(loaded?.processPid).toBe(12345);
    });

    it('should save config with nodeStartTime', async () => {
      const startTime = new Date().toISOString();
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://localhost:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
        nodeStartTime: startTime,
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      expect(loaded).toBeDefined();
      expect(loaded?.nodeStartTime).toBe(startTime);
    });

    it('should save config with both processPid and nodeStartTime', async () => {
      const startTime = new Date().toISOString();
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 8080,
        publicUrl: 'http://example.com:8080',
        models: ['test-model'],
        pricePerToken: 0.0001,
        processPid: 99999,
        nodeStartTime: startTime,
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      expect(loaded).toBeDefined();
      expect(loaded?.processPid).toBe(99999);
      expect(loaded?.nodeStartTime).toBe(startTime);
      expect(loaded?.publicUrl).toBe('http://example.com:8080');
    });

    it('should preserve all fields when loading', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xABC123...',
        privateKey: '0xDEF456...',
        network: 'base-sepolia',
        rpcUrl: 'https://sepolia.base.org',
        inferencePort: 9000,
        publicUrl: 'http://my-host.example.com:9000',
        models: ['model1', 'model2'],
        pricePerToken: 0.0002,
        minSessionDeposit: 0.05,
        processPid: 54321,
        nodeStartTime: '2024-01-15T12:00:00.000Z',
        contracts: {
          jobMarketplace: '0xMarket...',
          nodeRegistry: '0xRegistry...',
        },
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      expect(loaded).toBeDefined();
      expect(loaded?.version).toBe('1.0.0');
      expect(loaded?.walletAddress).toBe('0xABC123...');
      expect(loaded?.publicUrl).toBe('http://my-host.example.com:9000');
      expect(loaded?.processPid).toBe(54321);
      expect(loaded?.nodeStartTime).toBe('2024-01-15T12:00:00.000Z');
      expect(loaded?.models).toEqual(['model1', 'model2']);
    });
  });
});
