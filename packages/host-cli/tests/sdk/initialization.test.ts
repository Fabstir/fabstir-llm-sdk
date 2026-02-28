// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeSDK, getSDK, cleanupSDK, getConnectionStatus, authenticateSDK, ConnectionStatus } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('SDK Initialization', () => {
  beforeEach(async () => {
    // Ensure clean state before each test
    await cleanupSDK();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupSDK();
  });

  describe('Basic Initialization', () => {
    it('should initialize SDK with default network (base-sepolia)', async () => {
      const sdk = await initializeSDK();

      expect(sdk).toBeDefined();
      expect(sdk.config).toBeDefined();
      expect(sdk.config.chainId).toBe(84532); // Base Sepolia
    });

    it('should initialize SDK with base-mainnet network', async () => {
      // Mock mainnet RPC URL if not available
      const originalEnv = process.env.RPC_URL_BASE_MAINNET;
      process.env.RPC_URL_BASE_MAINNET = process.env.RPC_URL_BASE_MAINNET || 'https://mainnet.base.org';

      const sdk = await initializeSDK('base-mainnet');

      expect(sdk).toBeDefined();
      expect(sdk.config.chainId).toBe(8453); // Base Mainnet

      // Restore
      if (!originalEnv) delete process.env.RPC_URL_BASE_MAINNET;
      else process.env.RPC_URL_BASE_MAINNET = originalEnv;
    });

    it('should throw error if required environment variables are missing', async () => {
      const originalEnv = process.env.CONTRACT_JOB_MARKETPLACE;
      delete process.env.CONTRACT_JOB_MARKETPLACE;

      await expect(initializeSDK()).rejects.toThrow('Missing required environment variable');

      // Restore
      process.env.CONTRACT_JOB_MARKETPLACE = originalEnv;
    });

    it('should validate contract addresses on initialization', async () => {
      const originalEnv = process.env.CONTRACT_JOB_MARKETPLACE;
      process.env.CONTRACT_JOB_MARKETPLACE = 'invalid-address';

      await expect(initializeSDK()).rejects.toThrow('Invalid JobMarketplace address');

      // Restore
      process.env.CONTRACT_JOB_MARKETPLACE = originalEnv;
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', async () => {
      const sdk1 = await initializeSDK();
      const sdk2 = await initializeSDK();

      expect(sdk1).toBe(sdk2);
    });

    it('should return same instance via getSDK after initialization', async () => {
      const sdk1 = await initializeSDK();
      const sdk2 = getSDK();

      expect(sdk1).toBe(sdk2);
    });

    it('should throw error when getting SDK before initialization', () => {
      expect(() => getSDK()).toThrow('SDK not initialized');
    });

    it('should reinitialize after cleanup', async () => {
      const sdk1 = await initializeSDK();
      const address1 = sdk1.config.contractAddresses.jobMarketplace;

      await cleanupSDK();

      // Should throw after cleanup
      expect(() => getSDK()).toThrow('SDK not initialized');

      // Should create new instance
      const sdk2 = await initializeSDK();
      expect(sdk2).toBeDefined();
      expect(sdk2).not.toBe(sdk1); // Different instance
      expect(sdk2.config.contractAddresses.jobMarketplace).toBe(address1);
    });
  });

  describe('Connection Status', () => {
    it('should start with disconnected status', async () => {
      await initializeSDK();
      const status = getConnectionStatus();

      expect(status).toBe(ConnectionStatus.DISCONNECTED);
    });

    it('should update status to connecting during connection', async () => {
      await initializeSDK();

      // Start authentication (should set status to connecting)
      const connectPromise = authenticateSDK(process.env.TEST_HOST_1_PRIVATE_KEY!);

      // Status should be connecting during auth
      const status = getConnectionStatus();
      expect([ConnectionStatus.CONNECTING, ConnectionStatus.CONNECTED]).toContain(status);

      await connectPromise;
    });

    it('should update status to connected after successful authentication', async () => {
      await initializeSDK();
      await authenticateSDK(process.env.TEST_HOST_1_PRIVATE_KEY!);

      const status = getConnectionStatus();
      expect(status).toBe(ConnectionStatus.CONNECTED);
    });

    it('should update status to error on connection failure', async () => {
      await initializeSDK();

      try {
        // Try with an invalid key - should fail and set error status
        await authenticateSDK('0x' + '0'.repeat(64));
      } catch (error) {
        // Expected to fail
      }

      const status = getConnectionStatus();
      expect(status).toBe(ConnectionStatus.ERROR);
    });

    it('should track reconnection attempts', async () => {
      await initializeSDK();

      // First connection fails
      try {
        await authenticateSDK('0x' + '0'.repeat(64));
      } catch (error) {
        // Expected
      }

      expect(getConnectionStatus()).toBe(ConnectionStatus.ERROR);

      // Successful reconnection
      await authenticateSDK(process.env.TEST_HOST_1_PRIVATE_KEY!);

      expect(getConnectionStatus()).toBe(ConnectionStatus.CONNECTED);
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeout gracefully', async () => {
      // Clean up before test
      await cleanupSDK();

      // Mock a timeout scenario
      const originalRpc = process.env.RPC_URL_BASE_SEPOLIA;
      process.env.RPC_URL_BASE_SEPOLIA = 'https://invalid-rpc-url.example.com';

      // SDK initialization doesn't connect, but auth will fail
      await initializeSDK();

      // This should fail with network error
      try {
        await authenticateSDK(process.env.TEST_HOST_1_PRIVATE_KEY!);
        // Should not reach here
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should get a network error
        expect(error).toBeDefined();
        expect(error.message).toBeDefined();
      }

      // Restore
      process.env.RPC_URL_BASE_SEPOLIA = originalRpc;
      await cleanupSDK();
    });

    it('should provide meaningful error messages', async () => {
      const originalEnv = process.env.FAB_TOKEN;
      delete process.env.FAB_TOKEN;

      try {
        await initializeSDK();
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('FAB_TOKEN');
      }

      // Restore
      process.env.FAB_TOKEN = originalEnv;
    });
  });

  describe('Configuration Validation', () => {
    it('should validate all required contract addresses', async () => {
      const sdk = await initializeSDK();
      const addresses = sdk.config.contractAddresses;

      expect(addresses.jobMarketplace).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(addresses.nodeRegistry).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(addresses.proofSystem).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(addresses.hostEarnings).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(addresses.fabToken).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(addresses.usdcToken).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should include S5 configuration', async () => {
      const sdk = await initializeSDK();

      expect(sdk.config.s5Config).toBeDefined();
      expect(sdk.config.s5Config?.portalUrl).toBeDefined();
    });

    it('should set mode to production', async () => {
      const sdk = await initializeSDK();

      expect(sdk.config.mode).toBe('production');
    });
  });
});