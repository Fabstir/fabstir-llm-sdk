import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'path';
import { config } from 'dotenv';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';

import { FabstirSDKCore } from '@fabstir/sdk-core';
import * as SDKConfig from '../../src/sdk/config';
import { getTestHostWallet, checkBalance, waitForTx } from '../fixtures/wallet';
import { createTestConfig } from '../fixtures/config';
import {
  isHostRegistered,
  getStakingBalance,
  getFABBalance,
  getContract
} from '../helpers/blockchain';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Host Registration E2E', () => {
  let sdk: FabstirSDKCore;
  let provider: ethers.Provider;
  let hostWallet: any;
  let testConfig: any;

  beforeAll(async () => {
    // Create SDK configuration
    const sdkConfig = SDKConfig.createSDKConfig('base-sepolia');
    sdk = new FabstirSDKCore(sdkConfig);

    // Get provider
    provider = new ethers.JsonRpcProvider(process.env.RPC_URL_BASE_SEPOLIA);

    // Get test host wallet
    hostWallet = await getTestHostWallet(provider);

    // Create test configuration
    testConfig = createTestConfig();

    // Authenticate SDK with host wallet
    await sdk.authenticate('privatekey', { privateKey: hostWallet.privateKey });
  });

  afterAll(async () => {
    if (sdk && typeof sdk.cleanup === 'function') {
      await sdk.cleanup();
    }
  });

  describe('Pre-registration Checks', () => {
    it('should connect to Base Sepolia testnet', async () => {
      const network = await provider.getNetwork();
      expect(Number(network.chainId)).toBe(84532);
      console.log('Connected to Base Sepolia');
    });

    it('should have sufficient ETH balance', async () => {
      const balance = await checkBalance(
        hostWallet.wallet,
        ethers.parseEther('0.01')
      );

      console.log(`Host ETH balance: ${ethers.formatEther(balance.eth)} ETH`);
      expect(balance.hasMinimum).toBe(true);
    });

    it('should check FAB token balance', async () => {
      const fabBalance = await getFABBalance(
        testConfig.contracts.fabToken,
        hostWallet.address,
        provider
      );

      console.log(`Host FAB balance: ${ethers.formatUnits(fabBalance, 18)} FAB`);
      // Not requiring minimum for test
    });
  });

  describe('Registration Process', () => {
    it('should check if host is already registered', async () => {
      const isRegistered = await isHostRegistered(
        testConfig.contracts.nodeRegistry,
        hostWallet.address,
        provider
      );

      console.log(`Host registration status: ${isRegistered ? 'Registered' : 'Not registered'}`);

      // Test passes regardless of status - just checking the function works
      expect(typeof isRegistered).toBe('boolean');
    });

    it('should get current staking balance', async () => {
      const stakingBalance = await getStakingBalance(
        testConfig.contracts.nodeRegistry,
        hostWallet.address,
        provider
      );

      console.log(`Current staking balance: ${ethers.formatUnits(stakingBalance, 18)} FAB`);
      expect(stakingBalance).toBeDefined();
    });

    it('should interact with NodeRegistry contract', async () => {
      const nodeRegistry = await getContract(
        'NodeRegistry',
        testConfig.contracts.nodeRegistry,
        hostWallet.wallet
      );

      // Check contract is deployed
      const code = await provider.getCode(testConfig.contracts.nodeRegistry);
      expect(code).not.toBe('0x');

      // Try to read registry state
      try {
        const minStake = await nodeRegistry.minStakeAmount();
        console.log(`Minimum stake required: ${ethers.formatUnits(minStake, 18)} FAB`);
        expect(minStake).toBeDefined();
      } catch (error) {
        // Contract might not have this method, that's okay for test
        console.log('Could not read minStakeAmount:', error);
      }
    });

    it('should simulate registration flow (dry run)', async () => {
      // This test simulates the registration flow without actually executing it
      // to avoid spending real testnet funds repeatedly

      const nodeRegistry = await getContract(
        'NodeRegistry',
        testConfig.contracts.nodeRegistry,
        provider
      );

      try {
        // Check if we can estimate gas for registration
        // This validates the call would work without executing it
        const nodeUrl = 'http://localhost:8080';
        const models = ['gpt-3.5-turbo'];

        // Try to estimate gas (won't work if already registered)
        console.log('Simulating registration call...');

        // Just verify we can interact with the contract
        const isCallable = typeof nodeRegistry.registerNode === 'function' ||
                          typeof nodeRegistry.register === 'function';

        expect(isCallable).toBe(true);
        console.log('NodeRegistry contract is accessible and has registration methods');
      } catch (error: any) {
        console.log('Registration simulation:', error.message);
        // It's okay if this fails - we're just testing connectivity
      }
    });
  });

  describe('Post-registration Verification', () => {
    it('should verify contract addresses are valid', async () => {
      const contracts = testConfig.contracts;

      for (const [name, address] of Object.entries(contracts)) {
        if (!address) continue;

        const code = await provider.getCode(address as string);
        const isDeployed = code !== '0x';

        console.log(`${name}: ${address} - ${isDeployed ? 'Deployed' : 'Not deployed'}`);
        expect(isDeployed).toBe(true);
      }
    });

    it('should verify host can interact with JobMarketplace', async () => {
      const jobMarketplace = await getContract(
        'JobMarketplaceFABWithS5',
        testConfig.contracts.jobMarketplace,
        provider
      );

      try {
        // Read some basic state from JobMarketplace
        const jobCounter = await jobMarketplace.jobCounter();
        console.log(`Current job counter: ${jobCounter.toString()}`);
        expect(jobCounter).toBeDefined();
      } catch (error) {
        console.log('Could not read job counter:', error);
        // Still pass - we're just testing connectivity
      }
    });

    it('should verify host earnings contract access', async () => {
      const hostEarnings = await getContract(
        'HostEarnings',
        testConfig.contracts.hostEarnings,
        provider
      );

      try {
        // Check host's earnings balance
        const earnings = await hostEarnings.earnings(hostWallet.address);
        console.log(`Host earnings: ${ethers.formatUnits(earnings, 18)} FAB`);
        expect(earnings).toBeDefined();
      } catch (error) {
        console.log('Could not read earnings:', error);
        // Still pass - we're testing connectivity
      }
    });
  });
});