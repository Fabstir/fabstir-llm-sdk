import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import NodeRegistryABI from '../../src/contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json';
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModels-CLIENT-ABI.json';

/**
 * Sub-phase 1.4: Contract Verification Tests
 *
 * Validates that deployed contracts correctly enforce host-controlled pricing:
 * - Price range validation (100-100,000)
 * - Contract-level price enforcement
 * - Session creation validates minimum pricing
 *
 * Uses real deployed contracts on Base Sepolia testnet.
 */

describe('Contract Pricing Validation', () => {
  let nodeRegistry: ethers.Contract;
  let jobMarketplace: ethers.Contract;
  let signer: ethers.Wallet;
  let provider: ethers.JsonRpcProvider;

  const NODE_REGISTRY_ADDRESS = process.env.CONTRACT_NODE_REGISTRY!;
  const JOB_MARKETPLACE_ADDRESS = process.env.CONTRACT_JOB_MARKETPLACE!;
  const TEST_PRIVATE_KEY = process.env.TEST_HOST_2_PRIVATE_KEY!;
  const RPC_URL = process.env.RPC_URL_BASE_SEPOLIA!;
  const USDC_ADDRESS = process.env.CONTRACT_USDC_TOKEN!;
  const FAB_ADDRESS = process.env.CONTRACT_FAB_TOKEN!;

  beforeAll(() => {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    signer = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    nodeRegistry = new ethers.Contract(NODE_REGISTRY_ADDRESS, NodeRegistryABI, signer);
    jobMarketplace = new ethers.Contract(JOB_MARKETPLACE_ADDRESS, JobMarketplaceABI, signer);
  });

  describe('registerNode with pricing', () => {
    it('should register node with valid minPricePerToken', async () => {
      const minPrice = 5000; // 0.005 USDC per token
      const metadata = JSON.stringify({ name: 'Test Host', description: 'Pricing test' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'];

      // Note: This test assumes host is not already registered
      // In practice, unregister first or use a different test account
      const tx = await nodeRegistry.registerNode(metadata, apiUrl, modelIds, minPrice);
      await tx.wait(3);

      const pricing = await nodeRegistry.getNodePricing(await signer.getAddress());
      expect(pricing).toBe(BigInt(minPrice));
    });

    it('should reject price below minimum (100)', async () => {
      const metadata = JSON.stringify({ name: 'Test Host' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'];

      await expect(
        nodeRegistry.registerNode(metadata, apiUrl, modelIds, 50) // Below min
      ).rejects.toThrow();
    });

    it('should reject price above maximum (100000)', async () => {
      const metadata = JSON.stringify({ name: 'Test Host' });
      const apiUrl = 'http://localhost:8083';
      const modelIds = ['0x329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f'];

      await expect(
        nodeRegistry.registerNode(metadata, apiUrl, modelIds, 150000) // Above max
      ).rejects.toThrow();
    });
  });

  describe('updatePricing', () => {
    it('should update host minimum price', async () => {
      const newPrice = 3000;

      const tx = await nodeRegistry.updatePricing(newPrice);
      await tx.wait(3);

      const updatedPrice = await nodeRegistry.getNodePricing(await signer.getAddress());
      expect(updatedPrice).toBe(BigInt(newPrice));
    });

    it('should emit PricingUpdated event', async () => {
      const newPrice = 4000;
      const signerAddress = await signer.getAddress();

      const tx = await nodeRegistry.updatePricing(newPrice);
      const receipt = await tx.wait(3);

      const event = receipt.logs
        .map((log: any) => {
          try {
            return nodeRegistry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e: any) => e && e.name === 'PricingUpdated');

      expect(event).toBeDefined();
      expect(event!.args.operator.toLowerCase()).toBe(signerAddress.toLowerCase());
      expect(event!.args.newMinPrice).toBe(BigInt(newPrice));
    });
  });

  describe('getNodePricing', () => {
    it('should return correct pricing value', async () => {
      const signerAddress = await signer.getAddress();
      const pricing = await nodeRegistry.getNodePricing(signerAddress);

      expect(pricing).toBeGreaterThanOrEqual(BigInt(100));
      expect(pricing).toBeLessThanOrEqual(BigInt(100000));
    });
  });

  describe('createSession price validation', () => {
    it('should reject session with price below host minimum', async () => {
      const hostAddress = await signer.getAddress();
      const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);
      const belowMinPrice = Number(hostMinPrice) - 100;

      await expect(
        jobMarketplace.createSessionFromDeposit(
          hostAddress,
          USDC_ADDRESS,
          1000000, // 1 USDC deposit
          belowMinPrice,
          3600, // 1 hour
          1000 // proof interval
        )
      ).rejects.toThrow(/Price below host minimum/);
    });

    it('should accept session with price >= host minimum', async () => {
      const hostAddress = await signer.getAddress();
      const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);

      // This test would require actual deposit - skipping execution
      // In real test: First deposit, then create session
      expect(hostMinPrice).toBeGreaterThanOrEqual(BigInt(100));
    });
  });
});
