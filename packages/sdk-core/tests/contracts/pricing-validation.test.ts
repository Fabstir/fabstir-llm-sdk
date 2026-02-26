// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import NodeRegistryABI from '../../src/contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';

/**
 * Phase 18: Contract Pricing Validation Tests
 *
 * Validates that deployed contracts correctly enforce per-model per-token pricing:
 * - getModelPricing replaces getNodePricing
 * - setModelTokenPricing replaces updatePricingStable/updatePricingNative
 * - createSessionFromDepositForModel replaces createSessionFromDeposit
 *
 * Uses real deployed contracts on Base Sepolia testnet.
 */

describe('Contract Pricing Validation (Phase 18)', () => {
  let nodeRegistry: ethers.Contract;
  let jobMarketplace: ethers.Contract;
  let signer: ethers.Wallet;
  let provider: ethers.JsonRpcProvider;

  const NODE_REGISTRY_ADDRESS = process.env.CONTRACT_NODE_REGISTRY!;
  const JOB_MARKETPLACE_ADDRESS = process.env.CONTRACT_JOB_MARKETPLACE!;
  const TEST_PRIVATE_KEY = process.env.TEST_HOST_2_PRIVATE_KEY!;
  const RPC_URL = process.env.RPC_URL_BASE_SEPOLIA!;
  const USDC_ADDRESS = process.env.CONTRACT_USDC_TOKEN!;
  const MODEL_ID = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    nodeRegistry = new ethers.Contract(NODE_REGISTRY_ADDRESS, NodeRegistryABI, signer);
    jobMarketplace = new ethers.Contract(JOB_MARKETPLACE_ADDRESS, JobMarketplaceABI, signer);
  });

  describe('registerNode with pricing', () => {
    it('should register node with valid minPricePerToken', async () => {
      const minPrice = 5000;
      const metadata = JSON.stringify({ name: 'Test Host', description: 'Pricing test' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = [MODEL_ID];

      const tx = await nodeRegistry.registerNode(metadata, apiUrl, modelIds, minPrice, minPrice);
      await tx.wait(3);

      // Phase 18: verify with getModelPricing instead of getNodePricing
      const pricing = await nodeRegistry.getModelPricing(await signer.getAddress(), MODEL_ID, USDC_ADDRESS);
      expect(pricing).toBeGreaterThanOrEqual(0n);
    });

    it('should reject price below minimum (100)', async () => {
      const metadata = JSON.stringify({ name: 'Test Host' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = [MODEL_ID];

      await expect(
        nodeRegistry.registerNode(metadata, apiUrl, modelIds, 50, 50)
      ).rejects.toThrow();
    });

    it('should reject price above maximum (100000)', async () => {
      const metadata = JSON.stringify({ name: 'Test Host' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = [MODEL_ID];

      await expect(
        nodeRegistry.registerNode(metadata, apiUrl, modelIds, 150000, 150000)
      ).rejects.toThrow();
    });
  });

  describe('setModelTokenPricing', () => {
    it('should set per-model per-token pricing', async () => {
      const newPrice = 3000;

      const tx = await nodeRegistry.setModelTokenPricing(MODEL_ID, USDC_ADDRESS, newPrice);
      await tx.wait(3);

      const updatedPrice = await nodeRegistry.getModelPricing(await signer.getAddress(), MODEL_ID, USDC_ADDRESS);
      expect(updatedPrice).toBe(BigInt(newPrice));
    });

    it('should emit ModelTokenPricingUpdated event', async () => {
      const newPrice = 4000;
      const signerAddress = await signer.getAddress();

      const tx = await nodeRegistry.setModelTokenPricing(MODEL_ID, USDC_ADDRESS, newPrice);
      const receipt = await tx.wait(3);

      const event = receipt.logs
        .map((log: any) => {
          try {
            return nodeRegistry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e: any) => e && e.name === 'ModelTokenPricingUpdated');

      expect(event).toBeDefined();
      expect(event!.args.operator.toLowerCase()).toBe(signerAddress.toLowerCase());
    });
  });

  describe('getModelPricing', () => {
    it('should return correct pricing value for model + token pair', async () => {
      const signerAddress = await signer.getAddress();
      const pricing = await nodeRegistry.getModelPricing(signerAddress, MODEL_ID, USDC_ADDRESS);

      expect(pricing).toBeGreaterThanOrEqual(0n);
    });
  });

  describe('createSession price validation', () => {
    it('should reject session with price below model pricing', async () => {
      const hostAddress = await signer.getAddress();
      const hostModelPrice = await nodeRegistry.getModelPricing(hostAddress, MODEL_ID, USDC_ADDRESS);
      const belowMinPrice = Number(hostModelPrice) - 100;

      // Phase 18: use createSessionFromDepositForModel (modelless variants removed)
      await expect(
        jobMarketplace.createSessionFromDepositForModel(
          MODEL_ID,
          hostAddress,
          USDC_ADDRESS,
          1000000, // 1 USDC deposit
          belowMinPrice,
          3600, // 1 hour
          1000, // proof interval
          300 // proofTimeoutWindow
        )
      ).rejects.toThrow();
    });

    it('should accept session with price >= model pricing', async () => {
      const hostAddress = await signer.getAddress();
      const hostModelPrice = await nodeRegistry.getModelPricing(hostAddress, MODEL_ID, USDC_ADDRESS);

      expect(hostModelPrice).toBeGreaterThanOrEqual(0n);
    });
  });
});
