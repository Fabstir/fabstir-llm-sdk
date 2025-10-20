// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto'; // Required for S5.js in Node.js
import * as path from 'path';
import { config } from 'dotenv';
import * as SDKConfig from '../../src/sdk/config';
import * as Secrets from '../../src/sdk/secrets';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Testnet Connection', () => {
  let sdk: any;

  beforeAll(async () => {
    const { FabstirSDKCore } = await import('@fabstir/sdk-core');
    const config = SDKConfig.createSDKConfig('base-sepolia');
    sdk = new FabstirSDKCore(config);

    // Authenticate to make provider available
    const privateKey = await Secrets.getPrivateKey();
    await sdk.authenticate('privatekey', { privateKey });
  });

  afterAll(async () => {
    if (sdk && typeof sdk.cleanup === 'function') {
      await sdk.cleanup();
    }
  });

  describe('Blockchain Connection', () => {
    it('should initialize SDK and connect to Base Sepolia', async () => {
      // FabstirSDKCore doesn't have an initialize method - it's ready after construction
      expect(sdk).toBeDefined();
      expect(sdk.config).toBeDefined();
      expect(sdk.config.chainId).toBe(84532); // Base Sepolia chain ID
    });

    it('should get current block number from testnet', async () => {
      // Provider should be available after construction
      expect(sdk.provider).toBeDefined();

      const blockNumber = await sdk.provider.getBlockNumber();
      expect(blockNumber).toBeGreaterThan(0);
      console.log(`Connected to Base Sepolia at block ${blockNumber}`);
    });

    it('should verify network is Base Sepolia', async () => {
      const network = await sdk.provider.getNetwork();
      expect(Number(network.chainId)).toBe(84532); // Base Sepolia chain ID
    });
  });

  describe('Contract Verification', () => {
    it('should verify JobMarketplace contract exists', async () => {
      const contractAddress = process.env.CONTRACT_JOB_MARKETPLACE!;
      const code = await sdk.provider.getCode(contractAddress);

      // Contract should have deployed bytecode
      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(2);
    });

    it('should verify NodeRegistry contract exists', async () => {
      const contractAddress = process.env.CONTRACT_NODE_REGISTRY!;
      const code = await sdk.provider.getCode(contractAddress);

      expect(code).not.toBe('0x');
      expect(code.length).toBeGreaterThan(2);
    });
  });

  describe('Authentication', () => {
    it('should authenticate with test wallet using private key', async () => {
      // Should already be authenticated in beforeAll
      expect(sdk.isAuthenticated()).toBe(true);
      expect(sdk.signer).toBeDefined();
    }, 10000);

    it('should verify authenticated address matches expected', async () => {
      if (!sdk.isAuthenticated()) {
        const privateKey = await Secrets.getPrivateKey();
        await sdk.authenticate('privatekey', { privateKey });
      }

      const address = sdk.signer.address;
      expect(address.toLowerCase()).toBe(process.env.TEST_HOST_1_ADDRESS!.toLowerCase());
    });

    it('should get ETH balance of test wallet', async () => {
      if (!sdk.isAuthenticated()) {
        const privateKey = await Secrets.getPrivateKey();
        await sdk.authenticate('privatekey', { privateKey });
      }

      const balance = await sdk.provider.getBalance(sdk.signer.address);
      console.log(`Test wallet balance: ${balance.toString()} wei`);

      // Test wallet should have some ETH
      expect(balance).toBeGreaterThan(0n);
    });
  });

  describe('Manager Access', () => {
    it('should access HostManager after authentication', async () => {
      if (!sdk.isAuthenticated()) {
        const privateKey = await Secrets.getPrivateKey();
        await sdk.authenticate('privatekey', { privateKey });
      }

      const hostManager = sdk.getHostManager();
      expect(hostManager).toBeDefined();
      // Check for actual methods on HostManager
      expect(typeof hostManager.registerHostWithModels).toBe('function');
    });

    it('should access PaymentManager after authentication', async () => {
      if (!sdk.isAuthenticated()) {
        const privateKey = await Secrets.getPrivateKey();
        await sdk.authenticate('privatekey', { privateKey });
      }

      const paymentManager = sdk.getPaymentManager();
      expect(paymentManager).toBeDefined();
      expect(typeof paymentManager.getBalance).toBe('function');
    });

    it('should throw error when accessing managers without authentication', async () => {
      // Create new SDK instance without auth
      const { FabstirSDKCore } = await import('@fabstir/sdk-core');
      const config = SDKConfig.createSDKConfig('base-sepolia');
      const newSdk = new FabstirSDKCore(config);

      expect(() => newSdk.getHostManager()).toThrow();
    });
  });
});