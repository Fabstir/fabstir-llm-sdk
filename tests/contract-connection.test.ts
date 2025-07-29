import { describe, it, expect, beforeAll } from 'vitest';
import { FabstirSDK } from '../src';
import { ethers } from 'ethers';

describe('Contract Connection and Loading', () => {
  let sdk: FabstirSDK;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    // Skip connection for now
    // const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    // await sdk.connect(provider);
  });

  it.skip('should load JobMarketplace contract', async () => {
    const jobMarketplace = await sdk.contracts.getJobMarketplace();
    expect(jobMarketplace.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(jobMarketplace.interface).toBeDefined();
  });

  it.skip('should load PaymentEscrow contract', async () => {
    const paymentEscrow = await sdk.contracts.getPaymentEscrow();
    expect(paymentEscrow.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it.skip('should load NodeRegistry contract', async () => {
    const nodeRegistry = await sdk.contracts.getNodeRegistry();
    expect(nodeRegistry.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
