// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto'; // Required for S5.js in Node.js
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from 'dotenv';
import * as SDKConfig from '../../src/sdk/config';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('SDK Setup and Discovery', () => {
  describe('SDK Package Verification', () => {
    it('should find @fabstir/sdk-core package', async () => {
      const sdkCorePath = path.join(__dirname, '../../../sdk-core');
      const stat = await fs.stat(sdkCorePath);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should find built SDK distribution', async () => {
      const distPath = path.join(__dirname, '../../../sdk-core/dist/index.js');
      const stat = await fs.stat(distPath);
      expect(stat.isFile()).toBe(true);
    });

    it('should import FabstirSDKCore class', async () => {
      // Import the actual SDK from sdk-core package
      const { FabstirSDKCore } = await import('@fabstir/sdk-core');
      expect(FabstirSDKCore).toBeDefined();
      expect(typeof FabstirSDKCore).toBe('function');
    });
  });

  describe('Environment Configuration', () => {
    it('should have required contract addresses in environment', () => {
      expect(process.env.CONTRACT_JOB_MARKETPLACE).toBeDefined();
      expect(process.env.CONTRACT_NODE_REGISTRY).toBeDefined();
      expect(process.env.CONTRACT_FAB_TOKEN).toBeDefined();
      expect(process.env.CONTRACT_USDC_TOKEN).toBeDefined();
    });

    it('should have RPC URL for Base Sepolia', () => {
      expect(process.env.RPC_URL_BASE_SEPOLIA).toBeDefined();
      expect(process.env.RPC_URL_BASE_SEPOLIA).toMatch(/^https?:\/\//);
    });

    it('should have test wallet credentials', () => {
      expect(process.env.TEST_HOST_1_PRIVATE_KEY).toBeDefined();
      expect(process.env.TEST_HOST_1_ADDRESS).toBeDefined();
    });
  });

  describe('SDK Configuration', () => {
    it('should create SDK config from environment', () => {
      const config = SDKConfig.createSDKConfig('base-sepolia');

      expect(config.chainId).toBe(84532); // Base Sepolia chain ID
      expect(config.rpcUrl).toBe(process.env.RPC_URL_BASE_SEPOLIA);
      expect(config.contractAddresses).toBeDefined();
      expect(config.contractAddresses.jobMarketplace).toBe(process.env.CONTRACT_JOB_MARKETPLACE);
    });

    it('should validate contract addresses', () => {
      const config = SDKConfig.createSDKConfig('base-sepolia');

      // All addresses should be valid Ethereum addresses
      expect(config.contractAddresses.jobMarketplace).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.contractAddresses.nodeRegistry).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.contractAddresses.fabToken).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.contractAddresses.usdcToken).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should throw error if required env vars missing', () => {
      const originalEnv = { ...process.env };
      delete process.env.CONTRACT_JOB_MARKETPLACE;

      expect(() => SDKConfig.createSDKConfig('base-sepolia'))
        .toThrow('Missing required environment variable: CONTRACT_JOB_MARKETPLACE');

      // Restore
      process.env.CONTRACT_JOB_MARKETPLACE = originalEnv.CONTRACT_JOB_MARKETPLACE;
    });
  });

  describe('SDK Initialization', () => {
    it('should create SDK instance with config', async () => {
      const { FabstirSDKCore } = await import('@fabstir/sdk-core');
      const config = SDKConfig.createSDKConfig('base-sepolia');

      const sdk = new FabstirSDKCore(config);
      expect(sdk).toBeDefined();
      expect(sdk.config.contractAddresses).toEqual(config.contractAddresses);
    });

    it('should have required manager methods', async () => {
      const { FabstirSDKCore } = await import('@fabstir/sdk-core');
      const config = SDKConfig.createSDKConfig('base-sepolia');

      const sdk = new FabstirSDKCore(config);

      // Check for expected methods (these should exist on the real SDK)
      expect(typeof sdk.authenticate).toBe('function');
      expect(typeof sdk.getHostManager).toBe('function');
      expect(typeof sdk.getPaymentManager).toBe('function');
      expect(typeof sdk.getSessionManager).toBe('function');
    });
  });
});